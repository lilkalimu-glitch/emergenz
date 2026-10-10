// Lebewesen auf dem Bildschirm: aus den Gruppen der Simulation werden Punkte, Tierbilder oder einzelne Tiere,
// je nachdem, wie nah man herangezoomt ist. Bilder der Arten liegen in einem Atlas (für die Grafikkarte).

import { drawCreature, looks } from '../art/creatures.js';
import { ATLAS_N, ATLAS_CELL, INST_FLOATS } from '../gl/renderer.js';
import { speciesRgb } from '../render/colors.js';
import { W } from '../sim/const.js';
import { NEAR } from './camera.js';

const SLOTS = ATLAS_N * ATLAS_N;
const TAU = Math.PI * 2;
const GROUP_MIN = 7; // ab so vielen Bildschirmpixeln je Zelle: Tierbilder statt Punkte

function hash(n) {
  let h = Math.imul(n | 0, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

export class LifeLayer {
  // sink(slot, canvas): Bild einer Art in den Atlas übernehmen
  constructor(sink) {
    this.sink = sink;
    this.slotOf = new Map();
    this.sigOf = new Map();
    this.slotSp = new Int32Array(SLOTS);
    this.lastUse = new Float64Array(SLOTS);
    this.used = 0;
    this.queue = new Set();
    this.colors = new Map();
    this.canvas = document.createElement('canvas');
    this.canvas.width = ATLAS_CELL;
    this.canvas.height = ATLAS_CELL;
    this.ctx = this.canvas.getContext('2d');
    this.cap = 0;
    this.count = 0;
    this.ensure(4096);
    this.tmp = [0, 0, 0];
    this.mode = 0;
  }

  ensure(n) {
    if (n <= this.cap) return;
    const cap = Math.max(n, this.cap * 2);
    this.inst = new Float32Array(cap * INST_FLOATS);
    this.sorted = new Float32Array(cap * INST_FLOATS);
    this.keys = new Float64Array(cap);
    this.group = new Int32Array(cap);
    this.groupSorted = new Int32Array(cap);
    this.cap = cap;
  }

  // Atlas neu aufbauen (nach Verlust des Grafik-Kontexts)
  reset() {
    this.slotOf.clear();
    this.sigOf.clear();
    this.used = 0;
    this.queue.clear();
  }

  // Neue Artenliste: Farben merken, veränderte Arten neu zeichnen lassen
  setSpecies(map) {
    this.species = map;
    for (const s of map.values()) {
      if (!this.colors.has(s.id)) {
        const [r, g, b] = speciesRgb(s.hue);
        this.colors.set(s.id, [r / 255, g / 255, b / 255]);
      }
      const slot = this.slotOf.get(s.id);
      if (slot !== undefined && this.sigOf.get(s.id) !== looks(s)) this.queue.add(s.id);
    }
  }

  color(id) {
    return this.colors.get(id) || [0.75, 0.8, 0.85];
  }

  // Platz im Atlas für eine Art (oder -1, solange das Bild noch fehlt)
  slot(id, now) {
    const s = this.slotOf.get(id);
    if (s !== undefined) {
      this.lastUse[s] = now;
      return this.sigOf.has(id) ? s : -1;
    }
    this.queue.add(id);
    return -1;
  }

  // Ein paar fehlende Bilder pro Bild zeichnen, damit nichts ruckelt
  pump(now, budget = 4) {
    if (!this.queue.size || !this.species) return 0;
    let done = 0;
    for (const id of this.queue) {
      if (done >= budget) break;
      this.queue.delete(id);
      const sp = this.species.get(id);
      if (!sp) continue;
      let slot = this.slotOf.get(id);
      if (slot === undefined) {
        slot = this.allocate(now);
        if (slot < 0) continue;
        this.slotOf.set(id, slot);
        this.slotSp[slot] = id;
      }
      this.lastUse[slot] = now;
      const c = this.ctx;
      c.clearRect(0, 0, ATLAS_CELL, ATLAS_CELL);
      drawCreature(c, ATLAS_CELL / 2, ATLAS_CELL / 2, ATLAS_CELL * 0.84, sp);
      this.sink(slot, this.canvas);
      this.sigOf.set(id, looks(sp));
      done++;
    }
    return done;
  }

  allocate(now) {
    if (this.used < SLOTS) return this.used++;
    // am längsten nicht gebrauchtes Bild ersetzen
    let best = -1;
    let bt = now - 1500;
    for (let k = 0; k < SLOTS; k++) {
      if (this.lastUse[k] < bt) {
        bt = this.lastUse[k];
        best = k;
      }
    }
    if (best >= 0) {
      const old = this.slotSp[best];
      this.slotOf.delete(old);
      this.sigOf.delete(old);
    }
    return best;
  }

  // Instanzen für das aktuelle Bild bauen. o: { now, t (0..1 zwischen zwei Ständen), dpr, highlight, dim }
  build(f, cam, o) {
    this.count = 0;
    if (!f || !f.n) return 0;
    const n = f.n;
    const ppc = cam.pxPerCell();
    const mode = ppc < GROUP_MIN ? 0 : cam.view === 'map' && ppc >= NEAR ? 2 : 1;
    this.mode = mode;
    this.ensure(n * (mode === 2 ? 7 : 1) + 16);
    const inst = this.inst;
    const keys = this.keys;
    const group = this.group;
    const P = this.tmp;
    const dpr = o.dpr;
    const t = o.t;
    const now = o.now;
    const sec = now / 1000;
    const hl = o.highlight || 0;
    const margin = mode === 2 ? Math.min(140, ppc * 1.4) : 40;
    const w = cam.w;
    const h = cam.h;
    const dot = Math.max(2.2, Math.min(4.6, ppc * 0.75));
    let k = 0;
    const put = (gi, sx, sy, size, slot, r, g, b, a, flip) => {
      const p = k * INST_FLOATS;
      inst[p] = sx * dpr;
      inst[p + 1] = sy * dpr;
      inst[p + 2] = size * dpr;
      inst[p + 3] = slot;
      inst[p + 4] = r;
      inst[p + 5] = g;
      inst[p + 6] = b;
      inst[p + 7] = a;
      inst[p + 8] = flip;
      keys[k] = Math.floor((sy + 2000) * 4) * 65536 + k;
      group[k] = gi;
      k++;
    };
    for (let i = 0; i < n; i++) {
      // Position zwischen letztem und aktuellem Stand
      let x = f.x[i];
      let y = f.y[i];
      let dx = x - f.px[i];
      if (dx > W / 2) dx -= W;
      else if (dx < -W / 2) dx += W;
      const dy = y - f.py[i];
      if (t < 1 && dx * dx + dy * dy < 9) {
        x = f.px[i] + dx * t;
        y = f.py[i] + dy * t;
        if (x < 0) x += W;
        else if (x >= W) x -= W;
      }
      if (!cam.project(x, y, P)) continue;
      const sx = P[0];
      const sy = P[1];
      if (sx < -margin || sy < -margin || sx > w + margin || sy > h + margin) continue;
      const id = f.sp[i];
      const size = f.size[i] / 255;
      const dim = hl && id !== hl;
      const lit = hl && id === hl;
      const vis = P[2] * (dim ? 0.2 : 1);
      const slot = mode ? this.slot(id, now) : -1;
      if (slot < 0) {
        const c = this.color(id);
        const s = dot * (0.8 + 0.5 * size) * (lit ? 1.8 : 1) * (mode ? 1.4 : 1);
        put(i, sx, sy, s, -1, c[0], c[1], c[2], vis, 1);
        continue;
      }
      const water = f.land[i] < 90;
      // im Wasser etwas bläulich und durchscheinend
      const tr = water ? 0.86 : 1;
      const tg = water ? 0.94 : 1;
      const ta = vis * (water ? 0.9 : 1);
      const uid = f.uid[i];
      const hs = hash(uid);
      const facing = dx < -0.002 ? -1 : dx > 0.002 ? 1 : hs & 1 ? 1 : -1;
      if (mode === 1) {
        const s = Math.max(10, Math.min(34, ppc * (0.95 + 0.75 * size))) * (lit ? 1.35 : 1);
        const bob = water ? Math.sin(sec * 2 + (hs & 255)) * s * 0.04 : 0;
        put(i, sx, sy + bob, s, slot, tr, tg, 1, ta, facing);
        continue;
      }
      // Nahansicht: einzelne Tiere wuseln um die Stelle der Gruppe
      const mass = f.mass ? f.mass[i] / 255 : 0.5;
      const cnt = Math.max(2, Math.min(7, Math.round((size < 0.2 ? 4 : size < 0.45 ? 3.4 : size < 0.7 ? 2.6 : 2) + mass * 3)));
      const base = Math.max(10, Math.min(92, ppc * (0.26 + 0.38 * size)));
      const spread = ppc * 0.46;
      for (let m = 0; m < cnt; m++) {
        const hm = hash(uid * 8 + m + 1);
        const a0 = ((hm & 1023) / 1023) * TAU;
        const r0 = 0.2 + 0.8 * (((hm >>> 10) & 1023) / 1023);
        const sp = 0.15 + (((hm >>> 20) & 255) / 255) * 0.45;
        const ph = sec * sp + a0;
        const ox = Math.cos(ph) * r0 * spread;
        const oy = Math.sin(ph * 1.3 + a0) * r0 * spread * 0.62;
        // Blickrichtung aus der Bewegung (Ableitung) und dem Zug der Gruppe
        const vx = -Math.sin(ph) * r0 * sp + dx * 2;
        const flip = vx < 0 ? -1 : 1;
        const s = base * (0.82 + 0.36 * ((hm >>> 28) / 15));
        let bob = 0;
        if (!water) bob = -Math.abs(Math.sin(sec * (4 + sp * 6) + a0)) * s * 0.06;
        else bob = Math.sin(sec * 1.8 + a0) * s * 0.05;
        put(i, sx + ox, sy + oy + bob, s * (lit ? 1.25 : 1), slot, tr, tg, 1, ta, flip);
      }
    }
    this.count = k;
    if (mode === 0) {
      // Punkte: Reihenfolge egal
      this.out = inst;
      this.outGroup = group;
      return k;
    }
    // Tierbilder von hinten nach vorne (oben nach unten) zeichnen
    const ks = keys.subarray(0, k);
    ks.sort();
    const out = this.sorted;
    const gs = this.groupSorted;
    for (let q = 0; q < k; q++) {
      const src = ks[q] % 65536;
      out.set(inst.subarray(src * INST_FLOATS, src * INST_FLOATS + INST_FLOATS), q * INST_FLOATS);
      gs[q] = group[src];
    }
    this.out = out;
    this.outGroup = gs;
    return k;
  }

  // Nächstes Lebewesen zu einem Bildschirmpunkt (CSS-Pixel): Index der Gruppe oder -1
  pick(sx, sy, dpr, minR = 16) {
    const out = this.out;
    if (!out) return -1;
    let best = -1;
    let bd = Infinity;
    for (let q = this.count - 1; q >= 0; q--) {
      const p = q * INST_FLOATS;
      const x = out[p] / dpr;
      const y = out[p + 1] / dpr;
      const r = Math.max(minR, (out[p + 2] / dpr) * 0.55);
      const d = (x - sx) ** 2 + (y - sy) ** 2;
      if (d < r * r && d < bd) {
        bd = d;
        best = this.outGroup[q];
      }
    }
    return best;
  }
}
