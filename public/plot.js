// The rarity plot: the crowd clusters at the origin, rarer answers land on rings further out.
export const TIER_COLORS = ['#a7b3c2', '#7d8ea5', '#3f7cc4', '#1f9a8c', '#d98a0b', '#e0337a'];
const RING = [0.1, 0.24, 0.42, 0.6, 0.78, 0.95];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Plot {
  constructor(canvas, { tierNames = [], crowd = 40, seed = 7, labels = true, slots = 6, stretch = false } = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.tierNames = tierNames; this.labels = labels; this.slots = Math.max(1, slots); this.stretch = stretch;
    this.points = []; this.anim = null; this.seed = seed;
    this.setCrowd(crowd);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
  }
  destroy() { this.ro.disconnect(); cancelAnimationFrame(this.raf); }
  setCrowd(n) {
    const r = seeded(this.seed);
    this.crowd = Array.from({ length: Math.min(n, 400) }, () => {
      const g = Math.sqrt(-2 * Math.log(r() + 1e-9)) * 0.5;
      return { d: Math.abs(g) * RING[1] * 0.9, a: r() * Math.PI / 2, s: 1.6 + r() * 1.6 };
    });
    this.draw();
  }
  angleFor(i) {
    const r = seeded(this.seed * 31 + i * 97 + 3), n = this.slots;
    return (0.1 + 0.8 * ((i % n) + 0.5) / n + (r() - 0.5) * 0.25 / n) * Math.PI / 2;
  }
  placeFor(tier, i) {
    if (!tier) return { d: RING[0] * 0.8, a: this.angleFor(i) };
    const inner = RING[tier], outer = RING[tier + 1] ?? RING[tier] + 0.04;
    return { d: inner + (outer - inner) * 0.5, a: this.angleFor(i) };
  }
  setPoints(points) {
    this.points = points.map((p, i) => ({ ...p, ...this.placeFor(p.tier, p.i ?? i), t: 1 }));
    this.draw();
  }
  /** Animate a new point flying out of the crowd. */
  launch(tier, i, label) {
    const target = this.placeFor(tier, i);
    const p = { tier, label, i, ...target, t: reduced() ? 1 : 0 };
    this.points.push(p);
    if (p.t === 1) return this.draw();
    const start = performance.now(), dur = 900;
    const step = now => {
      p.t = Math.min(1, (now - start) / dur);
      this.draw();
      if (p.t < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  resize() {
    const dpr = window.devicePixelRatio || 1, rect = this.c.getBoundingClientRect();
    if (!rect.width) return;
    this.c.width = Math.round(rect.width * dpr); this.c.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = rect.width; this.h = rect.height;
    this.draw();
  }
  draw() {
    const { ctx, w, h } = this;
    if (!w) return;
    ctx.clearRect(0, 0, w, h);
    const pad = 18, ox = pad, oy = h - pad;
    const R = Math.min(w - pad * 2, h - pad * 2) / RING[5] * 0.98;
    const Rx = this.stretch ? (w - pad * 2) / RING[5] * 0.98 : R, Ry = R;
    const xy = (d, a) => [ox + Math.cos(a) * d * Rx, oy - Math.sin(a) * d * Ry];
    // contour rings
    ctx.lineWidth = 1;
    for (let t = 1; t <= 5; t++) {
      ctx.strokeStyle = t === 5 ? 'rgba(224,51,122,.45)' : 'rgba(27,42,65,.16)';
      ctx.setLineDash(t === 5 ? [] : [3, 4]);
      ctx.beginPath(); ctx.ellipse(ox, oy, RING[t] * Rx, RING[t] * Ry, 0, -Math.PI / 2, 0); ctx.stroke();
    }
    ctx.setLineDash([]);
    // axes
    ctx.strokeStyle = 'rgba(27,42,65,.55)'; ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(ox, pad * 0.4); ctx.lineTo(ox, oy); ctx.lineTo(w - pad * 0.4, oy); ctx.stroke();
    if (this.labels && w > 300) {
      ctx.font = '500 11px "Bricolage Grotesque", system-ui, sans-serif';
      ctx.textBaseline = 'bottom';
      let lastRight = ox + RING[0] * Rx;
      for (let t = 1; t <= 5; t++) {
        const label = this.tierNames[t - 1] || '', half = ctx.measureText(label).width / 2;
        const x = ox + (RING[t - 1] + RING[t]) / 2 * Rx;
        if (x - half < lastRight + 6 || x + half > w - 4) continue; // no room: skip rather than overlap
        ctx.fillStyle = TIER_COLORS[t];
        ctx.textAlign = 'center';
        ctx.fillText(label, x, oy - 4);
        lastRight = x + half;
      }
    }
    // crowd
    ctx.fillStyle = 'rgba(122,140,163,.55)';
    for (const p of this.crowd) { const [x, y] = xy(p.d, p.a); ctx.beginPath(); ctx.arc(x, y, p.s, 0, Math.PI * 2); ctx.fill(); }
    // player points
    const boxes = [];
    for (const p of this.points) {
      const e = 1 - Math.pow(1 - p.t, 3);
      const d = RING[0] * 0.6 + (p.d - RING[0] * 0.6) * e;
      const [x, y] = xy(d, p.a);
      const col = TIER_COLORS[p.tier] || TIER_COLORS[0];
      if (p.t < 1) {
        const [sx, sy] = xy(RING[0] * 0.6, p.a);
        ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (p.tier) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, p.tier === 5 ? 8 : 6.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        ctx.strokeStyle = TIER_COLORS[1]; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      }
      if (p.label && p.t === 1 && this.labels) {
        ctx.font = '600 12px "Bricolage Grotesque", system-ui, sans-serif';
        ctx.fillStyle = '#1b2a41'; ctx.textBaseline = 'middle';
        const right = x < w - 120, tw = ctx.measureText(p.label).width;
        let ly = y;
        const lx = right ? x + 12 : x - 12 - tw;
        for (let k = 0; k < 4 && boxes.some(b => lx < b[0] + b[2] && lx + tw > b[0] && Math.abs(ly - b[1]) < 14); k++) ly += 14;
        boxes.push([lx, ly, tw]);
        ctx.textAlign = 'left';
        ctx.fillText(p.label, lx, ly);
      }
    }
  }
}
