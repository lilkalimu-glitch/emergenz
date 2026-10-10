// Lebewesen als Gruppen (ein Punkt auf der Planetenkarte = eine Gruppe von Tieren einer Art).
// Daten liegen spaltenweise in typisierten Arrays (wie in einem Entity-Component-System),
// damit tausende Gruppen pro Monat schnell durchgerechnet werden.
//
// Jede Gruppe: frisst, verbraucht Energie, wandert, wird gefressen, teilt sich (mit Mutation) oder stirbt.
// Es gibt keine Vorgaben, welche Merkmale "gut" sind: Was überlebt, bestimmt die Umwelt.

import { W, H, N, LAT, COSLAT, clamp } from './const.js';
import { NG, SIZE, DIET, LAND, TOPT, TTOL, SPEED, SENSE, REPRO, HUE, topt, sigma } from './genome.js';

export const CAP = 5000;

const C0 = 0.035; // Grundumsatz pro Monat (relativ zur Biomasse)
const I0 = 2.4; // maximale Fressrate
const EFF_PLANT = 0.3; // Anteil der gefressenen Pflanzenenergie, der zu eigener Biomasse wird
const EFF_MEAT = 0.8;
const B_SPLIT = 2.0;
const B_DEATH = 0.25;
const MUT_P = 0.35;
const MUT_S = 0.03;

export class Life {
  constructor(world, cap = CAP) {
    this.world = world;
    this.cap = cap;
    this.n = 0;
    this.nextId = 1;
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
    this.B = new Float32Array(cap);
    this.age = new Float32Array(cap);
    this.sp = new Int32Array(cap);
    this.uid = new Int32Array(cap);
    this.gen = new Int32Array(cap);
    this.genes = new Float32Array(cap * NG);
    this.dx = new Float32Array(cap);
    this.dy = new Float32Array(cap);
    this.think = new Uint8Array(cap);
    this.dead = new Uint8Array(cap);
    // aus dem Erbgut abgeleitet (beim Entstehen berechnet)
    this.rate = new Float32Array(cap);
    this.pa = new Float32Array(cap);
    this.ma = new Float32Array(cap);
    this.tOpt = new Float32Array(cap);
    this.sig = new Float32Array(cap);
    this.spd = new Float32Array(cap);
    this.sense = new Float32Array(cap);
    this.mul = new Float32Array(cap);
    this.half = new Float32Array(cap);
    this.maxAge = new Float32Array(cap);
    // Raumgitter für Begegnungen
    this.head = new Int32Array(N);
    this.next = new Int32Array(cap);
    this.bio = new Float32Array(N);
    this.stats = { births: 0, deaths: 0, eaten: 0, starved: 0, old: 0, hunts: 0 };
    this.childGenes = new Float32Array(NG);
  }

  derive(i) {
    const o = i * NG;
    const g = this.genes;
    const s = g[o + SIZE];
    const d = g[o + DIET];
    this.rate[i] = Math.pow(10, -1.5 * s);
    this.pa[i] = 1 - Math.pow(d, 1.4); // Pflanzen verdauen
    this.ma[i] = Math.pow(d, 0.9); // Beute fangen und verdauen
    this.tOpt[i] = topt(g[o + TOPT]);
    this.sig[i] = sigma(g[o + TTOL]);
    // Zellen pro Monat: Treiben mit Strömung und Wind plus aktive Bewegung (größer = schneller)
    this.spd[i] = 0.25 + 1.2 * g[o + SPEED] * (0.3 + 0.7 * s);
    this.sense[i] = 1 + 4 * g[o + SENSE];
    this.mul[i] = 1 + 0.6 * g[o + SPEED] * g[o + SPEED] + 0.35 * g[o + SENSE] + 0.4 * g[o + TTOL];
    this.half[i] = 0.04 + 0.9 * s * s;
    this.maxAge[i] = 36 + 700 * Math.pow(s, 1.6);
  }

  spawn(x, y, genes, go, B, spId, gen) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x;
    this.y[i] = clamp(y, 0.3, H - 0.3);
    this.B[i] = B;
    this.age[i] = 0;
    this.sp[i] = spId;
    this.uid[i] = this.nextId++;
    this.gen[i] = gen;
    for (let g = 0; g < NG; g++) this.genes[i * NG + g] = genes[go + g];
    this.dx[i] = 0;
    this.dy[i] = 0;
    this.think[i] = 0;
    this.dead[i] = 0;
    this.derive(i);
    return i;
  }

  kill(i, cause) {
    if (this.dead[i]) return;
    this.dead[i] = 1;
    this.stats.deaths++;
    this.stats[cause]++;
  }

  // tote Gruppen entfernen (letzte lebende rückt auf ihren Platz)
  compact() {
    let i = 0;
    while (i < this.n) {
      if (this.dead[i]) {
        const last = this.n - 1;
        if (i !== last) this.move(last, i);
        this.n--;
      } else i++;
    }
  }

  move(from, to) {
    this.x[to] = this.x[from];
    this.y[to] = this.y[from];
    this.B[to] = this.B[from];
    this.age[to] = this.age[from];
    this.sp[to] = this.sp[from];
    this.uid[to] = this.uid[from];
    this.gen[to] = this.gen[from];
    this.genes.copyWithin(to * NG, from * NG, from * NG + NG);
    this.dx[to] = this.dx[from];
    this.dy[to] = this.dy[from];
    this.think[to] = this.think[from];
    this.dead[to] = this.dead[from];
    this.rate[to] = this.rate[from];
    this.pa[to] = this.pa[from];
    this.ma[to] = this.ma[from];
    this.tOpt[to] = this.tOpt[from];
    this.sig[to] = this.sig[from];
    this.spd[to] = this.spd[from];
    this.sense[to] = this.sense[from];
    this.mul[to] = this.mul[from];
    this.half[to] = this.half[from];
    this.maxAge[to] = this.maxAge[from];
  }

  buildGrid() {
    const { head, next, bio, x, y, B } = this;
    head.fill(-1);
    bio.fill(0);
    for (let i = 0; i < this.n; i++) {
      let ix = x[i] | 0;
      if (ix >= W) ix -= W;
      const c = (y[i] | 0) * W + ix;
      next[i] = head[c];
      head[c] = i;
      bio[c] += B[i];
    }
  }

  // Kosten für Lebensraum und Temperatur an einer Zelle
  stress(i, c, t, ocean) {
    const h = this.genes[i * NG + LAND];
    const dw = 1 - h - this.world.wet[c];
    const hab = dw * dw;
    let dev = t - this.tOpt[i];
    if (dev < 0) dev = -dev - 5 * this.genes[i * NG + SIZE]; // große Körper halten Kälte besser aus (Bergmann)
    dev -= this.sig[i];
    const temp = dev > 0 ? Math.min(6, (dev / 5) * (dev / 5)) : 0;
    return 3 * hab + temp;
  }

  stepMonth(m) {
    const world = this.world;
    const rng = world.rng;
    const { isOcean, climate, plants } = world;
    const { Ts, season } = climate;
    const P = plants.P;
    const A = plants.A;
    const off = m * N;
    const { x, y, B, genes, head, next, bio } = this;
    this.buildGrid();
    const n0 = this.n;

    for (let i = 0; i < n0; i++) {
      if (this.dead[i]) continue;
      let ix = x[i] | 0;
      if (ix >= W) ix -= W;
      const c = (y[i] | 0) * W + ix;
      const ocean = isOcean[c];
      let t = Ts[c] + season[off + c];
      if (ocean && t < -1.8) t = -1.8;
      const o = i * NG;
      const r = this.rate[i];
      const st = this.stress(i, c, t, ocean);

      // Energie: Jede Gruppe steht für denselben Anteil am Energiefluss (Damuths Gesetz:
      // große Tiere leben in kleineren Zahlen). Fressen und Grundumsatz sind daher je Gruppe gleich,
      // die Körpergröße bestimmt das Lebenstempo: Wachstum und Hunger laufen bei Großen langsamer.
      const maint = B[i] * C0 * (this.mul[i] + st);
      let gain = 0;

      // Pflanzen oder Algen fressen
      const pa = this.pa[i];
      if (pa > 0.02) {
        const h = genes[o + LAND];
        const he = ocean ? 1 - h * h : 1 - (1 - h) * (1 - h);
        const food = ocean ? A[c] : P[c];
        if (food > 0.001 && he > 0.05) {
          const want = B[i] * I0 * pa * he * (food / (food + this.half[i]));
          const lim = food * (ocean ? 0.2 : 0.12) * pa; // pro Monat erreichbarer Anteil der Nahrung in der Zelle
          const take = want < lim ? want : lim;
          if (ocean) A[c] = food - take;
          else P[c] = food - take;
          gain += take * EFF_PLANT;
        }
      }

      // Jagen: Beute in der eigenen Zelle oder einer Nachbarzelle suchen
      const ma = this.ma[i];
      if (ma > 0.12 && B[i] < 1.9) {
        const s = genes[o + SIZE];
        let best = -1;
        let bestScore = 0;
        let checked = 0;
        const left = ix > 0 ? c - 1 : c - 1 + W;
        const right = ix + 1 < W ? c + 1 : c + 1 - W;
        const up = c >= W ? c - W : c;
        const down = c + W < N ? c + W : c;
        for (let pass = 0; pass < 5 && checked < 16; pass++) {
          const cell = pass === 0 ? c : pass === 1 ? left : pass === 2 ? right : pass === 3 ? up : down;
          if (pass > 0 && cell === c) continue;
          for (let k = head[cell]; k !== -1 && checked < 16; k = next[k]) {
            if (k === i || this.dead[k]) continue;
            checked++;
            const ds = s - genes[k * NG + SIZE];
            if (ds < 0.025 || ds > 0.45) continue;
            const score = B[k];
            if (score > bestScore) {
              bestScore = score;
              best = k;
            }
          }
        }
        if (best >= 0) {
          const adv = 0.45 + 1.0 * (this.spd[i] - this.spd[best]) + 0.4 * (genes[o + SENSE] - genes[best * NG + SENSE]);
          const p = (0.25 + 0.75 * ma) * clamp(adv, 0.05, 0.9);
          if (rng.next() < p) {
            const bite = Math.min(B[i] * I0 * 0.25 * ma, 0.6 * B[best]);
            B[best] -= bite;
            gain += bite * EFF_MEAT;
            this.stats.hunts++;
            if (B[best] < B_DEATH) this.kill(best, 'eaten');
          }
        }
      }

      const net = gain - maint;
      B[i] += net > 0 ? net * r : net * Math.sqrt(r);

      // Altern, Hunger
      this.age[i] += 1;
      if (B[i] < B_DEATH) {
        this.kill(i, 'starved');
        continue;
      }
      if (this.age[i] > this.maxAge[i]) {
        this.kill(i, 'old');
        continue;
      }

      // Teilung mit Mutation
      if (B[i] >= B_SPLIT && this.n < this.cap && (this.n < this.cap * 0.9 || rng.next() < (this.cap - this.n) / (0.1 * this.cap))) {
        const f = 0.3 + 0.35 * genes[o + REPRO];
        const childB = B[i] * f;
        B[i] = B[i] * (1 - f) * 0.97;
        const cg = this.childGenes;
        for (let g = 0; g < NG; g++) {
          let v = genes[o + g];
          if (g === HUE) {
            v += rng.normal() * 0.02;
            v -= Math.floor(v);
          } else if (rng.next() < MUT_P) {
            v += rng.normal() * (rng.next() < 0.03 ? 0.12 : MUT_S);
            v = v < 0 ? 0 : v > 1 ? 1 : v;
          }
          cg[g] = v;
        }
        // Nachwuchs verteilt sich in die Umgebung
        const ang = rng.next() * Math.PI * 2;
        const dist = (0.4 + rng.next()) * Math.max(1, this.spd[i] * 2);
        const cy = clamp(y[i] + Math.sin(ang) * dist, 0.3, H - 0.3);
        const cx = x[i] + (Math.cos(ang) * dist) / Math.max(0.2, COSLAT[cy | 0]);
        const k = this.spawn((cx + W) % W, cy, cg, 0, childB, this.sp[i], this.gen[i] + 1);
        if (k >= 0) {
          // an Land geborene Meeresbewohner (und umgekehrt) überleben nicht lange: dort bleiben, wo die Eltern sind
          const kc = (this.y[k] | 0) * W + ((this.x[k] | 0) % W);
          if (isOcean[kc] !== ocean) {
            this.x[k] = x[i];
            this.y[k] = y[i];
          }
          this.stats.births++;
        }
      }

      // Wandern: ab und zu umschauen, sonst weiter in die gewählte Richtung
      if (this.think[i] === 0 || (B[i] < 0.7 && rng.next() < 0.3)) this.decide(i, c, m, st);
      else this.think[i]--;
      const lat = LAT[y[i] | 0];
      const cosl = Math.max(0.2, COSLAT[y[i] | 0]);
      let nx = x[i] + this.dx[i] / cosl;
      let ny = y[i] + this.dy[i];
      if (ny < 0.3) ny = 0.3;
      if (ny > H - 0.3) ny = H - 0.3;
      if (nx < 0) nx += W;
      if (nx >= W) nx -= W;
      let jx = nx | 0;
      if (jx >= W) jx -= W;
      const nc = (ny | 0) * W + jx;
      if (nc !== c && isOcean[nc] !== ocean) {
        // Küste: nur überqueren, wenn das Lebewesen dort leben kann
        const dw = 1 - genes[o + LAND] - world.wet[nc];
        if (dw * dw > 0.3) {
          this.dx[i] = -this.dx[i];
          this.dy[i] = -this.dy[i];
          this.think[i] = 0;
          continue;
        }
      }
      x[i] = nx;
      y[i] = ny;
      void lat;
    }
    this.compact();
  }

  // Richtung wählen: Nahrung suchen, Feinde und Konkurrenz meiden, unpassendes Klima meiden
  decide(i, c, m, stHere) {
    const world = this.world;
    const rng = world.rng;
    const { isOcean, climate, plants } = world;
    const { Ts, season } = climate;
    const o = i * NG;
    const g = this.genes;
    const h = g[o + LAND];
    const pa = this.pa[i];
    const ma = this.ma[i];
    const half = this.half[i];
    const off = m * N;
    const range = Math.max(1, Math.min(this.sense[i], this.spd[i] * 4));
    // erwarteter Energiegewinn pro Monat in einer Zelle (Pflanzen + Beute - Stress)
    const Bi = this.B[i];
    const huntValue = ma > 0.12 ? (0.25 + 0.75 * ma) * 0.45 * Bi * I0 * 0.25 * ma * EFF_MEAT : 0;
    const score = (cell, st, own) => {
      const ocean = isOcean[cell];
      const he = ocean ? 1 - h * h : 1 - (1 - h) * (1 - h);
      const food = ocean ? plants.A[cell] : plants.P[cell];
      const others = Math.max(0, this.bio[cell] - own);
      let v = (pa * he * (ocean ? 0.2 : 0.12) * food * EFF_PLANT) / (1 + 0.4 * others);
      if (huntValue > 0) v += huntValue * (others / (others + 1.5));
      v -= Bi * C0 * st;
      return v;
    };
    let best = score(c, stHere, this.B[i]) * 1.1 + 0.002;
    let bx = 0;
    let by = 0;
    const cx = this.x[i];
    const cy = this.y[i];
    for (let k = 0; k < 4; k++) {
      const ang = rng.next() * Math.PI * 2;
      const dx = Math.cos(ang) * range;
      const dy = Math.sin(ang) * range;
      const tx = cx + dx / Math.max(0.2, COSLAT[cy | 0]);
      const ty = clamp(cy + dy, 0, H - 0.01);
      let ix = Math.floor(tx) % W;
      if (ix < 0) ix += W;
      const cell = (ty | 0) * W + ix;
      const ocean = isOcean[cell];
      let t = Ts[cell] + season[off + cell];
      if (ocean && t < -1.8) t = -1.8;
      const v = score(cell, this.stress(i, cell, t, ocean), 0) + rng.next() * 0.004;
      if (v > best) {
        best = v;
        bx = dx;
        by = dy;
      }
    }
    const len = Math.hypot(bx, by);
    if (len > 0) {
      this.dx[i] = (bx / len) * this.spd[i];
      this.dy[i] = (by / len) * this.spd[i];
    } else {
      // bleiben, leicht treiben
      this.dx[i] = (rng.next() - 0.5) * 0.2 * this.spd[i];
      this.dy[i] = (rng.next() - 0.5) * 0.2 * this.spd[i];
    }
    this.think[i] = 2 + rng.int(3);
  }

  // Für Anzeige und Statistik
  totalBiomass() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.B[i];
    return s;
  }

  nearest(x, y, maxDist = 2) {
    let best = -1;
    let bd = maxDist * maxDist;
    for (let i = 0; i < this.n; i++) {
      let dx = Math.abs(this.x[i] - x);
      if (dx > W / 2) dx = W - dx;
      const dy = this.y[i] - y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  serialize() {
    const n = this.n;
    return {
      n,
      nextId: this.nextId,
      x: this.x.slice(0, n),
      y: this.y.slice(0, n),
      B: this.B.slice(0, n),
      age: this.age.slice(0, n),
      sp: this.sp.slice(0, n),
      uid: this.uid.slice(0, n),
      gen: this.gen.slice(0, n),
      genes: this.genes.slice(0, n * NG),
      dx: this.dx.slice(0, n),
      dy: this.dy.slice(0, n),
      think: this.think.slice(0, n),
      stats: { ...this.stats },
    };
  }

  restore(d) {
    this.n = Math.min(d.n, this.cap);
    this.nextId = d.nextId;
    this.x.set(d.x.subarray(0, this.n));
    this.y.set(d.y.subarray(0, this.n));
    this.B.set(d.B.subarray(0, this.n));
    this.age.set(d.age.subarray(0, this.n));
    this.sp.set(d.sp.subarray(0, this.n));
    this.uid.set(d.uid.subarray(0, this.n));
    this.gen.set(d.gen.subarray(0, this.n));
    this.genes.set(d.genes.subarray(0, this.n * NG));
    this.dead.fill(0);
    this.think.fill(0);
    this.dx.fill(0);
    this.dy.fill(0);
    if (d.dx) {
      this.dx.set(d.dx.subarray(0, this.n));
      this.dy.set(d.dy.subarray(0, this.n));
      this.think.set(d.think.subarray(0, this.n));
    }
    for (let i = 0; i < this.n; i++) this.derive(i);
    if (d.stats) this.stats = { ...this.stats, ...d.stats };
  }
}
