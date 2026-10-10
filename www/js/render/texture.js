// Baut die Bildtextur des Planeten (1024 x 512) aus Gelände, Klima und Leben.
// Statischer Teil (Relief, Meerestiefe) nur bei Kratern neu, der Rest bei Bedarf.
// Läuft ohne DOM, damit es auch in Node getestet werden kann.

import { W, H, N, TW, TH, LAT, COSLAT } from '../sim/const.js';
import { detailTerrain } from '../sim/planet.js';
import { vegCover, FOOD_SCALE } from '../sim/plants.js';
import { C, mix, tempColor, rainColor, speciesRgb } from './colors.js';
import { NG, HUE } from '../sim/genome.js';

export const LAYERS = [
  { id: 'natur', name: 'Natur' },
  { id: 'temperatur', name: 'Temperatur' },
  { id: 'regen', name: 'Regen' },
  { id: 'leben', name: 'Leben' },
];

const SX = TW / W;
const SY = TH / H;

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export class PlanetTexture {
  constructor(world) {
    this.world = world;
    this.data = new Uint8ClampedArray(TW * TH * 4);
    this.pixels = new Uint32Array(this.data.buffer);
    this.sea = new Uint8Array(TW * TH);
    this.shade = new Float32Array(TW * TH);
    this.depth = new Uint8ClampedArray(TW * TH * 3);
    this.elevHi = null;
    this.baseHi = null;
    this.terrainVersion = -1;
    // Werte je Simulationszelle (5 Kanäle: Land R, G, B, Algen, Meereis)
    this.cell = new Float32Array(N * 5);
    this.rowUp = new Float32Array(TW * H * 5);
    // Tabellen für die Interpolation
    this.ix0 = new Int32Array(TW);
    this.ix1 = new Int32Array(TW);
    this.iwx = new Float32Array(TW);
    this.iy0 = new Int32Array(TH);
    this.iy1 = new Int32Array(TH);
    this.iwy = new Float32Array(TH);
    for (let x = 0; x < TW; x++) {
      const f = (x + 0.5) / SX - 0.5;
      let a = Math.floor(f);
      const w = f - a;
      if (a < 0) a += W;
      this.ix0[x] = a;
      this.ix1[x] = (a + 1) % W;
      this.iwx[x] = w;
    }
    for (let y = 0; y < TH; y++) {
      const f = Math.min(H - 1.0001, Math.max(0, (y + 0.5) / SY - 0.5));
      const a = Math.floor(f);
      this.iy0[y] = a;
      this.iy1[y] = Math.min(H - 1, a + 1);
      this.iwy[y] = f - a;
    }
    this.lifeHue = new Float32Array(N * 3);
  }

  ensureStatic() {
    const world = this.world;
    if (this.terrainVersion === world.terrainVersion && this.elevHi) return false;
    if (!this.baseHi) this.baseHi = detailTerrain(world.planet);
    const e = this.baseHi.slice();
    for (const cr of world.craters) this.applyCrater(e, cr);
    this.elevHi = e;
    // Meer, Relief, Tiefe
    for (let y = 0; y < TH; y++) {
      const lat = 90 - ((y + 0.5) * 180) / TH;
      const cosl = Math.max(0.12, Math.cos((lat * Math.PI) / 180));
      const yu = y > 0 ? y - 1 : y;
      const yd = y < TH - 1 ? y + 1 : y;
      for (let x = 0; x < TW; x++) {
        const t = y * TW + x;
        const v = e[t];
        const sea = v < 0 ? 1 : 0;
        this.sea[t] = sea;
        const xl = x > 0 ? x - 1 : TW - 1;
        const xr = x < TW - 1 ? x + 1 : 0;
        if (!sea) {
          const dx = (e[y * TW + xr] - e[y * TW + xl]) / cosl;
          const dy = e[yd * TW + x] - e[yu * TW + x];
          // Licht von Nordwesten
          let s = 1 + (-dx * 0.7 + dy * 0.7) * 0.00042;
          s = s < 0.55 ? 0.55 : s > 1.35 ? 1.35 : s;
          this.shade[t] = s * (0.94 + 0.08 * Math.min(1, v / 3500));
        } else {
          this.shade[t] = 1;
          const d = -v;
          let col = mix(C.seaShallow, C.seaMid, smooth(30, 900, d));
          col = mix(col, C.seaDeep, smooth(600, 4800, d));
          // weiche Unterwasser-Struktur
          const dx = (e[y * TW + xr] - e[y * TW + xl]) / cosl;
          const k = 1 + Math.max(-0.08, Math.min(0.08, -dx * 0.00006));
          this.depth[t * 3] = col[0] * k;
          this.depth[t * 3 + 1] = col[1] * k;
          this.depth[t * 3 + 2] = col[2] * k;
        }
      }
    }
    this.terrainVersion = world.terrainVersion;
    return true;
  }

  applyCrater(e, cr) {
    const cx = cr.x * SX;
    const cy = cr.y * SY;
    const r = cr.r * SY;
    const y0 = Math.max(0, Math.floor(cy - r * 1.7));
    const y1 = Math.min(TH - 1, Math.ceil(cy + r * 1.7));
    for (let y = y0; y <= y1; y++) {
      const lat = 90 - ((y + 0.5) * 180) / TH;
      const cosl = Math.max(0.12, Math.cos((lat * Math.PI) / 180));
      const rx = (r * 1.7) / cosl;
      for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
        const x = ((xx % TW) + TW) % TW;
        const dx = (xx + 0.5 - cx) * cosl;
        const dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy);
        const t = y * TW + x;
        if (d < r) e[t] -= cr.depth * (1 - (d / r) ** 2);
        else e[t] += 0.18 * cr.depth * Math.exp(-(((d - r) / (0.35 * r)) ** 2));
      }
    }
  }

  // Werte je Zelle für die gewählte Ansicht
  computeCells(layer, month) {
    const world = this.world;
    const { climate, plants, isOcean } = world;
    const { Ts, season, rain, ice } = climate;
    const cell = this.cell;
    const off = month * N;
    if (layer === 'leben') this.computeLife();
    for (let c = 0; c < N; c++) {
      const tm = Ts[c] + season[off + c];
      let rgb;
      let alg = 0;
      let seaIce = 0;
      if (layer === 'temperatur') {
        rgb = tempColor(tm);
      } else if (layer === 'regen') {
        rgb = rainColor(rain[c]);
      } else {
        // Natur: kahler Boden nach Klima, darüber Pflanzen, darüber Schnee und Eis
        const t = Ts[c];
        const r = rain[c];
        const dry = smooth(900, 150, r);
        const cold = smooth(2, -12, t);
        let bare = mix(C.soil, C.sand, dry);
        bare = mix(bare, C.redrock, dry * smooth(18, 30, t) * 0.5);
        bare = mix(bare, C.rock, cold);
        const veg = isOcean[c] ? 0 : vegCover(plants.P[c]);
        let v;
        if (veg > 0.001) {
          const warm = smooth(-4, 24, t);
          const wet = smooth(250, 1800, r);
          const coldCol = mix(C.tundra, C.taiga, wet);
          const warmCol = mix(C.savanna, C.rainforest, wet);
          v = mix(coldCol, warmCol, warm);
          v = mix(v, C.temperate, (1 - Math.abs(warm - 0.55) * 2.2) * wet * 0.5 > 0 ? (1 - Math.abs(warm - 0.55) * 2.2) * wet * 0.5 : 0);
          rgb = mix(bare, v, smooth(0, 0.42, veg));
        } else rgb = bare;
        if (!isOcean[c]) {
          if (ice[c] > 0.5) rgb = C.glacier;
          else if (tm < 0) rgb = mix(rgb, C.snow, Math.min(1, -tm / 5) * (0.75 - 0.35 * veg));
        }
        if (layer === 'leben') {
          const l = (rgb[0] * 0.3 + rgb[1] * 0.55 + rgb[2] * 0.15) * 0.38;
          rgb = [l * 0.9, l * 0.95, l * 1.15];
        }
      }
      if (isOcean[c]) {
        alg = Math.min(1, plants.A[c] / (1.5 * FOOD_SCALE));
        seaIce = ice[c] > 0.5 ? 1 : tm < -1.8 ? Math.min(1, (-1.8 - tm) / 2.5) : 0;
      }
      if (layer === 'leben') {
        const k = c * 3;
        const n = this.lifeHue[k + 2];
        if (n > 0) {
          const hue = (Math.atan2(this.lifeHue[k + 1], this.lifeHue[k]) / (2 * Math.PI) + 1) % 1;
          rgb = mix(rgb, speciesRgb(hue), Math.min(0.9, 0.35 + n * 0.22));
        }
      }
      cell[c * 5] = rgb[0];
      cell[c * 5 + 1] = rgb[1];
      cell[c * 5 + 2] = rgb[2];
      cell[c * 5 + 3] = alg;
      cell[c * 5 + 4] = seaIce;
    }
    // Werte über die Küste hinweg ergänzen, damit die Interpolation keine falschen Farben mischt
    this.dilate();
  }

  computeLife() {
    const { life } = this.world;
    const lh = this.lifeHue;
    lh.fill(0);
    for (let i = 0; i < life.n; i++) {
      let ix = life.x[i] | 0;
      if (ix >= W) ix -= W;
      const c = (life.y[i] | 0) * W + ix;
      const h = life.genes[i * NG + HUE] * 2 * Math.PI;
      lh[c * 3] += Math.cos(h);
      lh[c * 3 + 1] += Math.sin(h);
      lh[c * 3 + 2] += 1;
    }
  }

  dilate() {
    const { isOcean } = this.world;
    const cell = this.cell;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const c = j * W + i;
        const o = isOcean[c];
        const nb = [j * W + ((i + W - 1) % W), j * W + ((i + 1) % W), j > 0 ? c - W : c, j < H - 1 ? c + W : c];
        // Landfarbe für Meereszellen, Meereswerte für Landzellen aus den Nachbarn
        let n = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let s = 0;
        for (const k of nb) {
          if (isOcean[k] !== o) {
            n++;
            if (o) {
              r += cell[k * 5];
              g += cell[k * 5 + 1];
              b += cell[k * 5 + 2];
            } else {
              a += cell[k * 5 + 3];
              s += cell[k * 5 + 4];
            }
          }
        }
        if (n) {
          if (o) {
            cell[c * 5] = r / n;
            cell[c * 5 + 1] = g / n;
            cell[c * 5 + 2] = b / n;
          } else {
            cell[c * 5 + 3] = a / n;
            cell[c * 5 + 4] = s / n;
          }
        }
      }
    }
  }

  // Textur neu zusammensetzen
  update(layer = 'natur', month = this.world.month) {
    this.ensureStatic();
    this.computeCells(layer, month);
    const cell = this.cell;
    const up = this.rowUp;
    // 1) waagerecht hochrechnen (je Zellreihe)
    for (let j = 0; j < H; j++) {
      const base = j * W;
      for (let x = 0; x < TW; x++) {
        const a = (base + this.ix0[x]) * 5;
        const b = (base + this.ix1[x]) * 5;
        const w = this.iwx[x];
        const o = (j * TW + x) * 5;
        up[o] = cell[a] + (cell[b] - cell[a]) * w;
        up[o + 1] = cell[a + 1] + (cell[b + 1] - cell[a + 1]) * w;
        up[o + 2] = cell[a + 2] + (cell[b + 2] - cell[a + 2]) * w;
        up[o + 3] = cell[a + 3] + (cell[b + 3] - cell[a + 3]) * w;
        up[o + 4] = cell[a + 4] + (cell[b + 4] - cell[a + 4]) * w;
      }
    }
    // 2) senkrecht und mit Relief/Tiefe zusammensetzen
    const d = this.data;
    const shade = this.shade;
    const depth = this.depth;
    const sea = this.sea;
    const ice = C.seaIce;
    const alg = C.algae;
    const isTemp = layer === 'temperatur';
    const isRain = layer === 'regen';
    const isLife = layer === 'leben';
    for (let y = 0; y < TH; y++) {
      const ra = this.iy0[y] * TW * 5;
      const rb = this.iy1[y] * TW * 5;
      const wy = this.iwy[y];
      for (let x = 0; x < TW; x++) {
        const t = y * TW + x;
        const a = ra + x * 5;
        const b = rb + x * 5;
        let R;
        let G;
        let B;
        if (sea[t]) {
          const al = up[a + 3] + (up[b + 3] - up[a + 3]) * wy;
          const si = up[a + 4] + (up[b + 4] - up[a + 4]) * wy;
          if (isTemp || isRain) {
            const k = isTemp ? 0.78 : 0;
            const cr = up[a] + (up[b] - up[a]) * wy;
            const cg = up[a + 1] + (up[b + 1] - up[a + 1]) * wy;
            const cb = up[a + 2] + (up[b + 2] - up[a + 2]) * wy;
            R = isTemp ? cr * k : depth[t * 3] * 0.35 + 14;
            G = isTemp ? cg * k : depth[t * 3 + 1] * 0.35 + 22;
            B = isTemp ? cb * k : depth[t * 3 + 2] * 0.45 + 34;
          } else {
            const f = isLife ? 0.45 : 1;
            R = depth[t * 3] * f;
            G = depth[t * 3 + 1] * f;
            B = depth[t * 3 + 2] * f;
            const am = al * 0.5;
            R += (alg[0] * f - R) * am;
            G += (alg[1] * f - G) * am;
            B += (alg[2] * f - B) * am;
            if (si > 0.02) {
              R += (ice[0] - R) * si;
              G += (ice[1] - G) * si;
              B += (ice[2] - B) * si;
            }
            if (isLife) {
              // Leben im Meer sichtbar machen
              const cr = up[a] + (up[b] - up[a]) * wy;
              const cg = up[a + 1] + (up[b + 1] - up[a + 1]) * wy;
              const cb = up[a + 2] + (up[b + 2] - up[a + 2]) * wy;
              const lum = (cr + cg + cb) / 3;
              if (lum > 60) {
                R = R * 0.4 + cr * 0.6;
                G = G * 0.4 + cg * 0.6;
                B = B * 0.4 + cb * 0.6;
              }
            }
          }
        } else {
          const s = isTemp || isRain ? 0.82 + 0.18 * shade[t] : shade[t];
          R = (up[a] + (up[b] - up[a]) * wy) * s;
          G = (up[a + 1] + (up[b + 1] - up[a + 1]) * wy) * s;
          B = (up[a + 2] + (up[b + 2] - up[a + 2]) * wy) * s;
        }
        const p = t * 4;
        d[p] = R;
        d[p + 1] = G;
        d[p + 2] = B;
        d[p + 3] = 255;
      }
    }
  }

  // Höhe an einer Stelle der feinen Textur (für Anzeige)
  elevationAt(x, y) {
    if (!this.elevHi) return 0;
    const tx = Math.floor((x / W) * TW) % TW;
    const ty = Math.min(TH - 1, Math.floor((y / H) * TH));
    return this.elevHi[ty * TW + tx];
  }
}

export { LAT, COSLAT };
