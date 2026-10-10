// Bilder der Arten für Listen und Infoblätter. Einmal gezeichnet, dann aus dem Speicher kopiert.

import { drawCreature, looks } from '../art/creatures.js';

const cache = new Map(); // "id|px" -> { sig, canvas }

function source(sp, px) {
  const key = `${sp.id}|${px}`;
  const sig = looks(sp);
  let e = cache.get(key);
  if (!e || e.sig !== sig) {
    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    drawCreature(c.getContext('2d'), px / 2, px / 2, px * 0.9, sp);
    e = { sig, canvas: c };
    cache.set(key, e);
    if (cache.size > 400) cache.delete(cache.keys().next().value);
  }
  return e.canvas;
}

// Platzhalter im HTML: <canvas data-por="id" data-px="88">
export function portraitTag(sp, cssPx, cls = 'sp-portrait') {
  const px = Math.round(cssPx * 2);
  const where = sp.g[2] < 0.35 ? ' is-sea' : sp.g[2] < 0.65 ? ' is-coast' : ' is-land';
  return `<canvas class="${cls}${where}" data-por="${sp.id}" data-px="${px}" width="${px}" height="${px}" style="width:${cssPx}px;height:${cssPx}px" aria-hidden="true"></canvas>`;
}

// Platzhalter füllen; viele neue Bilder werden über mehrere Bilder verteilt gezeichnet
export function fillPortraits(root, species) {
  const list = [...root.querySelectorAll('canvas[data-por]')];
  let k = 0;
  const step = () => {
    const t0 = performance.now();
    while (k < list.length && performance.now() - t0 < 8) {
      const c = list[k++];
      if (!c.isConnected) continue;
      const sp = species.get(Number(c.dataset.por));
      if (!sp) continue;
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(source(sp, Number(c.dataset.px)), 0, 0);
    }
    if (k < list.length) requestAnimationFrame(step);
  };
  step();
}
