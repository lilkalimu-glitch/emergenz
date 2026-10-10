// Tests für den Simulations-Prozess (SimHost): Daten für die Anzeige, Eingriffe, Abfragen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SimHost } from '../www/js/sim/host.js';
import { W, H, N, BW, BH } from '../www/js/sim/const.js';

test('Vorschau und Start liefern Bilder-Daten in der richtigen Größe', () => {
  const h = new SimHost();
  h.previewWorld(4242);
  const t = h.terrain(true);
  assert.equal(t.elev.length, BW * BH);
  const f = h.fields(0, true);
  assert.equal(f.climate.length, N * 4);
  assert.equal(f.bio.length, N * 4);
  assert.equal(f.life.length, N * 4);
  assert.equal(f.width, W);
  assert.equal(f.height, H);
  h.start('ursuppe');
  const fr = h.frame();
  assert.ok(fr.n > 0, 'erste Gruppen');
  for (const k of ['x', 'y', 'px', 'py', 'sp', 'uid', 'size', 'land', 'mass']) assert.equal(fr[k].length, fr.n, k);
  assert.ok(SimHost.transfer(fr).every((b) => b instanceof ArrayBuffer));
  const s = h.species(0, true);
  assert.ok(s.list.length >= 1);
  assert.equal(s.list[0].g.length, 9);
});

test('Bewegung: px/py ist die Position beim letzten Bild', () => {
  const h = new SimHost();
  h.previewWorld(777);
  h.start('ursuppe');
  h.world.step(24);
  const a = h.frame();
  h.world.step(3);
  const b = h.frame();
  const pos = new Map();
  for (let i = 0; i < a.n; i++) pos.set(a.uid[i], [a.x[i], a.y[i]]);
  let checked = 0;
  for (let i = 0; i < b.n; i++) {
    const p = pos.get(b.uid[i]);
    if (!p) continue;
    assert.equal(b.px[i], p[0]);
    assert.equal(b.py[i], p[1]);
    checked++;
  }
  assert.ok(checked > 0, 'Gruppen über zwei Bilder verfolgt');
  const c = h.frame(true);
  for (let i = 0; i < c.n; i++) assert.equal(c.px[i], c.x[i]);
});

test('Eingriffe und Abfragen über den Host', () => {
  const h = new SimHost();
  h.previewWorld(31337);
  h.start('ursuppe');
  h.world.step(12 * 40);
  const tv = h.world.terrainVersion;
  h.terrain(true);
  assert.equal(h.terrain(), null, 'Gelände nur nach Änderung');
  const r = h.act('meteor', { x: 100, y: 64, size: 2 });
  assert.ok(r !== null);
  assert.ok(h.world.terrainVersion > tv);
  assert.ok(h.terrain(), 'neues Gelände nach dem Einschlag');
  const fr = h.frame();
  const g = h.query('group', { uid: fr.uid[0] });
  assert.equal(g.uid, fr.uid[0]);
  assert.equal(g.genes.length, 9);
  const cell = h.query('cell', { x: fr.x[0], y: fr.y[0] });
  assert.ok(cell.groups.some((x) => x.id === fr.sp[0]));
  assert.ok(typeof cell.biome === 'string');
  const hist = h.query('history');
  assert.ok(hist.history.length > 10);
  h.act('sun', { v: 0.97 });
  assert.equal(h.world.params.sun, 0.97);
  h.act('step', { months: 12 });
});

test('Gleicher Seed und gleiche Eingriffe ergeben denselben Verlauf', () => {
  const run = () => {
    const h = new SimHost();
    h.previewWorld(2024);
    h.start('ursuppe');
    h.world.step(12 * 30);
    h.act('meteor', { x: 40, y: 50, size: 1 });
    h.act('sow', { x: 120, y: 70, kind: 'pflanzen' });
    h.world.step(12 * 30);
    const f = h.frame();
    let s = 0;
    for (let i = 0; i < f.n; i++) s += f.x[i] * 3 + f.y[i] + f.sp[i];
    return [f.n, Math.round(s * 1000)];
  };
  assert.deepEqual(run(), run());
});

test('Spielstand: speichern und laden über den Host', () => {
  const h = new SimHost();
  h.previewWorld(99);
  h.start('ursuppe');
  h.world.step(12 * 20);
  const data = h.world.serialize();
  const h2 = new SimHost();
  h2.restore(structuredClone(data));
  assert.equal(h2.world.tick, h.world.tick);
  assert.equal(h2.frame().n, h.frame().n);
});
