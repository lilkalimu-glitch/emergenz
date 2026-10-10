// Pflanzen an Land und Algen im Meer als Felder (Biomasse je Zelle).
//
// Land: Tragfähigkeit aus dem Miami-Modell (Lieth 1975), das die Netto-Primärproduktion
// aus Jahresmitteltemperatur und Jahresniederschlag schätzt:
//   NPP_T = 3000 / (1 + e^(1,315 - 0,119 T)),  NPP_P = 3000 (1 - e^(-0,000664 P)),  NPP = min(...)
// Meer: Licht, Temperatur und Nährstoffe (an Küsten und in kühlen Meeren mehr).
// Wachstum logistisch, nur in Monaten mit Licht und ohne Frost; Ausbreitung von Zelle zu Zelle.

import { W, H, N, LAT, MONTHS, clamp } from './const.js';

export const FOOD_SCALE = 3; // Energieeinheiten pro 1000 g/m²/Jahr Netto-Primärproduktion
export const ENERGY_PER_NPP = FOOD_SCALE / 1000;

// Anteil der Bodenbedeckung (0..1) für Albedo und Verdunstung
export function vegCover(p) {
  return Math.min(1, p / (1.6 * FOOD_SCALE));
}

export function miamiNPP(t, p) {
  const nT = 3000 / (1 + Math.exp(1.315 - 0.119 * t));
  const nP = 3000 * (1 - Math.exp(-0.000664 * Math.max(0, p)));
  return Math.min(nT, nP);
}

export class Plants {
  constructor(world) {
    this.world = world;
    this.P = new Float32Array(N); // Landpflanzen
    this.A = new Float32Array(N); // Algen
    this.Kp = new Float32Array(N);
    this.Ka = new Float32Array(N);
    this.landStarted = false;
    this.seaStarted = false;
  }

  // Tragfähigkeit aus dem aktuellen Klima (einmal pro Jahr)
  updateCapacity() {
    const { isOcean, coast, climate } = this.world;
    const { Ts, rain, ice, Qy } = climate;
    let qmax = 1;
    for (let j = 0; j < H; j++) qmax = Math.max(qmax, Qy[j]);
    for (let j = 0; j < H; j++) {
      const light = Qy[j] / qmax;
      const al = Math.abs(LAT[j]);
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        if (isOcean[c]) {
          this.Kp[c] = 0;
          if (ice[c] > 0.5) {
            this.Ka[c] = 0;
            continue;
          }
          const nutrients = coast[c] <= 2 ? 1 : 0.32 + 0.45 * clamp(al / 65, 0, 1);
          const t = Ts[c];
          const tf = clamp((t + 2) / 14, 0.15, 1) * (t > 33 ? 0.6 : 1);
          this.Ka[c] = 1.5 * FOOD_SCALE * light * nutrients * tf;
        } else {
          this.Ka[c] = 0;
          this.Kp[c] = ice[c] > 0.5 ? 0 : miamiNPP(Ts[c], rain[c]) * ENERGY_PER_NPP;
        }
      }
    }
  }

  // Ein Monat Wachstum
  stepMonth(m) {
    if (!this.landStarted && !this.seaStarted) return;
    const { climate } = this.world;
    const { Ts, season, Qm, lightMax } = climate;
    const P = this.P;
    const A = this.A;
    for (let j = 0; j < H; j++) {
      const light = Qm[m * H + j] / lightMax[j];
      const off = m * N;
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        if (this.seaStarted) {
          const a = A[c];
          const k = this.Ka[c];
          if (a > 0) {
            if (k <= 0) A[c] = a * 0.97;
            else {
              const t = Ts[c] + season[off + c];
              const g = t < -1.8 ? 0 : 0.32 * light;
              let v = a + g * a * (1 - a / k);
              if (v > k) v -= 0.25 * (v - k);
              A[c] = v < 1e-4 ? 0 : v;
            }
          }
        }
        if (this.landStarted) {
          const p = P[c];
          if (p > 0) {
            const k = this.Kp[c];
            if (k <= 0.001) P[c] = p * 0.9;
            else {
              const t = Ts[c] + season[off + c];
              const g = t <= 0 ? 0 : 0.16 * Math.min(1, t / 12) * (0.35 + 0.65 * light);
              let v = p + g * p * (1 - p / k);
              if (v > k) v -= 0.15 * (v - k);
              P[c] = v < 1e-4 ? 0 : v;
            }
          }
        }
      }
    }
  }

  // Ausbreitung (Samen, Strömungen), einmal pro Jahr
  spreadYear() {
    if (this.seaStarted) this.spread(this.A, this.Ka, 0.3, true);
    if (this.landStarted) {
      this.spread(this.P, this.Kp, 0.2, false);
      // Samen mit Wind, Treibgut oder Tieren über das Meer: ab und zu wird eine ferne Küste grün
      const rng = this.world.rng;
      if (rng.chance(0.12)) {
        const { isOcean, coast } = this.world;
        for (let tries = 0; tries < 40; tries++) {
          const c = rng.int(N);
          if (!isOcean[c] && coast[c] <= 1 && this.Kp[c] > 0.3 * FOOD_SCALE && this.P[c] < 0.01) {
            this.P[c] = 0.2 * this.Kp[c];
            break;
          }
        }
      }
    }
  }

  spread(F, K, rate, ocean) {
    const { isOcean } = this.world;
    const src = F.slice();
    for (let j = 0; j < H; j++) {
      const up = j > 0 ? j - 1 : j;
      const dn = j < H - 1 ? j + 1 : j;
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        if ((isOcean[c] === 1) !== ocean || K[c] <= 0) continue;
        const l = j * W + ((i + W - 1) % W);
        const r = j * W + ((i + 1) % W);
        let best = 0;
        for (const n of [l, r, up * W + i, dn * W + i]) {
          if ((isOcean[n] === 1) === ocean) {
            const share = src[n] / Math.max(0.05, K[n]);
            if (share > best) best = share;
          }
        }
        if (best > 0.25) {
          const target = Math.min(K[c], best * K[c] * 0.5);
          if (F[c] < target) F[c] += (target - F[c]) * rate;
        }
      }
    }
  }

  totals() {
    let p = 0;
    let a = 0;
    let landCells = 0;
    for (let c = 0; c < N; c++) {
      p += this.P[c];
      a += this.A[c];
      if (this.P[c] > 0.05) landCells++;
    }
    return { plants: p, algae: a, greenCells: landCells };
  }
}

export { MONTHS };
