// Ersatz-Darstellung mit Canvas 2D für Geräte ohne WebGL2. Der Planet kommt als fertiges Bild (1024 x 512)
// aus dem Simulations-Prozess, die Kugel wird pixelweise gerechnet (wie in Version 0.1).

import { Globe } from '../render/globe.js';
import { drawSky } from '../render/sky.js';
import { TW, TH, W, H } from '../sim/const.js';
import { ATLAS_N, ATLAS_CELL, INST_FLOATS } from '../gl/renderer.js';

export class Fallback2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.sky = document.createElement('canvas');
    this.tex = document.createElement('canvas');
    this.tex.width = TW;
    this.tex.height = TH;
    this.texCtx = this.tex.getContext('2d');
    this.globe = new Globe();
    this.globeCanvas = document.createElement('canvas');
    this.globeCtx = this.globeCanvas.getContext('2d');
    this.atlas = document.createElement('canvas');
    this.atlas.width = ATLAS_N * ATLAS_CELL;
    this.atlas.height = ATLAS_N * ATLAS_CELL;
    this.atlasCtx = this.atlas.getContext('2d');
    this.texData = null;
    this.image = null;
    this.colors = new Map();
    this.dpr = 1;
  }

  setSprite(slot, canvas) {
    const x = (slot % ATLAS_N) * ATLAS_CELL;
    const y = Math.floor(slot / ATLAS_N) * ATLAS_CELL;
    this.atlasCtx.clearRect(x, y, ATLAS_CELL, ATLAS_CELL);
    this.atlasCtx.drawImage(canvas, x, y);
  }

  resize(w, h, dpr) {
    this.dpr = dpr;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    drawSky(this.sky, w, h, dpr);
  }

  setTexture(m) {
    this.texData = { data: new Uint8ClampedArray(m.data.buffer), sea: m.sea };
    this.texCtx.putImageData(new ImageData(this.texData.data, TW, TH), 0, 0);
  }

  css(r, g, b) {
    const key = ((r * 255) << 16) | ((g * 255) << 8) | (b * 255);
    let s = this.colors.get(key);
    if (!s) {
      s = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      this.colors.set(key, s);
    }
    return s;
  }

  draw(cam, inst, count) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.drawImage(this.sky, 0, 0);
    if (!this.texData) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (cam.view === 'globe') {
      const R = cam.radius();
      const glow = ctx.createRadialGradient(cam.cx, cam.cy, R * 0.92, cam.cx, cam.cy, R * 1.22);
      glow.addColorStop(0, 'rgba(110,170,255,0.38)');
      glow.addColorStop(0.35, 'rgba(90,150,255,0.12)');
      glow.addColorStop(1, 'rgba(90,150,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cam.cx, cam.cy, R * 1.22, 0, Math.PI * 2);
      ctx.fill();
      this.globe.setup(Math.round(R * 2 * dpr * 0.7));
      this.globe.tilt = cam.tilt;
      this.globe.lon = cam.lon;
      if (this.globeCanvas.width !== this.globe.res) {
        this.globeCanvas.width = this.globe.res;
        this.globeCanvas.height = this.globe.res;
        this.image = null;
      }
      const img = this.globe.render(this.texData);
      if (!this.image || this.image.width !== img.width) this.image = new ImageData(img.data, img.width, img.height);
      this.globeCtx.putImageData(this.image, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.globeCanvas, cam.cx - R, cam.cy - R, R * 2, R * 2);
    } else {
      const z = cam.zoom;
      const mapW = W * z;
      let ox = cam.cx - cam.mx * z;
      ox = (((ox % mapW) + mapW) % mapW) - mapW;
      const oy = cam.cy - cam.my * z;
      ctx.imageSmoothingEnabled = true;
      for (let k = ox; k < this.w; k += mapW) {
        if (k + mapW <= 0) continue;
        ctx.drawImage(this.tex, 0, 0, TW, TH, k, oy, mapW, H * z);
      }
    }
    // Lebewesen
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let q = 0; q < count; q++) {
      const p = q * INST_FLOATS;
      const x = inst[p];
      const y = inst[p + 1];
      const s = inst[p + 2];
      const slot = inst[p + 3];
      ctx.globalAlpha = inst[p + 7];
      if (slot < 0) {
        ctx.fillStyle = this.css(inst[p + 4], inst[p + 5], inst[p + 6]);
        ctx.fillRect(x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8);
      } else {
        const sx = (slot % ATLAS_N) * ATLAS_CELL;
        const sy = Math.floor(slot / ATLAS_N) * ATLAS_CELL;
        if (inst[p + 8] < 0) {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(-1, 1);
          ctx.drawImage(this.atlas, sx, sy, ATLAS_CELL, ATLAS_CELL, -s / 2, -s / 2, s, s);
          ctx.restore();
        } else ctx.drawImage(this.atlas, sx, sy, ATLAS_CELL, ATLAS_CELL, x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }
}
