// Testet die Oberfläche im Handyformat (393 x 852) mit Playwright und macht Bildschirmfotos.
// Aufruf (Server muss laufen): python3 -m http.server 8080 --directory www & node tests/ui.mjs <ordner>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const out = process.argv[2] || 'out/web';
mkdirSync(out, { recursive: true });
const URL = process.env.EMERGENZ_URL || 'http://127.0.0.1:8080/index.html';

const browser = await chromium.launch();
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
page.on('console', (m) => {
  logs.push(`[${m.type()}] ${m.text()}`);
  // fehlende Dateien meldet die Antwort-Prüfung mit Adresse
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`Konsole: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`Seitenfehler: ${e.message}`));
page.on('requestfailed', (r) => errors.push(`Laden fehlgeschlagen: ${r.url()}`));
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()}: ${r.url()}`);
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

await step('Start', async () => {
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForFunction(() => {
    const b = document.getElementById('create');
    return b && !b.disabled;
  }, null, { timeout: 60000 });
  results.vorschauMs = Date.now() - t0;
  await page.waitForTimeout(700);
  await shot('start');
});

await step('Welt erschaffen', async () => {
  await page.click('#create');
  await page.waitForFunction(() => window.__emergenz && window.__emergenz.state.started, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot('globus-anfang');
});

await step('Tempo messen', async () => {
  results.jahreProSekundeMax = await E(async () => {
    const X = window.__emergenz;
    const t0 = X.app.world.tick;
    X.setSpeed(3);
    await new Promise((r) => setTimeout(r, 5000));
    const t1 = X.app.world.tick;
    X.setSpeed(1);
    return (t1 - t0) / 12 / 5;
  });
  console.log('Jahre pro Sekunde (höchste Stufe):', results.jahreProSekundeMax.toFixed(1));
});

await step('600 Jahre vorspulen', async () => {
  results.ms600Jahre = await E(() => {
    const t0 = performance.now();
    window.__emergenz.step(12 * 600);
    return Math.round(performance.now() - t0);
  });
  results.nachVorspulen = await E(() => {
    const w = window.__emergenz.app.world;
    return { jahr: w.year, gruppen: w.life.n, arten: w.species.alive().length, temperatur: w.climate.globalT };
  });
  await page.waitForTimeout(1500);
  await shot('globus-600-jahre');
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

await step('Ort ansehen', async () => {
  await E(() => window.__emergenz.setLayer('natur'));
  await E(() => window.__emergenz.setSpeed(0));
  // eine Landzelle mit Leben suchen und dorthin fliegen
  await E(() => {
    const X = window.__emergenz;
    const w = X.app.world;
    const L = w.life;
    let i = 0;
    for (let k = 0; k < L.n; k++) {
      if (!w.isOcean[(L.y[k] | 0) * 256 + (L.x[k] | 0)]) {
        i = k;
        break;
      }
    }
    X.app.flyTo(L.x[i], L.y[i]);
  });
  await page.waitForTimeout(700);
  await E(() => window.__emergenz.tapAt(196.5, 426));
  await page.waitForTimeout(700);
  await shot('ort-oder-gruppe');
  await E(() => window.__emergenz.closeSheet());
});

await step('Chronik', async () => {
  await page.click('[data-tool="chronik"]');
  await page.waitForTimeout(500);
  await shot('chronik');
});

await step('Arten', async () => {
  await page.click('[data-act="tab"][data-v="arten"]');
  await page.waitForTimeout(400);
  await shot('arten');
  const first = await page.$('.species-row');
  if (!first) throw new Error('keine Art in der Liste');
  await first.click();
  await page.waitForTimeout(500);
  await shot('art');
});

await step('Verlauf', async () => {
  await E(() => window.__emergenz.openSheet('chronik', 'verlauf'));
  await page.waitForTimeout(500);
  await shot('verlauf');
  await E(() => window.__emergenz.closeSheet());
});

await step('Klima', async () => {
  await page.click('[data-tool="klima"]');
  await page.waitForTimeout(400);
  await page.fill('#sun', '96');
  await page.dispatchEvent('#sun', 'input');
  await page.dispatchEvent('#sun', 'change');
  await page.waitForTimeout(300);
  await shot('klima');
  const sun = await E(() => window.__emergenz.app.world.params.sun);
  if (Math.abs(sun - 0.96) > 0.001) throw new Error(`Sonne nicht übernommen: ${sun}`);
  await E(() => {
    window.__emergenz.app.world.setSun(1);
    window.__emergenz.closeSheet();
  });
});

await step('Meteor', async () => {
  await E(() => window.__emergenz.setView('globe'));
  await page.click('[data-tool="meteor"]');
  await page.click('[data-meteor="3"]');
  const before = await E(() => window.__emergenz.app.world.chronicle.entries.length);
  await E(() => {
    const X = window.__emergenz;
    X.setSpeed(1);
    X.tapAt(196.5, 390);
  });
  await page.waitForTimeout(250);
  await shot('meteor');
  const after = await E(() => window.__emergenz.app.world.chronicle.entries.length);
  if (after <= before) throw new Error('Meteor hat keinen Eintrag in der Chronik erzeugt');
  await page.waitForTimeout(1500);
  await shot('nach-meteor');
});

await step('Leben aussetzen', async () => {
  await page.click('[data-tool="leben"]');
  await page.waitForTimeout(300);
  await shot('werkzeug-leben');
  await page.click('[data-tool="ansehen"]');
});

await step('Welt-Menü', async () => {
  await page.click('#btn-world');
  await page.waitForTimeout(400);
  await shot('welt-menue');
  await E(() => window.__emergenz.closeSheet());
});

await step('Kein seitliches Scrollen', async () => {
  const over = await E(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (over) throw new Error('Seite ist breiter als der Bildschirm');
});

await step('Speichern und Weiterspielen', async () => {
  const tick = await E(async () => {
    await window.__emergenz.save();
    return window.__emergenz.app.world.tick;
  });
  await page.reload();
  await page.waitForSelector('#continue', { timeout: 30000 });
  await shot('weiterspielen');
  await page.click('#continue');
  await page.waitForFunction(() => window.__emergenz && window.__emergenz.state.started, null, { timeout: 30000 });
  const loaded = await E(() => window.__emergenz.app.world.tick);
  if (Math.abs(loaded - tick) > 24) throw new Error(`geladen: ${loaded}, gespeichert: ${tick}`);
  await page.waitForTimeout(1000);
  await shot('geladen');
});

writeFileSync(`${out}/konsole.txt`, logs.join('\n'));
writeFileSync(`${out}/ergebnis.json`, JSON.stringify({ fehler: errors, ...results }, null, 2));
await browser.close();

if (errors.length) {
  console.error('\nFEHLER:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nALLE OBERFLÄCHEN-TESTS BESTANDEN', JSON.stringify(results));
