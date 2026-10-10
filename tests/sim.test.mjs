// Tests der Simulation (laufen mit `node --test tests/`, ohne Browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../www/js/sim/world.js';
import { generatePlanet, oceanShare } from '../www/js/sim/planet.js';
import { W, H, N, LAT } from '../www/js/sim/const.js';
import { NG, SIZE, LAND } from '../www/js/sim/genome.js';
import { miamiNPP } from '../www/js/sim/plants.js';

function hashWorld(w) {
  let h = 0;
  const mix = (v) => {
    h = (Math.imul(h ^ Math.round(v * 1000), 2654435761) >>> 0) ^ (h >>> 13);
  };
  for (let i = 0; i < w.life.n; i += 7) {
    mix(w.life.x[i]);
    mix(w.life.B[i]);
  }
  for (let c = 0; c < N; c += 97) mix(w.plants.A[c] + w.plants.P[c]);
  mix(w.climate.globalT);
  return h >>> 0;
}

test('Gelände: gleicher Seed gibt dieselbe Welt, etwa 68 % Ozean', () => {
  const a = generatePlanet(4711);
  const b = generatePlanet(4711);
  assert.deepEqual(a.elev.slice(0, 500), b.elev.slice(0, 500));
  const share = oceanShare(a.elev);
  assert.ok(share > 0.62 && share < 0.75, `Ozeananteil ${share}`);
});

test('Klima: erdähnliche Mitteltemperatur, Äquator warm, Pole kalt', () => {
  const w = World.create({ seed: 12345, start: 'leer' });
  const cl = w.climate;
  assert.ok(cl.globalT > 8 && cl.globalT < 20, `Mittel ${cl.globalT}`);
  const eq = cl.zonal[H / 2];
  const pole = cl.zonal[2];
  assert.ok(eq > 22 && eq < 33, `Äquator ${eq}`);
  assert.ok(pole < -3, `Pol ${pole}`);
  // Wüsten in den Subtropen, Regen am Äquator (über dem Meer gemittelt)
  const rowMean = (lat) => {
    const j = Math.round(((90 - lat) / 180) * H - 0.5);
    let s = 0;
    for (let i = 0; i < W; i++) s += cl.rain[j * W + i];
    return s / W;
  };
  assert.ok(rowMean(0) > 1.5 * rowMean(28), 'Äquator nasser als Subtropen');
  for (let c = 0; c < N; c++) assert.ok(Number.isFinite(cl.Ts[c]) && Number.isFinite(cl.rain[c]));
});

test('Klima: schwächere Sonne kühlt, mehr CO2 wärmt', () => {
  const w = World.create({ seed: 99, start: 'leer' });
  const t0 = w.climate.globalT;
  w.setSun(0.97);
  for (let y = 0; y < 60; y++) w.climate.stepYear();
  const tCold = w.climate.globalT;
  assert.ok(tCold < t0 - 2, `Sonne 97 %: ${t0} -> ${tCold}`);
  w.setSun(1);
  w.setCO2(1120);
  for (let y = 0; y < 80; y++) w.climate.stepYear();
  assert.ok(w.climate.globalT > t0 + 2, `CO2 x4: ${w.climate.globalT}`);
});

test('Miami-Modell: Regenwald produktiver als Wüste und Tundra', () => {
  assert.ok(miamiNPP(26, 2500) > 2000);
  assert.ok(miamiNPP(25, 100) < 200);
  assert.ok(miamiNPP(-8, 300) < 700);
});

test('Ursuppe: Leben breitet sich aus und bildet Arten', () => {
  const w = World.create({ seed: 12345, start: 'ursuppe' });
  w.step(12 * 300);
  assert.ok(w.life.n > 300, `Gruppen ${w.life.n}`);
  assert.ok(w.species.alive().length >= 3, 'mehrere Arten');
  assert.ok(w.milestones.multicell !== undefined, 'Mehrzeller entstanden');
  for (let i = 0; i < w.life.n; i++) {
    assert.ok(Number.isFinite(w.life.x[i]) && w.life.x[i] >= 0 && w.life.x[i] < W);
    assert.ok(w.life.y[i] >= 0 && w.life.y[i] < H);
    assert.ok(w.life.B[i] > 0);
    for (let g = 0; g < NG; g++) {
      const v = w.life.genes[i * NG + g];
      assert.ok(v >= 0 && v <= 1, `Gen ${g} = ${v}`);
    }
  }
  assert.ok(w.life.n <= w.life.cap);
});

test('Gleicher Seed und gleiche Eingriffe ergeben denselben Verlauf', () => {
  const run = () => {
    const w = World.create({ seed: 2026, start: 'ursuppe' });
    w.step(12 * 60);
    w.meteor(100, 60, 2);
    w.step(12 * 40);
    return hashWorld(w);
  };
  assert.equal(run(), run());
});

test('Meteor: tötet in der Nähe, Staub kühlt das Klima', () => {
  const w = World.create({ seed: 12345, start: 'ursuppe' });
  w.step(12 * 150);
  // Ziel: dichteste Stelle
  let bx = 0;
  let by = 0;
  let best = -1;
  for (let i = 0; i < w.life.n; i += 5) {
    let cnt = 0;
    for (let k = 0; k < w.life.n; k += 3) {
      if (Math.abs(w.life.x[k] - w.life.x[i]) < 4 && Math.abs(w.life.y[k] - w.life.y[i]) < 4) cnt++;
    }
    if (cnt > best) {
      best = cnt;
      bx = w.life.x[i];
      by = w.life.y[i];
    }
  }
  const before = w.life.n;
  const t0 = w.climate.globalT;
  const killed = w.meteor(bx, by, 3);
  assert.ok(killed > 0, 'Opfer');
  assert.equal(w.life.n, before - killed);
  assert.ok(w.params.dust > 0.25);
  w.step(12 * 2);
  assert.ok(w.climate.globalT < t0 - 1, `Einschlagswinter ${t0} -> ${w.climate.globalT}`);
  w.step(12 * 40);
  assert.ok(w.params.dust < 0.01, 'Staub verschwindet');
});

test('Speichern und Laden ergibt dieselbe Welt', () => {
  const w = World.create({ seed: 31337, start: 'ursuppe' });
  w.step(12 * 80);
  w.weather(50, 40, 'regen');
  const data = w.serialize();
  const copy = World.restore(structuredClone(data));
  assert.equal(copy.tick, w.tick);
  assert.equal(copy.life.n, w.life.n);
  assert.equal(copy.species.list.length, w.species.list.length);
  w.step(12 * 20);
  copy.step(12 * 20);
  assert.equal(hashWorld(copy), hashWorld(w));
});

test('Leben aussetzen und Pflanzen säen', () => {
  const w = World.create({ seed: 5, start: 'leer' });
  // Landzelle mit gutem Klima suchen
  let land = -1;
  for (let c = 0; c < N; c++) {
    if (!w.isOcean[c] && w.plants.Kp[c] > 2 && Math.abs(LAT[(c / W) | 0]) < 40) {
      land = c;
      break;
    }
  }
  assert.ok(land >= 0);
  const x = (land % W) + 0.5;
  const y = ((land / W) | 0) + 0.5;
  assert.ok(w.sow(x, y, 'pflanzen'));
  assert.ok(w.plants.landStarted);
  assert.ok(w.sow(x, y, 'zellen'));
  assert.ok(w.life.n >= 10);
  const g = w.life.genes;
  assert.ok(g[0 * NG + LAND] > 0.5, 'an Land ausgesetzte Zellen leben an Land');
  assert.ok(g[0 * NG + SIZE] < 0.1);
});
