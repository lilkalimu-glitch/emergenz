// Erzeugt das Gelände eines Planeten aus einem Seed.
// Kontinente aus verzerrtem Rauschen, Gebirge als Grate in "tektonischen Gürteln",
// Meeresspiegel so gewählt, dass etwa 68 % der Fläche Ozean sind (Erde: 71 %).

import { RNG } from './rng.js';
import { makeNoise3, fbm, ridged } from './noise.js';
import { W, H, N, BW, BH, TW, TH, COSLAT, smoothstep } from './const.js';

export const OCEAN_SHARE = 0.68;

function sphere(i, j, w, h) {
  const lat = (0.5 - (j + 0.5) / h) * Math.PI;
  const lon = ((i + 0.5) / w) * 2 * Math.PI;
  const cl = Math.cos(lat);
  return [cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat)];
}

function makeNoises(seed) {
  const rng = new RNG((seed ^ 0x51ed270b) >>> 0);
  return {
    cont: makeNoise3(rng),
    warp: makeNoise3(rng),
    mount: makeNoise3(rng),
    detail: makeNoise3(rng),
  };
}

// Roh-Höhe (ohne Einheit) an einem Punkt der Einheitskugel
function rawHeight(nz, x, y, z) {
  const wx = fbm(nz.warp, x * 1.3 + 3.1, y * 1.3, z * 1.3, 3);
  const wy = fbm(nz.warp, x * 1.3, y * 1.3 + 7.7, z * 1.3, 3);
  const wz = fbm(nz.warp, x * 1.3, y * 1.3, z * 1.3 + 5.3, 3);
  const px = x + 0.33 * wx;
  const py = y + 0.33 * wy;
  const pz = z + 0.33 * wz;
  const cont = fbm(nz.cont, px * 0.85, py * 0.85, pz * 0.85, 7, 2, 0.42);
  const belt = fbm(nz.mount, x * 0.9 + 9.1, y * 0.9, z * 0.9, 2);
  const ridge = ridged(nz.mount, px * 2.7, py * 2.7, pz * 2.7, 5);
  const mask = smoothstep(0.02, 0.38, belt) * smoothstep(-0.03, 0.2, cont);
  return cont + 0.55 * ridge * mask + 0.06 * ridge;
}

// Schwelle so, dass der flächengewichtete Anteil unter der Schwelle = share ist
function areaPercentile(values, w, h, share) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < values.length; k++) {
    if (values[k] < lo) lo = values[k];
    if (values[k] > hi) hi = values[k];
  }
  const BINS = 4096;
  const hist = new Float64Array(BINS);
  let total = 0;
  for (let j = 0; j < h; j++) {
    const wgt = Math.cos((0.5 - (j + 0.5) / h) * Math.PI);
    for (let i = 0; i < w; i++) {
      const v = values[j * w + i];
      const b = Math.min(BINS - 1, Math.floor(((v - lo) / (hi - lo)) * BINS));
      hist[b] += wgt;
      total += wgt;
    }
  }
  let acc = 0;
  for (let b = 0; b < BINS; b++) {
    acc += hist[b];
    if (acc >= share * total) return { level: lo + ((b + 1) / BINS) * (hi - lo), lo, hi };
  }
  return { level: hi, lo, hi };
}

function toMeters(e, sea, lo, hi) {
  if (e >= sea) {
    const t = (e - sea) / (hi - sea);
    return 20 + 6200 * Math.pow(t, 1.45);
  }
  const d = (sea - e) / (sea - lo);
  // flacher Schelf an der Küste, dann Abhang zur Tiefsee
  const f = d < 0.06 ? (0.035 * d) / 0.06 : 0.035 + 0.965 * Math.pow((d - 0.06) / 0.94, 0.55);
  return -(40 + 5600 * f);
}

export function generatePlanet(seed) {
  const nz = makeNoises(seed);

  // 1) Grundgelände in mittlerer Auflösung
  const raw = new Float32Array(BW * BH);
  for (let j = 0; j < BH; j++) {
    for (let i = 0; i < BW; i++) {
      const [x, y, z] = sphere(i, j, BW, BH);
      raw[j * BW + i] = rawHeight(nz, x, y, z);
    }
  }
  const { level, lo, hi } = areaPercentile(raw, BW, BH, OCEAN_SHARE);
  const base = new Float32Array(BW * BH);
  for (let k = 0; k < base.length; k++) base[k] = toMeters(raw[k], level, lo, hi);

  // 2) Simulationsraster: Mittel aus 2x2 Zellen
  const elev = new Float32Array(N);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const a = base[2 * j * BW + 2 * i];
      const b = base[2 * j * BW + 2 * i + 1];
      const c = base[(2 * j + 1) * BW + 2 * i];
      const d = base[(2 * j + 1) * BW + 2 * i + 1];
      elev[j * W + i] = (a + b + c + d) / 4;
    }
  }

  return { seed, base, elev, noises: nz };
}

// Feines Gelände für die Darstellung: Grundgelände hochskaliert plus Detailrauschen
export function detailTerrain(planet, base = planet.base) {
  const { noises } = planet;
  const out = new Float32Array(TW * TH);
  const sx = BW / TW;
  const sy = BH / TH;
  for (let j = 0; j < TH; j++) {
    const fy = Math.min(BH - 1.001, Math.max(0, (j + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    for (let i = 0; i < TW; i++) {
      const fx = (i + 0.5) * sx - 0.5;
      let x0 = Math.floor(fx);
      const tx = fx - x0;
      if (x0 < 0) x0 += BW;
      const x1 = (x0 + 1) % BW;
      const a = base[y0 * BW + x0];
      const b = base[y0 * BW + x1];
      const c = base[(y0 + 1) * BW + x0];
      const d = base[(y0 + 1) * BW + x1];
      let e = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      const [x, y, z] = sphere(i, j, TW, TH);
      const n = fbm(noises.detail, x * 16, y * 16, z * 16, 3);
      e += n * (e > 0 ? 260 : 90);
      out[j * TW + i] = e;
    }
  }
  return out;
}

// Abstand jeder Zelle zur nächsten Zelle des anderen Typs (Land/Meer), in Zellen
export function coastDistance(isOcean) {
  const dist = new Uint8Array(N).fill(255);
  const queue = new Int32Array(N);
  let qh = 0;
  let qt = 0;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const o = isOcean[k];
      const l = j * W + ((i + W - 1) % W);
      const r = j * W + ((i + 1) % W);
      const u = j > 0 ? k - W : k;
      const d = j < H - 1 ? k + W : k;
      if (isOcean[l] !== o || isOcean[r] !== o || isOcean[u] !== o || isOcean[d] !== o) {
        dist[k] = 0;
        queue[qt++] = k;
      }
    }
  }
  while (qh < qt) {
    const k = queue[qh++];
    const j = (k / W) | 0;
    const i = k - j * W;
    const nd = dist[k] + 1;
    if (nd > 250) continue;
    const nb = [j * W + ((i + W - 1) % W), j * W + ((i + 1) % W), j > 0 ? k - W : -1, j < H - 1 ? k + W : -1];
    for (const n of nb) {
      if (n >= 0 && dist[n] > nd && isOcean[n] === isOcean[k]) {
        dist[n] = nd;
        queue[qt++] = n;
      }
    }
  }
  return dist;
}

export function oceanShare(elev) {
  let o = 0;
  let t = 0;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      t += COSLAT[j];
      if (elev[j * W + i] < 0) o += COSLAT[j];
    }
  }
  return o / t;
}
