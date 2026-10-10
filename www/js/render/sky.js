// Sternenhimmel als Hintergrund, einmal pro Bildschirmgröße gezeichnet.
import { RNG } from '../sim/rng.js';

export function drawSky(canvas, w, h, dpr) {
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, '#060b18');
  g.addColorStop(0.55, '#050913');
  g.addColorStop(1, '#03060d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // schwaches Band der Milchstraße
  ctx.save();
  ctx.translate(w * 0.5, h * 0.42);
  ctx.rotate(-0.55);
  const band = ctx.createLinearGradient(0, -h * 0.18, 0, h * 0.18);
  band.addColorStop(0, 'rgba(90,110,170,0)');
  band.addColorStop(0.5, 'rgba(90,110,170,0.07)');
  band.addColorStop(1, 'rgba(90,110,170,0)');
  ctx.fillStyle = band;
  ctx.fillRect(-w * 1.2, -h * 0.18, w * 2.4, h * 0.36);
  ctx.restore();
  const rng = new RNG(20261010);
  const count = Math.round((w * h) / 900);
  for (let k = 0; k < count; k++) {
    const x = rng.next() * w;
    const y = rng.next() * h;
    const m = rng.next();
    const r = m > 0.985 ? 1.3 : m > 0.9 ? 0.85 : 0.5;
    const a = m > 0.985 ? 0.95 : 0.25 + rng.next() * 0.45;
    const warm = rng.next();
    ctx.fillStyle = warm > 0.85 ? `rgba(255,214,170,${a})` : warm < 0.2 ? `rgba(170,200,255,${a})` : `rgba(235,240,255,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
