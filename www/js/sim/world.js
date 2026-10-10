// Die Welt: hält alle Ebenen zusammen und führt die Zeit.
//
// Zeit-System (jede Ebene in ihrem eigenen Takt):
//  - 1 Schritt = 1 Monat: Pflanzen wachsen, Lebewesen fressen, wandern, teilen sich
//  - 1 Jahr: Klima (Energiebilanz, Eis, Regen), Ausbreitung der Pflanzen, Arten, Chronik
// Die Jahreszeiten werden aus dem Jahresklima abgeleitet, damit schnelles Vorspulen günstig bleibt.

import { W, H, N, LAT, COSLAT, MONTHS, clamp, cellOf, xyToLatLon } from './const.js';
import { RNG, hashString } from './rng.js';
import { generatePlanet, coastDistance } from './planet.js';
import { Climate } from './climate.js';
import { Plants } from './plants.js';
import { Life } from './life.js';
import { Species } from './species.js';
import { Chronicle } from './chronicle.js';
import { NG, SIZE, DIET, LAND, TOPT, TTOL, SPEED, SENSE, REPRO, HUE, toptGene, describe } from './genome.js';

export const SAVE_VERSION = 1;

export function formatLatLon(x, y) {
  const [lat, lon] = xyToLatLon(x, y);
  const la = `${Math.abs(lat).toFixed(0)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lon).toFixed(0)}° ${lon >= 0 ? 'O' : 'W'}`;
  return `${la}, ${lo}`;
}

export function biomeName(world, c) {
  const { climate, plants, isOcean, elev } = world;
  const t = climate.Ts[c];
  const p = climate.rain[c];
  if (isOcean[c]) {
    if (climate.ice[c] > 0.5) return 'Packeis';
    if (elev[c] > -200) return 'Küstenmeer';
    return 'Ozean';
  }
  if (climate.ice[c] > 0.5) return 'Gletscher';
  const green = plants.P[c];
  const k = plants.Kp[c];
  if (green < 0.03 || green < 0.08 * k) {
    if (elev[c] > 3000) return 'Kahles Hochgebirge';
    if (t < -5) return 'Frostwüste';
    if (p < 300) return 'Wüste';
    return 'Kahles Land';
  }
  if (elev[c] > 3200) return 'Hochgebirge';
  if (t < -5) return 'Tundra';
  if (t < 3) return p > 300 ? 'Taiga' : 'Tundra';
  if (t < 18) {
    if (p < 250) return 'Kältesteppe';
    if (p < 500) return 'Steppe';
    if (p < 1100) return 'Mischwald';
    return 'Gemäßigter Regenwald';
  }
  if (p < 250) return 'Wüste';
  if (p < 700) return 'Savanne';
  if (p < 1500) return 'Trockenwald';
  return 'Regenwald';
}

export class World {
  constructor({ seed = 1, start = 'ursuppe', name = '' } = {}) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this.name = name || `Welt ${this.seed % 100000}`;
    this.start = start;
    this.rng = new RNG(this.seed ^ 0xa5a5a5a5);
    this.params = { sun: 1, co2: 280, dust: 0, tilt: 23.44 };
    this.tick = 0;
    this.version = 0; // steigt, wenn sich etwas Sichtbares ändert
    this.terrainVersion = 0; // steigt bei Kratern
    this.craters = [];
    this.milestones = {};
    this.state = { iceAge: false, snowball: false, hothouse: false, lastMass: -1e9, algaeSince: -1 };
    this.history = [];
    this.historyStep = 1;

    const planet = generatePlanet(this.seed);
    this.planet = planet;
    this.elev = planet.elev;
    this.isOcean = new Uint8Array(N);
    this.coast = null;
    this.updateOcean();

    this.plants = new Plants(this);
    this.climate = new Climate(this);
    this.life = new Life(this);
    this.species = new Species(this);
    this.chronicle = new Chronicle(this);
  }

  static create(opts) {
    const w = new World(opts);
    w.spinUp();
    w.chronicle.add('welt', `${w.name} entsteht: ein junger Planet mit Ozeanen und Kontinenten`, null, true);
    if (w.start === 'ursuppe') w.seedPrimordial();
    w.recordHistory();
    return w;
  }

  get year() {
    return Math.floor(this.tick / 12);
  }

  get month() {
    return this.tick % 12;
  }

  updateOcean() {
    for (let c = 0; c < N; c++) this.isOcean[c] = this.elev[c] < 0 ? 1 : 0;
    this.coast = coastDistance(this.isOcean);
    // Nässe des Lebensraums: offenes Meer 1, Küstenmeer 0,75, Küste an Land 0,35, Landesinneres 0
    if (!this.wet) this.wet = new Float32Array(N);
    for (let c = 0; c < N; c++) {
      const d = this.coast[c];
      this.wet[c] = this.isOcean[c] ? (d <= 1 ? 0.75 : d <= 3 ? 0.9 : 1) : d <= 1 ? 0.35 : d <= 3 ? 0.15 : 0;
    }
  }

  spinUp(years = 40) {
    this.climate.updateInsolation();
    for (let y = 0; y < years; y++) this.climate.stepYear(y < years - 5);
    this.plants.updateCapacity();
  }

  // Start "Ursuppe": Algen in warmen Küstenmeeren und die ersten Zellen, die sie fressen
  seedPrimordial() {
    const spots = this.findWarmShallows(6);
    for (const c of spots) this.seedAlgae(c % W + 0.5, ((c / W) | 0) + 0.5, 2);
    this.plants.seaStarted = true;
    this.state.algaeSince = this.tick;
    this.milestones.algae = this.tick;
    this.chronicle.add('leben', 'Ursuppe: In warmen Küstenmeeren leben die ersten Zellen, die Sonnenlicht nutzen', null, true);
    // Algen etwas wachsen lassen
    for (let k = 0; k < 24; k++) this.plants.stepMonth(k % 12);
    this.spawnFirstAnimals(spots, 'Die ersten Zellen, die andere Zellen fressen: der Anfang der Tiere');
  }

  findWarmShallows(count) {
    const cand = [];
    for (let c = 0; c < N; c++) {
      if (this.isOcean[c] && this.coast[c] <= 2 && this.plants.Ka[c] > 0.9 && this.climate.Ts[c] > 16) cand.push(c);
    }
    if (!cand.length) {
      for (let c = 0; c < N; c++) if (this.isOcean[c] && this.plants.Ka[c] > 0.3) cand.push(c);
    }
    const out = [];
    for (let k = 0; k < count && cand.length; k++) out.push(cand[this.rng.int(cand.length)]);
    return out;
  }

  seedAlgae(x, y, r) {
    const { Ka, A } = this.plants;
    this.forCells(x, y, r, (c) => {
      if (this.isOcean[c] && Ka[c] > 0) A[c] = Math.max(A[c], 0.3 * Ka[c]);
    });
  }

  seedPlants(x, y, r) {
    const { Kp, P } = this.plants;
    let any = false;
    this.forCells(x, y, r, (c) => {
      if (!this.isOcean[c] && Kp[c] > 0.06) {
        P[c] = Math.max(P[c], 0.3 * Kp[c]);
        any = true;
      }
    });
    return any;
  }

  primitiveGenes(c, onLand) {
    const g = new Float32Array(NG);
    g[SIZE] = 0.02;
    g[DIET] = 0.03;
    g[LAND] = onLand ? 0.8 : 0.03;
    g[TOPT] = toptGene(this.climate.Ts[c]);
    g[TTOL] = 0.35;
    g[SPEED] = 0.15;
    g[SENSE] = 0.1;
    g[REPRO] = 0.4;
    g[HUE] = this.rng.next();
    return g;
  }

  spawnFirstAnimals(cells, text) {
    if (!cells.length) return null;
    const c0 = cells[0];
    const genes = this.primitiveGenes(c0, false);
    const sp = this.species.create(genes, 0, null, this.tick, [c0 % W + 0.5, ((c0 / W) | 0) + 0.5]);
    for (const c of cells) {
      const cx = c % W + 0.5;
      const cy = ((c / W) | 0) + 0.5;
      for (let k = 0; k < 4; k++) {
        const g = this.primitiveGenes(c, false);
        g[HUE] = genes[HUE];
        let gx = cx;
        let gy = cy;
        for (let t = 0; t < 8; t++) {
          gx = (cx + this.rng.range(-2.5, 2.5) + W) % W;
          gy = cy + this.rng.range(-2.5, 2.5);
          if (this.isOcean[cellOf(gx, gy)]) break;
          gx = cx;
          gy = cy;
        }
        this.life.spawn(gx, gy, g, 0, 1.2, sp.id, 0);
      }
    }
    sp.count = cells.length * 4;
    sp.peak = sp.count;
    sp.announced = true;
    this.milestones.animals = this.tick;
    this.chronicle.add('leben', `${text}. Sie heißen §${sp.name}§.`, [sp.x, sp.y], true);
    return sp;
  }

  forCells(x, y, r, fn) {
    const j0 = Math.max(0, Math.floor(y - r));
    const j1 = Math.min(H - 1, Math.floor(y + r));
    for (let j = j0; j <= j1; j++) {
      const cosl = Math.max(0.15, COSLAT[j]);
      const rx = r / cosl;
      const i0 = Math.floor(x - rx);
      const i1 = Math.floor(x + rx);
      for (let ii = i0; ii <= i1; ii++) {
        const i = ((ii % W) + W) % W;
        let dx = Math.abs(ii + 0.5 - x) * cosl;
        const dy = j + 0.5 - y;
        const d = Math.hypot(dx, dy);
        if (d <= r) fn(j * W + i, d);
      }
    }
  }

  stepMonth() {
    const m = this.month;
    this.plants.stepMonth(m);
    this.life.stepMonth(m);
    this.tick++;
    if (this.tick % MONTHS === 0) this.stepYear();
  }

  step(months) {
    for (let k = 0; k < months; k++) this.stepMonth();
  }

  stepYear() {
    const p = this.params;
    this.climate.stepYear();
    this.climate.relaxRainMod();
    if (p.dust > 0) {
      p.dust *= 0.55;
      if (p.dust < 0.002) p.dust = 0;
    }
    this.plants.updateCapacity();
    this.plants.spreadYear();
    this.triggers();
    const born = this.species.yearly();
    this.checkMilestones(born);
    this.checkClimate();
    this.recordHistory();
    this.version++;
  }

  // Ereignisse, die von selbst eintreten können, wenn die Bedingungen stimmen
  triggers() {
    const rng = this.rng;
    const plants = this.plants;
    const totals = plants.totals();
    if (!plants.seaStarted) {
      if (rng.chance(1 / 220)) {
        const spots = this.findWarmShallows(1);
        if (spots.length) {
          const c = spots[0];
          this.seedAlgae(c % W + 0.5, ((c / W) | 0) + 0.5, 1.5);
          plants.seaStarted = true;
          this.state.algaeSince = this.tick;
          this.milestones.algae = this.tick;
          this.chronicle.add('leben', 'Erstes Leben: In einem warmen Küstenmeer entstehen Zellen, die Sonnenlicht nutzen', [c % W + 0.5, ((c / W) | 0) + 0.5], true);
        }
      }
      return;
    }
    if (totals.algae < 0.01 && rng.chance(1 / 300)) {
      const spots = this.findWarmShallows(1);
      if (spots.length) {
        this.seedAlgae(spots[0] % W + 0.5, ((spots[0] / W) | 0) + 0.5, 1.5);
        this.chronicle.add('leben', 'Algen kehren zurück: Aus überlebenden Zellen wachsen neue Algenteppiche', null, false);
      }
    }
    const algaeAge = this.tick - this.state.algaeSince;
    if (this.life.n === 0 && totals.algae > 15 && algaeAge > 12 * 40) {
      const chance = this.milestones.animals !== undefined ? 1 / 400 : 1 / 90;
      if (rng.chance(chance)) {
        const spots = this.richestAlgae(4);
        this.spawnFirstAnimals(
          spots,
          this.milestones.animals !== undefined
            ? 'Neue Zellen entstehen, die Algen fressen'
            : 'Die ersten Zellen, die andere Zellen fressen: der Anfang der Tiere',
        );
      }
    }
    if (totals.plants < 0.01 && algaeAge > 12 * 120) {
      const chance = plants.landStarted ? 1 / 250 : 1 / 140;
      if (rng.chance(chance)) {
        const c = this.findGreenCoast();
        if (c >= 0) {
          const first = !plants.landStarted;
          plants.landStarted = true;
          this.seedPlants(c % W + 0.5, ((c / W) | 0) + 0.5, 1.2);
          if (first) this.milestones.landplants = this.tick;
          this.chronicle.add(
            'leben',
            first ? 'Pflanzen erobern das Land: An einer Küste wachsen die ersten grünen Teppiche' : 'Pflanzen kehren an Land zurück',
            [c % W + 0.5, ((c / W) | 0) + 0.5],
            first,
          );
        }
      }
    }
  }

  richestAlgae(count) {
    const idx = [];
    for (let c = 0; c < N; c++) if (this.plants.A[c] > 0.9) idx.push(c);
    idx.sort((a, b) => this.plants.A[b] - this.plants.A[a]);
    const top = idx.slice(0, 200);
    const out = [];
    for (let k = 0; k < count && top.length; k++) out.push(top[this.rng.int(top.length)]);
    return out;
  }

  findGreenCoast() {
    const cand = [];
    for (let c = 0; c < N; c++) {
      if (!this.isOcean[c] && this.coast[c] === 0 && this.plants.Kp[c] > 1.8) cand.push(c);
    }
    return cand.length ? cand[this.rng.int(cand.length)] : -1;
  }

  checkMilestones(born) {
    const ms = this.milestones;
    const alive = this.species.alive();
    const first = (key, test, text, minCount) => {
      if (ms[key] !== undefined) return;
      for (const s of alive) {
        if (s.count >= minCount && test(s.centroid, s)) {
          ms[key] = this.tick;
          this.chronicle.add('leben', text(s), [s.x, s.y], true);
          s.announced = true;
          return;
        }
      }
    };
    first('multicell', (g) => g[SIZE] > 0.2, (s) => `Erste Mehrzeller: §${s.name}§ wird größer als eine einzelne Zelle`, 15);
    first('predator', (g) => g[DIET] > 0.6, (s) => `Erste Räuber: §${s.name}§ jagt andere Lebewesen`, 15);
    first('land', (g, s) => g[LAND] > 0.62 && this.shareOnLand(s.id) > 0.6, (s) => `§${s.name}§ geht an Land: die ersten Landtiere`, 15);
    first('large', (g) => g[SIZE] > 0.6, (s) => `Erste Großtiere: §${s.name}§`, 10);
    first('giant', (g) => g[SIZE] > 0.85, (s) => `Riesen: §${s.name}§ ist das größte Lebewesen des Planeten`, 8);
    first('cold', (g) => g[TOPT] < toptGene(0), (s) => `Leben in der Kälte: §${s.name}§ ist an Frost angepasst`, 15);

    // Neue Arten, die sich durchsetzen
    let told = 0;
    const big = Math.max(60, Math.round(this.life.n * 0.04));
    if (this.tick - (this.state.lastArt || -1e9) < 12 * 8) told = 1;
    for (const s of alive) {
      if (!s.announced && s.count >= big && this.tick - s.born >= 12 * 20 && told < 1) {
        this.state.lastArt = this.tick;
        s.announced = true;
        told++;
        const parent = this.species.get(s.parent);
        const from = parent ? `, stammt von §${parent.name}§ ab` : '';
        this.chronicle.add('art', `Neue Art: §${s.name}§ (${describe(s.centroid, 0)}${from})`, [s.x, s.y], false);
      }
    }
    void born;

    // Massenaussterben
    const n = alive.length;
    const recent = this.history.slice(-Math.ceil(60 / this.historyStep));
    let max = 0;
    for (const h of recent) max = Math.max(max, h.species);
    if (max >= 25 && n <= 0.6 * max && this.tick - this.state.lastMass > 12 * 300) {
      this.state.lastMass = this.tick;
      const pct = Math.round((1 - n / max) * 100);
      this.chronicle.add('tod', `Massenaussterben: ${pct} % aller Arten sind in kurzer Zeit verschwunden`, null, true);
    }
  }

  shareOnLand(spId) {
    const life = this.life;
    let on = 0;
    let tot = 0;
    for (let i = 0; i < life.n; i++) {
      if (life.sp[i] !== spId) continue;
      tot++;
      if (!this.isOcean[cellOf(life.x[i], life.y[i])]) on++;
    }
    return tot ? on / tot : 0;
  }

  checkClimate() {
    const cl = this.climate;
    const st = this.state;
    const pct = Math.round(cl.iceShare * 100);
    if (!st.snowball && cl.iceShare > 0.85) {
      st.snowball = true;
      this.chronicle.add('klima', 'Schneeball-Planet: Fast die ganze Oberfläche ist gefroren', null, true);
    } else if (st.snowball && cl.iceShare < 0.6) {
      st.snowball = false;
      this.chronicle.add('klima', 'Der Schneeball taut: Ozeane brechen wieder auf', null, true);
    }
    if (!st.iceAge && cl.iceShare > 0.24) {
      st.iceAge = true;
      this.chronicle.add('klima', `Eiszeit: Gletscher wachsen, ${pct} % des Planeten sind von Eis und Schnee bedeckt`, null, true);
    } else if (st.iceAge && cl.iceShare < 0.16) {
      st.iceAge = false;
      this.chronicle.add('klima', 'Die Eiszeit endet', null, true);
    }
    if (!st.hothouse && cl.globalT > 25) {
      st.hothouse = true;
      this.chronicle.add('klima', `Treibhaus-Welt: Mitteltemperatur ${cl.globalT.toFixed(0)} °C, die Pole sind eisfrei`, null, true);
    } else if (st.hothouse && cl.globalT < 22) {
      st.hothouse = false;
      this.chronicle.add('klima', 'Das Treibhausklima kühlt ab', null, false);
    }
  }

  recordHistory() {
    const t = this.plants.totals();
    this.history.push({
      year: this.year,
      T: Math.round(this.climate.globalT * 10) / 10,
      ice: Math.round(this.climate.iceShare * 1000) / 1000,
      plants: Math.round(t.plants),
      algae: Math.round(t.algae),
      groups: this.life.n,
      species: this.species.alive().length,
    });
    if (this.history.length > 1200) {
      this.history = this.history.filter((_, k) => k % 2 === 0);
      this.historyStep *= 2;
    }
  }

  // ---------- Eingriffe ----------

  setSun(v) {
    this.params.sun = clamp(v, 0.7, 1.3);
    this.version++;
  }

  setCO2(v) {
    this.params.co2 = clamp(v, 100, 5000);
    this.version++;
  }

  logParam(kind) {
    if (kind === 'sun') {
      this.chronicle.add('gott', `Die Sonne leuchtet jetzt mit ${Math.round(this.params.sun * 100)} % ihrer Kraft`, null, true);
    } else {
      this.chronicle.add('gott', `Der Kohlendioxid-Gehalt der Luft liegt jetzt bei ${Math.round(this.params.co2)} ppm`, null, true);
    }
  }

  meteor(x, y, size = 2) {
    const r = [2, 4.5, 9][size - 1];
    const depth = [450, 1600, 3600][size - 1];
    const where = formatLatLon(x, y);
    const life = this.life;
    const rng = this.rng;
    let changed = false;
    const hitOcean = this.isOcean[cellOf(x, y)] === 1;
    // Krater
    this.forCells(x, y, r * 1.6, (c, d) => {
      const before = this.elev[c] < 0;
      if (d < r) this.elev[c] -= depth * (1 - (d / r) ** 2);
      else this.elev[c] += 0.18 * depth * Math.exp(-(((d - r) / (0.35 * r)) ** 2));
      if (before !== this.elev[c] < 0) changed = true;
    });
    this.craters.push({ x, y, r, depth });
    // Tote und verbrannte Erde
    let killed = 0;
    for (let i = 0; i < life.n; i++) {
      let dx = Math.abs(life.x[i] - x);
      if (dx > W / 2) dx = W - dx;
      dx *= Math.max(0.15, COSLAT[life.y[i] | 0]);
      const d = Math.hypot(dx, life.y[i] - y);
      let p = d < r * 1.5 ? 1.3 - d / (r * 1.5) : 0;
      if (hitOcean && d < r * 4 && this.coast[cellOf(life.x[i], life.y[i])] <= 2) p = Math.max(p, 0.6);
      if (p > 0 && rng.next() < p) {
        life.kill(i, 'starved');
        killed++;
      }
    }
    life.compact();
    this.forCells(x, y, r * 2.5, (c, d) => {
      const f = d / (r * 2.5);
      this.plants.P[c] *= f * f;
      this.plants.A[c] *= f;
    });
    this.params.dust = Math.min(0.6, this.params.dust + [0.03, 0.12, 0.3][size - 1]);
    if (changed) {
      this.updateOcean();
      this.climate.updateSeasonShape();
    }
    this.plants.updateCapacity();
    this.terrainVersion++;
    this.version++;
    const word = ['Ein kleiner Meteor', 'Ein großer Meteor', 'Ein gewaltiger Asteroid'][size - 1];
    const extra = size === 3 ? '. Staub verdunkelt den Himmel für Jahre' : size === 2 ? '. Staub kühlt den Planeten' : '';
    const dead = killed ? `, ${killed} Gruppen von Lebewesen sterben` : '';
    this.chronicle.add('gott', `${word} schlägt bei ${where} ein${dead}${extra}`, [x, y], true);
    return killed;
  }

  weather(x, y, mode) {
    const f = mode === 'regen' ? 2.6 : 0.2;
    const r = 7;
    this.forCells(x, y, r, (c, d) => {
      const w = 1 - (d / r) ** 2;
      this.climate.rainMod[c] = Math.max(0.05, Math.min(5, this.climate.rainMod[c] * (1 + (f - 1) * w)));
    });
    this.climate.computeRain();
    this.plants.updateCapacity();
    this.version++;
    const where = formatLatLon(x, y);
    this.chronicle.add('gott', mode === 'regen' ? `Ein Gott lässt es bei ${where} regnen` : `Eine Dürre trifft das Land bei ${where}`, [x, y], false);
  }

  sow(x, y, kind) {
    const c = cellOf(x, y);
    const where = formatLatLon(x, y);
    if (kind === 'pflanzen') {
      if (this.isOcean[c]) {
        this.seedAlgae(x, y, 3);
        if (!this.plants.seaStarted) {
          this.plants.seaStarted = true;
          this.state.algaeSince = this.tick;
          this.milestones.algae = this.tick;
        }
        this.chronicle.add('gott', `Ein Gott sät Algen ins Meer bei ${where}`, [x, y], true);
      } else {
        if (!this.seedPlants(x, y, 3)) return false;
        if (!this.plants.landStarted) this.milestones.landplants = this.tick;
        this.plants.landStarted = true;
        this.chronicle.add('gott', `Ein Gott pflanzt Grün bei ${where}`, [x, y], true);
      }
      this.version++;
      return true;
    }
    // Zellen aussetzen, angepasst an den Ort
    const onLand = !this.isOcean[c];
    const genes = this.primitiveGenes(c, onLand);
    const sp = this.species.create(genes, 0, null, this.tick, [x, y]);
    for (let k = 0; k < 12; k++) {
      const g = this.primitiveGenes(c, onLand);
      g[HUE] = genes[HUE];
      this.life.spawn((x + this.rng.range(-1.5, 1.5) + W) % W, y + this.rng.range(-1.5, 1.5), g, 0, 1.3, sp.id, 0);
    }
    sp.count = 12;
    sp.peak = 12;
    sp.announced = true;
    if (this.milestones.animals === undefined) this.milestones.animals = this.tick;
    this.chronicle.add('gott', `Ein Gott setzt Leben aus: §${sp.name}§ bei ${where}`, [x, y], true);
    this.version++;
    return true;
  }

  // ---------- Abfragen ----------

  cellInfo(x, y) {
    const c = cellOf(x, y);
    const cl = this.climate;
    const life = this.life;
    const groups = new Map();
    for (let i = 0; i < life.n; i++) {
      if (cellOf(life.x[i], life.y[i]) !== c) continue;
      groups.set(life.sp[i], (groups.get(life.sp[i]) || 0) + 1);
    }
    let tMin = Infinity;
    let tMax = -Infinity;
    for (let m = 0; m < MONTHS; m++) {
      const t = cl.Ts[c] + cl.season[m * N + c];
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
    }
    return {
      c,
      where: formatLatLon(x, y),
      biome: biomeName(this, c),
      ocean: this.isOcean[c] === 1,
      elev: this.elev[c],
      T: cl.Ts[c],
      tMonth: cl.Ts[c] + cl.season[this.month * N + c],
      tMin,
      tMax,
      rain: cl.rain[c],
      ice: cl.ice[c],
      plants: this.isOcean[c] ? this.plants.A[c] : this.plants.P[c],
      capacity: this.isOcean[c] ? this.plants.Ka[c] : this.plants.Kp[c],
      groups: [...groups.entries()].map(([id, n]) => ({ sp: this.species.get(id), n })).filter((g) => g.sp),
    };
  }

  globalStats() {
    const t = this.plants.totals();
    return {
      T: this.climate.globalT,
      ice: this.climate.iceShare,
      plants: t.plants,
      algae: t.algae,
      groups: this.life.n,
      species: this.species.alive().length,
    };
  }

  // ---------- Speichern ----------

  serialize() {
    const cl = this.climate;
    return {
      v: SAVE_VERSION,
      seed: this.seed,
      name: this.name,
      start: this.start,
      tick: this.tick,
      params: { ...this.params },
      rng: this.rng.getState(),
      rngSpare: this.rng.spare,
      elev: this.elev.slice(),
      craters: this.craters.slice(),
      milestones: { ...this.milestones },
      state: { ...this.state },
      history: this.history.slice(),
      historyStep: this.historyStep,
      climate: {
        zonal: Array.from(cl.zonal),
        T: cl.T.slice(),
        Ts: cl.Ts.slice(),
        rain: cl.rain.slice(),
        rainMod: cl.rainMod.slice(),
        ice: cl.ice.slice(),
        snow: cl.snow.slice(),
        globalT: cl.globalT,
        iceShare: cl.iceShare,
      },
      plants: {
        P: this.plants.P.slice(),
        A: this.plants.A.slice(),
        landStarted: this.plants.landStarted,
        seaStarted: this.plants.seaStarted,
      },
      life: this.life.serialize(),
      species: this.species.serialize(),
      chronicle: this.chronicle.entries.slice(),
    };
  }

  static restore(d) {
    const w = new World({ seed: d.seed, start: d.start, name: d.name });
    w.tick = d.tick;
    w.params = { ...w.params, ...d.params };
    w.rng.setState(d.rng);
    w.rng.spare = d.rngSpare ?? null;
    w.elev.set(d.elev);
    w.craters = d.craters || [];
    w.milestones = d.milestones || {};
    w.state = { ...w.state, ...d.state };
    w.history = d.history || [];
    w.historyStep = d.historyStep || 1;
    w.updateOcean();
    const cl = w.climate;
    cl.zonal.set(d.climate.zonal);
    cl.T.set(d.climate.T);
    cl.Ts.set(d.climate.Ts);
    cl.rain.set(d.climate.rain);
    cl.rainMod.set(d.climate.rainMod);
    cl.ice.set(d.climate.ice);
    cl.snow.set(d.climate.snow);
    cl.globalT = d.climate.globalT;
    cl.iceShare = d.climate.iceShare;
    cl.updateInsolation();
    w.plants.P.set(d.plants.P);
    w.plants.A.set(d.plants.A);
    w.plants.landStarted = d.plants.landStarted;
    w.plants.seaStarted = d.plants.seaStarted;
    w.plants.updateCapacity();
    w.life.restore(d.life);
    w.species.restore(d.species);
    w.chronicle.entries = d.chronicle || [];
    w.terrainVersion = w.craters.length;
    return w;
  }

  areaMean(field) {
    let s = 0;
    let wsum = 0;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        s += field[j * W + i] * COSLAT[j];
        wsum += COSLAT[j];
      }
    }
    return s / wsum;
  }
}

export { LAT };
