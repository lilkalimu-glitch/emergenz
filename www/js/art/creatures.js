// Zeichnet ein Lebewesen aus dem Erbgut seiner Art (Canvas 2D), damit Arten erkennbar werden:
// Einzeller, Fische, Amphibien, Insekten, Vierbeiner und denkende Wesen.
// Merkmale im Bild: Größe und Gestalt, Zähne bei Räubern, große Augen bei guten Sinnen,
// Fell bei Kälteliebe, schlanker Körper und lange Beine bei hohem Tempo, Muster je Art.

const SIZE = 0;
const DIET = 1;
const LAND = 2;
const TOPT = 3;
const SPEED = 5;
const SENSE = 6;

function hash(n) {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

export function bodyPlan(g, sapient = false) {
  if (sapient) return 'denker';
  const s = g[SIZE];
  const h = g[LAND];
  if (s < 0.14) return 'zelle';
  if (h < 0.35) return s > 0.78 ? 'wal' : 'fisch';
  if (h < 0.65) return 'amphibie';
  if (s < 0.27) return 'insekt';
  return 'vierbeiner';
}

// Merkmale, die man im Bild sieht; ändern sie sich, muss das Bild neu gezeichnet werden
export function looks(sp) {
  const g = sp.g;
  const q = (v, k) => Math.round(v * k);
  return `${bodyPlan(g, sp.sapient)}|${q(g[SIZE], 6)}|${q(g[DIET], 4)}|${q(g[TOPT], 3)}|${q(g[SPEED], 3)}|${q(g[SENSE], 3)}|${q(sp.hue, 36)}|${sp.id}`;
}

export const PLAN_NAMES = {
  zelle: 'Einzeller',
  fisch: 'Schwimmer',
  wal: 'Meeresriese',
  amphibie: 'Amphibie',
  insekt: 'Krabbler',
  vierbeiner: 'Vierbeiner',
  denker: 'Denkendes Wesen',
};

function hsl(h, s, l, a = 1) {
  return `hsla(${Math.round(h * 360)},${Math.round(s * 100)}%,${Math.round(l * 100)}%,${a})`;
}

// Zeichnet in ein Quadrat der Kantenlänge size mit Mittelpunkt (cx, cy), Blick nach rechts
export function drawCreature(ctx, cx, cy, size, sp) {
  const g = sp.g;
  const plan = bodyPlan(g, sp.sapient);
  const hue = sp.hue;
  const hs = hash(sp.id || 1);
  const pattern = hs % 4; // 0 schlicht, 1 Streifen, 2 Flecken, 3 zweifarbig
  const pred = g[DIET] > 0.55;
  const cold = g[TOPT] < 0.38;
  // Farbe aus dem Farb-Gen, je Art leicht verschoben, damit verwandte Arten unterscheidbar bleiben;
  // Kältebewohner blasser, Wärmeliebhaber kräftiger
  const h = (hue + (((hs >>> 8) % 1000) / 1000 - 0.5) * 0.12 + 1) % 1;
  const sat = 0.42 + 0.3 * g[TOPT] + (((hs >>> 18) % 100) / 100) * 0.1;
  const lig = 0.5 + (((hs >>> 12) % 100) / 100) * 0.12 + (cold ? 0.06 : 0);
  const col = {
    body: hsl(h, sat, lig),
    dark: hsl(h, sat * 0.9, lig * 0.47),
    light: hsl((h + 0.04) % 1, Math.min(1, sat + 0.08), Math.min(0.9, lig + 0.24)),
    accent: hsl((h + 0.5) % 1, 0.55, 0.45),
    line: 'rgba(8,10,20,0.85)',
  };
  ctx.save();
  ctx.translate(cx, cy);
  const u = size / 100; // Einheit: 1/100 der Kantenlänge
  ctx.scale(u, u);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = col.line;
  // weicher Schatten unter Landtieren
  if (plan === 'vierbeiner' || plan === 'amphibie' || plan === 'insekt' || plan === 'denker') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 38, 34, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const draw = { zelle, fisch, wal, amphibie, insekt, vierbeiner, denker }[plan];
  draw(ctx, g, col, { pred, cold, pattern, hs });
  ctx.restore();
}

function eye(ctx, x, y, r, col) {
  ctx.fillStyle = '#f7f4ea';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = '#10131c';
  ctx.beginPath();
  ctx.arc(x + r * 0.25, y, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(x + r * 0.05, y - r * 0.3, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  void col;
}

function teeth(ctx, x0, y0, x1, y1, n, down = true) {
  ctx.fillStyle = '#f4f1e6';
  for (let k = 0; k < n; k++) {
    const t0 = k / n;
    const t1 = (k + 1) / n;
    const ax = x0 + (x1 - x0) * t0;
    const ay = y0 + (y1 - y0) * t0;
    const bx = x0 + (x1 - x0) * t1;
    const by = y0 + (y1 - y0) * t1;
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 + (down ? 4 : -4);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(mx, my);
    ctx.lineTo(bx, by);
    ctx.closePath();
    ctx.fill();
  }
}

function patternOn(ctx, pattern, col, clipPath, box, hs) {
  if (!pattern) return;
  ctx.save();
  ctx.clip(clipPath);
  ctx.fillStyle = pattern === 3 ? col.light : col.dark;
  ctx.globalAlpha = pattern === 3 ? 0.55 : 0.45;
  const [x0, y0, x1, y1] = box;
  if (pattern === 1) {
    for (let x = x0 + 6; x < x1; x += 11) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x + 5, y0);
      ctx.lineTo(x + 1, y1);
      ctx.lineTo(x - 4, y1);
      ctx.fill();
    }
  } else if (pattern === 2) {
    let k = hs;
    for (let i = 0; i < 9; i++) {
      k = hash(k + i);
      const x = x0 + (k % 1000) / 1000 * (x1 - x0);
      const y = y0 + ((k >>> 10) % 1000) / 1000 * (y1 - y0);
      ctx.beginPath();
      ctx.arc(x, y, 2.5 + (k % 5), 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // helle Unterseite
    ctx.fillRect(x0, (y0 + y1) / 2 + 2, x1 - x0, (y1 - y0) / 2);
  }
  ctx.restore();
}

function fur(ctx, path, rx, ry, cx, cy, col) {
  ctx.save();
  ctx.strokeStyle = col.light;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.6;
  for (let a = 0; a < Math.PI * 2; a += 0.22) {
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 4, y + Math.sin(a) * 4 - 1);
    ctx.stroke();
  }
  ctx.restore();
  void path;
}

// ---------- Baupläne ----------

function zelle(ctx, g, col, o) {
  const r = 30 + g[SIZE] * 60;
  const wobble = o.pred ? 0.18 : 0.06;
  const p = new Path2D();
  for (let k = 0; k <= 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const rr = r * (1 + wobble * Math.sin(a * (o.pred ? 5 : 3) + (o.hs % 7)));
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * 0.85;
    if (k === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.closePath();
  // Wimpern oder Geißel
  ctx.strokeStyle = col.dark;
  ctx.lineWidth = 1.8;
  if (g[SPEED] > 0.45) {
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    for (let x = 0; x < 40; x += 4) ctx.lineTo(-r - x, Math.sin(x * 0.4) * 6);
    ctx.stroke();
  } else {
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.85);
      ctx.lineTo(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7) * 0.85);
      ctx.stroke();
    }
  }
  ctx.fillStyle = hsl(0, 0, 1, 0.08);
  ctx.fillStyle = col.light;
  ctx.globalAlpha = 0.75;
  ctx.fill(p);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2.4;
  ctx.stroke(p);
  // Zellkern und Bläschen
  ctx.fillStyle = col.dark;
  ctx.beginPath();
  ctx.arc(r * 0.15, -r * 0.1, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col.body;
  for (let k = 0; k < 4; k++) {
    const a = (o.hs >>> (k * 3)) % 628 / 100;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.45, r * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
}

function fisch(ctx, g, col, o) {
  const s = g[SIZE];
  // Körperform je Art: klassisch, hochrückig oder lang gestreckt
  const form = (o.hs >>> 4) % 3;
  const fl = form === 1 ? 0.84 : form === 2 ? 1.18 : 1;
  const fh = form === 1 ? 1.45 : form === 2 ? 0.66 : 1;
  const len = (62 + s * 18) * fl;
  const hgt = (26 + s * 8) * (1.25 - 0.45 * g[SPEED]) * fh;
  const x0 = -len / 2;
  const x1 = len / 2;
  // Schwanzflosse
  ctx.fillStyle = col.dark;
  ctx.beginPath();
  if (g[SPEED] > 0.5) {
    ctx.moveTo(x0 + 6, 0);
    ctx.lineTo(x0 - 18, -hgt * 0.75);
    ctx.lineTo(x0 - 10, 0);
    ctx.lineTo(x0 - 18, hgt * 0.75);
  } else {
    ctx.moveTo(x0 + 6, 0);
    ctx.quadraticCurveTo(x0 - 26, -hgt * 0.9, x0 - 18, 0);
    ctx.quadraticCurveTo(x0 - 26, hgt * 0.9, x0 + 6, 0);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Rückenflosse: kurz und spitz oder lang über den Rücken
  ctx.beginPath();
  if ((o.hs >>> 7) % 2 === 0) {
    ctx.moveTo(-8, -hgt * 0.42);
    ctx.quadraticCurveTo(4, -hgt * (o.pred ? 1.25 : 0.95), 16, -hgt * 0.36);
  } else {
    ctx.moveTo(x0 + len * 0.25, -hgt * 0.38);
    ctx.quadraticCurveTo(x0 + len * 0.42, -hgt * (o.pred ? 1.05 : 0.85), x0 + len * 0.72, -hgt * 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Bauchflosse
  if (form !== 2) {
    ctx.beginPath();
    ctx.moveTo(-6, hgt * 0.4);
    ctx.quadraticCurveTo(-12, hgt * 0.8, -20, hgt * 0.62);
    ctx.lineTo(-14, hgt * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Körper
  const body = new Path2D();
  body.moveTo(x1, 0);
  body.bezierCurveTo(x1 - 6, -hgt * 0.62, x0 + 12, -hgt * 0.62, x0 + 4, 0);
  body.bezierCurveTo(x0 + 12, hgt * 0.62, x1 - 6, hgt * 0.62, x1, 0);
  body.closePath();
  ctx.fillStyle = col.body;
  ctx.fill(body);
  patternOn(ctx, o.pattern, col, body, [x0, -hgt / 2, x1, hgt / 2], o.hs);
  ctx.stroke(body);
  // Kiemen und Brustflosse
  ctx.strokeStyle = col.dark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x1 - 18, 0, hgt * 0.32, -1.1, 1.1);
  ctx.stroke();
  ctx.fillStyle = col.light;
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1 - 22, hgt * 0.12);
  ctx.quadraticCurveTo(x1 - 34, hgt * 0.45, x1 - 40, hgt * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Maul
  if (o.pred) {
    ctx.fillStyle = '#3a1418';
    ctx.beginPath();
    ctx.moveTo(x1 + 1, 0);
    ctx.lineTo(x1 - 14, -2);
    ctx.lineTo(x1 - 14, 7);
    ctx.closePath();
    ctx.fill();
    teeth(ctx, x1 - 13, -2, x1, 0, 3, true);
    teeth(ctx, x1 - 13, 7, x1, 1, 3, false);
  } else {
    ctx.beginPath();
    ctx.moveTo(x1 - 1, 2);
    ctx.lineTo(x1 - 7, 3);
    ctx.stroke();
  }
  eye(ctx, x1 - 12, -hgt * 0.15, 3.2 + g[SENSE] * 5, col);
}

function wal(ctx, g, col, o) {
  const len = 86;
  const hgt = 34;
  const x0 = -len / 2;
  const x1 = len / 2;
  // Fluke
  ctx.fillStyle = col.dark;
  ctx.beginPath();
  ctx.moveTo(x0 + 6, -2);
  ctx.quadraticCurveTo(x0 - 6, -20, x0 - 16, -22);
  ctx.quadraticCurveTo(x0 - 8, -6, x0 - 2, 2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  const body = new Path2D();
  body.moveTo(x1, 2);
  body.bezierCurveTo(x1, -hgt * 0.75, x0 + 18, -hgt * 0.4, x0 + 2, 0);
  body.bezierCurveTo(x0 + 18, hgt * 0.45, x1 - 4, hgt * 0.7, x1, 2);
  body.closePath();
  ctx.fillStyle = col.body;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = col.light;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x0, 6, len, hgt);
  if (o.pred) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#f4f2ea';
    ctx.beginPath();
    ctx.ellipse(x1 - 18, -4, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.stroke(body);
  // Flosse
  ctx.fillStyle = col.dark;
  ctx.beginPath();
  ctx.moveTo(x1 - 26, 8);
  ctx.quadraticCurveTo(x1 - 34, 22, x1 - 42, 20);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (o.pred) teeth(ctx, x1 - 18, 6, x1 - 1, 4, 4, true);
  else {
    ctx.strokeStyle = col.dark;
    ctx.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(x1 - 22 + k * 4, 8);
      ctx.lineTo(x1 - 24 + k * 4, 14);
      ctx.stroke();
    }
  }
  eye(ctx, x1 - 18, -2, 3 + g[SENSE] * 3, col);
}

function legs(ctx, pts, len, thick, col) {
  ctx.strokeStyle = col.line;
  ctx.lineWidth = thick + 2.6;
  for (const [x, y, k] of pts) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + k * 3, y + len * 0.55);
    ctx.lineTo(x + k, y + len);
    ctx.stroke();
  }
  ctx.strokeStyle = col.dark;
  ctx.lineWidth = thick;
  for (const [x, y, k] of pts) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + k * 3, y + len * 0.55);
    ctx.lineTo(x + k, y + len);
    ctx.stroke();
  }
}

function amphibie(ctx, g, col, o) {
  const len = 70;
  const x0 = -len / 2;
  const x1 = len / 2;
  // Schwanz
  ctx.fillStyle = col.body;
  ctx.beginPath();
  ctx.moveTo(x0 + 14, 6);
  ctx.quadraticCurveTo(x0 - 6, 10, x0 - 18, 0);
  ctx.quadraticCurveTo(x0 - 4, 2, x0 + 14, -4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  legs(ctx, [[x0 + 18, 8, -4], [x0 + 26, 8, 4], [x1 - 22, 8, -4], [x1 - 14, 8, 4]], 16, 5, col);
  const body = new Path2D();
  body.ellipse(-2, 2, len * 0.42, 11, 0, 0, Math.PI * 2);
  ctx.fillStyle = col.body;
  ctx.fill(body);
  patternOn(ctx, o.pattern || 2, col, body, [x0, -10, x1, 14], o.hs);
  ctx.stroke(body);
  // Kopf
  const snout = o.pred ? 24 : 14;
  ctx.fillStyle = col.body;
  ctx.beginPath();
  ctx.moveTo(x1 - 8, -6);
  ctx.quadraticCurveTo(x1 + snout * 0.6, -8, x1 + snout, 2);
  ctx.quadraticCurveTo(x1 + snout * 0.5, 10, x1 - 8, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (o.pred) teeth(ctx, x1 + 2, 3, x1 + snout - 2, 2.5, 4, true);
  eye(ctx, x1 + 2, -6, 3 + g[SENSE] * 3.5, col);
}

function insekt(ctx, g, col, o) {
  const legLen = 16 + g[SPEED] * 10;
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2.4;
  for (const [x, k] of [[-12, -1], [0, 0], [12, 1]]) {
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x + k * 6 - 6, 4 + legLen * 0.5);
    ctx.lineTo(x + k * 8 - 4, 4 + legLen);
    ctx.stroke();
  }
  // Flügel
  if (g[SPEED] > 0.55) {
    ctx.fillStyle = 'rgba(220,235,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-6, -16, 22, 9, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.lineWidth = 2.6;
  ctx.fillStyle = col.dark;
  ctx.beginPath();
  ctx.ellipse(-20, 0, 18, 12, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = col.body;
  ctx.beginPath();
  ctx.ellipse(2, -1, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(18, -2, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (o.pattern) {
    ctx.strokeStyle = col.light;
    ctx.lineWidth = 2;
    for (let k = -30; k < -8; k += 6) {
      ctx.beginPath();
      ctx.moveTo(k, -9);
      ctx.lineTo(k + 2, 9);
      ctx.stroke();
    }
  }
  // Fühler
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 1.8;
  const ant = 10 + g[SENSE] * 16;
  ctx.beginPath();
  ctx.moveTo(22, -7);
  ctx.quadraticCurveTo(28, -7 - ant, 34, -6 - ant);
  ctx.stroke();
  if (o.pred) {
    ctx.beginPath();
    ctx.moveTo(25, 2);
    ctx.quadraticCurveTo(32, 2, 30, 8);
    ctx.stroke();
  }
  eye(ctx, 21, -3, 2.5 + g[SENSE] * 2, col);
}

function vierbeiner(ctx, g, col, o) {
  const s = g[SIZE];
  const big = s > 0.62;
  const huge = s > 0.84;
  const sp = g[SPEED];
  const len = 52 + s * 16;
  const hgt = (20 + s * 12) * (1.15 - 0.3 * sp);
  const legLen = 16 + sp * 12 + (o.pred ? 2 : 0) - (huge ? 2 : 0);
  const thick = 4 + s * 7;
  const x0 = -len / 2;
  const x1 = len / 2;
  const by = 2 - legLen * 0.25;
  // Schwanz
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(x0 + 4, by - 2);
  ctx.quadraticCurveTo(x0 - 12, by - (o.pred ? 4 : -2), x0 - 16, by + 10);
  ctx.stroke();
  ctx.strokeStyle = col.dark;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  // Beine (hinten dunkler)
  legs(ctx, [[x0 + 10, by + hgt * 0.25, -2], [x1 - 10, by + hgt * 0.25, -2]], legLen, thick, col);
  // Körper
  const body = new Path2D();
  body.ellipse(0, by, len / 2, hgt / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = col.body;
  ctx.fill(body);
  patternOn(ctx, o.pattern, col, body, [x0, by - hgt / 2, x1, by + hgt / 2], o.hs);
  if (o.cold) fur(ctx, body, len / 2, hgt / 2, 0, by, col);
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2.6;
  ctx.stroke(body);
  legs(ctx, [[x0 + 16, by + hgt * 0.3, 2], [x1 - 14, by + hgt * 0.3, 2]], legLen, thick, col);
  // Hals und Kopf
  const longNeck = big && !o.pred && o.hs % 3 === 0;
  const nx = x1 - 4;
  const ny = longNeck ? by - hgt * 1.4 : by - hgt * 0.35;
  ctx.strokeStyle = col.line;
  ctx.lineWidth = (longNeck ? 9 : 12) + s * 6 + 2.6;
  ctx.beginPath();
  ctx.moveTo(x1 - 12, by - 2);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  ctx.strokeStyle = col.body;
  ctx.lineWidth = (longNeck ? 9 : 12) + s * 6;
  ctx.stroke();
  const hr = 9 + s * 5;
  ctx.fillStyle = col.body;
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2.6;
  // Ohren
  ctx.beginPath();
  if (o.pred) {
    ctx.moveTo(nx - 4, ny - hr * 0.6);
    ctx.lineTo(nx - 1, ny - hr * 1.6);
    ctx.lineTo(nx + 4, ny - hr * 0.7);
  } else {
    ctx.ellipse(nx - 3, ny - hr * 0.9, hr * 0.35, hr * 0.55, -0.4, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  // Hörner
  if (!o.pred && big && o.hs % 2 === 1) {
    ctx.strokeStyle = '#e9e1c8';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(nx + 2, ny - hr * 0.7);
    ctx.quadraticCurveTo(nx + 6, ny - hr * 1.9, nx + 14, ny - hr * 1.7);
    ctx.stroke();
    ctx.strokeStyle = col.line;
    ctx.lineWidth = 2.6;
  }
  const head = new Path2D();
  if (o.pred) {
    head.moveTo(nx - hr * 0.8, ny - hr * 0.6);
    head.quadraticCurveTo(nx + hr * 1.2, ny - hr * 0.9, nx + hr * 2, ny + hr * 0.1);
    head.lineTo(nx + hr * 1.9, ny + hr * 0.5);
    head.quadraticCurveTo(nx + hr * 0.4, ny + hr * 1.1, nx - hr * 0.8, ny + hr * 0.6);
    head.closePath();
  } else {
    head.ellipse(nx + hr * 0.6, ny, hr * 1.25, hr * 0.85, 0.15, 0, Math.PI * 2);
  }
  ctx.fillStyle = col.body;
  ctx.fill(head);
  if (o.cold) fur(ctx, head, hr * 1.1, hr * 0.8, nx + hr * 0.5, ny, col);
  ctx.stroke(head);
  // Rüssel bei Riesen
  if (huge && !o.pred && o.hs % 3 !== 0) {
    ctx.strokeStyle = col.line;
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(nx + hr * 1.6, ny + 2);
    ctx.quadraticCurveTo(nx + hr * 2.3, ny + hr * 1.6, nx + hr * 1.7, ny + hr * 2.6);
    ctx.stroke();
    ctx.strokeStyle = col.body;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  if (o.pred) {
    ctx.fillStyle = '#3a1418';
    ctx.beginPath();
    ctx.moveTo(nx + hr * 0.4, ny + hr * 0.35);
    ctx.lineTo(nx + hr * 1.95, ny + hr * 0.3);
    ctx.lineTo(nx + hr * 1.8, ny + hr * 0.62);
    ctx.closePath();
    ctx.fill();
    teeth(ctx, nx + hr * 0.6, ny + hr * 0.33, nx + hr * 1.9, ny + hr * 0.31, 4, true);
  } else {
    ctx.fillStyle = col.dark;
    ctx.beginPath();
    ctx.arc(nx + hr * 1.65, ny + hr * 0.05, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  eye(ctx, nx + hr * 0.75, ny - hr * 0.25, 2.6 + g[SENSE] * 3.2, col);
}

function denker(ctx, g, col, o) {
  // aufrecht, zwei Beine, Werkzeug in der Hand
  const skin = col.body;
  ctx.strokeStyle = col.line;
  // Speer
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = '#6b4f2c';
  ctx.beginPath();
  ctx.moveTo(18, 38);
  ctx.lineTo(26, -40);
  ctx.stroke();
  ctx.fillStyle = '#b9b2a2';
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(26, -40);
  ctx.lineTo(23, -32);
  ctx.lineTo(29, -32);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Beine
  ctx.lineWidth = 7;
  ctx.strokeStyle = col.dark;
  ctx.beginPath();
  ctx.moveTo(-4, 10);
  ctx.lineTo(-7, 36);
  ctx.moveTo(4, 10);
  ctx.lineTo(8, 36);
  ctx.stroke();
  // Körper mit Umhang (Kälte) oder schlicht
  const torso = new Path2D();
  torso.moveTo(-11, -14);
  torso.quadraticCurveTo(0, -20, 11, -14);
  torso.lineTo(9, 14);
  torso.quadraticCurveTo(0, 18, -9, 14);
  torso.closePath();
  ctx.fillStyle = o.cold ? col.dark : skin;
  ctx.fill(torso);
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2.4;
  ctx.stroke(torso);
  // Arme
  ctx.lineWidth = 5;
  ctx.strokeStyle = skin;
  ctx.beginPath();
  ctx.moveTo(10, -10);
  ctx.lineTo(20, 2);
  ctx.moveTo(-10, -10);
  ctx.lineTo(-16, 8);
  ctx.stroke();
  // Kopf
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(1, -27, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = col.line;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  // Haare / Schmuck
  ctx.fillStyle = col.accent;
  ctx.beginPath();
  ctx.arc(-1, -33, 7, Math.PI, Math.PI * 2);
  ctx.fill();
  eye(ctx, 5, -28, 2.2 + g[SENSE] * 1.4, col);
}

// Kleines Bild einer Art als Canvas (für Listen und Infoblätter)
export function portrait(sp, px = 96, dpr = 2) {
  const c = document.createElement('canvas');
  c.width = px * dpr;
  c.height = px * dpr;
  c.style.width = `${px}px`;
  c.style.height = `${px}px`;
  const ctx = c.getContext('2d');
  drawCreature(ctx, (px * dpr) / 2, (px * dpr) / 2, px * dpr * 0.92, sp);
  return c;
}
