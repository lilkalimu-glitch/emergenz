// Effekte über dem Planeten (Canvas 2D): Einschläge, Ringe bei Eingriffen, Markierung der Auswahl.

export class Effects {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.list = [];
    this.clean = true;
    this.dpr = 1;
  }

  resize(w, h, dpr) {
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.clean = false;
  }

  add(e) {
    this.list.push(e);
  }

  // mark: { x, y, r } Auswahl in Weltkoordinaten (oder null)
  draw(cam, now, mark) {
    const ctx = this.ctx;
    this.list = this.list.filter((e) => now - e.t0 < (e.dur || 2200));
    if (!this.list.length && !mark) {
      if (!this.clean) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.clean = true;
      }
      return;
    }
    this.clean = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const p = [0, 0, 0];
    const scale = cam.pxPerCell();
    for (const e of this.list) {
      if (!cam.project(e.x, e.y, p)) continue;
      const t = (now - e.t0) / (e.dur || 2200);
      if (e.kind === 'impact') {
        const r0 = Math.max(6, [2, 4.5, 9][e.size - 1] * scale);
        if (t < 0.14) {
          const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r0 * 1.4);
          g.addColorStop(0, `rgba(255,248,225,${0.95 * (1 - t / 0.14)})`);
          g.addColorStop(0.45, `rgba(255,180,110,${0.7 * (1 - t / 0.14)})`);
          g.addColorStop(1, 'rgba(255,120,60,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p[0], p[1], r0 * 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = `rgba(255,140,90,${0.9 * (1 - t)})`;
        ctx.lineWidth = 2.5 * (1 - t) + 0.5;
        ctx.beginPath();
        ctx.arc(p[0], p[1], r0 * (0.6 + t * 2.2), 0, Math.PI * 2);
        ctx.stroke();
        if (t < 0.6) {
          ctx.strokeStyle = `rgba(255,214,150,${0.5 * (1 - t / 0.6)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p[0], p[1], r0 * (0.4 + t * 3.4), 0, Math.PI * 2);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = `rgba(${e.color},${0.85 * (1 - t)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p[0], p[1], Math.max(8, 7 * scale) * (0.3 + t), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (mark && cam.project(mark.x, mark.y, p)) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 260);
      const r = (mark.r || 11) + 2 * pulse;
      ctx.strokeStyle = `rgba(245,198,106,${0.55 + 0.4 * pulse})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(5,9,19,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r + 1.8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
