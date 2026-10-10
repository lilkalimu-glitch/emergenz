// Verwaltet eine Welt für den Simulations-Prozess (Web Worker) und bereitet Daten für die Anzeige vor.
// Kein Browser-Code hier, damit alles auch in Node getestet werden kann.

import { World } from './world.js';
import { W, H, N, BW, BH } from './const.js';
import { NG, SIZE, LAND, HUE } from './genome.js';
import { vegCover, FOOD_SCALE } from './plants.js';
import { speciesRgb } from '../render/colors.js';

export const SPEED_MONTHS = [0, 12, 72, Infinity];

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Kanal k eines RGBA-Felds (W x H) mit [1 2 1] in beide Richtungen glätten (Ost-West ringsum)
function blurChannel(a, k, tmp) {
  for (let j = 0; j < H; j++) {
    const row = j * W;
    for (let i = 0; i < W; i++) {
      const l = i === 0 ? W - 1 : i - 1;
      const r = i === W - 1 ? 0 : i + 1;
      tmp[row + i] = a[(row + l) * 4 + k] + 2 * a[(row + i) * 4 + k] + a[(row + r) * 4 + k];
    }
  }
  for (let j = 0; j < H; j++) {
    const u = (j === 0 ? 0 : j - 1) * W;
    const d = (j === H - 1 ? H - 1 : j + 1) * W;
    const row = j * W;
    for (let i = 0; i < W; i++) a[(row + i) * 4 + k] = (tmp[u + i] + 2 * tmp[row + i] + tmp[d + i]) / 16;
  }
}

export class SimHost {
  constructor() {
    this.tmp = new Float32Array(N);
    this.world = null;
    this.started = false;
    this.layer = 'natur';
    this.fieldsKey = '';
    this.lifeFieldAt = 0;
    this.terrainSent = -1;
    this.speciesSentAt = 0;
    this.speciesKey = '';
  }

  resetSync() {
    this.fieldsKey = '';
    this.terrainSent = -1;
    this.speciesKey = '';
    this.speciesSentAt = 0;
  }

  previewWorld(seed) {
    this.world = World.create({ seed, start: 'leer' });
    this.started = false;
    this.resetSync();
    return this.world;
  }

  start(mode) {
    const w = this.world;
    w.start = mode;
    if (mode === 'ursuppe') w.seedPrimordial();
    else w.chronicle.add('welt', 'Noch ist der Planet leer. Ob hier Leben entsteht, entscheiden Zeit und Zufall.', null, true);
    this.started = true;
    this.resetSync();
  }

  restore(data) {
    this.world = World.restore(data);
    this.started = true;
    this.resetSync();
    return this.world;
  }

  // ---------- Eingriffe ----------

  act(kind, a = {}) {
    const w = this.world;
    if (!w) return null;
    switch (kind) {
      case 'meteor':
        return w.meteor(a.x, a.y, a.size);
      case 'weather':
        w.weather(a.x, a.y, a.mode);
        return true;
      case 'sow':
        return w.sow(a.x, a.y, a.kind);
      case 'sun':
        w.setSun(a.v);
        return true;
      case 'co2':
        w.setCO2(a.v);
        return true;
      case 'log':
        w.logParam(a.kind);
        return true;
      case 'step':
        w.step(a.months);
        return true;
      default:
        if (typeof w.act === 'function') return w.act(kind, a);
        return null;
    }
  }

  // ---------- Abfragen ----------

  query(what, a = {}) {
    const w = this.world;
    if (!w) return null;
    if (what === 'cell') {
      const info = w.cellInfo(a.x, a.y);
      return {
        ...info,
        groups: info.groups.map((g) => ({ id: g.sp.id, n: g.n })),
      };
    }
    if (what === 'group') {
      const L = w.life;
      for (let i = 0; i < L.n; i++) {
        if (L.uid[i] !== a.uid) continue;
        return {
          uid: L.uid[i],
          sp: L.sp[i],
          x: L.x[i],
          y: L.y[i],
          B: L.B[i],
          age: L.age[i],
          gen: L.gen[i],
          genes: Array.from(L.genes.subarray(i * NG, i * NG + NG)),
        };
      }
      return null;
    }
    if (what === 'history') return { history: w.history, step: w.historyStep };
    if (what === 'chronicle') return w.chronicle.entries.slice();
    if (what === 'world') return this.worldInfo();
    if (typeof w.query === 'function') return w.query(what, a);
    return null;
  }

  worldInfo() {
    const w = this.world;
    return { name: w.name, seed: w.seed, tick: w.tick, start: w.start };
  }

  // ---------- Daten für die Anzeige ----------

  // Lebewesen und Kennzahlen, so oft wie möglich.
  // px/py: Position beim letzten Bild, damit die Anzeige die Bewegung dazwischen weich zeichnen kann.
  // snap: ohne Bewegung (nach Zeitsprung oder Laden)
  frame(snap = false) {
    const w = this.world;
    const L = w.life;
    const n = L.n;
    const size = new Uint8Array(n);
    const land = new Uint8Array(n);
    const mass = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      size[i] = Math.round(L.genes[i * NG + SIZE] * 255);
      land[i] = Math.round(L.genes[i * NG + LAND] * 255);
      mass[i] = Math.round(Math.min(1, L.B[i] / 2) * 255);
    }
    const x = L.x.slice(0, n);
    const y = L.y.slice(0, n);
    const px = snap ? x.slice() : L.px.slice(0, n);
    const py = snap ? y.slice() : L.py.slice(0, n);
    L.px.set(x);
    L.py.set(y);
    const cl = w.climate;
    return {
      type: 'frame',
      tick: w.tick,
      n,
      x,
      y,
      px,
      py,
      sp: L.sp.slice(0, n),
      uid: L.uid.slice(0, n),
      size,
      land,
      mass,
      stats: {
        T: cl.globalT,
        ice: cl.iceShare,
        species: w.species.aliveCount ? w.species.aliveCount() : w.species.alive().length,
        groups: n,
      },
      params: { ...w.params },
      name: w.name,
      seed: w.seed,
      fresh: this.started ? w.chronicle.takeFresh() : [],
      version: w.version,
      terrainVersion: w.terrainVersion,
    };
  }

  static transfer(f) {
    return [f.x.buffer, f.y.buffer, f.px.buffer, f.py.buffer, f.sp.buffer, f.uid.buffer, f.size.buffer, f.land.buffer, f.mass.buffer];
  }

  // Gelände (512 x 256, km) nur nach Änderungen
  terrain(force = false) {
    const w = this.world;
    if (!force && this.terrainSent === w.terrainVersion) return null;
    this.terrainSent = w.terrainVersion;
    const t = new Float32Array(BW * BH);
    for (let k = 0; k < t.length; k++) t[k] = w.base[k] / 1000;
    return { type: 'terrain', width: BW, height: BH, elev: t, version: w.terrainVersion };
  }

  // Klima- und Pflanzenfelder als RGBA-Texturen (je Zelle 4 Byte)
  fields(now, force = false) {
    const w = this.world;
    const key = `${w.version}|${w.month}|${w.terrainVersion}`;
    const lifeDue = this.layer === 'leben' && now - this.lifeFieldAt > 250;
    if (!force && key === this.fieldsKey && !lifeDue) return null;
    this.fieldsKey = key;
    this.lifeFieldAt = now;
    const cl = w.climate;
    const pl = w.plants;
    const m = w.month;
    const climate = new Uint8Array(N * 4);
    const bio = new Uint8Array(N * 4);
    for (let c = 0; c < N; c++) {
      const ta = cl.Ts[c];
      const tm = ta + cl.season[m * N + c];
      const ocean = w.isOcean[c] === 1;
      const o = c * 4;
      climate[o] = clamp255(((ta + 60) / 110) * 255);
      climate[o + 1] = clamp255(((tm + 60) / 110) * 255);
      climate[o + 2] = clamp255(Math.sqrt(Math.max(0, cl.rain[c]) / 6000) * 255);
      climate[o + 3] = clamp255(cl.ice[c] * 255);
      if (ocean) {
        bio[o] = 0;
        bio[o + 1] = clamp255((pl.A[c] / (1.5 * FOOD_SCALE)) * 255);
        const si = cl.ice[c] > 0.5 ? 1 : tm < -1.8 ? Math.min(1, (-1.8 - tm) / 2.5) : 0;
        bio[o + 2] = clamp255(si * 255);
        bio[o + 3] = 0;
      } else {
        bio[o] = clamp255(vegCover(pl.P[c]) * 255);
        bio[o + 1] = 0;
        bio[o + 2] = 0;
        const sn = cl.ice[c] > 0.5 ? 1 : tm < 0 ? Math.min(1, -tm / 5) : 0;
        bio[o + 3] = clamp255(sn * 255);
      }
    }
    // Eis und Schnee sind fast nur 0 oder 1: weichzeichnen, damit die Ränder im Bild keine Treppen zeigen
    blurChannel(climate, 3, this.tmp);
    blurChannel(bio, 2, this.tmp);
    blurChannel(bio, 3, this.tmp);
    const out = { type: 'fields', width: W, height: H, climate, bio, version: w.version, month: m };
    out.life = this.lifeField();
    if (typeof w.extraField === 'function') out.extra = w.extraField();
    return out;
  }

  // Farbe der häufigsten Art je Zelle und Dichte (für die Ebene "Leben")
  lifeField() {
    const w = this.world;
    const L = w.life;
    const sx = new Float32Array(N);
    const sy = new Float32Array(N);
    const cnt = new Float32Array(N);
    for (let i = 0; i < L.n; i++) {
      let ix = L.x[i] | 0;
      if (ix >= W) ix -= W;
      const c = (L.y[i] | 0) * W + ix;
      const h = L.genes[i * NG + HUE] * 2 * Math.PI;
      sx[c] += Math.cos(h);
      sy[c] += Math.sin(h);
      cnt[c] += 1;
    }
    const out = new Uint8Array(N * 4);
    for (let c = 0; c < N; c++) {
      if (!cnt[c]) continue;
      const hue = (Math.atan2(sy[c], sx[c]) / (2 * Math.PI) + 1) % 1;
      const [r, g, b] = speciesRgb(hue);
      const o = c * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = clamp255(80 + cnt[c] * 60);
    }
    return out;
  }

  static fieldTransfer(f) {
    const t = [f.climate.buffer, f.bio.buffer, f.life.buffer];
    if (f.extra) t.push(f.extra.buffer);
    return t;
  }

  // Artenliste (gedrosselt), für Listen, Bilder und Farben in der Anzeige
  species(now, force = false) {
    const w = this.world;
    const S = w.species;
    const key = `${S.nextId}|${S.list.length}|${Math.floor(w.tick / 12)}`;
    if (!force && (key === this.speciesKey || now - this.speciesSentAt < 600)) return null;
    this.speciesKey = key;
    this.speciesSentAt = now;
    const list = [];
    let extinct = S.pruned;
    for (const s of S.list) {
      const alive = s.died < 0 && s.count > 0;
      if (s.died >= 0) extinct++;
      if (!alive && s.peak < 25) continue;
      list.push({
        id: s.id,
        name: s.name,
        genus: s.genus,
        parent: s.parent,
        born: s.born,
        died: s.died,
        count: s.count,
        peak: s.peak,
        hue: s.hue,
        x: s.x,
        y: s.y,
        sapient: !!s.sapient,
        g: Array.from(s.centroid, (v) => Math.round(v * 1000) / 1000),
      });
    }
    return { type: 'species', list, pruned: S.pruned, extinct, tick: w.tick };
  }
}
