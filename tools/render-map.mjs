// Entwicklerwerkzeug: erzeugt eine Welt, lässt sie laufen und speichert die Karten als PPM-Bilder.
// Aufruf: node tools/render-map.mjs [seed] [jahre] [start] [ordner]
import { writeFileSync, mkdirSync } from 'node:fs';
import { World } from '../www/js/sim/world.js';
import { PlanetTexture, LAYERS } from '../www/js/render/texture.js';
import { TW, TH } from '../www/js/sim/const.js';

const seed = Number(process.argv[2] || 12345);
const years = Number(process.argv[3] || 300);
const start = process.argv[4] || 'ursuppe';
const out = process.argv[5] || 'karten';
mkdirSync(out, { recursive: true });

const t0 = performance.now();
const world = World.create({ seed, start });
world.step(years * 12);
console.log(`Welt ${seed}, ${years} Jahre in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${world.life.n} Gruppen, ${world.species.alive().length} Arten`);

const tex = new PlanetTexture(world);
for (const layer of LAYERS) {
  for (const month of layer.id === 'natur' ? [0, 6] : [world.month]) {
    const t1 = performance.now();
    tex.update(layer.id, month);
    const ms = performance.now() - t1;
    const rgb = Buffer.alloc(TW * TH * 3);
    for (let k = 0; k < TW * TH; k++) {
      rgb[k * 3] = tex.data[k * 4];
      rgb[k * 3 + 1] = tex.data[k * 4 + 1];
      rgb[k * 3 + 2] = tex.data[k * 4 + 2];
    }
    const name = `${out}/${layer.id}${layer.id === 'natur' ? `-m${month}` : ''}.ppm`;
    writeFileSync(name, Buffer.concat([Buffer.from(`P6\n${TW} ${TH}\n255\n`), rgb]));
    console.log(`${name}: ${ms.toFixed(0)} ms`);
  }
}
