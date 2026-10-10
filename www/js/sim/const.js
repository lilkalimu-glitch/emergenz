// Feste Größen der Simulation.

// Simulationsraster (Länge x Breite), jede Zelle ca. 1,4 Grad
export const W = 256;
export const H = 128;
export const N = W * H;

// Raster für die Geländeerzeugung und für die Darstellung
export const BW = 512;
export const BH = 256;
export const TW = 1024;
export const TH = 512;

export const MONTHS = 12;
export const DEG = Math.PI / 180;

// Breitengrad jeder Rasterzeile in Grad (Zeile 0 = Nordpol)
export const LAT = new Float32Array(H);
export const COSLAT = new Float32Array(H);
export const SINLAT = new Float32Array(H);
for (let j = 0; j < H; j++) {
  const lat = 90 - ((j + 0.5) * 180) / H;
  LAT[j] = lat;
  COSLAT[j] = Math.cos(lat * DEG);
  SINLAT[j] = Math.sin(lat * DEG);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function wrapX(x) {
  x %= W;
  return x < 0 ? x + W : x;
}

export function cellOf(x, y) {
  let i = x | 0;
  let j = y | 0;
  if (i >= W) i -= W;
  if (i < 0) i += W;
  if (j < 0) j = 0;
  if (j >= H) j = H - 1;
  return j * W + i;
}

// Breite/Länge (Grad) zu Rasterkoordinaten
export function latLonToXY(lat, lon) {
  const x = wrapX(((lon + 180) / 360) * W);
  const y = clamp(((90 - lat) / 180) * H, 0, H - 0.001);
  return [x, y];
}

export function xyToLatLon(x, y) {
  return [90 - (y / H) * 180, (x / W) * 360 - 180];
}
