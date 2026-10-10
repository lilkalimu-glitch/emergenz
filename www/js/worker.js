// Simulations-Prozess (Web Worker): rechnet die Welt, damit die Anzeige flüssig bleibt.
// Bekommt Befehle von der Oberfläche und schickt regelmäßig Daten für das Bild zurück.

import { SimHost, SPEED_MONTHS } from './sim/host.js';
import * as store from './store.js';

const host = new SimHost();
let speed = 0;
let acc = 0;
let last = performance.now();
let lastFrame = 0;
let lastSave = performance.now();
let jump = null;
let rateMonths = 0;
let rateAt = performance.now();
let rate = 0;
let wantFallback = false;

const post = (msg, transfer = []) => self.postMessage(msg, transfer);

function sendTerrain(force = false) {
  const t = host.terrain(force);
  if (t) post(t, [t.elev.buffer]);
}

function sendFields(now, force = false) {
  const f = host.fields(now, force);
  if (f) post(f, SimHost.fieldTransfer(f));
  if (wantFallback && (f || force)) sendTexture2d();
}

let tex2d = null;
let tex2dBusy = false;
async function sendTexture2d() {
  // Ersatz-Bild für Geräte ohne WebGL2
  if (tex2dBusy) return;
  tex2dBusy = true;
  try {
    if (!tex2d) {
      const { PlanetTexture } = await import('./render/texture.js');
      tex2d = new PlanetTexture(host.world);
    }
    if (tex2d.world !== host.world) {
      const { PlanetTexture } = await import('./render/texture.js');
      tex2d = new PlanetTexture(host.world);
    }
    tex2d.update(host.layer, host.world.month);
    const data = tex2d.data.slice();
    const sea = tex2d.sea.slice();
    post({ type: 'tex2d', data, sea }, [data.buffer, sea.buffer]);
  } finally {
    tex2dBusy = false;
  }
}

function sendSpecies(now, force = false) {
  const s = host.species(now, force);
  if (s) post(s);
}

function sendFrame(stepped, snap = false) {
  const f = host.frame(snap);
  f.rate = rate;
  f.speed = speed;
  f.stepped = stepped;
  post(f, SimHost.transfer(f));
}

function sendAll() {
  const now = performance.now();
  sendTerrain(true);
  sendFields(now, true);
  sendSpecies(now, true);
  host.world.chronicle.takeFresh();
  post({ type: 'chronicle', entries: host.world.chronicle.entries.slice() });
  sendFrame(0, true);
}

async function save() {
  if (!host.world || !host.started) return false;
  try {
    await store.save(host.world.serialize());
    lastSave = performance.now();
    post({ type: 'saved', tick: host.world.tick });
    return true;
  } catch (e) {
    post({ type: 'error', message: `Speichern: ${e && e.message}` });
    return false;
  }
}

// Schleife ohne Wartezeit zwischen den Häppchen (MessageChannel statt setTimeout)
const channel = new MessageChannel();
let scheduled = false;
channel.port1.onmessage = () => {
  scheduled = false;
  loop();
};
function schedule(delay = 0) {
  if (scheduled) return;
  scheduled = true;
  if (delay > 0) {
    setTimeout(() => {
      scheduled = false;
      loop();
    }, delay);
  } else channel.port2.postMessage(0);
}

function finishJump(w) {
  const years = Math.round((w.tick - jump.start) / 12);
  const important = w.chronicle.takeFresh().filter((e) => e.important).length;
  jump = null;
  sendAll();
  post({ type: 'jump-done', years, important, tick: w.tick });
  save();
}

function loop() {
  const now = performance.now();
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  let stepped = 0;
  const w = host.world;
  if (w && host.started) {
    try {
      if (jump) {
        const t0 = performance.now();
        while (w.tick < jump.target && !jump.stop && performance.now() - t0 < 40) {
          w.stepMonth();
          stepped++;
        }
        jump.done += stepped;
        post({ type: 'jump', done: w.tick - jump.start, total: jump.target - jump.start, tick: w.tick });
        if (w.tick >= jump.target || jump.stop) finishJump(w);
      } else if (speed > 0) {
        const per = SPEED_MONTHS[speed];
        const t0 = performance.now();
        if (per === Infinity) {
          while (performance.now() - t0 < 16) {
            w.stepMonth();
            stepped++;
          }
        } else {
          acc = Math.min(acc + dt * per, 6);
          while (acc >= 1 && performance.now() - t0 < 16) {
            w.stepMonth();
            acc -= 1;
            stepped++;
          }
        }
      }
    } catch (e) {
      post({ type: 'error', message: `Simulation: ${e && e.stack ? e.stack : e}` });
      speed = 0;
      jump = null;
    }
    rateMonths += stepped;
    if (now - rateAt > 1000) {
      const yrs = rateMonths / 12 / ((now - rateAt) / 1000);
      rate = rate ? rate * 0.5 + yrs * 0.5 : yrs;
      rateMonths = 0;
      rateAt = now;
    }
    if (!jump) {
      const frameGap = stepped ? (SPEED_MONTHS[speed] <= 12 ? 0 : 33) : 250;
      if (now - lastFrame >= frameGap) {
        lastFrame = now;
        sendFrame(stepped);
        sendFields(now);
        sendTerrain();
        sendSpecies(now);
      }
      if (now - lastSave > 60000 && speed > 0) save();
    }
  }
  const busy = jump || speed === 3 || (speed === 2 && host.started);
  schedule(busy ? 0 : 8);
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    switch (m.cmd) {
      case 'init':
        wantFallback = !!m.fallback;
        if (wantFallback && host.world) sendTexture2d();
        break;
      case 'preview': {
        host.previewWorld(m.seed);
        speed = 0;
        sendAll();
        post({ type: 'preview-ready', seed: m.seed });
        break;
      }
      case 'start':
        host.start(m.mode);
        speed = 1;
        acc = 0;
        sendAll();
        post({ type: 'started' });
        save();
        break;
      case 'check-save': {
        const d = await store.load();
        post({ type: 'save-info', id: m.id, info: d && d.v ? { name: d.name, tick: d.tick } : null });
        break;
      }
      case 'load': {
        const d = await store.load();
        if (!d) {
          post({ type: 'reply', id: m.id, data: false });
          break;
        }
        host.restore(d);
        speed = 1;
        acc = 0;
        sendAll();
        post({ type: 'reply', id: m.id, data: true });
        post({ type: 'started' });
        break;
      }
      case 'speed':
        speed = m.value;
        acc = 0;
        break;
      case 'layer':
        host.layer = m.layer;
        if (host.world) sendFields(performance.now(), true);
        break;
      case 'act': {
        const data = host.act(m.kind, m.args);
        post({ type: 'reply', id: m.id, data });
        const now = performance.now();
        sendFrame(0, m.kind === 'step');
        sendFields(now, true);
        sendTerrain();
        sendSpecies(now, true);
        break;
      }
      case 'query':
        post({ type: 'reply', id: m.id, data: host.query(m.what, m.args) });
        break;
      case 'jump':
        if (host.world && host.started && !jump) jump = { start: host.world.tick, target: host.world.tick + m.years * 12, stop: false, done: 0 };
        break;
      case 'stop-jump':
        if (jump) jump.stop = true;
        break;
      case 'save': {
        const ok = await save();
        post({ type: 'reply', id: m.id, data: ok ? host.world.tick : false });
        break;
      }
      default:
        break;
    }
  } catch (err) {
    post({ type: 'error', message: `${m.cmd}: ${err && err.stack ? err.stack : err}` });
    if (m.id) post({ type: 'reply', id: m.id, data: null });
  }
  schedule();
};

schedule();
