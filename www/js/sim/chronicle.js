// Chronik: das Geschichtsbuch, das die Welt selbst schreibt.

export const KINDS = {
  leben: 'Leben',
  art: 'Neue Art',
  tod: 'Aussterben',
  klima: 'Klima',
  gott: 'Eingriff',
  welt: 'Welt',
};

export class Chronicle {
  constructor(world) {
    this.world = world;
    this.entries = [];
    this.fresh = []; // für Hinweise in der Oberfläche
    this.max = 500;
  }

  add(kind, text, where = null, important = false) {
    const e = { t: this.world.tick, kind, text, important };
    if (where) {
      e.x = where[0];
      e.y = where[1];
    }
    this.entries.push(e);
    if (this.entries.length > this.max) {
      // unwichtige alte Einträge zuerst entfernen
      const idx = this.entries.findIndex((x) => !x.important);
      this.entries.splice(idx >= 0 ? idx : 0, 1);
    }
    this.fresh.push(e);
    if (this.fresh.length > 20) this.fresh.shift();
    return e;
  }

  takeFresh() {
    const f = this.fresh;
    this.fresh = [];
    return f;
  }
}

export function formatYear(tick) {
  const y = Math.floor(tick / 12);
  return `Jahr ${y.toLocaleString('de-DE')}`;
}
