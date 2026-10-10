// Kamera für Globus und Karte: Umrechnung zwischen Bildschirm und Planet, Gesten, sanfte Flüge.
// Globus: echte Perspektive (Kamera im Abstand dist, in Planetenradien). Karte: flach, nach Osten und Westen endlos.
// Alle Bildschirmangaben in CSS-Pixeln.

import { W, H } from '../sim/const.js';

export const TAN_HALF = 0.364; // halber Blickwinkel ca. 20 Grad
export const DIST_MIN = 1.75; // noch näher heran: Wechsel zur Karte
export const DIST_MAX = 7.5;
export const DIST_GAME = 3.3;
export const MAP_MAX = 150; // Bildschirmpixel je Zelle
export const NEAR = 26; // ab hier Nahansicht mit einzelnen Tieren
const TAU = Math.PI * 2;
const CELL_RAD = TAU / W;

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapPi = (a) => a - TAU * Math.round(a / TAU);
const wrapCells = (d) => d - W * Math.round(d / W);

export class Camera {
  constructor() {
    this.view = 'globe';
    this.lon = 0;
    this.tilt = 0.32;
    this.dist = DIST_GAME;
    this.mx = W / 2;
    this.my = H / 2;
    this.zoom = 4;
    this.minZoom = 2;
    this.w = 1;
    this.h = 1;
    this.cx = 0;
    this.cy = 0;
    this.half = 1;
    this.target = null;
    this.ortho = false; // Ersatz-Darstellung ohne WebGL: einfache Parallelprojektion
    this.flight = null;
    this.vlon = 0;
    this.vtilt = 0;
    this.vx = 0;
    this.vy = 0;
    this.lastInput = -1e9;
    this.spin = 0.05;
    this.update(0, 0);
  }

  // Bildschirm und Platz für den Planeten (base = Radius beim normalen Abstand)
  setLayout(w, h, cx, cy, base, instant = false) {
    this.w = w;
    this.h = h;
    this.target = { cx, cy, half: base * TAN_HALF * Math.sqrt(DIST_GAME * DIST_GAME - 1) };
    if (instant || this.half <= 1) {
      this.cx = cx;
      this.cy = cy;
      this.half = this.target.half;
    }
    this.minZoom = Math.max(w / W, (h * 0.42) / H);
    if (this.view === 'map') this.clampMap();
  }

  radius() {
    return this.half / (TAN_HALF * Math.sqrt(Math.max(1e-6, this.dist * this.dist - 1)));
  }

  // Bildschirmpixel je Zelle in der Mitte des Bildes
  pxPerCell() {
    if (this.view === 'map') return this.zoom;
    if (this.ortho) return this.radius() * CELL_RAD;
    return (this.half * CELL_RAD) / ((this.dist - 1) * TAN_HALF);
  }

  kmPerPx() {
    return (TAU * 6371) / W / this.pxPerCell();
  }

  touch(now) {
    this.lastInput = now;
    this.flight = null;
  }

  update(dt, now) {
    // Platz auf dem Bildschirm weich anpassen (Start -> Spiel)
    if (this.target) {
      const k = 1 - Math.exp(-dt * 5);
      this.cx += (this.target.cx - this.cx) * k;
      this.cy += (this.target.cy - this.cy) * k;
      this.half += (this.target.half - this.half) * k;
    }
    const f = this.flight;
    if (f) {
      const t = Math.min(1, (now - f.t0) / f.dur);
      const e = ease(t);
      if (f.view === 'globe') {
        this.lon = f.lon0 + f.dlon * e;
        this.tilt = f.tilt0 + (f.tilt1 - f.tilt0) * e;
        this.dist = f.dist0 + (f.dist1 - f.dist0) * e;
      } else {
        this.mx = (((f.mx0 + f.dmx * e) % W) + W) % W;
        this.my = f.my0 + (f.my1 - f.my0) * e;
        this.zoom = Math.exp(Math.log(f.z0) + (Math.log(f.z1) - Math.log(f.z0)) * e);
      }
      if (t >= 1) this.flight = null;
    } else if (dt > 0) {
      // Schwung nach dem Wischen
      const decay = Math.exp(-dt * 4.5);
      if (this.view === 'globe') {
        this.lon += this.vlon * dt;
        this.tilt = Math.max(-1.25, Math.min(1.25, this.tilt + this.vtilt * dt));
        this.vlon *= decay;
        this.vtilt *= decay;
        if (now - this.lastInput > 6000 && this.dist > 2.3) this.lon += dt * this.spin;
      } else {
        this.mx += this.vx * dt;
        this.my += this.vy * dt;
        this.vx *= decay;
        this.vy *= decay;
        this.clampMap();
      }
    }
    this.lon = wrapPi(this.lon);
    this.ct = Math.cos(this.tilt);
    this.st = Math.sin(this.tilt);
  }

  clampMap() {
    this.mx = ((this.mx % W) + W) % W;
    this.zoom = Math.max(this.minZoom, Math.min(MAP_MAX, this.zoom));
    const half = this.h / (2 * this.zoom);
    const lo = Math.min(H / 2, half * 0.6);
    const hi = Math.max(H / 2, H - half * 0.6);
    this.my = Math.min(hi, Math.max(lo, this.my));
  }

  // ---------- Umrechnung ----------

  // Welt (Zellen) -> Bildschirm. out = [x, y, Sichtbarkeit 0..1]; false, wenn auf der Rückseite
  project(x, y, out) {
    if (this.view === 'map') {
      out[0] = this.cx + wrapCells(x - this.mx) * this.zoom;
      out[1] = this.cy + (y - this.my) * this.zoom;
      out[2] = 1;
      return true;
    }
    const lat = (0.5 - y / H) * Math.PI;
    const rel = (x / W) * TAU - Math.PI - this.lon;
    const cl = Math.cos(lat);
    const X = cl * Math.sin(rel);
    const up = Math.sin(lat);
    const fwd = cl * Math.cos(rel);
    const Y = up * this.ct - fwd * this.st;
    const Z = up * this.st + fwd * this.ct;
    if (this.ortho) {
      if (Z <= 0) return false;
      const R = this.radius();
      out[0] = this.cx + X * R;
      out[1] = this.cy - Y * R;
      out[2] = Math.min(1, Z * 5);
      return true;
    }
    const lim = 1 / this.dist;
    if (Z <= lim) return false;
    const k = this.half / ((this.dist - Z) * TAN_HALF);
    out[0] = this.cx + X * k;
    out[1] = this.cy - Y * k;
    out[2] = Math.min(1, (Z - lim) * 6);
    return true;
  }

  // Bildschirm -> Welt (Zellen) oder null, wenn daneben
  unproject(sx, sy) {
    if (this.view === 'map') {
      const y = this.my + (sy - this.cy) / this.zoom;
      if (y < 0 || y >= H) return null;
      const x = this.mx + (sx - this.cx) / this.zoom;
      return [((x % W) + W) % W, y];
    }
    let nx;
    let ny;
    let nz;
    if (this.ortho) {
      const R = this.radius();
      nx = (sx - this.cx) / R;
      ny = -(sy - this.cy) / R;
      const r2 = nx * nx + ny * ny;
      if (r2 >= 1) return null;
      nz = Math.sqrt(1 - r2);
    } else {
      const px = ((sx - this.cx) / this.half) * TAN_HALF;
      const py = (-(sy - this.cy) / this.half) * TAN_HALF;
      const len = Math.hypot(px, py, 1);
      const rx = px / len;
      const ry = py / len;
      const rz = -1 / len;
      const d = this.dist;
      const b = d * rz;
      const h = b * b - (d * d - 1);
      if (h < 0) return null;
      const t = -b - Math.sqrt(h);
      nx = rx * t;
      ny = ry * t;
      nz = d + rz * t;
    }
    const up = ny * this.ct + nz * this.st;
    const fwd = nz * this.ct - ny * this.st;
    const lat = Math.asin(Math.max(-1, Math.min(1, up)));
    let lon = Math.atan2(nx, fwd) + this.lon + Math.PI;
    lon = ((lon % TAU) + TAU) % TAU;
    return [(lon / TAU) * W, Math.min(H - 0.001, Math.max(0, (0.5 - lat / Math.PI) * H))];
  }

  // Welt-Mitte des Bildes
  center() {
    if (this.view === 'map') return [this.mx, this.my];
    return this.unproject(this.cx, this.cy) || [W / 2, H / 2];
  }

  // ---------- Gesten ----------

  dragBy(dx, dy) {
    if (this.view === 'map') {
      this.mx -= dx / this.zoom;
      this.my -= dy / this.zoom;
      this.clampMap();
      return;
    }
    const k = this.ortho ? this.radius() : this.half / ((this.dist - 1) * TAN_HALF);
    this.lon -= dx / (k * Math.max(0.35, Math.cos(this.tilt)));
    this.tilt = Math.max(-1.25, Math.min(1.25, this.tilt + dy / k));
    this.ct = Math.cos(this.tilt);
    this.st = Math.sin(this.tilt);
  }

  // Schwung in CSS-Pixeln pro Sekunde
  fling(vx, vy) {
    if (this.view === 'map') {
      this.vx = -vx / this.zoom;
      this.vy = -vy / this.zoom;
    } else {
      const k = this.ortho ? this.radius() : this.half / ((this.dist - 1) * TAN_HALF);
      this.vlon = -vx / (k * Math.max(0.35, Math.cos(this.tilt)));
      this.vtilt = vy / k;
    }
  }

  stop() {
    this.vlon = this.vtilt = this.vx = this.vy = 0;
  }

  // Vergrößern um Faktor f um den Bildschirmpunkt (sx, sy).
  // Rückgabe: 'map' oder 'globe', wenn dabei die Ansicht wechseln sollte
  zoomAt(f, sx, sy) {
    const before = this.unproject(sx, sy);
    if (this.view === 'map') {
      const z = this.zoom * f;
      if (z < this.minZoom * 0.82) return 'globe';
      this.zoom = Math.max(this.minZoom, Math.min(MAP_MAX, z));
      if (before) {
        const after = this.unproject(sx, sy);
        if (after) {
          this.mx += wrapCells(before[0] - after[0]);
          this.my += before[1] - after[1];
        }
      }
      this.clampMap();
      return null;
    }
    const d = 1 + (this.dist - 1) / f;
    if (d < DIST_MIN) return 'map';
    this.dist = Math.min(DIST_MAX, d);
    // Punkt unter den Fingern festhalten
    if (before) {
      const p = [0, 0, 0];
      if (this.project(before[0], before[1], p)) this.dragBy(sx - p[0], sy - p[1]);
    }
    return null;
  }

  lookAt(x, y) {
    this.lon = wrapPi((x / W) * TAU - Math.PI);
    this.tilt = Math.max(-1.2, Math.min(1.2, (0.5 - y / H) * Math.PI));
    this.ct = Math.cos(this.tilt);
    this.st = Math.sin(this.tilt);
  }

  // Wechsel zur Karte, Maßstab in der Mitte bleibt gleich
  toMap(focus) {
    const c = focus || this.center();
    const z = this.view === 'globe' ? this.pxPerCell() : this.zoom;
    this.view = 'map';
    this.mx = c[0];
    this.my = c[1];
    this.zoom = Math.max(this.minZoom * 1.1, Math.min(MAP_MAX, z));
    this.stop();
    this.flight = null;
    this.clampMap();
  }

  toGlobe(focus) {
    const c = focus || this.center();
    const z = this.view === 'map' ? this.zoom : this.pxPerCell();
    this.view = 'globe';
    this.lookAt(c[0], c[1]);
    this.tilt *= 0.7;
    const d = 1 + (this.half * CELL_RAD) / (Math.max(z, 0.1) * TAN_HALF);
    this.dist = Math.max(DIST_MIN + 0.15, Math.min(DIST_GAME, d));
    this.stop();
    this.flight = null;
  }

  // Sanfter Flug zu einer Stelle; zoom = gewünschte Bildschirmpixel je Zelle (optional)
  flyTo(x, y, now, zoom = 0, dur = 900) {
    this.stop();
    if (this.view === 'map') {
      const z1 = zoom ? Math.max(this.minZoom, Math.min(MAP_MAX, zoom)) : this.zoom;
      this.flight = { view: 'map', t0: now, dur, mx0: this.mx, dmx: wrapCells(x - this.mx), my0: this.my, my1: y, z0: this.zoom, z1 };
      return;
    }
    const lon1 = (x / W) * TAU - Math.PI;
    const tilt1 = Math.max(-1.2, Math.min(1.2, (0.5 - y / H) * Math.PI)) * 0.85;
    let dist1 = this.dist;
    if (zoom) dist1 = Math.max(DIST_MIN + 0.05, Math.min(DIST_MAX, 1 + (this.half * CELL_RAD) / (zoom * TAN_HALF)));
    this.flight = { view: 'globe', t0: now, dur, lon0: this.lon, dlon: wrapPi(lon1 - this.lon), tilt0: this.tilt, tilt1, dist0: this.dist, dist1 };
  }

  // Standbild der Kamera (für Überblendungen beim Wechsel zwischen Globus und Karte)
  clone() {
    const c = new Camera();
    for (const k of ['view', 'lon', 'tilt', 'dist', 'mx', 'my', 'zoom', 'minZoom', 'w', 'h', 'cx', 'cy', 'half', 'ortho', 'ct', 'st']) c[k] = this[k];
    c.target = null;
    return c;
  }
}
