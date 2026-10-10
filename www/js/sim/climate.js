// Klima: Energiebilanzmodell (Budyko/Sellers/North) plus Feuchtetransport mit Windgürteln.
//
// Echte Formeln:
//  - Einstrahlung pro Breitengrad und Monat aus Achsneigung und Sonnenstand (Tagesmittel)
//  - Abstrahlung OLR = A + B*T mit A = 203,3 W/m², B = 2,09 W/m²/K (North 1981)
//  - CO2-Antrieb 5,35 * ln(C/C0) W/m² (Myhre 1998)
//  - Wärmetransport als Diffusion auf der Kugel, Wärmekapazität Ozean >> Land
//  - Eis-Albedo-Rückkopplung, Temperaturabnahme mit der Höhe 6,5 °C/km
//  - Wasserdampf nach Clausius-Clapeyron (ca. 7 % mehr pro Grad)
// Vereinfacht: Wolken stecken in der effektiven Albedo, Jahreszeiten als Schwingung um das Jahresmittel.

import { W, H, N, LAT, COSLAT, SINLAT, DEG, MONTHS, clamp } from './const.js';
import { vegCover } from './plants.js';

const S0 = 1361; // Solarkonstante der Erde in W/m²
const B_OLR = 2.09;
const A_OLR = 203.3;
const D_HEAT = 0.85; // Wärmetransport (Diffusionskonstante auf der Einheitskugel)
const C_OCEAN = 4.0e8; // J/m²/K, durchmischte Ozeanschicht ca. 100 m
const C_LAND = 1.0e7;
const YEAR_S = 3.156e7;
const LAPSE = 6.5; // °C pro km
const DLAT = Math.PI / H;
const RAIN_SCALE = 1150; // eicht den Niederschlag auf Erdwerte (mm/Jahr)

// Tagesmittel der Einstrahlung oben in der Atmosphäre
export function dailyInsolation(latRad, decl, s0) {
  const tt = -Math.tan(latRad) * Math.tan(decl);
  let h0;
  if (tt >= 1) h0 = 0;
  else if (tt <= -1) h0 = Math.PI;
  else h0 = Math.acos(tt);
  return (s0 / Math.PI) * (h0 * Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.sin(h0));
}

function p2(x) {
  return 0.5 * (3 * x * x - 1);
}

export function satVap(t) {
  return Math.exp(0.0687 * (t - 15));
}

export class Climate {
  constructor(world) {
    this.world = world;
    this.T = new Float32Array(N); // Jahresmittel auf Meereshöhe
    this.Ts = new Float32Array(N); // Jahresmittel an der Oberfläche
    this.season = new Float32Array(MONTHS * N); // Abweichung je Monat
    this.rain = new Float32Array(N); // mm pro Jahr
    this.rainMod = new Float32Array(N).fill(1);
    this.ice = new Float32Array(N); // dauerhaftes Eis 0..1
    this.snow = new Float32Array(N); // Anteil des Jahres mit Schnee oder Meereis (nach Sonnenlicht gewichtet)
    this.albedo = new Float32Array(N);
    this.zonal = new Float64Array(H); // Zonalmittel aus dem 1D-Modell
    this.Qm = new Float32Array(MONTHS * H); // Einstrahlung je Monat und Zeile
    this.Qy = new Float32Array(H); // Jahresmittel der Einstrahlung
    this.Qamp = new Float32Array(H);
    this.lightMax = new Float32Array(H);
    this.globalT = 14;
    this.iceShare = 0;
    this.insolationKey = '';
  }

  // Einstrahlung neu berechnen, wenn sich Sonne oder Achsneigung ändern
  updateInsolation() {
    const { sun, tilt } = this.world.params;
    const key = `${sun}|${tilt}`;
    if (key === this.insolationKey) return;
    this.insolationKey = key;
    const s0 = S0 * sun;
    const eps = tilt * DEG;
    const STEPS = 8;
    for (let j = 0; j < H; j++) {
      const lat = LAT[j] * DEG;
      let ysum = 0;
      let mx = -1;
      let mn = 1e9;
      for (let m = 0; m < MONTHS; m++) {
        let msum = 0;
        for (let s = 0; s < STEPS; s++) {
          const day = (m + (s + 0.5) / STEPS) / MONTHS; // Bruchteil des Jahres, 0 = 1. Januar
          const decl = eps * Math.sin(2 * Math.PI * (day - 0.2208)); // Frühlingspunkt um den 21. März
          msum += dailyInsolation(lat, decl, s0);
        }
        const q = msum / STEPS;
        this.Qm[m * H + j] = q;
        ysum += q;
        if (q > mx) mx = q;
        if (q < mn) mn = q;
      }
      this.Qy[j] = ysum / MONTHS;
      this.Qamp[j] = (mx - mn) / 2;
      this.lightMax[j] = Math.max(1, mx);
    }
    this.updateSeasonShape();
  }

  // Form der Jahreszeiten: Amplitude aus der Schwankung der Einstrahlung, groß im Landesinneren, klein über dem Meer
  updateSeasonShape() {
    const { isOcean, coast } = this.world;
    for (let j = 0; j < H; j++) {
      const north = LAT[j] >= 0;
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        let k;
        let lag;
        if (isOcean[c]) {
          k = 0.013;
          lag = 1.8;
        } else {
          const cont = Math.min(1, coast[c] / 9);
          k = 0.034 + 0.078 * Math.pow(cont, 0.6);
          lag = 1.0 - 0.3 * cont;
        }
        const amp = k * this.Qamp[j];
        const peak = (north ? 5.67 : 11.67) + lag; // Monat der höchsten Temperatur
        for (let m = 0; m < MONTHS; m++) {
          this.season[m * N + c] = amp * Math.cos((2 * Math.PI * (m + 0.5 - peak)) / MONTHS);
        }
      }
    }
  }

  monthTemp(c, m) {
    return this.Ts[c] + this.season[m * N + c];
  }

  // Albedo einer Zelle (effektiv, mit Wolken- und Sonnenstandsanteil)
  computeAlbedo() {
    const { isOcean, plants } = this.world;
    for (let j = 0; j < H; j++) {
      const latTerm = 0.22 * p2(SINLAT[j]);
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        let surf;
        let iceAlb;
        if (isOcean[c]) {
          surf = 0.31;
          iceAlb = 0.58;
        } else {
          const veg = plants ? vegCover(plants.P[c]) : 0;
          surf = 0.34 - 0.07 * veg;
          iceAlb = this.ice[c] > 0.5 ? 0.66 : 0.6 - 0.12 * veg;
        }
        const free = clamp(surf + latTerm, 0.12, 0.7);
        const f = Math.max(this.ice[c], this.snow[c]);
        this.albedo[c] = free * (1 - f) + Math.max(free, iceAlb) * f;
      }
    }
  }

  // Ein Klimajahr: Temperatur (implizit, stabil), Eis, Schnee, Niederschlag
  stepYear(spinup = false) {
    const world = this.world;
    const { params, isOcean, coast, elev } = world;
    this.updateInsolation();
    this.computeAlbedo();
    const A = A_OLR - 5.35 * Math.log(params.co2 / 280);
    const solar = 1 - params.dust;

    // 1) Zonalmittel mit dem eindimensionalen Energiebilanzmodell (Thomas-Algorithmus)
    const a = new Float64Array(H);
    const b = new Float64Array(H);
    const cc = new Float64Array(H);
    const d = new Float64Array(H);
    const albRow = new Float64Array(H);
    for (let j = 0; j < H; j++) {
      let alb = 0;
      let ocean = 0;
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        alb += this.albedo[c];
        ocean += isOcean[c];
      }
      albRow[j] = alb / W;
      const fo = ocean / W;
      const cap = (fo * C_OCEAN + (1 - fo) * C_LAND) / YEAR_S;
      const cUp = j > 0 ? Math.cos((LAT[j] + 90 / H) * DEG) : 0;
      const cDn = j < H - 1 ? Math.cos((LAT[j] - 90 / H) * DEG) : 0;
      const kUp = (D_HEAT * cUp) / (DLAT * DLAT * COSLAT[j]);
      const kDn = (D_HEAT * cDn) / (DLAT * DLAT * COSLAT[j]);
      const capUse = spinup ? cap * 0.02 : cap;
      a[j] = -kUp;
      cc[j] = -kDn;
      b[j] = capUse + B_OLR + kUp + kDn;
      d[j] = capUse * this.zonal[j] + this.Qy[j] * (1 - albRow[j]) * solar - A;
    }
    for (let j = 1; j < H; j++) {
      const w = a[j] / b[j - 1];
      b[j] -= w * cc[j - 1];
      d[j] -= w * d[j - 1];
    }
    this.zonal[H - 1] = d[H - 1] / b[H - 1];
    for (let j = H - 2; j >= 0; j--) this.zonal[j] = (d[j] - cc[j] * this.zonal[j + 1]) / b[j];

    // 2) Örtliche Abweichung durch andere Albedo, Land/Meer, Kontinentalität
    const dT = this.Ts; // als Zwischenspeicher
    for (let j = 0; j < H; j++) {
      const q = this.Qy[j] * solar;
      const s = Math.abs(SINLAT[j]);
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        let v = (q * (albRow[j] - this.albedo[c])) / (B_OLR + 10);
        if (isOcean[c]) v += 1.2 * s;
        else v -= 2 * Math.min(1, coast[c] / 10) * s;
        dT[c] = v;
      }
    }
    // glätten (horizontale Durchmischung)
    const tmp = new Float32Array(N);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < H; j++) {
        const up = j > 0 ? j - 1 : j;
        const dn = j < H - 1 ? j + 1 : j;
        for (let i = 0; i < W; i++) {
          const l = (i + W - 1) % W;
          const r = (i + 1) % W;
          tmp[j * W + i] = 0.4 * dT[j * W + i] + 0.15 * (dT[j * W + l] + dT[j * W + r] + dT[up * W + i] + dT[dn * W + i]);
        }
      }
      dT.set(tmp);
    }

    // 3) Oberflächentemperatur
    let tsum = 0;
    let wsum = 0;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        const tSea = this.zonal[j] + dT[c];
        this.T[c] = tSea;
        this.Ts[c] = isOcean[c] ? tSea : tSea - (LAPSE * Math.max(0, elev[c])) / 1000;
        tsum += this.Ts[c] * COSLAT[j];
        wsum += COSLAT[j];
      }
    }
    this.globalT = tsum / wsum;

    // 4) Schnee, Meereis, Gletscher
    let iceArea = 0;
    for (let j = 0; j < H; j++) {
      let qsum = 0;
      for (let m = 0; m < MONTHS; m++) qsum += this.Qm[m * H + j] + 1;
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        const ocean = isOcean[c];
        let cover = 0;
        let coldMonths = 0;
        for (let m = 0; m < MONTHS; m++) {
          const t = this.Ts[c] + this.season[m * N + c];
          if ((ocean && t < -1.8) || (!ocean && t < -1)) {
            cover += this.Qm[m * H + j] + 1;
            coldMonths++;
          }
        }
        this.snow[c] = cover / qsum;
        if (ocean) {
          // ganzjährig gefroren = dauerhaftes Meereis
          const target = coldMonths >= 12 ? 1 : 0;
          this.ice[c] += (target - this.ice[c]) * (spinup ? 1 : 0.5);
        } else if (this.Ts[c] < -9) {
          this.ice[c] = Math.min(1, this.ice[c] + (spinup ? 1 : 0.2));
        } else if (this.Ts[c] > -5) {
          this.ice[c] = Math.max(0, this.ice[c] - (spinup ? 1 : 0.3));
        }
        if (Math.max(this.ice[c], this.snow[c] * 1.2) > 0.5) iceArea += COSLAT[j];
      }
    }
    this.iceShare = iceArea / wsum;

    // 5) Niederschlag
    this.computeRain();
  }

  computeRain() {
    const { isOcean, elev, plants } = this.world;
    const raw = new Float32Array(N);

    // Verdunstung je Zeile (Ozean, plus Pflanzen an Land)
    const evap = new Float64Array(H);
    for (let j = 0; j < H; j++) {
      let e = 0;
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        const sat = satVap(this.Ts[c]);
        if (isOcean[c]) {
          if (this.ice[c] < 0.5) e += sat * (1 - 0.8 * this.snow[c]);
        } else {
          const veg = plants ? vegCover(plants.P[c]) : 0;
          e += sat * (0.08 + 0.45 * veg);
        }
      }
      evap[j] = e / W;
    }
    // Feuchte, die von Nachbarbreiten herangeführt wird: Passate tragen sie zum Äquator,
    // die Westwinde zur Polarfront (Konvergenzzonen), in den Subtropen sinkt trockene Luft ab
    const bg = new Float64Array(H);
    const SIG = 14;
    for (let j = 0; j < H; j++) {
      let s = 0;
      let w = 0;
      for (let k = Math.max(0, j - 3 * SIG); k <= Math.min(H - 1, j + 3 * SIG); k++) {
        const g = Math.exp(-(((k - j) / SIG) ** 2)) * COSLAT[k];
        s += g * evap[k];
        w += g;
      }
      const al = Math.abs(LAT[j]);
      const conv = 0.3 + 1.4 * Math.exp(-((LAT[j] / 12) ** 2)) + 1.0 * Math.exp(-(((al - 52) / 14) ** 2));
      bg[j] = (s / w) * conv * 5;
    }

    for (let j = 0; j < H; j++) {
      const lat = LAT[j];
      const al = Math.abs(lat);
      const dir = al < 30 ? -1 : al < 60 ? 1 : -1; // Passat, Westwind, polarer Ostwind
      // aufsteigende Luft (Tropen, Polarfront) regnet, absinkende (Subtropen) kaum
      const p0 = 0.035 + 0.3 * Math.exp(-((lat / 10) ** 2)) + 0.13 * Math.exp(-(((al - 52) / 13) ** 2));
      let q = bg[j];
      let i = 0;
      for (let step = 0; step < 2 * W; step++) {
        const c = j * W + i;
        const sat = satVap(this.Ts[c]);
        const prev = j * W + ((i - dir + W) % W);
        let p = p0;
        if (isOcean[c]) {
          if (this.ice[c] < 0.5) q += sat * (1 - 0.8 * this.snow[c]);
          q += 0.04 * (bg[j] - q);
        } else {
          const veg = plants ? vegCover(plants.P[c]) : 0;
          q += sat * (0.08 + 0.45 * veg) * 0.5;
          q += 0.3 * (bg[j] - q);
          p += 0.06;
          const rise = Math.max(0, elev[c]) - Math.max(0, elev[prev]);
          if (rise > 0) p += Math.min(0.5, rise / 1800);
        }
        if (q < 0) q = 0;
        p = Math.min(0.85, p);
        let rain = q * p;
        q -= rain;
        const cap = 5 * sat;
        if (q > cap) {
          rain += q - cap;
          q = cap;
        }
        if (step >= W) raw[c] = rain;
        i = (i + dir + W) % W;
      }
    }
    // in Nord-Süd-Richtung und seitlich glätten
    const out = this.rain;
    for (let j = 0; j < H; j++) {
      const up = j > 0 ? j - 1 : j;
      const dn = j < H - 1 ? j + 1 : j;
      for (let i = 0; i < W; i++) {
        const l = (i + W - 1) % W;
        const r = (i + 1) % W;
        const v = 0.36 * raw[j * W + i] + 0.16 * (raw[up * W + i] + raw[dn * W + i]) + 0.16 * (raw[j * W + l] + raw[j * W + r]);
        out[j * W + i] = v * RAIN_SCALE * this.rainMod[j * W + i];
      }
    }
  }

  // Wetter-Eingriffe klingen über Jahrzehnte ab
  relaxRainMod() {
    const m = this.rainMod;
    for (let c = 0; c < N; c++) {
      if (m[c] !== 1) {
        m[c] = 1 + (m[c] - 1) * 0.94;
        if (Math.abs(m[c] - 1) < 0.01) m[c] = 1;
      }
    }
  }
}
