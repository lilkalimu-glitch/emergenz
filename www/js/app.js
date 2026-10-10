// Emergenz: Startpunkt der App. Verbindet den Simulations-Prozess (Web Worker), die Darstellung (WebGL2)
// und die Bedienung. Die Welt selbst lebt im Worker; hier kommen nur fertige Daten für das Bild an.

import { W, H } from './sim/const.js';
import { SimClient } from './client.js';
import { Renderer } from './gl/renderer.js';
import { Camera, TAN_HALF, DIST_GAME, NEAR } from './view/camera.js';
import { LifeLayer } from './view/life-layer.js';
import { Effects } from './view/fx.js';
import { drawSky } from './render/sky.js';
import { icon } from './ui/icons.js';
import * as F from './ui/format.js';
import { createSheets } from './ui/sheets.js';
import * as native from './native.js';

const $ = (id) => document.getElementById(id);

const LAYERS = [
  { id: 'natur', name: 'Natur' },
  { id: 'temperatur', name: 'Temperatur' },
  { id: 'regen', name: 'Regen' },
  { id: 'leben', name: 'Leben' },
];
const LAYER_INDEX = { natur: 0, temperatur: 1, regen: 2, leben: 3 };

const SPEEDS = [
  { icon: 'pause', label: 'Pause' },
  { icon: 'play', label: '1 Jahr pro Sekunde' },
  { icon: 'play2', label: '6 Jahre pro Sekunde' },
  { icon: 'play3', label: 'So schnell wie möglich' },
];

const TOOLS = [
  { id: 'ansehen', name: 'Ansehen', icon: 'eye' },
  { id: 'klima', name: 'Klima', icon: 'sun' },
  { id: 'meteor', name: 'Meteor', icon: 'meteor' },
  { id: 'wetter', name: 'Wetter', icon: 'rain' },
  { id: 'leben', name: 'Leben', icon: 'sprout' },
  { id: 'chronik', name: 'Chronik', icon: 'book' },
];

// Sonne im Blickraum: Licht von links oben vorne
const SUN = (() => {
  const v = [-0.55, 0.42, 0.72];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((x) => x / l);
})();

const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const state = {
  phase: 'start',
  started: false,
  tool: 'ansehen',
  meteorSize: 2,
  weatherMode: 'regen',
  lifeKind: 'zellen',
  layer: 'natur',
  speed: 1,
  highlight: 0,
  selected: null, // { kind: 'zelle', x, y } oder { kind: 'gruppe', uid }
  w: 1,
  h: 1,
  dpr: 1,
  quality: 1,
  busy: false,
  savedAt: 0,
  fade: null,
  lifeMode: -1,
};

let canvas = $('view');
const fxCanvas = $('fx');
const client = new SimClient();
const cam = new Camera();
const fx = new Effects(fxCanvas);
const skyCanvas = document.createElement('canvas');
let renderer = Renderer.create(canvas);
let fallback = null;
const life = new LifeLayer((slot, c) => {
  if (renderer) renderer.setSprite(slot, c);
  else if (fallback) fallback.setSprite(slot, c);
});

const app = { client, state, cam };

// ---------------------------------------------------------------- Größe und Platz

function dprEff() {
  return state.dpr * state.quality;
}

function resize() {
  state.dpr = Math.min(2, window.devicePixelRatio || 1);
  state.w = window.innerWidth;
  state.h = window.innerHeight;
  const d = dprEff();
  if (renderer) {
    renderer.resize(state.w, state.h, d);
    drawSky(skyCanvas, state.w, state.h, d);
    renderer.setSky(skyCanvas);
  }
  if (fallback) fallback.resize(state.w, state.h, d);
  fx.resize(state.w, state.h, state.dpr);
  layout(true);
}

// Wo der Planet auf dem Bildschirm sitzt: im Spiel zwischen Kopfzeile und Werkzeugen, beim Start oben
function layout(instant = false) {
  const w = state.w;
  const h = state.h;
  if (state.phase === 'game') {
    const top = 84;
    const bottom = 150;
    const availH = Math.max(160, h - top - bottom);
    const base = Math.min(w * 0.86, availH) / 2;
    cam.setLayout(w, h, w / 2, top + availH / 2, base, instant);
  } else {
    const top = 96;
    const availH = Math.max(160, h * 0.5 - top);
    const base = Math.min(w * 0.86, availH) / 2;
    cam.setLayout(w, h, w / 2, Math.max(top + base, h * 0.3), base, instant);
  }
}

// ---------------------------------------------------------------- Grafik

async function useFallback(reason) {
  console.warn('EMERGENZ: Ersatz-Darstellung ohne WebGL2', reason || '');
  const { Fallback2D } = await import('./view/fallback.js');
  const fresh = document.createElement('canvas');
  fresh.id = 'view';
  fresh.setAttribute('aria-label', 'Planet');
  canvas.replaceWith(fresh);
  canvas = fresh;
  bindInput(canvas);
  renderer = null;
  fallback = new Fallback2D(canvas);
  cam.ortho = true;
  life.reset();
  client.send('init', { fallback: true });
  resize();
}

function watchContext(c) {
  c.addEventListener('webglcontextrestored', () => {
    try {
      renderer = Renderer.create(c);
      if (!renderer) throw new Error('kein Kontext');
      seen.terrain = -1;
      seen.fields = -1;
      life.reset();
      resize();
    } catch (e) {
      useFallback(e.message);
    }
  });
}

const seen = { terrain: 0, fields: 0, tex2d: 0, species: 0 };

function syncData(now) {
  if (renderer && !renderer.lost) {
    if (client.terrain && seen.terrain !== client.terrainSeq) {
      const t = client.terrain;
      renderer.setTerrain(t.elev, t.width, t.height);
      seen.terrain = client.terrainSeq;
    }
    if (client.fields && seen.fields !== client.fieldsSeq) {
      renderer.setFields(client.fields);
      seen.fields = client.fieldsSeq;
    }
  } else if (fallback && client.tex2d && seen.tex2d !== client.tex2dSeq) {
    fallback.setTexture(client.tex2d);
    seen.tex2d = client.tex2dSeq;
  }
  if (seen.species !== client.speciesSeq) {
    life.setSpecies(client.species);
    seen.species = client.speciesSeq;
  }
  life.pump(now, 4);
}

// Anteil der Bewegung zwischen dem letzten und dem aktuellen Stand der Simulation
function motionT(now) {
  const f = client.frame;
  if (!f || !f.stepped || state.speed === 0 || state.busy) return 1;
  return Math.min(1, (now - client.frameAt) / client.frameGap);
}

function drawPlanet(c, alpha, now) {
  const d = dprEff();
  const km = c.kmPerPx();
  const o = {
    layer: LAYER_INDEX[state.layer],
    seaLevel: 0,
    time: now / 1000,
    detail: smooth(16, 4, km),
    kmPerPx: km / d,
    alpha,
  };
  const oy = (state.h - c.cy) * d;
  if (c.view === 'globe') {
    o.sun = SUN;
    o.clouds = state.layer === 'natur' ? 0.85 * smooth(1.9, 2.8, c.dist) : 0;
    renderer.drawGlobe({ dist: c.dist, tanHalf: TAN_HALF, tilt: c.tilt, lon: c.lon, ox: c.cx * d, oy, half: c.half * d }, o);
  } else {
    o.gridW = W;
    o.gridH = H;
    renderer.drawMap({ x: c.mx, y: c.my, zoom: c.zoom * d, ox: c.cx * d, oy }, o);
  }
}

function render(now) {
  const f = client.frame;
  const t = motionT(now);
  const count = f ? life.build(f, cam, { now, t, dpr: dprEff(), highlight: state.highlight }) : 0;
  life.frameRef = f;
  if (renderer) {
    if (renderer.lost) return;
    renderer.begin();
    if (client.terrain) {
      let a = 1;
      const fade = state.fade;
      if (fade) {
        const ft = (now - fade.t0) / 380;
        if (ft >= 1) state.fade = null;
        else {
          drawPlanet(fade.cam, 1, now);
          a = smooth(0, 1, ft);
        }
      }
      drawPlanet(cam, a, now);
      renderer.drawSprites(life.out, count);
    }
  } else if (fallback) {
    fallback.draw(cam, life.out, count);
  }
  fx.draw(cam, now, selectionMark(f, t));
  if (state.lifeMode !== life.mode && state.started) {
    state.lifeMode = life.mode;
    if (state.tool === 'ansehen') renderContext();
  }
}

// Markierung um die gewählte Gruppe oder Zelle
function selectionMark(f, t) {
  const sel = state.selected;
  if (!sel || !sheets.isOpen()) return null;
  const ppc = cam.pxPerCell();
  if (sel.kind === 'zelle') return { x: Math.floor(sel.x) + 0.5, y: Math.floor(sel.y) + 0.5, r: Math.max(10, ppc * 0.75) };
  if (!f) return null;
  for (let i = 0; i < f.n; i++) {
    if (f.uid[i] !== sel.uid) continue;
    let dx = f.x[i] - f.px[i];
    if (dx > W / 2) dx -= W;
    else if (dx < -W / 2) dx += W;
    const x = (f.px[i] + dx * t + W) % W;
    const y = f.py[i] + (f.y[i] - f.py[i]) * t;
    const r = life.mode === 2 ? ppc * 0.62 : life.mode === 1 ? Math.max(12, ppc * 0.9) : 9;
    return { x, y, r };
  }
  return null;
}

// ---------------------------------------------------------------- Start

const startEl = $('start');
const seedInput = $('seed');
let startMode = 'ursuppe';
let previewSeed = null;
let previewWanted = null;
let previewTimer = null;
let pendingCreate = false;

function randomSeed() {
  return String(10000 + Math.floor(Math.random() * 89999));
}

function schedulePreview() {
  clearTimeout(previewTimer);
  $('start-note').textContent = 'Planet entsteht …';
  $('create').disabled = true;
  previewTimer = setTimeout(requestPreview, 120);
}

function requestPreview() {
  const seed = Number(seedInput.value) || 1;
  if (previewWanted === seed && previewSeed === seed) {
    readyPreview();
    return;
  }
  previewWanted = seed;
  client.send('preview', { seed });
}

function readyPreview() {
  $('start-note').textContent = '';
  $('create').disabled = false;
  if (pendingCreate) {
    pendingCreate = false;
    createWorld();
  }
}

client.on('preview-ready', (m) => {
  console.log(`EMERGENZ: Vorschau ${m.seed}`);
  previewSeed = m.seed;
  if (m.seed === previewWanted && state.phase === 'start') readyPreview();
});

function initStart() {
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
  schedulePreview();
}

function showContinue(saved) {
  const box = $('start-continue');
  box.innerHTML = `<button class="continue" id="continue">${icon('planet')}<span><b>Weiterspielen</b><span>${F.esc(saved.name)}, ${F.year(saved.tick)}</span></span></button>`;
  $('continue').addEventListener('click', continueWorld);
}

function createWorld() {
  const seed = Number(seedInput.value) || 1;
  if (previewSeed !== seed) {
    pendingCreate = true;
    requestPreview();
    return;
  }
  previewSeed = null;
  previewWanted = null;
  $('create').disabled = true;
  client.send('start', { mode: startMode });
}

async function continueWorld() {
  $('start-note').textContent = 'Welt wird geladen …';
  previewSeed = null;
  previewWanted = null;
  const ok = await client.request('load');
  if (!ok) $('start-note').textContent = 'Der Spielstand ließ sich nicht laden. Erschaffe eine neue Welt.';
}

client.on('started', () => enterGame());

function enterGame() {
  state.started = true;
  state.phase = 'game';
  startEl.hidden = true;
  $('hud').hidden = false;
  $('dock').hidden = false;
  $('context').hidden = false;
  $('start-note').textContent = '';
  state.speed = 1;
  state.tool = 'ansehen';
  state.highlight = 0;
  state.selected = null;
  state.lifeMode = -1;
  if (cam.view !== 'globe') cam.toGlobe();
  cam.dist = DIST_GAME;
  layout();
  renderSpeed();
  renderDock();
  renderContext();
  updateHud(performance.now(), true);
  console.log('EMERGENZ_WELT_LAEUFT');
}

function backToStart() {
  state.started = false;
  state.phase = 'start';
  state.speed = 0;
  state.highlight = 0;
  client.send('speed', { value: 0 });
  $('hud').hidden = true;
  $('dock').hidden = true;
  $('context').hidden = true;
  startEl.hidden = false;
  $('start-continue').innerHTML = '';
  seedInput.value = randomSeed();
  if (cam.view !== 'globe') switchView('globe');
  cam.dist = DIST_GAME;
  layout();
  schedulePreview();
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
  client.send('speed', { value: i });
  renderSpeed();
}

let hudAt = 0;
let hudStats = '';
function updateHud(now, force = false) {
  if (!force && now - hudAt < 200) return;
  hudAt = now;
  const f = client.frame;
  if (!f) return;
  const year = F.year(f.tick);
  if ($('hud-year').textContent !== year) $('hud-year').textContent = year;
  const s = f.stats.species;
  const html = `<span class="t">${icon('thermo')}${F.temp(f.stats.T)}</span><span class="s">${icon('leaf')}${F.num(s)} ${s === 1 ? 'Art' : 'Arten'}</span>`;
  if (html !== hudStats) {
    $('hud-stats').innerHTML = html;
    hudStats = html;
  }
  let rate = '';
  if (state.speed > 0 && !state.busy && f.rate) rate = f.rate >= 1.5 ? `${F.num(Math.round(f.rate))} Jahre/s` : `${F.num(f.rate, 1)} Jahre/s`;
  if ($('speed-rate').textContent !== rate) $('speed-rate').textContent = rate;
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
      (state.highlight ? chip('data-unmark', '1', 'Markierung aufheben', true, 'close') : '') +
      chip('data-view', cam.view === 'globe' ? 'map' : 'globe', cam.view === 'globe' ? 'Karte' : 'Globus', false, cam.view === 'globe' ? 'map' : 'globe') +
      '<span class="chip-sep"></span>' +
      LAYERS.map((l) => chip('data-layer', l.id, l.name, state.layer === l.id)).join('');
    if (state.highlight) {
      hint = 'Die markierte Art leuchtet, alle anderen treten zurück.';
    } else if (life.mode === 2) hint = 'Nahansicht: Tippe auf ein Tier, um seine Gruppe kennenzulernen.';
    else if (life.mode === 1) hint = 'Tippe auf ein Tier. Weiter heranzoomen zeigt einzelne Tiere.';
    else hint = 'Tippe auf einen Ort. Zieh zwei Finger auseinander, um die Tiere aus der Nähe zu sehen.';
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
  const html = `<div class="ctx-row">${row}</div><p class="ctx-hint">${hint}</p>`;
  if (el.innerHTML !== html) el.innerHTML = html;
}

$('context').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.view) switchView(b.dataset.view);
  else if (b.dataset.layer) setLayer(b.dataset.layer);
  else if (b.dataset.meteor) state.meteorSize = Number(b.dataset.meteor);
  else if (b.dataset.weather) state.weatherMode = b.dataset.weather;
  else if (b.dataset.life) state.lifeKind = b.dataset.life;
  else if (b.dataset.unmark) app.highlight(0);
  renderContext();
});

function setLayer(l) {
  state.layer = l;
  client.send('layer', { layer: l });
  renderContext();
}

function switchView(v, focus) {
  if (cam.view === v) return;
  state.fade = renderer ? { cam: cam.clone(), t0: performance.now() } : null;
  if (v === 'map') cam.toMap(focus || undefined);
  else cam.toGlobe(focus || undefined);
  renderContext();
}

// ---------------------------------------------------------------- Eingabe

const pointers = new Map();
let gesture = null;

function onDown(e) {
  e.currentTarget.setPointerCapture(e.pointerId);
  const now = performance.now();
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  cam.touch(now);
  cam.stop();
  if (pointers.size === 1) {
    gesture = { kind: 'drag', t0: now, lt: now, lx: e.clientX, ly: e.clientY, moved: 0, vx: 0, vy: 0 };
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
}

function onMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gesture) return;
  const now = performance.now();
  cam.touch(now);
  if (gesture.kind === 'drag' && pointers.size === 1) {
    const dx = e.clientX - gesture.lx;
    const dy = e.clientY - gesture.ly;
    const dtm = Math.max(4, now - gesture.lt);
    gesture.vx = gesture.vx * 0.6 + ((dx / dtm) * 1000) * 0.4;
    gesture.vy = gesture.vy * 0.6 + ((dy / dtm) * 1000) * 0.4;
    gesture.lx = e.clientX;
    gesture.ly = e.clientY;
    gesture.lt = now;
    gesture.moved += Math.abs(dx) + Math.abs(dy);
    cam.dragBy(dx, dy);
  } else if (gesture.kind === 'pinch' && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const f = d / Math.max(10, gesture.d);
    gesture.d = d;
    cam.dragBy(mx - gesture.mx, my - gesture.my);
    gesture.mx = mx;
    gesture.my = my;
    if (state.started) zoomAt(f, mx, my);
  }
}

function zoomAt(f, sx, sy) {
  const sw = cam.zoomAt(f, sx, sy);
  if (!sw) return;
  const focus = cam.unproject(sx, sy);
  switchView(sw, focus);
  // Punkt unter den Fingern bleibt dort
  if (sw === 'map' && focus) cam.dragBy(sx - cam.cx, sy - cam.cy);
}

function onUp(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  const now = performance.now();
  if (gesture && gesture.kind === 'drag' && pointers.size === 0) {
    if (gesture.moved < 10 && now - gesture.t0 < 500) tap(e.clientX, e.clientY);
    else if (now - gesture.lt < 90 && Math.hypot(gesture.vx, gesture.vy) > 90) cam.fling(gesture.vx, gesture.vy);
  }
  if (pointers.size === 0) gesture = null;
  else if (pointers.size === 1) {
    const p = [...pointers.values()][0];
    gesture = { kind: 'drag', t0: 0, lt: now, lx: p.x, ly: p.y, moved: 99, vx: 0, vy: 0 };
  }
}

function onWheel(e) {
  e.preventDefault();
  if (!state.started) return;
  cam.touch(performance.now());
  zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
}

function bindInput(el) {
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('wheel', onWheel, { passive: false });
}

async function tap(sx, sy) {
  if (!state.started) return;
  const p = cam.unproject(sx, sy);
  if (!p) return;
  const [x, y] = p;
  const now = performance.now();
  const t = state.tool;
  if (t === 'ansehen') {
    const gi = life.mode > 0 ? life.pick(sx, sy, dprEff(), life.mode === 2 ? 12 : 14) : -1;
    const f = life.frameRef;
    if (gi >= 0 && f && gi < f.n) {
      const uid = f.uid[gi];
      state.selected = { kind: 'gruppe', uid };
      sheets.open('gruppe', uid);
    } else {
      state.selected = { kind: 'zelle', x, y };
      sheets.open('zelle', [x, y]);
    }
  } else if (t === 'meteor') {
    fx.add({ kind: 'impact', x, y, t0: now, size: state.meteorSize });
    native.buzz(state.meteorSize === 3 ? 'HEAVY' : 'MEDIUM');
    await client.act('meteor', { x, y, size: state.meteorSize });
  } else if (t === 'wetter') {
    fx.add({ kind: 'ring', x, y, t0: now, color: state.weatherMode === 'regen' ? '140,200,255' : '245,198,106' });
    await client.act('weather', { x, y, mode: state.weatherMode });
  } else if (t === 'leben') {
    const ok = await client.act('sow', { x, y, kind: state.lifeKind });
    if (ok) fx.add({ kind: 'ring', x, y, t0: performance.now(), color: '120,215,154' });
    else toast({ kind: 'welt', text: 'Hier kann nichts wachsen. Versuche es an einem wärmeren oder feuchteren Ort.', t: client.frame ? client.frame.tick : 0 });
  }
}

// ---------------------------------------------------------------- Hinweise

const toastEl = $('toasts');
const toastQueue = [];
let toastShown = 0;

function toast(e) {
  toastQueue.push(e);
}

client.on('fresh', (entries) => {
  if (!state.started || state.busy) return;
  for (const e of entries) if (e.important || e.kind === 'gott' || e.kind === 'klima') toast(e);
});

function pumpToasts(now) {
  const tick = client.frame ? client.frame.tick : 0;
  // Alte Meldungen verwerfen: Was vor Jahrzehnten geschah, steht in der Chronik
  while (toastQueue.length && tick - toastQueue[0].t > 12 * 12 && toastQueue[0].kind !== 'gott') toastQueue.shift();
  while (toastQueue.length > 3) toastQueue.shift();
  if (!toastQueue.length || toastEl.children.length >= 1) return;
  if (now - toastShown < 500) return;
  toastShown = now;
  const e = toastQueue.shift();
  const div = document.createElement('div');
  div.className = `toast k-${e.kind}`;
  div.innerHTML = `<span class="toast-mark"></span><div><span class="toast-year">${F.year(e.t)}</span>${F.rich(e.text)}</div>`;
  if (e.x !== undefined) div.addEventListener('click', () => app.flyTo(e.x, e.y));
  toastEl.appendChild(div);
  setTimeout(() => {
    div.classList.add('is-out');
    setTimeout(() => div.remove(), 450);
  }, 3800);
}

// ---------------------------------------------------------------- Kamera-Aktionen

app.flyTo = (x, y) => {
  const now = performance.now();
  cam.touch(now);
  cam.flyTo(x, y, now, cam.view === 'map' ? Math.max(cam.zoom, 8) : 0);
  fx.add({ kind: 'ring', x, y, t0: now, color: '245,198,106' });
};

// Ganz nah heran: Karte in Nahansicht (instant für Tests)
app.zoomTo = (x, y, ppc = 52, instant = false) => {
  const now = performance.now();
  cam.touch(now);
  if (cam.view !== 'map') switchView('map', cam.center());
  if (instant) {
    cam.mx = x;
    cam.my = y;
    cam.zoom = ppc;
    cam.clampMap();
    state.fade = null;
  } else cam.flyTo(x, y, now, ppc, 1100);
};

// Eine Art markieren und zu einer ihrer Gruppen fliegen
app.highlight = (id) => {
  state.highlight = id;
  if (id) {
    const sp = client.species.get(id);
    const f = client.frame;
    let best = -1;
    let bd = Infinity;
    if (f && sp) {
      for (let i = 0; i < f.n; i++) {
        if (f.sp[i] !== id) continue;
        let dx = Math.abs(f.x[i] - sp.x);
        if (dx > W / 2) dx = W - dx;
        const d = dx * dx + (f.y[i] - sp.y) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    if (best >= 0) app.zoomTo(f.x[best], f.y[best], 30);
    else if (sp) app.flyTo(sp.x, sp.y);
  }
  renderContext();
};

app.onSheetClosed = () => {
  state.selected = null;
};

app.lastSavedText = () => (state.savedAt ? `zuletzt ${F.year(state.savedAt)}` : '');

// Klima-Regler: während des Ziehens höchstens zehnmal pro Sekunde senden
const paramTimers = {};
app.setParam = (kind, v, final) => {
  clearTimeout(paramTimers[kind]);
  const send = () => {
    paramTimers[kind] = null;
    client.act(kind, { v });
    if (final) client.act('log', { kind });
  };
  if (final) send();
  else paramTimers[kind] = setTimeout(send, 100);
};

app.action = (act, v) => {
  if (act === 'jump') {
    sheets.close();
    timeJump(Number(v));
  } else if (act === 'save') {
    saveNow(true).then(() => sheets.render());
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

// ---------------------------------------------------------------- Zeitsprung

function timeJump(years) {
  if (state.busy) return;
  state.busy = true;
  toastQueue.length = 0;
  $('busy-fill').style.width = '0%';
  $('busy-title').textContent = 'Zeitsprung';
  $('busy').hidden = false;
  client.send('jump', { years });
}

$('busy-stop').addEventListener('click', () => client.send('stop-jump'));

client.on('jump', (m) => {
  $('busy-fill').style.width = `${Math.round((m.done / Math.max(1, m.total)) * 100)}%`;
  $('busy-title').textContent = `Zeitsprung: ${F.year(m.tick)}`;
});

client.on('jump-done', (m) => {
  state.busy = false;
  $('busy').hidden = true;
  toastQueue.length = 0;
  const more = m.important ? ` ${m.important === 1 ? 'Ein wichtiges Ereignis steht' : `${m.important} wichtige Ereignisse stehen`} in der Chronik.` : '';
  toast({ kind: 'welt', text: `${F.num(m.years)} Jahre vergangen.${more}`, t: m.tick });
  state.savedAt = m.tick;
});

// ---------------------------------------------------------------- Speichern

let saving = false;
async function saveNow(manual = false) {
  if (!state.started || saving) return false;
  saving = true;
  try {
    const tick = await client.request('save');
    const ok = tick !== false && tick !== null && tick !== undefined;
    if (ok) state.savedAt = tick;
    if (manual) toast({ kind: ok ? 'welt' : 'tod', text: ok ? 'Gespeichert.' : 'Speichern hat nicht geklappt.', t: client.frame ? client.frame.tick : 0 });
    return ok;
  } finally {
    saving = false;
  }
}

client.on('saved', (m) => {
  state.savedAt = m.tick;
});

native.onPause(() => saveNow());
native.onBack(() => {
  if (state.busy) {
    client.send('stop-jump');
    return true;
  }
  if (sheets.isOpen()) return sheets.close();
  if (state.started && state.tool !== 'ansehen') {
    state.tool = 'ansehen';
    renderDock();
    renderContext();
    return true;
  }
  if (state.started && cam.view === 'map') {
    switchView('globe');
    return true;
  }
  saveNow();
  return false;
});

// ---------------------------------------------------------------- Schleife

const perf = { frames: 0, at: 0, fps: 0, good: 0 };

function trackPerf(now) {
  perf.frames++;
  if (!perf.at) perf.at = now;
  if (now - perf.at < 1000) return;
  perf.fps = (perf.frames * 1000) / (now - perf.at);
  perf.frames = 0;
  perf.at = now;
  if (document.hidden) return;
  // Auflösung an die Leistung des Geräts anpassen
  if (perf.fps < 40 && state.quality > 0.55) {
    state.quality = Math.max(0.55, Math.round((state.quality - 0.15) * 100) / 100);
    perf.good = 0;
    resize();
  } else if (perf.fps > 57 && state.quality < 1) {
    if (++perf.good >= 4) {
      state.quality = Math.min(1, Math.round((state.quality + 0.1) * 100) / 100);
      perf.good = 0;
      resize();
    }
  } else perf.good = 0;
}

let last = performance.now();
let sheetAt = 0;
function loop(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  try {
    syncData(now);
    cam.update(dt, now);
    render(now);
    if (state.started) {
      updateHud(now);
      pumpToasts(now);
      if (now - sheetAt > 700) {
        sheetAt = now;
        if (state.speed > 0 && !state.busy) sheets.refresh();
      }
    }
    trackPerf(now);
  } catch (e) {
    console.error('EMERGENZ_FEHLER', e && e.stack ? e.stack : e);
  }
  requestAnimationFrame(loop);
}

const sheets = createSheets(app);

window.addEventListener('resize', resize);

async function boot() {
  if (renderer) {
    bindInput(canvas);
    watchContext(canvas);
  } else await useFallback('kein WebGL2');
  resize();
  native.setupBars();
  initStart();
  requestAnimationFrame(loop);
  const saved = await client.request('check-save');
  if (saved && state.phase === 'start') showContinue(saved);
  console.log('EMERGENZ_BEREIT', renderer ? 'webgl2' : '2d');
}

// Zugriff für automatische Tests
window.__emergenz = {
  app,
  state,
  cam,
  client,
  info: () => {
    const f = client.frame;
    return {
      tick: f ? f.tick : -1,
      groups: f ? f.n : 0,
      species: f ? f.stats.species : 0,
      T: f ? f.stats.T : 0,
      view: cam.view,
      pxPerCell: cam.pxPerCell(),
      lifeMode: life.mode,
      instances: life.count,
      sprites: life.slotOf.size,
      fps: perf.fps,
      quality: state.quality,
      gl: !!renderer,
      chronicle: client.chronicleCount,
      params: f ? f.params : null,
    };
  },
  setSpeed,
  setView: (v) => switchView(v),
  setLayer,
  setTool: (t) => {
    state.tool = t;
    renderDock();
    renderContext();
  },
  openSheet: (k, a) => sheets.open(k, a),
  closeSheet: () => sheets.close(),
  tapAt: tap,
  step: (months) => client.act('step', { months }),
  save: () => saveNow(),
  query: (what, args) => client.query(what, args),
  act: (kind, args) => client.act(kind, args),
  flyTo: (x, y) => app.flyTo(x, y),
  zoomTo: (x, y, ppc, instant = true) => app.zoomTo(x, y, ppc, instant),
  globe: (dist) => {
    switchView('globe');
    if (dist) cam.dist = dist;
    state.fade = null;
  },
  // eine Gruppe finden: an Land (land > 0,65) oder im Meer
  findGroup: (where = 'land') => {
    const f = client.frame;
    if (!f) return null;
    let best = null;
    for (let i = 0; i < f.n; i++) {
      const l = f.land[i] / 255;
      const ok = where === 'land' ? l > 0.65 : where === 'meer' ? l < 0.35 : true;
      if (!ok) continue;
      if (!best || f.size[i] > best.size) best = { x: f.x[i], y: f.y[i], uid: f.uid[i], sp: f.sp[i], size: f.size[i] };
    }
    return best;
  },
};

boot();
