// Blätter von unten: Chronik, Arten, Verlauf, Infos zu Ort, Gruppe und Art, Klima, Welt.

import { icon } from './icons.js';
import * as F from './format.js';
import { speciesCss } from '../render/colors.js';
import { NG, SIZE, DIET, LAND, TOPT, TTOL, SPEED, SENSE, REPRO, describe, bodyMassKg, formatMass, topt, sigma } from '../sim/genome.js';
import { cellOf, W } from '../sim/const.js';
import { formatLatLon } from '../sim/world.js';
import { VERSION } from '../version.js';

export function createSheets(app) {
  const el = document.getElementById('sheet');
  const body = document.getElementById('sheet-body');
  const grip = document.getElementById('sheet-grip');
  let current = null;
  let tab = 'chronik';

  function open(kind, arg) {
    current = { kind, arg };
    if (kind === 'chronik' && arg) tab = arg;
    el.hidden = false;
    render();
    body.scrollTop = 0;
  }

  function close() {
    if (!current) return false;
    current = null;
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
      render();
    } else if (act === 'art') open('art', Number(v));
    else if (act === 'goto') {
      const [x, y] = v.split(',').map(Number);
      close();
      app.flyTo(x, y);
    } else if (act === 'highlight') {
      app.highlight(Number(v));
      close();
    } else if (act === 'unhighlight') {
      app.highlight(0);
      render();
    } else if (act === 'back') open('chronik', 'arten');
    else app.action(act, v);
  });

  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'sun') {
      app.world.setSun(Number(t.value) / 100);
      updateClimateValues();
    } else if (t.id === 'co2') {
      app.world.setCO2(co2FromSlider(Number(t.value)));
      updateClimateValues();
    }
  });
  body.addEventListener('change', (e) => {
    if (e.target.id === 'sun') app.world.logParam('sun');
    if (e.target.id === 'co2') app.world.logParam('co2');
  });

  function head(title, sub = '', italic = false) {
    return `<div class="sheet-head"><div style="flex:1;min-width:0"><h2 class="sheet-title${italic ? ' taxon-title' : ''}">${title}</h2>${
      sub ? `<p class="sheet-sub">${sub}</p>` : ''
    }</div><button class="icon-btn" data-act="close" aria-label="Schließen">${icon('close')}</button></div>`;
  }

  function render() {
    if (!current) return;
    const w = app.world;
    if (!w) return;
    const k = current.kind;
    if (k === 'chronik') body.innerHTML = renderChronik(w);
    else if (k === 'art') body.innerHTML = renderSpecies(w, current.arg);
    else if (k === 'zelle') body.innerHTML = renderCell(w, current.arg);
    else if (k === 'gruppe') body.innerHTML = renderGroup(w, current.arg);
    else if (k === 'klima') body.innerHTML = renderClimate(w);
    else if (k === 'welt') body.innerHTML = renderWorldMenu(w);
    else if (k === 'confirm') body.innerHTML = renderConfirm(current.arg);
    else if (k === 'about') body.innerHTML = renderAbout();
    if (k === 'chronik' && tab === 'verlauf') drawCharts(w);
  }

  // Ändert sich die Welt, werden manche Blätter neu gezeichnet
  function refresh() {
    if (!current) return;
    const k = current.kind;
    if (k === 'klima') updateClimateValues();
    else if (k === 'gruppe' || k === 'zelle' || k === 'art' || (k === 'chronik' && tab !== 'chronik')) {
      const top = body.scrollTop;
      render();
      body.scrollTop = top;
    }
  }

  // ---------- Chronik, Arten, Verlauf ----------

  function renderChronik(w) {
    const tabs = [
      ['chronik', 'Chronik'],
      ['arten', 'Arten'],
      ['verlauf', 'Verlauf'],
    ]
      .map(([id, name]) => `<button class="tab${tab === id ? ' is-on' : ''}" data-act="tab" data-v="${id}">${name}</button>`)
      .join('');
    let content = '';
    if (tab === 'chronik') content = chronikList(w);
    else if (tab === 'arten') content = speciesList(w);
    else content = charts(w);
    return `${head(F.esc(w.name), `${F.year(w.tick)}, ${F.MONTH_NAMES[w.month]}`)}<div class="tabs" role="tablist">${tabs}</div>${content}`;
  }

  function chronikList(w) {
    const entries = w.chronicle.entries.slice().reverse();
    if (!entries.length) return '<p class="empty">Noch ist nichts geschehen.</p>';
    return `<ul class="chron">${entries
      .slice(0, 250)
      .map((e) => {
        const tap = e.x !== undefined;
        return `<li class="k-${e.kind}${e.important ? ' is-big' : ''}${tap ? ' is-tap' : ''}"${tap ? ` data-act="goto" data-v="${e.x.toFixed(2)},${e.y.toFixed(2)}"` : ''}><span class="chron-mark"></span><div><span class="chron-year">${F.year(e.t)}</span><div class="chron-text">${F.rich(e.text)}</div></div></li>`;
      })
      .join('')}</ul>`;
  }

  function speciesList(w) {
    const alive = w.species.alive().sort((a, b) => b.count - a.count);
    if (!alive.length) return '<p class="empty">Noch gibt es keine Tiere. Algen und Pflanzen zählen hier nicht mit.</p>';
    const top = alive.slice(0, 120);
    const rows = top
      .map(
        (s) => `<li><button class="species-row" data-act="art" data-v="${s.id}"><span class="sp-dot" style="background:${speciesCss(s.hue)}"></span><span style="min-width:0"><span class="sp-name">${F.esc(s.name)}</span><span class="sp-desc">${F.esc(describe(s.centroid, 0))}</span></span><span class="sp-count">${F.num(s.count)}<br><span style="font-size:11px">Gruppen</span></span></button></li>`,
      )
      .join('');
    const extinct = w.species.list.filter((s) => s.died >= 0).length + w.species.pruned;
    const more = alive.length > top.length ? `Die ${F.num(top.length)} häufigsten von ${F.num(alive.length)} lebenden Arten. ` : '';
    return `<ul class="species-list">${rows}</ul><p class="list-note">${more}Ausgestorben: ${F.num(extinct)} Arten.</p>`;
  }

  function charts(w) {
    if (w.history.length < 2) return '<p class="empty">Der Verlauf erscheint nach den ersten Jahren.</p>';
    const last = w.history[w.history.length - 1];
    const box = (id, name, val) => `<div class="chart"><div class="chart-head"><span>${name}</span><span>${val}</span></div><canvas id="${id}"></canvas></div>`;
    return (
      box('ch-t', 'Mitteltemperatur', F.temp(last.T)) +
      box('ch-ice', 'Eis und Schnee', F.pct(last.ice)) +
      box('ch-sp', 'Lebende Arten', F.num(last.species)) +
      box('ch-gr', 'Gruppen von Lebewesen', F.num(last.groups)) +
      `<p class="list-note">Von ${F.year(w.history[0].year * 12)} bis heute.</p>`
    );
  }

  function drawCharts(w) {
    const h = w.history;
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
      ['Wohlfühltemperatur', g[o + TOPT], `${Math.round(topt(g[o + TOPT]))} °C`],
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

  function lineage(w, s) {
    const items = [];
    let p = s.parent;
    let guard = 0;
    while (p && guard++ < 12) {
      const sp = w.species.get(p);
      if (!sp) break;
      const state = sp.died >= 0 ? `ausgestorben ${F.year(sp.died)}` : 'lebt noch';
      items.push(`<li><button data-act="art" data-v="${sp.id}" style="text-align:left"><i class="taxon">${F.esc(sp.name)}</i> <span>(${state})</span></button></li>`);
      p = sp.parent;
    }
    if (!items.length) return '<p class="note">Ohne Vorfahren: Diese Art steht am Anfang ihres Stammbaums.</p>';
    return `<ul class="lineage">${items.join('')}</ul>`;
  }

  function renderSpecies(w, id) {
    const s = w.species.get(id);
    if (!s) return `${head('Unbekannte Art')}<p class="empty">Diese Art ist schon lange vergessen.</p>`;
    const alive = s.died < 0 && s.count > 0;
    const sub = `Gattung ${F.esc(s.genus)}, ${alive ? `seit ${F.year(s.born)}` : `${F.year(s.born)} bis ${F.year(s.died)}`}`;
    const children = w.species.list.filter((x) => x.parent === s.id);
    const hl = app.state.highlight === s.id;
    return `${head(F.esc(s.name), sub, true)}
      <p class="note" style="margin-top:-4px"><span class="sp-dot" style="display:inline-block;vertical-align:-1px;margin-right:6px;background:${speciesCss(s.hue)}"></span>${F.esc(describe(s.centroid, 0))}</p>
      <div class="facts">
        <div><div class="fact-label">Gruppen</div><div class="fact-value">${alive ? F.num(s.count) : 'ausgestorben'}</div></div>
        <div><div class="fact-label">Höchststand</div><div class="fact-value">${F.num(s.peak)} <small>Gruppen</small></div></div>
      </div>
      ${traitRows(s.centroid, 0)}
      <div class="section-title">Abstammung</div>
      ${lineage(w, s)}
      ${children.length ? `<p class="note">${F.num(children.length)} Tochterarten sind aus ihr hervorgegangen.</p>` : ''}
      <div class="row-actions">
        ${alive ? (hl ? `<button class="ghost" data-act="unhighlight">${icon('target')}Markierung aufheben</button>` : `<button class="ghost" data-act="highlight" data-v="${s.id}">${icon('target')}Auf dem Planeten zeigen</button>`) : ''}
        <button class="ghost" data-act="back">${icon('back')}Alle Arten</button>
      </div>`;
  }

  // ---------- Ort ----------

  function renderCell(w, [x, y]) {
    const info = w.cellInfo(x, y);
    const rows = [];
    rows.push(`<div><div class="fact-label">Temperatur im Jahr</div><div class="fact-value">${F.temp(info.T)}</div></div>`);
    rows.push(`<div><div class="fact-label">Jetzt (${F.MONTH_NAMES[w.month]})</div><div class="fact-value">${F.temp(info.tMonth)}</div></div>`);
    rows.push(`<div><div class="fact-label">Niederschlag</div><div class="fact-value">${F.num(Math.round(info.rain))} <small>mm im Jahr</small></div></div>`);
    rows.push(
      `<div><div class="fact-label">${info.ocean ? 'Tiefe' : 'Höhe'}</div><div class="fact-value">${F.num(Math.abs(Math.round(info.elev)))} <small>m</small></div></div>`,
    );
    const share = info.capacity > 0 ? Math.min(1, info.plants / info.capacity) : 0;
    const what = info.ocean ? 'Algen' : 'Pflanzen';
    const plantText = info.capacity <= 0.02 ? 'Hier kann nichts wachsen.' : info.plants < 0.01 ? `Noch keine ${what}. Möglich wären hier viele.` : `${what}: ${Math.round(share * 100)} % von dem, was hier wachsen kann.`;
    const groups = info.groups.sort((a, b) => b.n - a.n);
    const glist = groups.length
      ? `<ul class="species-list">${groups
          .map(
            (g) =>
              `<li><button class="species-row" data-act="art" data-v="${g.sp.id}"><span class="sp-dot" style="background:${speciesCss(g.sp.hue)}"></span><span style="min-width:0"><span class="sp-name">${F.esc(g.sp.name)}</span><span class="sp-desc">${F.esc(describe(g.sp.centroid, 0))}</span></span><span class="sp-count">${F.num(g.n)}</span></button></li>`,
          )
          .join('')}</ul>`
      : '<p class="note">Hier leben gerade keine Tiere.</p>';
    return `${head(info.biome, info.where)}
      <div class="facts">${rows.join('')}</div>
      <p class="note">Temperatur zwischen ${F.temp(info.tMin)} und ${F.temp(info.tMax)} übers Jahr. ${plantText}</p>
      <div class="section-title">Lebewesen hier</div>${glist}`;
  }

  // ---------- Gruppe ----------

  function renderGroup(w, uid) {
    const life = w.life;
    let i = -1;
    for (let k = 0; k < life.n; k++) {
      if (life.uid[k] === uid) {
        i = k;
        break;
      }
    }
    if (i < 0) return `${head('Gruppe verschwunden')}<p class="empty">Diese Gruppe lebt nicht mehr. Sie ist verhungert, gefressen worden, alt geworden oder hat sich in neue Gruppen geteilt.</p>`;
    const s = w.species.get(life.sp[i]);
    const name = s ? s.name : 'Unbenannt';
    const o = i * NG;
    const years = Math.floor(life.age[i] / 12);
    return `${head(F.esc(name), `Eine Gruppe dieser Art bei ${formatLatLon(life.x[i], life.y[i])}`, true)}
      <p class="note" style="margin-top:-4px">${F.esc(describe(life.genes, o))}</p>
      <div class="facts">
        <div><div class="fact-label">Kraft (Biomasse)</div><div class="fact-value">${Math.round((life.B[i] / 2) * 100)} <small>% bis zur Teilung</small></div></div>
        <div><div class="fact-label">Alter</div><div class="fact-value">${years ? `${F.num(years)} <small>Jahre</small>` : `${Math.floor(life.age[i])} <small>Monate</small>`}</div></div>
        <div><div class="fact-label">Generation</div><div class="fact-value">${F.num(life.gen[i])}</div></div>
        <div><div class="fact-label">Körpermasse</div><div class="fact-value">${formatMass(bodyMassKg(life.genes[o + SIZE]))}</div></div>
      </div>
      <div class="section-title">Erbgut dieser Gruppe</div>
      ${traitRows(life.genes, o)}
      <div class="row-actions">${s ? `<button class="ghost" data-act="art" data-v="${s.id}">${icon('leaf')}Zur Art</button>` : ''}</div>`;
  }

  // ---------- Klima ----------

  function co2FromSlider(v) {
    return Math.round(100 * Math.pow(40, v / 1000));
  }
  function sliderFromCo2(c) {
    return Math.round((Math.log(c / 100) / Math.log(40)) * 1000);
  }

  function renderClimate(w) {
    const p = w.params;
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
        <div><div class="fact-label">Mitteltemperatur</div><div class="fact-value" id="cl-t">${F.temp(w.climate.globalT)}</div></div>
        <div><div class="fact-label">Eis und Schnee</div><div class="fact-value" id="cl-ice">${F.pct(w.climate.iceShare)}</div></div>
      </div>
      <p class="note">Das Klima braucht Jahre, bis es sich einstellt: Die Ozeane speichern Wärme. Weniger Sonne lässt Gletscher wachsen, und Eis wirft Licht zurück, was weiter abkühlt. Unter etwa 94 % kann der ganze Planet zufrieren.</p>
      ${p.dust > 0.01 ? `<p class="note" style="color:var(--ember)">Staub in der Luft schluckt gerade ${Math.round(p.dust * 100)} % des Sonnenlichts.</p>` : ''}`;
  }

  function updateClimateValues() {
    const w = app.world;
    const sv = document.getElementById('sun-val');
    if (sv) sv.textContent = `${(w.params.sun * 100).toFixed(1).replace('.', ',').replace(',0', '')} %`;
    const cv = document.getElementById('co2-val');
    if (cv) cv.textContent = `${F.num(Math.round(w.params.co2))} ppm`;
    const t = document.getElementById('cl-t');
    if (t) t.textContent = F.temp(w.climate.globalT);
    const ice = document.getElementById('cl-ice');
    if (ice) ice.textContent = F.pct(w.climate.iceShare);
  }

  // ---------- Welt ----------

  function renderWorldMenu(w) {
    return `${head(F.esc(w.name), `Welt-Nummer ${w.seed}, ${F.year(w.tick)}`)}
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
      <p class="note">Ein Punkt ist eine Gruppe von Lebewesen einer Art. Jede Gruppe hat Erbgut aus neun Zahlen. Kleine leben schneller (Stoffwechsel nach Kleiber), große halten Hunger und Kälte besser aus. Bei jeder Teilung mutiert das Erbgut ein wenig. Was überlebt, entscheidet die Umwelt. Spaltet sich eine Art in deutlich verschiedene Gruppen, entsteht eine neue Art.</p>
      <div class="section-title">Ehrlich gesagt</div>
      <p class="note">Wie Leben wirklich entstanden ist, weiß niemand. Hier ist das vereinfacht. Evolution läuft viel schneller als auf der Erde, damit du sie erleben kannst.</p>`;
  }

  return { open, close, render, refresh, isOpen: () => !!current, current: () => current };
}
