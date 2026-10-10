// Flache Karte (Länge/Breite), nach Osten und Westen endlos, zoom- und verschiebbar.

import { W, H, TW, TH } from '../sim/const.js';

export class MapView {
  constructor() {
    this.x = W / 2; // Mitte in Zellen
    this.y = H / 2;
    this.zoom = 5; // Bildschirmpixel pro Zelle
    this.minZoom = 2;
    this.maxZoom = 46;
  }

  fit(w, h) {
    this.minZoom = Math.max(w / W, (h * 0.42) / H);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom));
    this.clamp(h);
  }

  clamp(h) {
    let x = this.x % W;
    if (x < 0) x += W;
    this.x = x;
    const half = h / (2 * this.zoom);
    const lo = Math.min(H / 2, half * 0.6);
    const hi = Math.max(H / 2, H - half * 0.6);
    this.y = Math.min(hi, Math.max(lo, this.y));
  }

  toScreen(gx, gy, w, h) {
    let dx = gx - this.x;
    if (dx > W / 2) dx -= W;
    if (dx < -W / 2) dx += W;
    return [w / 2 + dx * this.zoom, h / 2 + (gy - this.y) * this.zoom];
  }

  toWorld(sx, sy, w, h) {
    let x = this.x + (sx - w / 2) / this.zoom;
    x = ((x % W) + W) % W;
    const y = this.y + (sy - h / 2) / this.zoom;
    if (y < 0 || y >= H) return null;
    return [x, y];
  }

  draw(ctx, tex, w, h) {
    const z = this.zoom;
    const mapW = W * z;
    const mapH = H * z;
    let ox = w / 2 - this.x * z;
    ox = (((ox % mapW) + mapW) % mapW) - mapW;
    const oy = h / 2 - this.y * z;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = z > TW / W ? 'medium' : 'high';
    for (let k = ox; k < w; k += mapW) {
      if (k + mapW <= 0) continue;
      ctx.drawImage(tex, 0, 0, TW, TH, k, oy, mapW, mapH);
    }
    // feine Kante an den Polen
    ctx.fillStyle = 'rgba(140,200,255,0.18)';
    ctx.fillRect(0, oy - 1, w, 1);
    ctx.fillRect(0, oy + mapH, w, 1);
  }
}
