// Arten: entstehen, wenn sich eine Population in zwei deutlich verschiedene Gruppen aufspaltet
// (einmal im Jahr geprüft). Eine Art, die sich als Ganzes langsam verändert, behält ihren Namen.

import { NG, SIZE, DIET, LAND, TOPT, SPEED, SENSE, TTOL, HUE, geneDistance, describe } from './genome.js';
import { RNG } from './rng.js';

const SPLIT_DIST = 0.17;
const MIN_POP = 6;

const SYL_A = ['pro', 'cal', 've', 'ra', 'thal', 'mor', 'xe', 'lu', 'ka', 'dro', 'sel', 'tri', 'bo', 'nae', 'phy', 'gor', 'il', 'zan', 'cy', 'hel', 'ar', 'myr', 'tes', 'ul'];
const SYL_B = ['ce', 'lo', 'ri', 'na', 'to', 'phi', 'do', 'mi', 'ga', 'ste', 'ru', 'xi', 'le', 'tha', 'ko', 'pe', 'vi', 'sa'];
const END = ['us', 'a', 'ix', 'on', 'is', 'ella', 'odon', 'ops', 'ia', 'ax'];

function capital(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class Species {
  constructor(world) {
    this.world = world;
    this.list = []; // alle Arten, auch ausgestorbene (bedeutende)
    this.byId = new Map();
    this.nextId = 1;
    this.names = new Set();
    this.pruned = 0;
  }

  nameRng(id) {
    return new RNG((this.world.seed * 31 + id * 7919) >>> 0);
  }

  makeGenus(id) {
    const r = this.nameRng(id);
    let g = '';
    for (let k = 0; k < 4; k++) {
      g = r.pick(SYL_A) + (r.chance(0.6) ? r.pick(SYL_B) : '') + r.pick(END);
      if (!this.names.has(g)) break;
    }
    return capital(g);
  }

  epithet(genes, o, parent) {
    const pick = [];
    const d = (g) => genes[o + g] - (parent ? parent.centroid[g] : 0.5);
    const s = genes[o + SIZE];
    const diet = genes[o + DIET];
    const land = genes[o + LAND];
    const t = genes[o + TOPT];
    if (parent) {
      const cands = [
        [Math.abs(d(SIZE)), d(SIZE) > 0 ? 'major' : 'minor'],
        [Math.abs(d(DIET)), d(DIET) > 0 ? 'rapax' : 'herbivorus'],
        [Math.abs(d(LAND)), d(LAND) > 0 ? 'terrestris' : 'marinus'],
        [Math.abs(d(TOPT)), d(TOPT) > 0 ? 'tropicus' : 'borealis'],
        [Math.abs(d(SPEED)), d(SPEED) > 0 ? 'velox' : 'lentus'],
        [Math.abs(d(SENSE)), d(SENSE) > 0 ? 'vigilans' : 'caecus'],
        [Math.abs(d(TTOL)), d(TTOL) > 0 ? 'tolerans' : 'fragilis'],
      ];
      cands.sort((a, b) => b[0] - a[0]);
      pick.push(cands[0][1], cands[1][1]);
    }
    if (s > 0.8) pick.push('gigas');
    if (s < 0.12) pick.push('primus', 'simplex');
    if (diet > 0.7) pick.push('ferox');
    if (land > 0.7) pick.push('agrestis');
    if (land < 0.3) pick.push('pelagicus');
    if (t < 0.3) pick.push('glacialis');
    pick.push('vulgaris', 'novus', 'elegans', 'robustus', 'gracilis', 'varius', 'insignis', 'rarus');
    return pick;
  }

  create(genes, o, parent, born, where) {
    const id = this.nextId++;
    let genus;
    let depth = 0;
    if (parent) {
      const sameKind =
        (parent.depth || 0) < 3 &&
        Math.abs(genes[o + DIET] - parent.centroid[DIET]) < 0.25 &&
        Math.abs(genes[o + LAND] - parent.centroid[LAND]) < 0.3 &&
        Math.abs(genes[o + SIZE] - parent.centroid[SIZE]) < 0.25;
      genus = sameKind ? parent.genus : this.makeGenus(id);
      depth = sameKind ? (parent.depth || 0) + 1 : 0;
    } else {
      genus = this.makeGenus(id);
    }
    let name = '';
    for (const ep of this.epithet(genes, o, parent)) {
      const n = `${genus} ${ep}`;
      if (!this.names.has(n)) {
        name = n;
        break;
      }
    }
    if (!name) {
      const r = this.nameRng(id * 3 + 1);
      for (let k = 0; k < 8 && !name; k++) {
        const ep = r.pick(SYL_A) + r.pick(SYL_B) + r.pick(['us', 'is', 'ensis', 'oides', 'atus', 'inus', 'alis']);
        const n = `${genus} ${ep}`;
        if (!this.names.has(n)) name = n;
      }
      if (!name) name = `${genus} ${id}`;
    }
    this.names.add(name);
    this.names.add(genus);
    const centroid = new Float32Array(NG);
    for (let g = 0; g < NG; g++) centroid[g] = genes[o + g];
    const sp = {
      id,
      name,
      genus,
      parent: parent ? parent.id : 0,
      born,
      died: -1,
      hue: genes[o + HUE],
      centroid,
      count: 0,
      peak: 0,
      biomass: 0,
      x: where ? where[0] : 0,
      y: where ? where[1] : 0,
      announced: false,
      depth,
    };
    this.list.push(sp);
    this.byId.set(id, sp);
    return sp;
  }

  get(id) {
    return this.byId.get(id);
  }

  alive() {
    return this.list.filter((s) => s.died < 0 && s.count > 0);
  }

  // Einmal im Jahr: Mittelwerte, Aufspaltungen, Aussterben
  yearly() {
    const world = this.world;
    const life = world.life;
    const n = life.n;
    const genes = life.genes;
    const members = new Map();
    for (const s of this.list) {
      if (s.died < 0) {
        s.count = 0;
        s.biomass = 0;
      }
    }
    for (let i = 0; i < n; i++) {
      const id = life.sp[i];
      let arr = members.get(id);
      if (!arr) {
        arr = [];
        members.set(id, arr);
      }
      arr.push(i);
      const s = this.byId.get(id);
      if (s) {
        s.count++;
        s.biomass += life.B[i];
      }
    }

    const newSpecies = [];
    for (const [id, idx] of members) {
      const s = this.byId.get(id);
      if (!s) continue;
      // Mittelwert der Art
      const c = s.centroid;
      c.fill(0);
      let sx = 0;
      let sy = 0;
      for (const i of idx) {
        for (let g = 0; g < NG; g++) c[g] += genes[i * NG + g];
        sx += life.x[i];
        sy += life.y[i];
      }
      for (let g = 0; g < NG; g++) c[g] /= idx.length;
      s.x = sx / idx.length;
      s.y = sy / idx.length;
      if (idx.length > s.peak) s.peak = idx.length;
      if (idx.length >= 2 * MIN_POP) {
        const split = this.trySplit(s, idx);
        if (split) newSpecies.push(split);
      }
    }

    // Aussterben
    for (const s of this.list) {
      if (s.died < 0 && s.count === 0 && s.born < world.tick) {
        s.died = world.tick;
        if (s.peak >= 120 || (s.announced && s.peak >= 60)) {
          const years = Math.max(1, Math.round((s.died - s.born) / 12));
          world.chronicle.add('tod', `§${s.name}§ ist ausgestorben (nach ${years.toLocaleString('de-DE')} Jahren)`, [s.x, s.y], s.peak >= 300);
        }
      }
    }
    this.prune();
    return newSpecies;
  }

  // Zwei-Mittelwerte-Verfahren: zerfällt die Art in zwei deutlich verschiedene Gruppen?
  trySplit(s, idx) {
    const life = this.world.life;
    const genes = life.genes;
    // am weitesten entferntes Mitglied als zweiter Startpunkt
    let far = -1;
    let farD = 0;
    for (const i of idx) {
      const d = geneDistance(genes, i * NG, s.centroid, 0);
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (farD < SPLIT_DIST) return null;
    const ca = Float32Array.from(s.centroid);
    const cb = genes.slice(far * NG, far * NG + NG);
    const assign = new Uint8Array(idx.length);
    for (let iter = 0; iter < 3; iter++) {
      const sa = new Float64Array(NG);
      const sb = new Float64Array(NG);
      let na = 0;
      let nb = 0;
      idx.forEach((i, k) => {
        const da = geneDistance(genes, i * NG, ca, 0);
        const db = geneDistance(genes, i * NG, cb, 0);
        assign[k] = db < da ? 1 : 0;
        const tgt = assign[k] ? sb : sa;
        for (let g = 0; g < NG; g++) tgt[g] += genes[i * NG + g];
        if (assign[k]) nb++;
        else na++;
      });
      if (na === 0 || nb === 0) return null;
      for (let g = 0; g < NG; g++) {
        ca[g] = sa[g] / na;
        cb[g] = sb[g] / nb;
      }
    }
    let na = 0;
    let nb = 0;
    for (const a of assign) {
      if (a) nb++;
      else na++;
    }
    if (geneDistance(ca, 0, cb, 0) < SPLIT_DIST || Math.min(na, nb) < MIN_POP) return null;
    // die kleinere Gruppe wird zur neuen Art
    const minorFlag = nb <= na ? 1 : 0;
    const minorCentroid = minorFlag ? cb : ca;
    const majorCentroid = minorFlag ? ca : cb;
    let mx = 0;
    let my = 0;
    let cnt = 0;
    idx.forEach((i, k) => {
      if (assign[k] === minorFlag) {
        mx += life.x[i];
        my += life.y[i];
        cnt++;
      }
    });
    const child = this.create(minorCentroid, 0, s, this.world.tick, [mx / cnt, my / cnt]);
    s.centroid.set(majorCentroid);
    idx.forEach((i, k) => {
      if (assign[k] === minorFlag) life.sp[i] = child.id;
    });
    child.count = cnt;
    child.peak = cnt;
    s.count -= cnt;
    return child;
  }

  // Unbedeutende ausgestorbene Arten vergessen (Speicher), Abstammung bleibt erhalten
  prune() {
    if (this.list.length < 400) return;
    const remove = new Set();
    for (const s of this.list) {
      if (s.died >= 0 && s.peak < 25) remove.add(s.id);
    }
    if (!remove.size) return;
    for (const s of this.list) {
      let p = s.parent;
      while (p && remove.has(p)) p = this.byId.get(p)?.parent || 0;
      s.parent = p;
    }
    this.list = this.list.filter((s) => !remove.has(s.id));
    for (const id of remove) this.byId.delete(id);
    this.pruned += remove.size;
  }

  describe(s) {
    return describe(s.centroid, 0);
  }

  serialize() {
    return {
      nextId: this.nextId,
      pruned: this.pruned,
      list: this.list.map((s) => ({ ...s, centroid: Array.from(s.centroid) })),
    };
  }

  restore(data) {
    this.nextId = data.nextId;
    this.pruned = data.pruned || 0;
    this.list = data.list.map((s) => ({ ...s, centroid: Float32Array.from(s.centroid) }));
    this.byId = new Map(this.list.map((s) => [s.id, s]));
    this.names = new Set();
    for (const s of this.list) {
      this.names.add(s.name);
      this.names.add(s.genus);
    }
  }
}
