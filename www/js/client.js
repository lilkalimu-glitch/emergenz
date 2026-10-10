// Verbindung zum Simulations-Prozess: schickt Befehle und hält die neuesten Daten für die Anzeige bereit.

export class SimClient {
  constructor() {
    this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    this.pending = new Map();
    this.nextId = 1;
    this.frame = null;
    this.frameAt = 0;
    this.frameGap = 80; // geschätzter Abstand zwischen zwei Bildern mit Bewegung (ms)
    this.frameSeq = 0;
    this.fields = null;
    this.fieldsSeq = 0;
    this.terrain = null;
    this.terrainSeq = 0;
    this.tex2d = null;
    this.tex2dSeq = 0;
    this.species = new Map();
    this.speciesSeq = 0;
    this.speciesPruned = 0;
    this.chronicle = [];
    this.chronicleCount = 0;
    this.listeners = {};
    this.worker.onmessage = (e) => this.handle(e.data);
    this.worker.onerror = (e) => {
      console.error('EMERGENZ_FEHLER Worker', e.message || e);
      this.emit('error', e.message || String(e));
    };
  }

  on(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners[type] || []) fn(data);
  }

  send(cmd, args = {}) {
    this.worker.postMessage({ cmd, ...args });
  }

  request(cmd, args = {}) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({ cmd, id, ...args });
    });
  }

  act(kind, args = {}) {
    return this.request('act', { kind, args });
  }

  query(what, args = {}) {
    return this.request('query', { what, args });
  }

  handle(m) {
    switch (m.type) {
      case 'frame': {
        const now = performance.now();
        if (m.stepped && this.frame && this.frame.stepped) {
          const gap = Math.min(400, Math.max(16, now - this.frameAt));
          this.frameGap = this.frameGap * 0.8 + gap * 0.2;
        }
        this.frame = m;
        this.frameAt = now;
        this.frameSeq++;
        if (m.fresh && m.fresh.length) {
          for (const e of m.fresh) this.chronicle.push(e);
          this.chronicleCount += m.fresh.length;
          if (this.chronicle.length > 600) this.chronicle.splice(0, this.chronicle.length - 600);
          this.emit('fresh', m.fresh);
        }
        this.emit('frame', m);
        break;
      }
      case 'fields':
        this.fields = m;
        this.fieldsSeq++;
        break;
      case 'terrain':
        this.terrain = m;
        this.terrainSeq++;
        break;
      case 'tex2d':
        this.tex2d = m;
        this.tex2dSeq++;
        break;
      case 'species':
        this.species = new Map(m.list.map((s) => [s.id, s]));
        this.speciesPruned = m.pruned;
        this.speciesExtinct = m.extinct;
        this.speciesSeq++;
        this.emit('species', this.species);
        break;
      case 'chronicle':
        this.chronicle = m.entries;
        this.emit('chronicle', m.entries);
        break;
      case 'reply':
      case 'save-info': {
        const fn = this.pending.get(m.id);
        if (fn) {
          this.pending.delete(m.id);
          fn(m.type === 'save-info' ? m.info : m.data);
        }
        break;
      }
      case 'error':
        console.error('EMERGENZ_FEHLER', m.message);
        this.emit('error', m.message);
        break;
      default:
        this.emit(m.type, m);
    }
  }

  aliveSpecies() {
    const out = [];
    for (const s of this.species.values()) if (s.died < 0 && s.count > 0) out.push(s);
    return out.sort((a, b) => b.count - a.count);
  }
}
