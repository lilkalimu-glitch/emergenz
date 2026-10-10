// Zeichnet den Planeten als Kugel (orthografische Projektion) mit Licht, Tag/Nacht-Grenze,
// Glanz auf den Meeren und Atmosphärensaum. Rechnet pixelweise in einen kleinen Puffer,
// der dann vergrößert dargestellt wird.

import { TW, TH, W, H } from '../sim/const.js';

const SUN = (() => {
  const v = [-0.62, 0.38, 0.69];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((x) => x / l);
})();

export class Globe {
  constructor() {
    this.res = 0;
    this.tilt = 0.32; // Blick von etwas oberhalb des Äquators
    this.lon = 0; // Drehung in Radiant
    this.tableTilt = null;
    this.image = null;
  }

  // Puffergröße festlegen (Pixel)
  setup(res) {
    res = Math.max(160, Math.min(720, Math.round(res)));
    if (res === this.res) return;
    this.res = res;
    const R = res / 2;
    const idx = [];
    const light = [];
    const haze = [];
    const spec = [];
    const nx = [];
    const ny = [];
    const nz = [];
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const x = (px + 0.5 - R) / R;
        const y = (R - (py + 0.5)) / R;
        const r2 = x * x + y * y;
        if (r2 >= 1) continue;
        const z = Math.sqrt(1 - r2);
        idx.push(py * res + px);
        nx.push(x);
        ny.push(y);
        nz.push(z);
        const d = x * SUN[0] + y * SUN[1] + z * SUN[2];
        // weiche Tag/Nacht-Grenze, Nachtseite nicht ganz schwarz
        const day = Math.min(1, Math.max(0, (d + 0.12) / 0.55));
        const dayS = day * day * (3 - 2 * day);
        light.push((0.07 + 0.93 * dayS) * (0.8 + 0.2 * z));
        const rim = Math.pow(1 - z, 2.4);
        haze.push(rim * (0.15 + 0.85 * dayS));
        const rv = 2 * d * z - SUN[2];
        spec.push(d > 0 ? Math.pow(Math.max(0, rv), 28) * 0.55 : 0);
      }
    }
    this.n = idx.length;
    this.idx = Int32Array.from(idx);
    this.light = Float32Array.from(light);
    this.haze = Float32Array.from(haze);
    this.spec = Float32Array.from(spec);
    this.nx = Float32Array.from(nx);
    this.ny = Float32Array.from(ny);
    this.nz = Float32Array.from(nz);
    this.row = new Int32Array(this.n);
    this.colBase = new Int32Array(this.n);
    this.image = new ImageDataLike(res, res);
    this.tableTilt = null;
  }

  // Für jeden Pixel: welche Stelle der Textur liegt dort (abhängig von der Neigung)
  computeTables() {
    const ct = Math.cos(this.tilt);
    const st = Math.sin(this.tilt);
    for (let k = 0; k < this.n; k++) {
      const x = this.nx[k];
      const y = this.ny[k];
      const z = this.nz[k];
      const up = y * ct + z * st;
      const fwd = z * ct - y * st;
      const lat = Math.asin(Math.max(-1, Math.min(1, up)));
      const lonRel = Math.atan2(x, fwd);
      let ty = Math.floor((0.5 - lat / Math.PI) * TH);
      if (ty < 0) ty = 0;
      if (ty >= TH) ty = TH - 1;
      this.row[k] = ty * TW;
      this.colBase[k] = Math.floor(((lonRel + Math.PI) / (2 * Math.PI)) * TW);
    }
    this.tableTilt = this.tilt;
  }

  render(tex) {
    if (this.tableTilt !== this.tilt) this.computeTables();
    const out = this.image.u32;
    out.fill(0);
    const src = tex.data;
    const sea = tex.sea;
    let off = Math.floor((((this.lon / (2 * Math.PI)) % 1) + 1) * TW) % TW;
    off = (off + TW / 2) % TW; // Länge 0 der Textur liegt bei -180°
    const { idx, row, colBase, light, haze, spec } = this;
    for (let k = 0; k < this.n; k++) {
      let col = colBase[k] + off;
      if (col >= TW) col -= TW;
      const t = row[k] + col;
      const p = t * 4;
      const l = light[k];
      const h = haze[k];
      let r = src[p] * l + h * 120;
      let g = src[p + 1] * l + h * 170;
      let b = src[p + 2] * l + h * 255;
      if (sea[t]) {
        const s = spec[k] * 255;
        r += s;
        g += s;
        b += s * 0.9;
      }
      r = r > 255 ? 255 : r;
      g = g > 255 ? 255 : g;
      b = b > 255 ? 255 : b;
      out[idx[k]] = 0xff000000 | (b << 16) | (g << 8) | r;
    }
    return this.image;
  }

  // Rasterkoordinaten (Zellen) -> Bildschirm relativ zum Kugelmittelpunkt in Radien, oder null wenn hinten
  project(x, y) {
    const lat = (0.5 - y / H) * Math.PI;
    const lon = (x / W) * 2 * Math.PI - Math.PI;
    const rel = lon - this.lon;
    const cl = Math.cos(lat);
    const X = cl * Math.sin(rel);
    const Y = Math.sin(lat);
    const Z = cl * Math.cos(rel);
    const ct = Math.cos(this.tilt);
    const st = Math.sin(this.tilt);
    const vy = Y * ct - Z * st;
    const vz = Y * st + Z * ct;
    if (vz <= 0) return null;
    return [X, vy, vz];
  }

  // Bildschirmpunkt (in Radien, -1..1) -> Rasterkoordinaten oder null außerhalb
  unproject(x, y) {
    const r2 = x * x + y * y;
    if (r2 >= 1) return null;
    const z = Math.sqrt(1 - r2);
    const ct = Math.cos(this.tilt);
    const st = Math.sin(this.tilt);
    const up = y * ct + z * st;
    const fwd = z * ct - y * st;
    const lat = Math.asin(Math.max(-1, Math.min(1, up)));
    let lon = Math.atan2(x, fwd) + this.lon;
    lon = (((lon + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return [(lon / (2 * Math.PI)) * W, (0.5 - lat / Math.PI) * H];
  }

  // Blick auf eine Stelle drehen
  lookAt(x, y) {
    const lat = (0.5 - y / H) * Math.PI;
    const lon = (x / W) * 2 * Math.PI - Math.PI;
    this.lon = lon;
    this.tilt = Math.max(-1.2, Math.min(1.2, lat));
  }
}

// Schlanker Ersatz für ImageData, damit der Code auch ohne Browser läuft
export class ImageDataLike {
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.u32 = new Uint32Array(this.data.buffer);
  }
}
