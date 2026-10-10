// Emergenz: Startpunkt der App. Verbindet Simulation, Darstellung und Bedienung.

import { World } from './sim/world.js';
import { W, H, TW, TH, cellOf } from './sim/const.js';
import { NG, SIZE } from './sim/genome.js';
import { PlanetTexture, LAYERS } from './render/texture.js';
import { Globe } from './render/globe.js';
import { MapView } from './render/mapview.js';
import { drawSky } from './render/sky.js';
import { speciesRgb } from './render/colors.js';
import { icon } from './ui/icons.js';
import * as F from './ui/format.js';
import { createSheets } from './ui/sheets.js';
import * as store from './store.js';
import * as native from './native.js';

const $ = (id) => document.getElementById(id);

const canvas = $('view');
const ctx = canvas.getContext('2d', { alpha: false });
const skyCanvas = document.createElement('canvas');
const texCanvas = document.createElement('canvas');
texCanvas.width = TW;
texCanvas.height = TH;
const texCtx = texCanvas.getContext('2d');
const globeCanvas = document.createElement('canvas');
const globeCtx = globeCanvas.getContext('2d');

const SPEEDS = [
  { icon: 'pause', label: 'Pause', months: 0 },
  { icon: 'play', label: '1 Jahr pro Sekunde', months: 12 },
  { icon: 'play2', label: '6 Jahre pro Sekunde', months: 72 },
  { icon: 'play3', label: 'So schnell wie möglich', months: Infinity },
];

const TOOLS = [
  { id: 'ansehen', name: 'Ansehen', icon: 'eye' },
  { id: 'klima', name: 'Klima', icon: 'sun' },
  { id: 'meteor', name: 'Meteor', icon: 'meteor' },
  { id: 'wetter', name: 'Wetter', icon: 'rain' },
  { id: 'leben', name: 'Leben', icon: 'sprout' },
  { id: 'chronik', name: 'Chronik', icon: 'book' },
];

const state = {
  view: 'globe',
  tool: 'ansehen',
  meteorSize: 2,
  weatherMode: 'regen',
  lifeKind: 'zellen',
  layer: 'natur',
  speed: 1,
  highlight: 0,
  selected: null, // { kind: 'zelle', x, y } oder { kind: 'gruppe', uid }
  acc: 0,
  w: 0,
  h: 0,
  dpr: 1,
  globeZoom: 1,
  spin: true,
  texKey: '',
  texAt: 0,
  effects: [],
  rate: 0,
  rateMonths: 0,
  rateAt: 0,
  lastSave: 0,
  savedAt: 0,
  busy: null,
  started: false,
};

const app = {
  world: null,
  tex: null,
  globe: new Globe(),
  map: new MapView(),
  state,
};

// ---------------------------------------------------------------- Größe

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  state.dpr = dpr;
  state.w = window.innerWidth;
  state.h = window.innerHeight;
  canvas.width = Math.round(state.w * dpr);
  canvas.height = Math.round(state.h * dpr);
  drawSky(skyCanvas, state.w, state.h, dpr);
  app.map.fit(state.w, viewHeight());
  setupGlobe();
}

function viewHeight() {
  return state.h;
}

function globeGeom() {
  const top = 96;
  const bottom = state.started ? 150 : state.h * 0.5;
  const availH = Math.max(160, state.h - top - bottom);
  const base = Math.min(state.w * 0.86, availH) / 2;
  const r = base * state.globeZoom;
  const cy = state.started ? top + availH / 2 : Math.max(top + base, state.h * 0.3);
  return { cx: state.w / 2, cy, r, base };
}

function setupGlobe() {
  const { base } = globeGeom();
  const res = Math.round(base * 2 * state.dpr * 0.62 * Math.min(1.6, state.globeZoom));
  app.globe.setup(res);
  if (globeCanvas.width !== app.globe.res) {
    globeCanvas.width = app.globe.res;
    globeCanvas.height = app.globe.res;
    state.globeImage = null;
  }
}

// ---------------------------------------------------------------- Start

const startEl = $('start');
const seedInput = $('seed');
let startMode = 'ursuppe';
let preview = null; // { seed, world }
let previewTimer = null;

function randomSeed() {
  return String(10000 + Math.floor(Math.random() * 89999));
}

function schedulePreview() {
  clearTimeout(previewTimer);
  $('start-note').textContent = 'Planet entsteht …';
  $('create').disabled = true;
  previewTimer = setTimeout(buildPreview, 60);
}

function buildPreview() {
  const seed = Number(seedInput.value) || 1;
  if (preview && preview.seed === seed) return readyPreview();
  // zweimal Bild zeichnen lassen, dann rechnen (damit der Hinweis sichtbar ist)
  requestAnimationFrame(() =>
    setTimeout(() => {
      const t0 = performance.now();
      const world = World.create({ seed, start: 'leer' });
      preview = { seed, world };
      setWorld(world, false);
      console.log(`EMERGENZ: Vorschau ${seed} in ${Math.round(performance.now() - t0)} ms`);
      readyPreview();
    }, 30),
  );
}

let pendingCreate = false;
function readyPreview() {
  $('start-note').textContent = '';
  $('create').disabled = false;
  if (pendingCreate) {
    pendingCreate = false;
    createWorld();
  }
}

function initStart(saved) {
  seedInput.value = randomSeed();
  $('dice').innerHTML = icon('dice');
  $('dice').addEventListener('click', () => {
    seedInput.value = randomSeed();
    schedulePreview();
  });
  seedInput.addEventListener('input', () => {
    seedInput.value = seedInput.value.replace(/\D/g, '').slice(0, 9);
    schedulePreview();
  });
  for (const b of document.querySelectorAll('.choice-opt')) {
    b.addEventListener('click', () => {
      startMode = b.dataset.start;
      for (const o of document.querySelectorAll('.choice-opt')) {
        o.classList.toggle('is-on', o === b);
        o.setAttribute('aria-checked', o === b ? 'true' : 'false');
      }
    });
  }
  $('create').addEventListener('click', createWorld);
  if (saved) {
    const box = $('start-continue');
    box.innerHTML = `<button class="continue" id="continue">${icon('planet')}<span><b>Weiterspielen</b><span>${F.esc(saved.name)}, ${F.year(saved.tick)}</span></span></button>`;
    $('continue').addEventListener('click', () => continueWorld(saved));
  }
  schedulePreview();
}

function createWorld() {
  if (!preview || preview.seed !== (Number(seedInput.value) || 1)) {
    pendingCreate = true;
    buildPreview();
    return;
  }
  const world = preview.world;
  preview = null;
  world.start = startMode;
  if (startMode === 'ursuppe') world.seedPrimordial();
  else world.chronicle.add('welt', 'Noch ist der Planet leer. Ob hier Leben entsteht, entscheiden Zeit und Zufall.', null, true);
  enterGame(world);
  saveNow();
}

function continueWorld(saved) {
  $('start-note').textContent = 'Welt wird geladen …';
  setTimeout(() => {
    try {
      const world = World.restore(saved);
      enterGame(world);
    } catch (e) {
      console.error(e);
      $('start-note').textContent = 'Der Spielstand ließ sich nicht laden. Erschaffe eine neue Welt.';
    }
  }, 30);
}

function setWorld(world, running) {
  app.world = world;
  app.tex = new PlanetTexture(world);
  app.tex.update(state.layer, world.month);
  texCtx.putImageData(new ImageData(app.tex.data, TW, TH), 0, 0);
  state.texKey = '';
  state.started = running;
  setupGlobe();
}

function enterGame(world) {
  setWorld(world, true);
  startEl.hidden = true;
  $('hud').hidden = false;
  $('dock').hidden = false;
  $('context').hidden = false;
  state.speed = 1;
  state.view = 'globe';
  state.globeZoom = 1;
  state.tool = 'ansehen';
  state.highlight = 0;
  setupGlobe();
  renderSpeed();
  renderDock();
  renderContext();
  updateHud(true);
  console.log('EMERGENZ_WELT_LAEUFT');
}

// ---------------------------------------------------------------- Kopfzeile

function renderSpeed() {
  $('speed').innerHTML = SPEEDS.map(
    (s, i) => `<button data-speed="${i}" class="${state.speed === i ? 'is-on' : ''}" aria-label="${s.label}" aria-pressed="${state.speed === i}">${icon(s.icon)}</button>`,
  ).join('');
}

$('speed').addEventListener('click', (e) => {
  const b = e.target.closest('[data-speed]');
  if (!b) return;
  setSpeed(Number(b.dataset.speed));
});

function setSpeed(i) {
  state.speed = i;
  state.acc = 0;
  renderSpeed();
}

let hudAt = 0;
function updateHud(force = false) {
  const now = performance.now();
  if (!force && now - hudAt < 200) return;
  hudAt = now;
  const w = app.world;
  if (!w) return;
  $('hud-year').textContent = F.year(w.tick);
  const s = w.species.alive().length;
  $('hud-stats').innerHTML = `<span class="t">${icon('thermo')}${F.temp(w.climate.globalT)}</span><span class="s">${icon('leaf')}${F.num(s)} ${s === 1 ? 'Art' : 'Arten'}</span>`;
  let rate = '';
  if (state.speed > 0 && !state.busy) {
    const y = state.rate;
    rate = y >= 1.5 ? `${F.num(Math.round(y))} Jahre/s` : `${F.num(y, 1)} Jahre/s`;
  }
  $('speed-rate').textContent = rate;
}
$('btn-world').innerHTML = icon('planet');
$('btn-world').addEventListener('click', () => sheets.open('welt'));

// ---------------------------------------------------------------- Werkzeuge

function renderDock() {
  $('dock').innerHTML = TOOLS.map(
    (t) => `<button class="tool${state.tool === t.id ? ' is-on' : ''}" data-tool="${t.id}" aria-pressed="${state.tool === t.id}">${icon(t.icon)}<span>${t.name}</span></button>`,
  ).join('');
}

$('dock').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (!b) return;
  const id = b.dataset.tool;
  if (id === 'klima') {
    sheets.open('klima');
    return;
  }
  if (id === 'chronik') {
    sheets.open('chronik');
    return;
  }
  state.tool = state.tool === id && id !== 'ansehen' ? 'ansehen' : id;
  renderDock();
  renderContext();
});

function chip(attr, value, label, on, ic = '') {
  return `<button class="chip${on ? ' is-on' : ''}" ${attr}="${value}">${ic ? icon(ic) : ''}${label}</button>`;
}

function renderContext() {
  const el = $('context');
  let row = '';
  let hint = '';
  const t = state.tool;
  if (t === 'ansehen') {
    row =
      chip('data-view', state.view === 'globe' ? 'map' : 'globe', state.view === 'globe' ? 'Karte' : 'Globus', false, state.view === 'globe' ? 'map' : 'globe') +
      '<span class="chip-sep"></span>' +
      LAYERS.map((l) => chip('data-layer', l.id, l.name, state.layer === l.id)).join('');
    hint = state.highlight ? 'Markierte Art leuchtet. Tippe auf den Planeten, um mehr zu sehen.' : 'Tippe auf den Planeten, um einen Ort oder eine Gruppe anzusehen.';
    if (state.highlight) row += chip('data-unmark', '1', 'Markierung aufheben', false, 'close');
  } else if (t === 'meteor') {
    row = [
      [1, 'Klein'],
      [2, 'Groß'],
      [3, 'Gewaltig'],
    ]
      .map(([v, n]) => `<button class="chip${state.meteorSize === v ? ' is-on' : ''}" data-meteor="${v}">${n}</button>`)
      .join('');
    hint = state.meteorSize === 3 ? 'Tippe auf den Planeten. Ein gewaltiger Einschlag verdunkelt den Himmel für Jahre.' : 'Tippe auf den Planeten, um einen Meteor einschlagen zu lassen.';
  } else if (t === 'wetter') {
    row = chip('data-weather', 'regen', 'Regen', state.weatherMode === 'regen', 'rain') + chip('data-weather', 'duerre', 'Dürre', state.weatherMode === 'duerre', 'sun');
    hint = 'Tippe auf eine Gegend. Die Wirkung lässt über Jahrzehnte nach.';
  } else if (t === 'leben') {
    row = chip('data-life', 'zellen', 'Zellen aussetzen', state.lifeKind === 'zellen', 'dots') + chip('data-life', 'pflanzen', 'Grün säen', state.lifeKind === 'pflanzen', 'sprout');
    hint = state.lifeKind === 'zellen' ? 'Einfache Zellen, angepasst an den Ort. Was daraus wird, entscheidet die Evolution.' : 'Algen im Meer oder Pflanzen an Land, wo das Klima es zulässt.';
  }
  el.innerHTML = `<div class="ctx-row">${row}</div><p class="ctx-hint">${hint}</p>`;
}

$('context').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.view) setView(b.dataset.view);
  else if (b.dataset.layer) {
    state.layer = b.dataset.layer;
    state.texKey = '';
  } else if (b.dataset.meteor) state.meteorSize = Number(b.dataset.meteor);
  else if (b.dataset.weather) state.weatherMode = b.dataset.weather;
  else if (b.dataset.life) state.lifeKind = b.dataset.life;
  else if (b.dataset.unmark) app.highlight(0);
  renderContext();
});

function setView(v, focus) {
  const w = state.w;
  const h = state.h;
  if (v === 'map') {
    const g = globeGeom();
    const center = focus || app.globe.unproject(0, 0) || [W / 2, H / 2];
    app.map.x = center[0];
    app.map.y = center[1];
    app.map.zoom = Math.max(app.map.minZoom, Math.min(app.map.maxZoom, focus ? g.r * ((Math.PI * 2) / W) : app.map.minZoom * 1.15));
    app.map.fit(w, h);
  } else {
    const c = focus || [app.map.x, app.map.y];
    app.globe.lookAt(c[0], c[1]);
    app.globe.tilt *= 0.6;
    state.globeZoom = 1;
    setupGlobe();
  }
  state.view = v;
  renderContext();
}

// ---------------------------------------------------------------- Eingabe

const pointers = new Map();
let gesture = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    gesture = { kind: 'drag', x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: 0, lx: e.clientX, ly: e.clientY };
    state.spin = false;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, zoom0: state.view === 'map' ? app.map.zoom : state.globeZoom, moved: 99 };
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gesture) return;
  if (gesture.kind === 'drag' && pointers.size === 1) {
    const dx = e.clientX - gesture.lx;
    const dy = e.clientY - gesture.ly;
    gesture.lx = e.clientX;
    gesture.ly = e.clientY;
    gesture.moved += Math.abs(dx) + Math.abs(dy);
    if (state.view === 'globe') {
      const { r } = globeGeom();
      app.globe.lon -= dx / r;
      app.globe.tilt = Math.max(-1.25, Math.min(1.25, app.globe.tilt + dy / r));
    } else {
      app.map.x -= dx / app.map.zoom;
      app.map.y -= dy / app.map.zoom;
      app.map.clamp(state.h);
    }
  } else if (gesture.kind === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const f = d / Math.max(10, gesture.d0);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (state.view === 'map') {
      const before = app.map.toWorld(mx, my, state.w, state.h);
      app.map.zoom = Math.max(app.map.minZoom * 0.82, Math.min(app.map.maxZoom, gesture.zoom0 * f));
      if (app.map.zoom < app.map.minZoom * 0.85) {
        gesture = null;
        setView('globe', [app.map.x, app.map.y]);
        return;
      }
      app.map.zoom = Math.max(app.map.minZoom, app.map.zoom);
      const after = app.map.toWorld(mx, my, state.w, state.h);
      if (before && after) {
        app.map.x += before[0] - after[0];
        app.map.y += before[1] - after[1];
      }
      app.map.x -= (mx - gesture.mx) / app.map.zoom;
      app.map.y -= (my - gesture.my) / app.map.zoom;
      gesture.mx = mx;
      gesture.my = my;
      app.map.clamp(state.h);
    } else {
      state.globeZoom = Math.max(0.7, Math.min(2.6, gesture.zoom0 * f));
      if (state.globeZoom > 2.45) {
        const g = globeGeom();
        const p = app.globe.unproject((mx - g.cx) / g.r, -(my - g.cy) / g.r) || app.globe.unproject(0, 0);
        gesture = null;
        setView('map', p);
        return;
      }
    }
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (gesture && gesture.kind === 'drag' && pointers.size === 0) {
    const dt = performance.now() - gesture.t0;
    if (gesture.moved < 10 && dt < 500) tap(e.clientX, e.clientY);
  }
  if (gesture && gesture.kind === 'pinch' && state.view === 'globe') setupGlobe();
  if (pointers.size === 0) gesture = null;
  else if (pointers.size === 1) {
    const p = [...pointers.values()][0];
    gesture = { kind: 'drag', x0: p.x, y0: p.y, t0: 0, moved: 99, lx: p.x, ly: p.y };
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0015);
    if (state.view === 'map') {
      const before = app.map.toWorld(e.clientX, e.clientY, state.w, state.h);
      app.map.zoom *= f;
      if (app.map.zoom < app.map.minZoom * 0.85) {
        setView('globe', [app.map.x, app.map.y]);
        return;
      }
      app.map.zoom = Math.max(app.map.minZoom, Math.min(app.map.maxZoom, app.map.zoom));
      const after = app.map.toWorld(e.clientX, e.clientY, state.w, state.h);
      if (before && after) {
        app.map.x += before[0] - after[0];
        app.map.y += before[1] - after[1];
      }
      app.map.clamp(state.h);
    } else {
      state.globeZoom = Math.max(0.7, Math.min(2.6, state.globeZoom * f));
      if (state.globeZoom > 2.45) {
        const g = globeGeom();
        setView('map', app.globe.unproject((e.clientX - g.cx) / g.r, -(e.clientY - g.cy) / g.r) || undefined);
      } else setupGlobe();
    }
  },
  { passive: false },
);

// Bildschirm -> Weltkoordinaten
function screenToWorld(sx, sy) {
  if (state.view === 'map') return app.map.toWorld(sx, sy, state.w, state.h);
  const g = globeGeom();
  return app.globe.unproject((sx - g.cx) / g.r, -(sy - g.cy) / g.r);
}

function worldToScreen(x, y) {
  if (state.view === 'map') return app.map.toScreen(x, y, state.w, state.h);
  const g = globeGeom();
  const p = app.globe.project(x, y);
  if (!p) return null;
  return [g.cx + p[0] * g.r, g.cy - p[1] * g.r];
}

function nearestGroup(sx, sy, maxPx) {
  const life = app.world.life;
  let best = -1;
  let bd = maxPx * maxPx;
  for (let i = 0; i < life.n; i++) {
    const p = worldToScreen(life.x[i], life.y[i]);
    if (!p) continue;
    const d = (p[0] - sx) ** 2 + (p[1] - sy) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function tap(sx, sy) {
  const w = app.world;
  if (!w || !state.started) return;
  const p = screenToWorld(sx, sy);
  if (!p) return;
  const [x, y] = p;
  const t = state.tool;
  if (t === 'ansehen') {
    const zoomedIn = state.view === 'map' ? app.map.zoom > 4 : globeGeom().r > 150;
    const gi = zoomedIn ? nearestGroup(sx, sy, 14) : -1;
    if (gi >= 0) {
      state.selected = { kind: 'gruppe', uid: w.life.uid[gi] };
      sheets.open('gruppe', w.life.uid[gi]);
    } else {
      state.selected = { kind: 'zelle', x, y };
      sheets.open('zelle', [x, y]);
    }
  } else if (t === 'meteor') {
    w.meteor(x, y, state.meteorSize);
    state.effects.push({ kind: 'impact', x, y, t0: performance.now(), size: state.meteorSize });
    native.buzz(state.meteorSize === 3 ? 'HEAVY' : 'MEDIUM');
    state.texKey = '';
  } else if (t === 'wetter') {
    w.weather(x, y, state.weatherMode);
    state.effects.push({ kind: 'ring', x, y, t0: performance.now(), color: state.weatherMode === 'regen' ? '140,200,255' : '245,198,106' });
    state.texKey = '';
  } else if (t === 'leben') {
    const ok = w.sow(x, y, state.lifeKind);
    if (ok) {
      state.effects.push({ kind: 'ring', x, y, t0: performance.now(), color: '120,215,154' });
      state.texKey = '';
    } else toast({ kind: 'welt', text: 'Hier kann nichts wachsen. Versuche es an einem wärmeren oder feuchteren Ort.', t: w.tick });
  }
}

// ---------------------------------------------------------------- Hinweise

const toastEl = $('toasts');
const toastQueue = [];
let toastShown = 0;

function toast(e) {
  toastQueue.push(e);
}

function pumpToasts() {
  const w = app.world;
  if (w && state.started) {
    for (const e of w.chronicle.takeFresh()) {
      if (!(e.important || e.kind === 'gott' || e.kind === 'klima')) continue;
      toast(e);
    }
  }
  // Alte Meldungen verwerfen: Was vor Jahrzehnten geschah, steht in der Chronik
  while (toastQueue.length && w && w.tick - toastQueue[0].t > 12 * 12 && toastQueue[0].kind !== 'gott') toastQueue.shift();
  while (toastQueue.length > 3) toastQueue.shift();
  if (!toastQueue.length || toastEl.children.length >= 1) return;
  const now = performance.now();
  if (now - toastShown < 500) return;
  toastShown = now;
  const e = toastQueue.shift();
  const div = document.createElement('div');
  div.className = `toast k-${e.kind}`;
  div.innerHTML = `<span class="toast-mark"></span><div><span class="toast-year">${F.year(e.t)}</span>${F.rich(e.text)}</div>`;
  if (e.x !== undefined) {
    div.addEventListener('click', () => app.flyTo(e.x, e.y));
  }
  toastEl.appendChild(div);
  setTimeout(() => {
    div.classList.add('is-out');
    setTimeout(() => div.remove(), 450);
  }, 3800);
}

// ---------------------------------------------------------------- Simulation

function simulate(dt) {
  const w = app.world;
  if (!w || !state.started || state.busy) return;
  const sp = SPEEDS[state.speed];
  if (!sp.months) return;
  const t0 = performance.now();
  const budget = state.speed === 3 ? 15 : 11;
  let done = 0;
  if (sp.months === Infinity) {
    while (performance.now() - t0 < budget) {
      w.stepMonth();
      done++;
    }
  } else {
    state.acc = Math.min(state.acc + dt * sp.months, 8);
    while (state.acc >= 1 && performance.now() - t0 < budget) {
      w.stepMonth();
      state.acc -= 1;
      done++;
    }
  }
  state.rateMonths += done;
  const now = performance.now();
  if (now - state.rateAt > 1000) {
    const yrs = state.rateMonths / 12 / ((now - state.rateAt) / 1000);
    state.rate = state.rate ? state.rate * 0.5 + yrs * 0.5 : yrs;
    state.rateMonths = 0;
    state.rateAt = now;
  }
}

function refreshTexture(now, force = false) {
  const w = app.world;
  if (!w) return;
  const key = `${w.version}|${w.month}|${state.layer}|${w.terrainVersion}|${state.layer === 'leben' ? w.tick : ''}`;
  if (key === state.texKey) return;
  const minGap = state.speed >= 2 ? 300 : 160;
  if (!force && state.texKey && now - state.texAt < minGap) return;
  app.tex.update(state.layer, w.month);
  texCtx.putImageData(new ImageData(app.tex.data, TW, TH), 0, 0);
  state.texKey = key;
  state.texAt = now;
}

// ---------------------------------------------------------------- Zeichnen

function draw(now) {
  const { dpr, w, h } = state;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(skyCanvas, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!app.world) return;
  if (state.view === 'globe') drawGlobe(now);
  else drawMap();
  drawEffects(now);
  drawSelection(now);
}

function drawGlobe(now) {
  const g = globeGeom();
  const globe = app.globe;
  // Atmosphärenschein
  const glow = ctx.createRadialGradient(g.cx, g.cy, g.r * 0.92, g.cx, g.cy, g.r * 1.22);
  glow.addColorStop(0, 'rgba(110,170,255,0.38)');
  glow.addColorStop(0.35, 'rgba(90,150,255,0.12)');
  glow.addColorStop(1, 'rgba(90,150,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(g.cx, g.cy, g.r * 1.22, 0, Math.PI * 2);
  ctx.fill();
  const img = globe.render(app.tex);
  if (!state.globeImage || state.globeImage.width !== img.width) state.globeImage = new ImageData(img.data, img.width, img.height);
  globeCtx.putImageData(state.globeImage, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(globeCanvas, g.cx - g.r, g.cy - g.r, g.r * 2, g.r * 2);
  // Lebewesen als Lichtpunkte, wenn der Globus groß genug ist
  if (g.r > 110) drawGroupsGlobe(g);
}

function groupStyle(i, life, hl) {
  const sp = life.sp[i];
  const hue = life.genes[i * NG + 8];
  const [r, gg, b] = speciesRgb(hue);
  const dim = hl && sp !== hl;
  return { r, g: gg, b, dim };
}

function drawGroupsGlobe(g) {
  const life = app.world.life;
  const hl = state.highlight;
  const size = Math.max(1.2, Math.min(2.6, g.r / 120));
  for (let i = 0; i < life.n; i++) {
    const p = app.globe.project(life.x[i], life.y[i]);
    if (!p) continue;
    const st = groupStyle(i, life, hl);
    const a = (0.35 + 0.65 * p[2]) * (st.dim ? 0.18 : 1);
    ctx.fillStyle = `rgba(${st.r},${st.g},${st.b},${a})`;
    const s = hl && !st.dim ? size * 1.8 : size;
    ctx.fillRect(g.cx + p[0] * g.r - s / 2, g.cy - p[1] * g.r - s / 2, s, s);
  }
}

function drawMap() {
  const { w, h } = state;
  app.map.draw(ctx, texCanvas, w, h);
  const life = app.world.life;
  const z = app.map.zoom;
  const hl = state.highlight;
  const base = Math.max(1.4, Math.min(5.5, z * 0.22));
  const round = z > 9;
  for (let i = 0; i < life.n; i++) {
    const [sx, sy] = app.map.toScreen(life.x[i], life.y[i], w, h);
    if (sx < -6 || sx > w + 6 || sy < -6 || sy > h + 6) continue;
    const st = groupStyle(i, life, hl);
    const s = base * (0.7 + 0.6 * life.genes[i * NG + SIZE]) * (hl && !st.dim ? 1.5 : 1);
    if (round) {
      ctx.fillStyle = 'rgba(5,9,19,0.55)';
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.62 + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${st.r},${st.g},${st.b},${st.dim ? 0.18 : 0.95})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.62, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = `rgba(${st.r},${st.g},${st.b},${st.dim ? 0.18 : 0.95})`;
      ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
    }
  }
}

function drawEffects(now) {
  state.effects = state.effects.filter((e) => now - e.t0 < 2200);
  for (const e of state.effects) {
    const p = worldToScreen(e.x, e.y);
    if (!p) continue;
    const t = (now - e.t0) / 2200;
    const scale = state.view === 'map' ? app.map.zoom : globeGeom().r * ((Math.PI * 2) / W);
    if (e.kind === 'impact') {
      const r0 = [2, 4.5, 9][e.size - 1] * scale;
      if (t < 0.12) {
        ctx.fillStyle = `rgba(255,240,210,${0.9 * (1 - t / 0.12)})`;
        ctx.beginPath();
        ctx.arc(p[0], p[1], r0 * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(255,140,90,${0.9 * (1 - t)})`;
      ctx.lineWidth = 2.5 * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r0 * (0.6 + t * 2.2), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(${e.color},${0.85 * (1 - t)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7 * scale * (0.3 + t), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawSelection(now) {
  const sel = state.selected;
  if (!sel || !sheets.isOpen()) return;
  let x;
  let y;
  if (sel.kind === 'zelle') {
    x = Math.floor(sel.x) + 0.5;
    y = Math.floor(sel.y) + 0.5;
  } else {
    const life = app.world.life;
    let i = -1;
    for (let k = 0; k < life.n; k++) {
      if (life.uid[k] === sel.uid) {
        i = k;
        break;
      }
    }
    if (i < 0) return;
    x = life.x[i];
    y = life.y[i];
  }
  const p = worldToScreen(x, y);
  if (!p) return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);
  ctx.strokeStyle = `rgba(245,198,106,${0.55 + 0.4 * pulse})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(p[0], p[1], 9 + 2 * pulse, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------------------------------------------------------------- Kamera

app.flyTo = (x, y) => {
  if (state.view === 'globe') {
    app.globe.lookAt(x, y);
    app.globe.tilt *= 0.8;
    state.spin = false;
  } else {
    app.map.x = x;
    app.map.y = y;
    app.map.zoom = Math.max(app.map.zoom, 8);
    app.map.clamp(state.h);
  }
  state.effects.push({ kind: 'ring', x, y, t0: performance.now(), color: '245,198,106' });
};

app.highlight = (id) => {
  state.highlight = id;
  if (id) {
    const sp = app.world.species.get(id);
    if (sp) app.flyTo(sp.x, sp.y);
  }
  renderContext();
};

app.onSheetClosed = () => {
  state.selected = null;
};

app.lastSavedText = () => (state.savedAt ? `zuletzt ${F.year(state.savedAt)}` : '');

app.action = (act, v) => {
  if (act === 'jump') {
    sheets.close();
    timeJump(Number(v));
  } else if (act === 'save') {
    saveNow(true);
    sheets.render();
  } else if (act === 'new') {
    sheets.open('confirm', {
      title: 'Neue Welt erschaffen?',
      text: 'Die aktuelle Welt wird dabei ersetzt. Sie wird vorher nicht extra gesichert.',
      ok: 'Neue Welt',
      act: 'new-ok',
    });
  } else if (act === 'new-ok') {
    sheets.close();
    backToStart();
  } else if (act === 'about') sheets.open('about');
};

function backToStart() {
  state.started = false;
  state.speed = 0;
  $('hud').hidden = true;
  $('dock').hidden = true;
  $('context').hidden = true;
  startEl.hidden = false;
  $('start-continue').innerHTML = '';
  seedInput.value = randomSeed();
  state.globeZoom = 1;
  state.view = 'globe';
  setupGlobe();
  schedulePreview();
}

// ---------------------------------------------------------------- Zeitsprung

function timeJump(years) {
  const w = app.world;
  state.busy = { target: w.tick + years * 12, start: w.tick, stop: false };
  $('busy').hidden = false;
}

$('busy-stop').addEventListener('click', () => {
  if (state.busy) state.busy.stop = true;
});

function runBusy() {
  const b = state.busy;
  if (!b) return;
  const w = app.world;
  const t0 = performance.now();
  while (w.tick < b.target && !b.stop && performance.now() - t0 < 40) w.stepMonth();
  const f = (w.tick - b.start) / (b.target - b.start);
  $('busy-fill').style.width = `${Math.round(f * 100)}%`;
  $('busy-title').textContent = `Zeitsprung: ${F.year(w.tick)}`;
  if (w.tick >= b.target || b.stop) {
    state.busy = null;
    $('busy').hidden = true;
    state.texKey = '';
    const fresh = w.chronicle.takeFresh().filter((e) => e.important);
    toastQueue.length = 0;
    const years = Math.round((w.tick - b.start) / 12);
    const more = fresh.length ? ` ${fresh.length === 1 ? 'Ein wichtiges Ereignis steht' : `${fresh.length} wichtige Ereignisse stehen`} in der Chronik.` : '';
    toast({ kind: 'welt', text: `${F.num(years)} Jahre vergangen.${more}`, t: w.tick });
    saveNow();
  }
}

// ---------------------------------------------------------------- Speichern

let saving = false;
async function saveNow(manual = false) {
  const w = app.world;
  if (!w || saving || !state.started) return;
  saving = true;
  try {
    await store.save(w.serialize());
    state.lastSave = performance.now();
    state.savedAt = w.tick;
    if (manual) toast({ kind: 'welt', text: 'Gespeichert.', t: w.tick });
  } catch (e) {
    console.warn('Speichern fehlgeschlagen', e);
    if (manual) toast({ kind: 'tod', text: 'Speichern hat nicht geklappt.', t: w.tick });
  } finally {
    saving = false;
  }
}

native.onPause(() => saveNow());
native.onBack(() => {
  if (state.busy) {
    state.busy.stop = true;
    return true;
  }
  if (sheets.isOpen()) return sheets.close();
  if (state.started && state.tool !== 'ansehen') {
    state.tool = 'ansehen';
    renderDock();
    renderContext();
    return true;
  }
  if (state.started && state.view === 'map') {
    setView('globe');
    return true;
  }
  saveNow();
  return false;
});

// ---------------------------------------------------------------- Schleife

let last = performance.now();
let sheetAt = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  try {
    if (state.busy) runBusy();
    else simulate(dt);
    if (app.world) {
      if (state.view === 'globe' && (state.spin || !state.started) && pointers.size === 0) app.globe.lon += dt * (state.started ? 0.05 : 0.09);
      if (pointers.size === 0 && !state.spin && state.view === 'globe' && performance.now() - lastTouch > 6000) state.spin = true;
      refreshTexture(now);
      draw(now);
      if (state.started) {
        updateHud();
        pumpToasts();
        if (now - sheetAt > 700) {
          sheetAt = now;
          if (state.speed > 0) sheets.refresh();
        }
        if (now - state.lastSave > 60000 && state.speed > 0) saveNow();
      }
    }
  } catch (e) {
    console.error('EMERGENZ_FEHLER', e && e.stack ? e.stack : e);
  }
  requestAnimationFrame(frame);
}

let lastTouch = 0;
canvas.addEventListener('pointerdown', () => {
  lastTouch = performance.now();
});

const sheets = createSheets(app);

window.addEventListener('resize', resize);

async function boot() {
  resize();
  native.setupBars();
  const saved = await store.load();
  initStart(saved && saved.v ? saved : null);
  requestAnimationFrame(frame);
  console.log('EMERGENZ_BEREIT');
}

// Zugriff für automatische Tests
window.__emergenz = {
  app,
  state,
  setSpeed,
  setView,
  openSheet: (k, a) => sheets.open(k, a),
  closeSheet: () => sheets.close(),
  tapAt: tap,
  setLayer: (l) => {
    state.layer = l;
    state.texKey = '';
    renderContext();
  },
  setTool: (t) => {
    state.tool = t;
    renderDock();
    renderContext();
  },
  step: (months) => app.world && app.world.step(months),
  save: () => saveNow(),
};

boot();
