// Testet die Oberfläche im Handyformat (393 x 852) mit Playwright und macht Bildschirmfotos.
// Aufruf (Server muss laufen): python3 -m http.server 8080 --directory www & node tests/ui.mjs <ordner>
// EMERGENZ_LOCAL=1: fehlende Schriften nicht als Fehler zählen (ohne "npm install").
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'out/web';
mkdirSync(out, { recursive: true });
const URL = process.env.EMERGENZ_URL || 'http://127.0.0.1:8080/index.html';
const LOCAL = !!process.env.EMERGENZ_LOCAL;

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
const errors = [];
const logs = [];
const results = {};
const ignored = (url) => url.endsWith('/favicon.ico') || (LOCAL && url.includes('/fonts/'));
page.on('console', (m) => {
  logs.push(`[${m.type()}] ${m.text()}`);
  // fehlende Dateien meldet die Antwort-Prüfung mit Adresse
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`Konsole: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`Seitenfehler: ${e.message}`));
page.on('requestfailed', (r) => {
  if (!ignored(r.url())) errors.push(`Laden fehlgeschlagen: ${r.url()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400 && !ignored(r.url())) errors.push(`HTTP ${r.status()}: ${r.url()}`);
});

let n = 0;
async function shot(name) {
  n++;
  const file = `${out}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: file });
  console.log('Bild', file);
}

async function step(name, fn) {
  try {
    await fn();
    console.log('ok   ', name);
  } catch (e) {
    errors.push(`${name}: ${e.message}`);
    console.log('FEHLER', name, e.message);
    try {
      await shot(`fehler-${name.replace(/\W+/g, '-')}`);
    } catch {}
  }
}

const E = (fn, arg) => page.evaluate(fn, arg);
const info = () => E(() => window.__emergenz.info());

await step('Start', async () => {
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => {
    const b = document.getElementById('create');
    return b && !b.disabled;
  }, null, { timeout: 60000 });
  results.vorschauMs = Date.now() - t0;
  await page.waitForTimeout(900);
  await shot('start');
  results.webgl = (await info()).gl;
});

await step('Welt erschaffen', async () => {
  await page.click('#create');
  await page.waitForFunction(() => window.__emergenz && window.__emergenz.state.started, null, { timeout: 30000 });
  await page.waitForTimeout(1800);
  await shot('globus-anfang');
});

await step('Tempo messen', async () => {
  const a = await info();
  await E(() => window.__emergenz.setSpeed(3));
  await page.waitForTimeout(5000);
  const b = await info();
  await E(() => window.__emergenz.setSpeed(1));
  results.jahreProSekundeMax = (b.tick - a.tick) / 12 / 5;
  results.bilderProSekunde = Math.round(b.fps * 10) / 10;
  console.log('Jahre pro Sekunde (höchste Stufe):', results.jahreProSekundeMax.toFixed(1), 'Bilder pro Sekunde:', b.fps.toFixed(1));
});

await step('600 Jahre vorspulen', async () => {
  results.ms600Jahre = await E(async () => {
    const t0 = performance.now();
    await window.__emergenz.step(12 * 600);
    return Math.round(performance.now() - t0);
  });
  await page.waitForTimeout(1500);
  const i = await info();
  results.nachVorspulen = { jahr: Math.floor(i.tick / 12), gruppen: i.groups, arten: i.species, temperatur: i.T };
  if (i.groups < 50) throw new Error(`zu wenig Leben: ${i.groups} Gruppen`);
  await shot('globus-600-jahre');
});

await step('Globus nah', async () => {
  await E(() => window.__emergenz.globe(2.0));
  await page.waitForTimeout(1500);
  await shot('globus-nah');
  const i = await info();
  if (i.lifeMode < 1) throw new Error(`Tiere sollten als Bilder erscheinen (Modus ${i.lifeMode})`);
});

await step('Karte', async () => {
  await E(() => window.__emergenz.setView('map'));
  await page.waitForTimeout(1200);
  await shot('karte');
});

for (const layer of ['temperatur', 'regen', 'leben']) {
  await step(`Ebene ${layer}`, async () => {
    await E((l) => window.__emergenz.setLayer(l), layer);
    await page.waitForTimeout(900);
    await shot(`karte-${layer}`);
  });
}

await step('Nahansicht', async () => {
  await E(() => window.__emergenz.setLayer('natur'));
  for (const where of ['land', 'meer']) {
    const g = await E((w) => window.__emergenz.findGroup(w), where);
    if (!g) {
      console.log('keine Gruppe', where);
      continue;
    }
    await E((g) => window.__emergenz.zoomTo(g.x, g.y, 16), g);
    await page.waitForTimeout(1200);
    await shot(`mittel-${where}`);
    await E((g) => window.__emergenz.zoomTo(g.x, g.y, 64), g);
    await page.waitForTimeout(1500);
    await shot(`nah-${where}`);
    const i = await info();
    if (i.lifeMode !== 2) throw new Error(`Nahansicht erwartet, Modus ${i.lifeMode}`);
    if (i.sprites < 1) throw new Error('keine Tierbilder im Atlas');
  }
});

await step('Gruppe antippen', async () => {
  await E(() => window.__emergenz.setSpeed(0));
  const g = await E(() => window.__emergenz.findGroup('any'));
  await E((g) => window.__emergenz.zoomTo(g.x, g.y, 40), g);
  await page.waitForTimeout(800);
  await E(() => window.__emergenz.tapAt(window.__emergenz.cam.cx, window.__emergenz.cam.cy));
  await page.waitForTimeout(900);
  await shot('gruppe-oder-ort');
  const kind = await E(() => {
    const c = document.querySelector('#sheet-body .sheet-title');
    return c ? c.textContent : '';
  });
  if (!kind) throw new Error('kein Infoblatt');
  await E(() => window.__emergenz.closeSheet());
});

await step('Chronik', async () => {
  await page.click('[data-tool="chronik"]');
  await page.waitForTimeout(500);
  await shot('chronik');
});

await step('Arten', async () => {
  await page.click('[data-act="tab"][data-v="arten"]');
  await page.waitForTimeout(700);
  await shot('arten');
  const first = await page.$('.species-row');
  if (!first) throw new Error('keine Art in der Liste');
  await first.click();
  await page.waitForTimeout(600);
  await shot('art');
});

await step('Art zeigen', async () => {
  const b = await page.$('[data-act="highlight"]');
  if (b) {
    await b.click();
    await page.waitForTimeout(1600);
    await shot('art-markiert');
    await E(() => window.__emergenz.app.highlight(0));
  }
});

await step('Verlauf', async () => {
  await E(() => window.__emergenz.openSheet('chronik', 'verlauf'));
  await page.waitForTimeout(700);
  await shot('verlauf');
  await E(() => window.__emergenz.closeSheet());
});

await step('Klima', async () => {
  await page.click('[data-tool="klima"]');
  await page.waitForTimeout(400);
  await page.fill('#sun', '96');
  await page.dispatchEvent('#sun', 'input');
  await page.dispatchEvent('#sun', 'change');
  await page.waitForTimeout(600);
  await shot('klima');
  const sun = await E(() => window.__emergenz.info().params.sun);
  if (Math.abs(sun - 0.96) > 0.001) throw new Error(`Sonne nicht übernommen: ${sun}`);
  await E(async () => {
    await window.__emergenz.act('sun', { v: 1 });
    window.__emergenz.closeSheet();
  });
});

await step('Meteor', async () => {
  await E(() => window.__emergenz.globe(3.3));
  await page.click('[data-tool="meteor"]');
  await page.click('[data-meteor="3"]');
  const before = (await info()).chronicle;
  await E(() => {
    const X = window.__emergenz;
    X.setSpeed(1);
    X.tapAt(X.cam.cx, X.cam.cy - 30);
  });
  await page.waitForTimeout(250);
  await shot('meteor');
  await page.waitForTimeout(1500);
  const after = (await info()).chronicle;
  if (after <= before) throw new Error('Meteor hat keinen Eintrag in der Chronik erzeugt');
  await shot('nach-meteor');
});

await step('Leben aussetzen', async () => {
  await page.click('[data-tool="leben"]');
  await page.waitForTimeout(300);
  await shot('werkzeug-leben');
  await page.click('[data-tool="ansehen"]');
});

await step('Welt-Menü und Zeitsprung', async () => {
  await page.click('#btn-world');
  await page.waitForTimeout(400);
  await shot('welt-menue');
  const t0 = (await info()).tick;
  await page.click('[data-act="jump"][data-v="100"]');
  await page.waitForTimeout(300);
  await shot('zeitsprung');
  await page.waitForFunction(() => document.getElementById('busy').hidden, null, { timeout: 120000 });
  const t1 = (await info()).tick;
  if (t1 - t0 < 1190) throw new Error(`Zeitsprung zu kurz: ${t1 - t0} Monate`);
  await page.waitForTimeout(800);
  await shot('nach-zeitsprung');
});

await step('Kein seitliches Scrollen', async () => {
  const over = await E(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (over) throw new Error('Seite ist breiter als der Bildschirm');
});

await step('Speichern und Weiterspielen', async () => {
  const ok = await E(() => window.__emergenz.save());
  if (!ok) throw new Error('Speichern fehlgeschlagen');
  const tick = (await info()).tick;
  await page.reload();
  await page.waitForSelector('#continue', { timeout: 30000 });
  await shot('weiterspielen');
  await page.click('#continue');
  await page.waitForFunction(() => window.__emergenz && window.__emergenz.state.started, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const loaded = (await info()).tick;
  if (Math.abs(loaded - tick) > 24) throw new Error(`geladen: ${loaded}, gespeichert: ${tick}`);
  await page.waitForTimeout(800);
  await shot('geladen');
});

await step('Bilder der Lebewesen', async () => {
  await E(async () => {
    const { drawCreature, PLAN_NAMES } = await import('./js/art/creatures.js');
    const c = document.createElement('canvas');
    const W = 393;
    const H = 852;
    c.width = W * 2;
    c.height = H * 2;
    c.style.cssText = `position:fixed;inset:0;width:${W}px;height:${H}px;z-index:9999;background:#070c18`;
    document.body.appendChild(c);
    const g = c.getContext('2d');
    g.scale(2, 2);
    g.fillStyle = '#070c18';
    g.fillRect(0, 0, W, H);
    const rows = [
      [0.08, 0.2, 0.1],
      [0.35, 0.2, 0.1],
      [0.88, 0.3, 0.1],
      [0.4, 0.3, 0.5],
      [0.2, 0.3, 0.85],
      [0.5, 0.2, 0.85],
      [0.85, 0.2, 0.85],
    ];
    const vars = [(b) => b, (b) => ((b[1] = 0.85), b), (b) => ((b[3] = 0.1), b), (b) => ((b[5] = 0.95), (b[6] = 0.95), b)];
    rows.forEach((r, j) => {
      vars.forEach((v, i) => {
        const gg = v([r[0], r[1], r[2], 0.5, 0.5, 0.5, 0.5, 0.5]);
        gg.push((i * 0.21 + j * 0.37) % 1);
        drawCreature(g, 50 + i * 98, 60 + j * 112, 92, { id: 3 + i * 11 + j * 17, hue: gg[8], g: gg });
      });
    });
    g.fillStyle = '#94a0b6';
    g.font = '12px sans-serif';
    g.fillText(Object.values(PLAN_NAMES).join(' · '), 8, H - 14);
  });
  await page.waitForTimeout(200);
  await shot('lebewesen');
});

results.ende = await info().catch(() => null);
writeFileSync(`${out}/konsole.txt`, logs.join('\n'));
writeFileSync(`${out}/ergebnis.json`, JSON.stringify({ fehler: errors, ...results }, null, 2));
await browser.close();

if (errors.length) {
  console.error('\nFEHLER:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nALLE OBERFLÄCHEN-TESTS BESTANDEN', JSON.stringify(results));
