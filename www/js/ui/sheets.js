// Blätter von unten: Chronik, Arten, Verlauf, Infos zu Ort, Gruppe und Art, Klima, Welt.
// Die Daten kommen aus dem Simulations-Prozess: manche direkt aus dem letzten Bild, andere per Anfrage.

import { icon } from './icons.js';
import * as F from './format.js';
import { portraitTag, fillPortraits } from './portraits.js';
import { speciesCss } from '../render/colors.js';
import { SIZE, DIET, LAND, TOPT, TTOL, SPEED, SENSE, REPRO, describe, bodyMassKg, formatMass, topt, sigma } from '../sim/genome.js';
import { formatLatLon } from '../sim/const.js';
import { bodyPlan, PLAN_NAMES } from '../art/creatures.js';
import { VERSION } from '../version.js';

export function createSheets(app) {
  const client = app.client;
  const el = document.getElementById('sheet');
  const body = document.getElementById('sheet-body');
  const grip = document.getElementById('sheet-grip');
  let current = null;
  let tab = 'chronik';
  let token = 0;

  function open(kind, arg) {
    current = { kind, arg };
    if (kind === 'chronik' && arg) tab = arg;
    el.hidden = false;
    render(true);
  }

  function close() {
    if (!current) return false;
    current = null;
    token++;
    el.hidden = true;
    app.onSheetClosed();
    return true;
  }

  // Herunterziehen schließt
  let dragY = null;
  grip.addEventListener('pointerdown', (e) => {
    dragY = e.clientY;
    grip.setPointerCapture(e.pointerId);
  });
  grip.addEventListener('pointermove', (e) => {
    if (dragY === null) return;
    const d = Math.max(0, e.clientY - dragY);
    el.style.transform = `translateY(${d}px)`;
  });
  const end = (e) => {
    if (dragY === null) return;
    const d = e.clientY - dragY;
    dragY = null;
    el.style.transform = '';
    if (d > 70) close();
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  grip.addEventListener('click', () => close());

  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const v = t.dataset.v;
    if (act === 'close') close();
    else if (act === 'tab') {
      tab = v;
      render(true);
    } else if (act === 'art') open('art', Number(v));
    else if (act === 'goto') {
      const [x, y] = v.split(',').map(Number);
      close();
      app.flyTo(x, y);
    } else if (act === 'near') {
      const [x, y] = v.split(',').map(Number);
      close();
      app.zoomTo(x, y);
    } else if (act === 'highlight') {
      close();
      app.highlight(Number(v));
    } else if (act === 'unhighlight') {
      app.highlight(0);
      render();
    } else if (act === 'back') open('chronik', 'arten');
    else app.action(act, v);
  });

  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'sun') {
      app.setParam('sun', Number(t.value) / 100, false);
      showParam('sun', Number(t.value) / 100);
    } else if (t.id === 'co2') {
      const c = co2FromSlider(Number(t.value));
      app.setParam('co2', c, false);
      showParam('co2', c);
    }
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'sun') app.setParam('sun', Number(t.value) / 100, true);
    if (t.id === 'co2') app.setParam('co2', co2FromSlider(Number(t.value)), true);
  });

  function head(title, sub = '', italic = false) {
    return `<div class="sheet-head"><div style="flex:1;min-width:0"><h2 class="sheet-title${italic ? ' taxon-title' : ''}">${title}</h2>${
      sub ? `<p class="sheet-sub">${sub}</p>` : ''
    }</div><button class="icon-btn" data-act="close" aria-label="Schließen">${icon('close')}</button></div>`;
  }

  const frame = () => client.frame;

  async function build(k) {
    if (k === 'chronik') return renderChronik();
    if (k === 'art') return renderSpecies(current.arg);
    if (k === 'zelle') return renderCell(current.arg);
    if (k === 'gruppe') return renderGroup(current.arg);
    if (k === 'klima') return renderClimate();
    if (k === 'welt') return renderWorldMenu();
    if (k === 'confirm') return renderConfirm(current.arg);
    if (k === 'about') return renderAbout();
    return '';
  }

  async function render(fresh = false) {
    if (!current || !frame()) return;
    const my = ++token;
    const k = current.kind;
    let html;
    try {
      html = await build(k);
    } catch (e) {
      console.error('EMERGENZ_FEHLER Blatt', k, e && e.stack ? e.stack : e);
      return;
    }
    if (my !== token || !current || current.kind !== k) return;
    const top = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = fresh ? 0 : top;
    fillPortraits(body, client.species);
    if (k === 'chronik' && tab === 'verlauf') drawCharts();
  }

  // Ändert sich die Welt, werden manche Blätter neu gezeichnet
  function refresh() {
    if (!current) return;
    const k = current.kind;
    if (k === 'klima') updateClimateValues();
    else if (k === 'gruppe' || k === 'zelle' || k === 'art' || (k === 'chronik' && tab !== 'chronik')) render();
  }

  // ---------- Chronik, Arten, Verlauf ----------

  let history = null;

  async function renderChronik() {
    const f = frame();
    const tabs = [
      ['chronik', 'Chronik'],
      ['arten', 'Arten'],
      ['verlauf', 'Verlauf'],
    ]
      .map(([id, name]) => `<button class="tab${tab === id ? ' is-on' : ''}" data-act="tab" data-v="${id}">${name}</button>`)
      .join('');
    let content = '';
    if (tab === 'chronik') content = chronikList();
    else if (tab === 'arten') content = speciesList();
    else {
      history = await client.query('history');
      content = charts();
    }
    return `${head(F.esc(f.name), `${F.year(f.tick)}, ${F.MONTH_NAMES[f.tick % 12]}`)}<div class="tabs" role="tablist">${tabs}</div>${content}`;
  }

  function chronikList() {
    const entries = client.chronicle.slice().reverse();
    if (!entries.length) return '<p class="empty">Noch ist nichts geschehen.</p>';
    return `<ul class="chron">${entries
      .slice(0, 250)
      .map((e) => {
        const tap = e.x !== undefined;
        return `<li class="k-${e.kind}${e.important ? ' is-big' : ''}${tap ? ' is-tap' : ''}"${tap ? ` data-act="goto" data-v="${e.x.toFixed(2)},${e.y.toFixed(2)}"` : ''}><span class="chron-mark"></span><div><span class="chron-year">${F.year(e.t)}</span><div class="chron-text">${F.rich(e.text)}</div></div></li>`;
      })
      .join('')}</ul>`;
  }

  function speciesRow(s, right) {
    return `<li><button class="species-row" data-act="art" data-v="${s.id}">${portraitTag(s, 44)}<span style="min-width:0"><span class="sp-name"><span class="sp-dot" style="background:${speciesCss(s.hue)}"></span>${F.esc(s.name)}</span><span class="sp-desc">${F.esc(describe(s.g, 0))}</span></span><span class="sp-count">${right}</span></button></li>`;
  }

  function speciesList() {
    const alive = client.aliveSpecies();
    if (!alive.length) return '<p class="empty">Noch gibt es keine Tiere. Algen und Pflanzen zählen hier nicht mit.</p>';
    const top = alive.slice(0, 120);
    const rows = top.map((s) => speciesRow(s, `${F.num(s.count)}<br><span style="font-size:11px">Gruppen</span>`)).join('');
    const more = alive.length > top.length ? `Die ${F.num(top.length)} häufigsten von ${F.num(alive.length)} lebenden Arten. ` : '';
    return `<ul class="species-list">${rows}</ul><p class="list-note">${more}Ausgestorben: ${F.num(client.speciesExtinct || 0)} Arten.</p>`;
  }

  function charts() {
    const h = history && history.history;
    if (!h || h.length < 2) return '<p class="empty">Der Verlauf erscheint nach den ersten Jahren.</p>';
    const last = h[h.length - 1];
    const box = (id, name, val) => `<div class="chart"><div class="chart-head"><span>${name}</span><span>${val}</span></div><canvas id="${id}"></canvas></div>`;
    return (
      box('ch-t', 'Mitteltemperatur', F.temp(last.T)) +
      box('ch-ice', 'Eis und Schnee', F.pct(last.ice)) +
      box('ch-sp', 'Lebende Arten', F.num(last.species)) +
      box('ch-gr', 'Gruppen von Lebewesen', F.num(last.groups)) +
      `<p class="list-note">Von ${F.year(h[0].year * 12)} bis heute.</p>`
    );
  }

  function drawCharts() {
    const h = history && history.history;
    if (!h || h.length < 2) return;
    const draw = (id, key, color) => {
      const c = document.getElementById(id);
      if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = c.clientWidth;
      const ch = c.clientHeight;
      c.width = cw * dpr;
      c.height = ch * dpr;
      const ctx = c.getContext('2d');
      ctx.scale(dpr, dpr);
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of h) {
        lo = Math.min(lo, p[key]);
        hi = Math.max(hi, p[key]);
      }
      if (hi - lo < 1e-6) {
        hi += 1;
        lo -= 1;
      }
      ctx.strokeStyle = 'rgba(160,190,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ch - 0.5);
      ctx.lineTo(cw, ch - 0.5);
      ctx.stroke();
      ctx.beginPath();
      h.forEach((p, i) => {
        const x = (i / (h.length - 1)) * cw;
        const y = ch - 4 - ((p[key] - lo) / (hi - lo)) * (ch - 8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.stroke();
    };
    draw('ch-t', 'T', '#8cc8ff');
    draw('ch-ice', 'ice', '#dfeaf2');
    draw('ch-sp', 'species', '#78d79a');
    draw('ch-gr', 'groups', '#f5c66a');
  }

  // ---------- Art ----------

  function traitRows(g, o) {
    const s = g[o + SIZE];
    const rows = [
      ['Größe', s, formatMass(bodyMassKg(s))],
      ['Fleisch', g[o + DIET], `${Math.round(g[o + DIET] * 100)} %`],
      ['Land', g[o + LAND], g[o + LAND] < 0.35 ? 'Meer' : g[o + LAND] < 0.65 ? 'beides' : 'Land'],
      ['Wärme', g[o + TOPT], `${Math.round(topt(g[o + TOPT]))} °C`],
      ['Toleranz', g[o + TTOL], `± ${Math.round(sigma(g[o + TTOL]))} °C`],
      ['Tempo', g[o + SPEED], `${Math.round(g[o + SPEED] * 100)}`],
      ['Sinne', g[o + SENSE], `${Math.round(g[o + SENSE] * 100)}`],
      ['Nachwuchs', g[o + REPRO], g[o + REPRO] < 0.4 ? 'viele kleine' : g[o + REPRO] < 0.7 ? 'mittel' : 'wenige große'],
    ];
    return `<div class="traits">${rows
      .map(
        ([n, v, txt]) =>
          `<div class="trait"><span class="trait-name">${n}</span><span class="trait-bar"><span class="trait-fill" style="display:block;width:${Math.round(Math.max(0.03, v) * 100)}%"></span></span><span class="trait-val">${txt}</span></div>`,
      )
      .join('')}</div>`;
  }

  function lineage(s) {
    const items = [];
    let p = s.parent;
    let guard = 0;
    while (p && guard++ < 12) {
      const sp = client.species.get(p);
      if (!sp) {
        items.push('<li><span class="note">… ältere Vorfahren sind vergessen</span></li>');
        break;
      }
      const st = sp.died >= 0 ? `ausgestorben ${F.year(sp.died)}` : 'lebt noch';
      items.push(`<li><button data-act="art" data-v="${sp.id}" style="text-align:left"><i class="taxon">${F.esc(sp.name)}</i> <span>(${st})</span></button></li>`);
      p = sp.parent;
    }
    if (!items.length) return '<p class="note">Ohne Vorfahren: Diese Art steht am Anfang ihres Stammbaums.</p>';
    return `<ul class="lineage">${items.join('')}</ul>`;
  }

  function planLine(g, sapient) {
    const plan = PLAN_NAMES[bodyPlan(g, sapient)];
    return `${plan} · ${describe(g, 0)}`;
  }

  function renderSpecies(id) {
    const s = client.species.get(id);
    if (!s) return `${head('Unbekannte Art')}<p class="empty">Diese Art ist schon lange vergessen.</p>`;
    const alive = s.died < 0 && s.count > 0;
    const sub = `Gattung ${F.esc(s.genus)}, ${alive ? `seit ${F.year(s.born)}` : `${F.year(s.born)} bis ${F.year(s.died)}`}`;
    let children = 0;
    for (const x of client.species.values()) if (x.parent === s.id) children++;
    const hl = app.state.highlight === s.id;
    return `${head(F.esc(s.name), sub, true)}
      <div class="hero">${portraitTag(s, 112, 'hero-portrait')}<p class="note hero-text"><span class="sp-dot" style="background:${speciesCss(s.hue)}"></span>${F.esc(planLine(s.g, s.sapient))}</p></div>
      <div class="facts">
        <div><div class="fact-label">Gruppen</div><div class="fact-value">${alive ? F.num(s.count) : 'ausgestorben'}</div></div>
        <div><div class="fact-label">Höchststand</div><div class="fact-value">${F.num(s.peak)} <small>Gruppen</small></div></div>
      </div>
      ${traitRows(s.g, 0)}
      <div class="section-title">Abstammung</div>
      ${lineage(s)}
      ${children ? `<p class="note">${F.num(children)} Tochterarten sind aus ihr hervorgegangen.</p>` : ''}
      <div class="row-actions">
        ${alive ? (hl ? `<button class="ghost" data-act="unhighlight">${icon('target')}Markierung aufheben</button>` : `<button class="ghost" data-act="highlight" data-v="${s.id}">${icon('target')}Auf dem Planeten zeigen</button>`) : ''}
        <button class="ghost" data-act="back">${icon('back')}Alle Arten</button>
      </div>`;
  }

  // ---------- Ort ----------

  async function renderCell([x, y]) {
    const info = await client.query('cell', { x, y });
    if (!info) return head('Ort');
    const f = frame();
    const rows = [];
    rows.push(`<div><div class="fact-label">Temperatur im Jahr</div><div class="fact-value">${F.temp(info.T)}</div></div>`);
    rows.push(`<div><div class="fact-label">Jetzt (${F.MONTH_NAMES[f.tick % 12]})</div><div class="fact-value">${F.temp(info.tMonth)}</div></div>`);
    rows.push(`<div><div class="fact-label">Niederschlag</div><div class="fact-value">${F.num(Math.round(info.rain))} <small>mm im Jahr</small></div></div>`);
    rows.push(`<div><div class="fact-label">${info.ocean ? 'Tiefe' : 'Höhe'}</div><div class="fact-value">${F.num(Math.abs(Math.round(info.elev)))} <small>m</small></div></div>`);
    const share = info.capacity > 0 ? Math.min(1, info.plants / info.capacity) : 0;
    const what = info.ocean ? 'Algen' : 'Pflanzen';
    const plantText = info.capacity <= 0.02 ? 'Hier kann nichts wachsen.' : info.plants < 0.01 ? `Noch keine ${what}. Möglich wären hier viele.` : `${what}: ${Math.round(share * 100)} % von dem, was hier wachsen kann.`;
    const groups = info.groups
      .map((g) => ({ sp: client.species.get(g.id), n: g.n }))
      .filter((g) => g.sp)
      .sort((a, b) => b.n - a.n);
    const glist = groups.length
      ? `<ul class="species-list">${groups.map((g) => speciesRow(g.sp, F.num(g.n))).join('')}</ul><div class="row-actions"><button class="ghost" data-act="near" data-v="${x.toFixed(2)},${y.toFixed(2)}">${icon('eye')}Ganz nah heran</button></div>`
      : '<p class="note">Hier leben gerade keine Tiere.</p>';
    return `${head(info.biome, info.where)}
      <div class="facts">${rows.join('')}</div>
      <p class="note">Temperatur zwischen ${F.temp(info.tMin)} und ${F.temp(info.tMax)} übers Jahr. ${plantText}</p>
      <div class="section-title">Lebewesen hier</div>${glist}`;
  }

  // ---------- Gruppe ----------

  async function renderGroup(uid) {
    const g = await client.query('group', { uid });
    if (!g) return `${head('Gruppe verschwunden')}<p class="empty">Diese Gruppe lebt nicht mehr. Sie ist verhungert, gefressen worden, alt geworden oder hat sich in neue Gruppen geteilt.</p>`;
    const s = client.species.get(g.sp);
    const name = s ? s.name : 'Unbenannt';
    const years = Math.floor(g.age / 12);
    const look = s ? { ...s, g: g.genes } : null;
    return `${head(F.esc(name), `Eine Gruppe dieser Art bei ${formatLatLon(g.x, g.y)}`, true)}
      ${look ? `<div class="hero">${portraitTag(look, 112, 'hero-portrait')}<p class="note hero-text">${F.esc(planLine(g.genes, s.sapient))}</p></div>` : ''}
      <div class="facts">
        <div><div class="fact-label">Kraft (Biomasse)</div><div class="fact-value">${Math.round((g.B / 2) * 100)} <small>% bis zur Teilung</small></div></div>
        <div><div class="fact-label">Alter</div><div class="fact-value">${years ? `${F.num(years)} <small>Jahre</small>` : `${Math.floor(g.age)} <small>Monate</small>`}</div></div>
        <div><div class="fact-label">Generation</div><div class="fact-value">${F.num(g.gen)}</div></div>
        <div><div class="fact-label">Körpermasse</div><div class="fact-value">${formatMass(bodyMassKg(g.genes[SIZE]))}</div></div>
      </div>
      <div class="section-title">Erbgut dieser Gruppe</div>
      ${traitRows(g.genes, 0)}
      <div class="row-actions">
        <button class="ghost" data-act="near" data-v="${g.x.toFixed(2)},${g.y.toFixed(2)}">${icon('eye')}Ganz nah heran</button>
        ${s ? `<button class="ghost" data-act="art" data-v="${s.id}">${icon('leaf')}Zur Art</button>` : ''}
      </div>`;
  }

  // ---------- Klima ----------

  function co2FromSlider(v) {
    return Math.round(100 * Math.pow(40, v / 1000));
  }
  function sliderFromCo2(c) {
    return Math.round((Math.log(c / 100) / Math.log(40)) * 1000);
  }

  function renderClimate() {
    const f = frame();
    const p = f.params;
    return `${head('Klima', 'Die Stellschrauben eines Gottes')}
      <div class="slider">
        <div class="slider-top"><span class="slider-name">Sonne</span><span class="slider-val" id="sun-val">${Math.round(p.sun * 100)} %</span></div>
        <input type="range" id="sun" min="85" max="115" step="0.5" value="${(p.sun * 100).toFixed(1)}">
        <div class="slider-scale"><span>85 %</span><span>100 %</span><span>115 %</span></div>
      </div>
      <div class="slider">
        <div class="slider-top"><span class="slider-name">Kohlendioxid</span><span class="slider-val" id="co2-val">${F.num(Math.round(p.co2))} ppm</span></div>
        <input type="range" id="co2" min="0" max="1000" step="1" value="${sliderFromCo2(p.co2)}">
        <div class="slider-scale"><span>100</span><span>Erde früher: 280</span><span>4000</span></div>
      </div>
      <div class="facts">
        <div><div class="fact-label">Mitteltemperatur</div><div class="fact-value" id="cl-t">${F.temp(f.stats.T)}</div></div>
        <div><div class="fact-label">Eis und Schnee</div><div class="fact-value" id="cl-ice">${F.pct(f.stats.ice)}</div></div>
      </div>
      <p class="note">Das Klima braucht Jahre, bis es sich einstellt: Die Ozeane speichern Wärme. Weniger Sonne lässt Gletscher wachsen, und Eis wirft Licht zurück, was weiter abkühlt. Unter etwa 94 % kann der ganze Planet zufrieren.</p>
      ${p.dust > 0.01 ? `<p class="note" style="color:var(--ember)">Staub in der Luft schluckt gerade ${Math.round(p.dust * 100)} % des Sonnenlichts.</p>` : ''}`;
  }

  function showParam(kind, v) {
    if (kind === 'sun') {
      const sv = document.getElementById('sun-val');
      if (sv) sv.textContent = `${(v * 100).toFixed(1).replace('.', ',').replace(',0', '')} %`;
    } else {
      const cv = document.getElementById('co2-val');
      if (cv) cv.textContent = `${F.num(Math.round(v))} ppm`;
    }
  }

  function updateClimateValues() {
    const f = frame();
    const t = document.getElementById('cl-t');
    if (t) t.textContent = F.temp(f.stats.T);
    const ice = document.getElementById('cl-ice');
    if (ice) ice.textContent = F.pct(f.stats.ice);
  }

  // ---------- Welt ----------

  function renderWorldMenu() {
    const f = frame();
    return `${head(F.esc(f.name), `Welt-Nummer ${f.seed}, ${F.year(f.tick)}`)}
      <div class="menu-list">
        <button class="menu-item" data-act="jump" data-v="100">${icon('jump')}Zeitsprung<small>100 Jahre</small></button>
        <button class="menu-item" data-act="jump" data-v="1000">${icon('jump')}Zeitsprung<small>1.000 Jahre</small></button>
        <button class="menu-item" data-act="save">${icon('save')}Jetzt speichern<small>${app.lastSavedText()}</small></button>
        <button class="menu-item" data-act="new">${icon('plus')}Neue Welt</button>
        <button class="menu-item" data-act="about">${icon('info')}Wie diese Welt funktioniert</button>
      </div>`;
  }

  function renderConfirm(arg) {
    return `${head(arg.title)}<p class="note">${arg.text}</p><div class="row-actions"><button class="primary" data-act="${arg.act}" data-v="ok">${arg.ok}</button><button class="ghost" data-act="close">Abbrechen</button></div>`;
  }

  function renderAbout() {
    return `${head('Wie diese Welt funktioniert', `Version ${VERSION}`)}
      <p class="note">Nichts in dieser Welt ist vorgeschrieben. Alles folgt aus Regeln, die an echte Wissenschaft angelehnt sind.</p>
      <div class="section-title">Klima</div>
      <p class="note">Einstrahlung je nach Breitengrad, Jahreszeit und Achsneigung. Energiebilanz nach Budyko, Sellers und North: Abstrahlung steigt mit der Temperatur, Wärme fließt von warm nach kalt, Ozeane speichern Wärme. Eis wirft Licht zurück. Mehr CO2 hält Wärme mit 5,35 · ln(C/C0) W/m². Feuchte verdunstet über warmen Meeren stärker (Clausius-Clapeyron) und regnet an Gebirgen und in aufsteigender Luft ab.</p>
      <div class="section-title">Pflanzen</div>
      <p class="note">Wie viel wachsen kann, schätzt das Miami-Modell aus Temperatur und Niederschlag. Algen brauchen Licht und Nährstoffe, an Küsten gibt es mehr.</p>
      <div class="section-title">Leben</div>
      <p class="note">Die Simulation rechnet mit Gruppen von Lebewesen einer Art. Jede Gruppe hat Erbgut aus neun Zahlen. Kleine leben schneller (Stoffwechsel nach Kleiber), große halten Hunger und Kälte besser aus. Bei jeder Teilung mutiert das Erbgut ein wenig. Was überlebt, entscheidet die Umwelt. Spaltet sich eine Art in deutlich verschiedene Gruppen, entsteht eine neue Art.</p>
      <p class="note">Wie ein Tier aussieht, folgt aus seinem Erbgut: Größe und Lebensraum bestimmen den Körperbau, Räuber haben Zähne, gute Sinne große Augen, Kälteliebhaber ein Fell. Zoomst du nah heran, siehst du einzelne Tiere jeder Gruppe.</p>
      <div class="section-title">Technik</div>
      <p class="note">Die Welt rechnet in einem eigenen Prozess, damit das Bild flüssig bleibt. Der Planet wird von der Grafikkarte Pixel für Pixel gezeichnet, feine Details kommen aus Rauschen, das an der Oberfläche haftet.</p>
      <div class="section-title">Ehrlich gesagt</div>
      <p class="note">Wie Leben wirklich entstanden ist, weiß niemand. Hier ist das vereinfacht. Evolution läuft viel schneller als auf der Erde, damit du sie erleben kannst.</p>`;
  }

  return { open, close, render, refresh, isOpen: () => !!current, current: () => current };
}
