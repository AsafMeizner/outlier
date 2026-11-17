// The office-chair launch scene. Everything is drawn in code: no image files, works fully offline.
// World units are "scene pixels": ground at y = 0, up is negative y. The camera follows the character.

const INK = '#1d2340';
export const TIER_COLORS = ['#94a3b8', '#94a3b8', '#22c55e', '#3b82f6', '#a855f7', '#ff8a00'];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- deterministic randomness ----------
export function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// ---------- the worker's look, from their username ----------
const SKIN = ['#f9d7b5', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const HAIR = ['#2b1d14', '#4a2f1b', '#7a4b26', '#d6a756', '#a33b20', '#1d2340', '#9aa0a6'];
const SHIRT = ['#ff4d5e', '#2ec4b6', '#ffc43d', '#7b5cff', '#3b82f6', '#ff8fab', '#22c55e', '#f97316'];
export function lookFor(seed) {
  const r = rng(hash(seed));
  const pick = a => a[Math.floor(r() * a.length)];
  return { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), style: Math.floor(r() * 4), glasses: r() < 0.4, tie: r() < 0.55, tieColor: pick(['#1d2340', '#ff4d5e', '#ffc43d', '#2ec4b6']) };
}

// ---------- sound (synthesised with Web Audio) ----------
class Sfx {
  constructor() { this.muted = localStorage.getItem('outlier.muted') === '1'; this.ctx = null; }
  setMuted(m) { this.muted = m; localStorage.setItem('outlier.muted', m ? '1' : '0'); }
  ac() {
    if (this.muted) return null;
    if (!this.ctx) { try { this.ctx = new AudioContext(); } catch { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  noise(ac, dur) {
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = b; return s;
  }
  env(ac, node, t0, a, peak, d) {
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); node.connect(g); g.connect(ac.destination); return g;
  }
  tone(type, f0, f1, dur, peak = 0.2, delay = 0) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(ac, o, t, 0.01, peak, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  filtered(type, f0, f1, dur, peak, q = 1, delay = 0) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + delay, n = this.noise(ac, dur + 0.1), f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    n.connect(f); this.env(ac, f, t, 0.02, peak, dur); n.start(t); n.stop(t + dur + 0.1);
  }
  whoosh(dur = 0.8) { this.filtered('bandpass', 300, 2400, dur, 0.5, 2); }
  crash() { this.filtered('highpass', 2500, 6000, 0.5, 0.45); for (let i = 0; i < 6; i++) this.tone('sine', 2200 + Math.random() * 3000, 1800 + Math.random() * 2000, 0.25, 0.06, i * 0.04); }
  thud() { this.tone('sine', 140, 40, 0.3, 0.6); this.filtered('lowpass', 600, 120, 0.25, 0.4); }
  splash() { this.filtered('lowpass', 2500, 300, 0.8, 0.5); this.tone('sine', 600, 200, 0.2, 0.08, 0.05); }
  bonk() { this.tone('square', 330, 160, 0.12, 0.12); this.tone('sine', 900, 500, 0.15, 0.1, 0.02); }
  fanfare(tier) {
    const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, tier + 1);
    notes.forEach((f, i) => this.tone('triangle', f, f, 0.16, 0.18, i * 0.085));
    if (tier >= 5) [1047, 1319, 1568, 2093].forEach(f => this.tone('triangle', f, f, 0.9, 0.08, notes.length * 0.085 + 0.05));
  }
  buzz() { this.tone('square', 160, 120, 0.22, 0.12); this.tone('square', 107, 90, 0.22, 0.08); }
  tick(hot) { this.tone('square', hot ? 1600 : 1100, hot ? 1600 : 1100, 0.025, 0.05); }
  sad() { [392, 370, 349].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.3, 0.08, i * 0.32)); this.tone('sawtooth', 330, 300, 0.7, 0.08, 0.96); }
  pop() { this.tone('sine', 500, 900, 0.08, 0.12); }
  ring() { for (let i = 0; i < 8; i++) this.tone('square', 1800, 1800, 0.04, 0.05, i * 0.07); }
}
export const sfx = new Sfx();

// ---------- world layout ----------
export const ZONES = [
  { id: 'office', from: -760, to: 700 }, { id: 'lot', from: 700, to: 2600 }, { id: 'city', from: 2600, to: 5600 },
  { id: 'park', from: 5600, to: 8200 }, { id: 'beach', from: 8200, to: 9300 }, { id: 'sea', from: 9300, to: 16000 },
];
const MOON = { x: 11650, y: -6600, r: 380 };
const LANDING = [
  { x: 120, y: 0 }, // miss: stays at the desk
  { x: 470, y: 0 }, // Mainstream: rolls into the water cooler
  { x: 1890, y: -62 }, // Familiar: car roof in the parking lot
  { x: 4235, y: -168 }, // Uncommon: café awning in the city
  { x: 10150, y: 58 }, // Rare: splash into the sea (chair under water)
  { x: MOON.x, y: MOON.y - MOON.r }, // Outlier: the Moon
];
const DESK_X = 60;
const FLIGHT_MS = [0, 1300, 1900, 2400, 2900, 4300];
const APEX = [0, 30, 520, 900, 1500, 0];

const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function path(tier, t) {
  const s = { x: DESK_X, y: 0 }, e = LANDING[tier];
  if (tier === 1) return { x: lerp(s.x, e.x, easeOut(t)), y: -Math.abs(Math.sin(t * Math.PI * 3)) * 18 * (1 - t) };
  if (tier === 5) {
    // up through the window, then a long climb that curves onto the Moon
    const k = easeInOut(t);
    const x = lerp(s.x, e.x, k);
    const y = lerp(s.y, e.y, Math.pow(k, 1.6)) - Math.sin(k * Math.PI) * 900;
    return { x, y };
  }
  const k = easeOut(t);
  return { x: lerp(s.x, e.x, k), y: lerp(s.y, e.y, k) - APEX[tier] * 4 * k * (1 - k) };
}

// ---------- drawing primitives ----------
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function fillStroke(ctx, fill, lw = 3) { ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); } }
function circle(ctx, x, y, r, fill, lw = 3) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fillStroke(ctx, fill, lw); }

export function drawWorker(ctx, look, pose = {}) {
  const { arm = 0, legs = 0, mouth = 'smile', blink = false, headShake = 0, spinWheels = 0 } = pose;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // chair base and wheels
  ctx.strokeStyle = INK; ctx.lineWidth = 3;
  rr(ctx, -34, -14, 68, 8, 4); fillStroke(ctx, '#3a3f58');
  for (const wx of [-30, 0, 30]) {
    circle(ctx, wx, -6, 6.5, '#2b2f45');
    ctx.beginPath(); ctx.moveTo(wx, -6); ctx.lineTo(wx + Math.cos(spinWheels) * 5, -6 + Math.sin(spinWheels) * 5); ctx.strokeStyle = '#8a91b4'; ctx.lineWidth = 2; ctx.stroke();
  }
  rr(ctx, -4, -52, 8, 40, 3); fillStroke(ctx, '#8a91b4');
  // backrest
  rr(ctx, -46, -138, 16, 82, 8); fillStroke(ctx, '#3a3f58');
  rr(ctx, -34, -66, 6, 16, 2); fillStroke(ctx, '#3a3f58');
  // legs
  ctx.lineWidth = 13; ctx.strokeStyle = INK;
  const knee = { x: 26, y: -66 - legs * 10 }, foot = { x: 34 + legs * 18, y: -24 - legs * 26 };
  ctx.beginPath(); ctx.moveTo(-8, -64); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
  ctx.lineWidth = 9; ctx.strokeStyle = '#41476b';
  ctx.beginPath(); ctx.moveTo(-8, -64); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(foot.x + 6, foot.y + 2, 11, 6, legs * 0.6, 0, Math.PI * 2); fillStroke(ctx, '#2b2f45');
  // seat
  rr(ctx, -36, -70, 72, 14, 7); fillStroke(ctx, '#4b5275');
  // torso
  rr(ctx, -26, -132, 38, 70, 14); fillStroke(ctx, look.shirt);
  if (look.tie) {
    ctx.beginPath(); ctx.moveTo(-7, -126); ctx.lineTo(-1, -126); ctx.lineTo(1, -96); ctx.lineTo(-4, -88); ctx.lineTo(-9, -96); ctx.closePath(); fillStroke(ctx, look.tieColor, 2);
  }
  // arm (shoulder -> elbow -> hand), swings with `arm` in radians
  const sh = { x: -6, y: -118 };
  const a1 = 0.9 + arm, a2 = a1 - 0.9 - arm * 0.6;
  const el = { x: sh.x + Math.cos(a1) * 30, y: sh.y + Math.sin(a1) * 30 };
  const hd = { x: el.x + Math.cos(a2) * 28, y: el.y + Math.sin(a2) * 28 };
  ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x, el.y); ctx.lineTo(hd.x, hd.y); ctx.stroke();
  ctx.lineWidth = 8; ctx.strokeStyle = look.shirt; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x, el.y); ctx.lineTo(hd.x, hd.y); ctx.stroke();
  circle(ctx, hd.x, hd.y, 6.5, look.skin, 2.5);
  // head
  ctx.save(); ctx.translate(-4 + headShake, -158);
  circle(ctx, 0, 0, 25, look.skin);
  ctx.fillStyle = look.hair; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  if (look.style === 0) { ctx.beginPath(); ctx.arc(0, -2, 25, Math.PI * 1.05, Math.PI * 2.02); ctx.lineTo(18, -8); ctx.quadraticCurveTo(0, -14, -22, -6); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else if (look.style === 1) { ctx.beginPath(); for (let i = 0; i <= 6; i++) { const ang = Math.PI * (1.0 + i / 6); const rad = i % 2 ? 36 : 25; ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad - 2); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else if (look.style === 2) { ctx.beginPath(); ctx.arc(0, -2, 26, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(-26, 10, 9, 20, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(0, 4, 25, Math.PI * 0.15, Math.PI * 0.85); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  // face (looks right, toward the window)
  if (blink) { ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(11, 0); ctx.moveTo(15, 0); ctx.lineTo(22, 0); ctx.stroke(); }
  else { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(8, 0, 3.2, 0, Math.PI * 2); ctx.arc(18, 0, 3.2, 0, Math.PI * 2); ctx.fill(); }
  if (look.glasses) { ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(8, 0, 6.5, 0, Math.PI * 2); ctx.moveTo(24.5, 0); ctx.arc(18, 0, 6.5, 0, Math.PI * 2); ctx.moveTo(1.5, 0); ctx.lineTo(-8, -3); ctx.stroke(); }
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.beginPath();
  if (mouth === 'o') { ctx.fillStyle = '#7a1f2b'; ctx.ellipse(14, 12, 5, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  else if (mouth === 'sad') { ctx.arc(14, 17, 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  else if (mouth === 'grin') { ctx.fillStyle = '#fff'; ctx.moveTo(6, 9); ctx.quadraticCurveTo(14, 20, 23, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else { ctx.arc(14, 8, 6.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,120,120,.35)'; ctx.beginPath(); ctx.arc(22, 8, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** A small round avatar (head only) for leaderboards. */
export function drawAvatar(canvas, seed, size = 36) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr; canvas.height = size * dpr; canvas.style.width = canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d'), look = lookFor(seed);
  ctx.setTransform(dpr * size / 80, 0, 0, dpr * size / 80, 0, 0);
  ctx.fillStyle = look.shirt; ctx.beginPath(); ctx.arc(40, 40, 39, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(40, 40, 38, 0, Math.PI * 2); ctx.clip();
  ctx.translate(36, 210); drawWorker(ctx, look, {});
  ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(40, 40, 38, 0, Math.PI * 2); ctx.stroke();
}

// ---------- props ----------
function car(ctx, x, color, t = 0, flash = 0) {
  ctx.save(); ctx.translate(x, 0);
  rr(ctx, -70, -50, 140, 34, 12); fillStroke(ctx, color);
  ctx.beginPath(); ctx.moveTo(-40, -50); ctx.lineTo(-24, -78); ctx.lineTo(30, -78); ctx.lineTo(48, -50); ctx.closePath(); fillStroke(ctx, color);
  ctx.beginPath(); ctx.moveTo(-30, -52); ctx.lineTo(-19, -72); ctx.lineTo(0, -72); ctx.lineTo(0, -52); ctx.closePath(); fillStroke(ctx, '#bfe8ff', 2);
  ctx.beginPath(); ctx.moveTo(6, -52); ctx.lineTo(6, -72); ctx.lineTo(27, -72); ctx.lineTo(40, -52); ctx.closePath(); fillStroke(ctx, '#bfe8ff', 2);
  circle(ctx, -40, -14, 15, '#2b2f45'); circle(ctx, -40, -14, 6, '#c9cde0', 2);
  circle(ctx, 42, -14, 15, '#2b2f45'); circle(ctx, 42, -14, 6, '#c9cde0', 2);
  if (flash) { ctx.fillStyle = (Math.floor(t / 180) % 2) ? '#ffc43d' : '#ff4d5e'; ctx.beginPath(); ctx.arc(66, -38, 7, 0, Math.PI * 2); ctx.arc(-66, -38, 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
function tree(ctx, x, s = 1, c = '#5bbf62') {
  ctx.save(); ctx.translate(x, 0); ctx.scale(s, s);
  rr(ctx, -8, -70, 16, 70, 4); fillStroke(ctx, '#8b5e3c');
  circle(ctx, 0, -100, 44, c); circle(ctx, -28, -78, 28, c); circle(ctx, 30, -80, 30, c);
  ctx.restore();
}
function palm(ctx, x, t) {
  ctx.save(); ctx.translate(x, 0);
  ctx.lineWidth = 14; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(20, -90, 10, -190); ctx.stroke();
  ctx.lineWidth = 9; ctx.strokeStyle = '#b07a46'; ctx.stroke();
  const sway = Math.sin(t / 700) * 0.08;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55 + sway;
    ctx.beginPath(); ctx.moveTo(10, -190);
    ctx.quadraticCurveTo(10 + Math.cos(a) * 60, -190 + Math.sin(a) * 60 - 20, 10 + Math.cos(a) * 95, -190 + Math.sin(a) * 95 + 25);
    ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 11; ctx.strokeStyle = '#3fae5a'; ctx.stroke();
  }
  ctx.restore();
}
function building(ctx, x, w, h, color, seed) {
  const r = rng(seed);
  rr(ctx, x, -h, w, h, 4); fillStroke(ctx, color);
  for (let yy = -h + 24; yy < -40; yy += 42) for (let xx = x + 16; xx < x + w - 24; xx += 34) {
    rr(ctx, xx, yy, 20, 26, 3); fillStroke(ctx, r() < 0.3 ? '#ffe28a' : '#bfe8ff', 2);
  }
  rr(ctx, x + w / 2 - 18, -44, 36, 44, 3); fillStroke(ctx, '#41476b', 2);
}

// ---------- particles ----------
class Particles {
  constructor() { this.list = []; }
  add(p) { this.list.push({ vx: 0, vy: 0, g: 0, life: 1000, age: 0, rot: 0, vr: 0, size: 8, ...p }); }
  burst(n, f) { for (let i = 0; i < n; i++) this.add(f(i)); }
  step(dt) {
    for (const p of this.list) { p.age += dt; p.vy += p.g * dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.rot += p.vr * dt / 1000; }
    this.list = this.list.filter(p => p.age < p.life);
  }
  draw(ctx) {
    for (const p of this.list) {
      const k = 1 - p.age / p.life;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, k * 1.6);
      if (p.type === 'dust') { ctx.fillStyle = p.color || '#e9dcc3'; ctx.beginPath(); ctx.arc(0, 0, p.size * (1.6 - k), 0, Math.PI * 2); ctx.fill(); }
      else if (p.type === 'shard') { ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.7, p.size); ctx.lineTo(-p.size * 0.6, p.size * 0.4); ctx.closePath(); ctx.fillStyle = 'rgba(191,232,255,.9)'; ctx.fill(); ctx.strokeStyle = '#7fb6d9'; ctx.lineWidth = 1.5; ctx.stroke(); }
      else if (p.type === 'paper') { ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.fillRect(-9, -12, 18, 24); ctx.strokeRect(-9, -12, 18, 24); }
      else if (p.type === 'confetti') { ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
      else if (p.type === 'drop') { ctx.fillStyle = p.color || '#4fc3f7'; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill(); }
      else if (p.type === 'spark') { ctx.fillStyle = p.color || '#ffd166'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? p.size * 0.45 : p.size; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); }
      else if (p.type === 'text') { ctx.font = `800 ${p.size}px Rubik, system-ui, sans-serif`; ctx.fillStyle = p.color; ctx.textAlign = 'center'; if (p.flip) ctx.scale(-1, 1); ctx.fillText(p.text, 0, 0); }
      ctx.restore();
    }
  }
}

// ---------- the scene ----------
export class Scene {
  constructor(canvas, { look, rtl = false, sound = true } = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.look = look || lookFor('guest'); this.rtl = rtl; this.sound = sound;
    this.t = 0; this.last = performance.now();
    this.cam = { x: DESK_X - 380, y: 0 }; this.shake = 0;
    this.char = { x: DESK_X, y: 0, rot: 0, pose: {} };
    this.state = 'idle'; this.anim = null;
    this.parts = new Particles();
    this.flags = []; this.windowBroken = false; this.coolerHit = 0; this.carAlarm = 0;
    this.clock = null; // 0..1 of time left, null = no round running
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(canvas); this.resize();
    const loop = now => {
      if (!this.c.isConnected) { this.ro.disconnect(); return; }
      const dt = Math.min(50, now - this.last); this.last = now; this.t += dt;
      this.update(dt); this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  resize() {
    const r = this.c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width) return;
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.z = clamp(Math.min(r.height / 520, r.width / 760), 0.45, 1.6);
    this.vw = r.width / this.z; this.vh = r.height / this.z;
  }

  // ---------- public API ----------
  setClock(left) { this.clock = left; }
  reset() {
    this.state = 'idle'; this.anim = null; this.char = { x: DESK_X, y: 0, rot: 0, pose: {} };
    this.windowBroken = false; this.coolerHit = 0; this.carAlarm = 0; this.flags = [];
    this.cam = { x: DESK_X - this.vw * 0.36, y: 0 };
  }
  /** Rarer tier = bigger launch. Calls onLand at impact and onDone when the camera settles. */
  launch(tier, { label = '', meters = '', onLand, onDone } = {}) {
    this.reset();
    if (reducedMotion()) {
      const e = LANDING[tier]; this.char = { x: e.x, y: e.y, rot: 0, pose: { mouth: 'grin', arm: -1.2 } };
      if (tier >= 2) this.windowBroken = true;
      this.flags.push({ x: e.x + 40, y: e.y, label, meters, tier, born: this.t });
      this.state = 'landed'; onLand?.(); setTimeout(() => onDone?.(), 300); return;
    }
    this.state = 'windup';
    this.anim = { tier, label, meters, onLand, onDone, start: this.t, phase: 'windup', crossed: false };
    if (this.sound) sfx.pop();
  }
  /** Timeout or pass: the chair just spins at the desk. */
  miss(kind = 'timeout') {
    this.reset(); this.state = 'miss'; this.anim = { start: this.t };
    if (this.sound) { if (kind === 'timeout') sfx.ring(); setTimeout(() => sfx.sad(), kind === 'timeout' ? 550 : 0); }
    this.parts.add({ type: 'text', text: '?', x: DESK_X + 10, y: -230, vy: -40, life: 1400, size: 42, color: INK, flip: this.rtl });
  }
  /** A wrong answer: head shake and a red cross. */
  reject() {
    if (this.sound) sfx.buzz();
    this.rejectAt = this.t;
    this.parts.add({ type: 'text', text: '✗', x: this.char.x + 10, y: this.char.y - 210, vy: -60, life: 900, size: 46, color: '#ff4d5e', flip: this.rtl });
  }

  // ---------- simulation ----------
  update(dt) {
    this.parts.step(dt);
    this.shake *= Math.pow(0.002, dt / 1000);
    const a = this.anim, ch = this.char;
    ch.pose = { blink: (this.t % 3400) < 120 };
    if (this.state === 'idle') {
      ch.rot = Math.sin(this.t / 900) * 0.03;
      ch.pose.arm = this.clock !== null ? Math.sin(this.t / 120) * 0.25 - 0.6 : Math.sin(this.t / 600) * 0.15;
      ch.pose.mouth = this.clock !== null && this.clock < 0.25 ? 'o' : 'smile';
      if (this.rejectAt && this.t - this.rejectAt < 500) { ch.pose.headShake = Math.sin((this.t - this.rejectAt) / 30) * 6; ch.pose.mouth = 'sad'; }
    } else if (this.state === 'miss') {
      const k = (this.t - a.start) / 1000;
      ch.rot = Math.sin(k * 6) * 0.05 * Math.max(0, 2 - k); ch.pose.mouth = 'sad'; ch.pose.arm = 0.6; ch.pose.spinWheels = k * 4;
    } else if (this.state === 'windup') {
      const k = (this.t - a.start) / 480;
      ch.x = DESK_X - easeOut(Math.min(1, k)) * 40; ch.rot = -0.12 * Math.min(1, k); ch.pose.mouth = 'grin'; ch.pose.arm = -0.4; ch.pose.legs = -0.4;
      this.shake = Math.max(this.shake, 3 * k);
      if (k >= 1) {
        this.state = 'fly'; a.start = this.t;
        if (this.sound) sfx.whoosh(FLIGHT_MS[a.tier] / 1000);
      }
    } else if (this.state === 'fly') {
      const dur = FLIGHT_MS[a.tier], k = Math.min(1, (this.t - a.start) / dur);
      const prev = { x: ch.x, y: ch.y };
      const p = path(a.tier, k); ch.x = p.x; ch.y = p.y;
      this.ahead = path(a.tier, Math.min(1, k + 0.018));
      const vx = (ch.x - prev.x) / Math.max(1, dt) * 1000;
      ch.rot = a.tier === 1 ? k * 1.5 * Math.PI : a.tier === 5 ? Math.sin(k * 12) * 0.4 : k * (2 + a.tier) * Math.PI * 0.5;
      ch.pose.arm = Math.sin(this.t / 70) * 1.3 - 0.6; ch.pose.legs = Math.sin(this.t / 90) * 0.6; ch.pose.mouth = 'o'; ch.pose.spinWheels = this.t / 40;
      this.speed = Math.abs(vx);
      if (!a.crossed && a.tier >= 2 && ch.x > 690) { a.crossed = true; this.shatter(); }
      if (a.tier >= 2 && Math.random() < dt / 90) this.parts.add({ type: 'paper', x: ch.x - 20, y: ch.y - 100, vx: -vx * 0.15 + (Math.random() - 0.5) * 80, vy: -60 + Math.random() * 60, g: 120, vr: (Math.random() - 0.5) * 8, life: 1600 });
      if (a.tier === 5 && Math.random() < dt / 30) this.parts.add({ type: 'spark', x: ch.x - 30, y: ch.y - 60, vx: -vx * 0.2, vy: (Math.random() - 0.5) * 80, life: 700, size: 7 + Math.random() * 6, color: Math.random() < 0.5 ? '#ffd166' : '#ff8a00' });
      if (k >= 1) this.land();
    } else if (this.state === 'landed') {
      const k = (this.t - a.landedAt) / 1000;
      ch.rot = lerp(ch.rot, 0, Math.min(1, dt / 120));
      ch.pose.mouth = a.tier >= 3 ? 'grin' : 'smile';
      ch.pose.arm = a.tier >= 3 ? -1.3 + Math.sin(this.t / 140) * 0.35 : -0.2;
      if (a.tier === 4) { ch.y = LANDING[4].y + Math.sin(this.t / 400) * 6; ch.rot = Math.sin(this.t / 600) * 0.08; }
      if (a.tier === 5) ch.y = LANDING[5].y - Math.abs(Math.sin(k * 2.2)) * 60 * Math.exp(-k * 0.9);
      if (!a.doneFired && k > (a.tier >= 4 ? 1.4 : 0.9)) { a.doneFired = true; a.onDone?.(); }
    }
    this.followCamera(dt);
  }
  shatter() {
    this.windowBroken = true; this.shake = 14;
    if (this.sound) sfx.crash();
    this.parts.burst(26, () => ({ type: 'shard', x: 700, y: -60 - Math.random() * 300, vx: 150 + Math.random() * 500, vy: -200 + Math.random() * 250, g: 900, vr: (Math.random() - 0.5) * 14, life: 1300, size: 6 + Math.random() * 10 }));
  }
  land() {
    const a = this.anim, ch = this.char, tier = a.tier;
    this.state = 'landed'; a.landedAt = this.t; ch.x = LANDING[tier].x; ch.y = LANDING[tier].y;
    ch.rot = Math.atan2(Math.sin(ch.rot), Math.cos(ch.rot)); this.ahead = null;
    this.shake = [0, 8, 14, 18, 16, 24][tier];
    if (tier === 1) { this.coolerHit = this.t; if (this.sound) sfx.bonk(); this.parts.burst(18, () => ({ type: 'drop', x: 520, y: -150, vx: (Math.random() - 0.3) * 260, vy: -260 - Math.random() * 200, g: 900, life: 1000, size: 4 + Math.random() * 4 })); }
    else if (tier === 4) { if (this.sound) sfx.splash(); this.parts.burst(40, () => ({ type: 'drop', x: ch.x + (Math.random() - 0.5) * 60, y: 0, vx: (Math.random() - 0.5) * 420, vy: -300 - Math.random() * 520, g: 1100, life: 1300, size: 5 + Math.random() * 7, color: Math.random() < 0.5 ? '#4fc3f7' : '#e1f5fe' })); }
    else { if (this.sound) sfx.thud(); if (tier === 2) this.carAlarm = this.t; this.parts.burst(16, () => ({ type: 'dust', x: ch.x + (Math.random() - 0.5) * 80, y: ch.y - 4, vx: (Math.random() - 0.5) * 220, vy: -40 - Math.random() * 90, life: 800, size: 8 + Math.random() * 10, color: tier === 5 ? '#d9d9e8' : '#e9dcc3' })); }
    if (tier >= 4) {
      const cols = ['#ff4d5e', '#ffc43d', '#2ec4b6', '#7b5cff', '#3b82f6', '#ff8fab'];
      this.parts.burst(tier === 5 ? 90 : 55, () => ({ type: 'confetti', x: ch.x + (Math.random() - 0.5) * 60, y: ch.y - 160, vx: (Math.random() - 0.5) * 700, vy: -400 - Math.random() * 500, g: tier === 5 ? 260 : 700, vr: (Math.random() - 0.5) * 16, life: 2200, size: 9 + Math.random() * 7, color: cols[Math.floor(Math.random() * cols.length)] }));
    }
    if (this.sound) setTimeout(() => sfx.fanfare(tier), 160);
    this.flags.push({ x: ch.x + (tier === 4 ? 130 : tier === 1 ? -150 : 90), y: tier === 4 ? 0 : ch.y, label: a.label, meters: a.meters, tier, born: this.t, float: tier === 4 });
    a.onLand?.();
  }
  followCamera(dt) {
    const ch = this.state === 'fly' && this.ahead ? this.ahead : this.char;
    const lead = this.state === 'fly' ? 0.42 : 0.36;
    const tx = ch.x - this.vw * lead;
    const ty = Math.min(0, ch.y + this.vh * (this.anim?.tier === 5 ? 0.3 : 0.4));
    const k = this.state === 'fly' ? Math.min(1, dt / 45) : Math.min(1, dt / 220);
    this.cam.x = lerp(this.cam.x, tx, k); this.cam.y = lerp(this.cam.y, ty, k);
  }

  // ---------- rendering ----------
  text(str, x, y, { size = 20, weight = 800, color = INK, align = 'center', stroke = null } = {}) {
    const ctx = this.ctx; ctx.save(); ctx.translate(x, y); if (this.rtl) ctx.scale(-1, 1);
    ctx.font = `${weight} ${size}px Rubik, system-ui, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = size / 5; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, 0, 0); }
    ctx.fillStyle = color; ctx.fillText(str, 0, 0); ctx.restore();
  }
  draw() {
    const { ctx, w, h, dpr, z } = this;
    if (!w) return;
    const alt = -this.cam.y;
    // sky, in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const space = clamp((alt - 900) / 3200, 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mix('#5ab8ff', '#05071a', space)); g.addColorStop(1, mix('#d4f0ff', '#1b1f4a', space));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (space > 0) { const r = rng(42); ctx.fillStyle = `rgba(255,255,255,${space})`; for (let i = 0; i < 160; i++) { const sx = (r() * w * 3 - this.cam.x * 0.02) % w, sy = (r() * h + alt * 0.05) % h; ctx.fillRect((sx + w) % w, sy, r() < 0.1 ? 2.5 : 1.5, r() < 0.1 ? 2.5 : 1.5); } }
    // world transform
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const flip = this.rtl ? -1 : 1;
    ctx.setTransform(dpr * z * flip, 0, 0, dpr * z, this.rtl ? w * dpr : 0, 0);
    ctx.translate(-this.cam.x + sx, this.vh * 0.8 - this.cam.y + sy);
    this.drawParallax();
    this.drawGround();
    this.drawProps();
    this.drawFlags();
    ctx.save(); ctx.translate(this.char.x, this.char.y); ctx.rotate(this.char.rot);
    if (this.char.rot) ctx.translate(0, 0);
    drawWorker(ctx, this.look, this.char.pose); ctx.restore();
    this.drawFront();
    this.parts.draw(ctx);
    // speed lines in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.state === 'fly' && this.speed > 1500) {
      ctx.strokeStyle = `rgba(255,255,255,${clamp((this.speed - 1500) / 6000, 0, 0.7)})`; ctx.lineWidth = 3;
      const r = rng(Math.floor(this.t / 50));
      for (let i = 0; i < 14; i++) { const y = r() * h, x = r() * w, len = 60 + r() * 140; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len * flip, y); ctx.stroke(); }
    }
  }
  drawParallax() {
    const ctx = this.ctx, cx = this.cam.x, cy = this.cam.y;
    // far hills
    ctx.save(); ctx.translate(cx * 0.88, cy * 0.85);
    ctx.fillStyle = '#a9d8e6';
    const base = Math.floor((cx * 0.12) / 900) * 900 - 1800;
    ctx.beginPath(); ctx.moveTo(base, 40);
    for (let x = base; x <= base + this.vw / 0.5 + 3600; x += 150) ctx.lineTo(x, -140 - Math.sin(x / 260) * 60 - Math.sin(x / 97) * 22);
    ctx.lineTo(base + this.vw / 0.5 + 3600, 40); ctx.closePath(); ctx.fill();
    ctx.restore();
    // distant skyline
    ctx.save(); ctx.translate(cx * 0.65, cy * 0.6);
    const b2 = Math.floor((cx * 0.35) / 400) * 400 - 800;
    for (let x = b2; x < b2 + this.vw / 0.35 + 1600; x += 80) {
      const hh = 120 + (hash(Math.floor(x / 80)) % 220);
      ctx.fillStyle = '#8fbfd6'; ctx.fillRect(x, -hh, 70, hh + 40);
    }
    ctx.restore();
    // clouds
    ctx.save(); ctx.translate(cx * 0.75, cy * 0.7);
    const b3 = Math.floor((cx * 0.25) / 600) * 600 - 1200;
    for (let x = b3; x < b3 + this.vw / 0.25 + 2400; x += 600) {
      const r = rng(hash('c' + x)); const cyy = -320 - r() * 420, drift = (this.t / 60) % 600;
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + drift + i * 38, cyy + (i % 2) * 10, 30 + r() * 22, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
  drawGround() {
    const ctx = this.ctx, l = this.cam.x - 200, r = this.cam.x + this.vw + 200;
    for (const zn of ZONES) {
      const a = Math.max(l, zn.from), b = Math.min(r, zn.to);
      if (a >= b) continue;
      if (zn.id === 'sea') {
        ctx.fillStyle = '#2f9fd8'; ctx.fillRect(a, 0, b - a, 900);
        ctx.fillStyle = '#5bc0f0';
        ctx.beginPath(); ctx.moveTo(a, 900);
        for (let x = a; x <= b + 40; x += 40) ctx.lineTo(x, Math.sin(x / 60 + this.t / 300) * 7);
        ctx.lineTo(b + 40, 900); ctx.closePath(); ctx.fill();
        continue;
      }
      const col = { office: '#c99a6b', lot: '#5b6275', city: '#8a90a6', park: '#7bc96f', beach: '#f3d89b' }[zn.id];
      ctx.fillStyle = col; ctx.fillRect(a, 0, b - a, 900);
      ctx.fillStyle = INK; ctx.fillRect(a, 0, b - a, 4);
      if (zn.id === 'office') { ctx.strokeStyle = 'rgba(29,35,64,.25)'; ctx.lineWidth = 2; for (let x = Math.ceil(a / 90) * 90; x < b; x += 90) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x - 30, 60); ctx.stroke(); } }
      if (zn.id === 'lot') { ctx.fillStyle = '#ffd34d'; for (let x = Math.ceil(a / 240) * 240; x < b; x += 240) ctx.fillRect(x, 26, 90, 8); }
      if (zn.id === 'city') { ctx.fillStyle = '#c3c7d6'; ctx.fillRect(a, 4, b - a, 22); }
      if (zn.id === 'park') { ctx.fillStyle = '#5fb257'; for (let x = Math.ceil(a / 50) * 50; x < b; x += 50) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 8, -10); ctx.lineTo(x + 14, 4); ctx.fill(); } }
    }
  }
  inView(x, pad = 400) { return x > this.cam.x - pad && x < this.cam.x + this.vw + pad; }
  drawProps() {
    const ctx = this.ctx, t = this.t;
    // --- office interior (cutaway) ---
    if (this.inView(0, 900)) {
      rr(ctx, -760, -460, 1470, 460, 0); fillStroke(ctx, '#f6ead2', 4);
      ctx.fillStyle = '#e9d9b8'; ctx.fillRect(-756, -150, 1456, 150);
      for (const lx of [-480, -80, 320]) { rr(ctx, lx, -452, 160, 14, 6); fillStroke(ctx, '#fffbe6', 2); ctx.fillStyle = 'rgba(255,251,200,.25)'; ctx.beginPath(); ctx.moveTo(lx, -438); ctx.lineTo(lx + 160, -438); ctx.lineTo(lx + 220, -150); ctx.lineTo(lx - 60, -150); ctx.closePath(); ctx.fill(); }
      // wall clock = the round timer
      const cxk = -210, cyk = -320, left = this.clock ?? 1, hot = this.clock !== null && left < 0.25;
      ctx.save(); ctx.translate(cxk + (hot ? Math.sin(t / 25) * 2 : 0), cyk);
      circle(ctx, 0, 0, 46, hot ? '#ffd6da' : '#fff', 4);
      if (this.clock !== null) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.closePath(); ctx.fillStyle = hot ? 'rgba(255,77,94,.45)' : 'rgba(46,196,182,.35)'; ctx.fill(); }
      for (let i = 0; i < 12; i++) { const ang = i * Math.PI / 6; ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(Math.cos(ang) * 37, Math.sin(ang) * 37, 2.5, 0, Math.PI * 2); ctx.fill(); }
      const hand = this.clock !== null ? -Math.PI / 2 + Math.PI * 2 * (1 - left) : t / 3000;
      ctx.lineWidth = 4; ctx.strokeStyle = hot ? '#ff4d5e' : INK; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hand) * 32, Math.sin(hand) * 32); ctx.stroke();
      circle(ctx, 0, 0, 5, INK, 0);
      ctx.restore();
      // whiteboard with a chart going up
      rr(ctx, -640, -360, 230, 150, 8); fillStroke(ctx, '#fff', 4);
      ctx.lineWidth = 4; ctx.strokeStyle = '#2ec4b6'; ctx.beginPath(); ctx.moveTo(-620, -240); ctx.lineTo(-580, -260); ctx.lineTo(-540, -250); ctx.lineTo(-500, -300); ctx.lineTo(-450, -330); ctx.stroke();
      ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(-450, -330, 7, 0, Math.PI * 2); ctx.fill();
      // cubicle with a colleague peeking
      const peek = Math.max(0, Math.sin(t / 1300)) * 26;
      circle(ctx, -470, -168 - peek, 24, '#e0ac69'); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(-462, -170 - peek, 3, 0, Math.PI * 2); ctx.arc(-452, -170 - peek, 3, 0, Math.PI * 2); ctx.fill();
      rr(ctx, -560, -170, 210, 170, 6); fillStroke(ctx, '#9aa7c7', 4);
      // plant
      rr(ctx, -300, -70, 54, 70, 8); fillStroke(ctx, '#d9784c');
      for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(-273, -70); ctx.rotate(-0.9 + i * 0.45 + Math.sin(t / 900 + i) * 0.05); ctx.beginPath(); ctx.ellipse(0, -40, 13, 40, 0, 0, Math.PI * 2); fillStroke(ctx, '#3fae5a', 3); ctx.restore(); }
      // desk, monitor, mug
      rr(ctx, -150, -110, 200, 18, 4); fillStroke(ctx, '#a8744a');
      rr(ctx, -140, -92, 14, 92, 3); fillStroke(ctx, '#8b5e3c'); rr(ctx, 26, -92, 14, 92, 3); fillStroke(ctx, '#8b5e3c');
      rr(ctx, -120, -210, 120, 84, 8); fillStroke(ctx, '#2b2f45');
      rr(ctx, -110, -200, 100, 64, 4); fillStroke(ctx, this.clock !== null ? '#7be3d6' : '#5ab8ff', 2);
      if (this.clock !== null) { ctx.fillStyle = INK; for (let i = 0; i < 4; i++) ctx.fillRect(-100, -190 + i * 14, 30 + ((i * 37 + Math.floor(t / 200)) % 50), 6); }
      rr(ctx, -66, -126, 12, 16, 2); fillStroke(ctx, '#41476b', 2);
      rr(ctx, 4, -138, 24, 28, 5); fillStroke(ctx, '#ff4d5e');
      ctx.strokeStyle = 'rgba(29,35,64,.35)'; ctx.lineWidth = 3; for (let i = 0; i < 2; i++) { ctx.beginPath(); const o = Math.sin(t / 300 + i * 2) * 4; ctx.moveTo(10 + i * 10, -146); ctx.quadraticCurveTo(14 + i * 10 + o, -160, 10 + i * 10, -176); ctx.stroke(); }
      // water cooler (Mainstream lands here)
      const wob = this.coolerHit ? Math.sin((t - this.coolerHit) / 40) * Math.exp(-(t - this.coolerHit) / 500) * 0.25 : 0;
      ctx.save(); ctx.translate(540, 0); ctx.rotate(wob);
      rr(ctx, -28, -120, 56, 120, 6); fillStroke(ctx, '#e8edf7');
      rr(ctx, -22, -200, 44, 80, 16); fillStroke(ctx, 'rgba(120,200,255,.75)');
      ctx.restore();
      // window wall
      if (!this.windowBroken) { rr(ctx, 690, -440, 22, 440, 2); fillStroke(ctx, 'rgba(191,232,255,.55)', 3); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(694, -380); ctx.lineTo(708, -420); ctx.moveTo(694, -300); ctx.lineTo(708, -360); ctx.stroke(); }
      else { ctx.fillStyle = INK; ctx.fillRect(690, -440, 22, 16); ctx.fillRect(690, -14, 22, 14); ctx.fillStyle = 'rgba(191,232,255,.55)'; ctx.beginPath(); ctx.moveTo(690, -424); ctx.lineTo(712, -424); ctx.lineTo(700, -360); ctx.closePath(); ctx.fill(); }
    }
    // --- parking lot ---
    if (this.inView(1700, 1300)) {
      rr(ctx, 840, -120, 90, 120, 6); fillStroke(ctx, '#ffd34d');
      rr(ctx, 852, -104, 66, 40, 4); fillStroke(ctx, '#bfe8ff', 2);
      ctx.save(); ctx.translate(930, -70); ctx.rotate(-0.15 + Math.sin(t / 2000) * 0.05); rr(ctx, 0, -6, 220, 12, 6); fillStroke(ctx, '#ff4d5e'); ctx.restore();
      car(ctx, 1300, '#7b5cff'); car(ctx, 1590, '#2ec4b6');
      car(ctx, 1890, '#ff4d5e', t, this.carAlarm && t - this.carAlarm < 4000);
      car(ctx, 2200, '#ffc43d');
      for (const lx of [1100, 1750, 2400]) { rr(ctx, lx, -300, 10, 300, 3); fillStroke(ctx, '#41476b', 2); rr(ctx, lx - 24, -310, 44, 14, 6); fillStroke(ctx, '#41476b', 2); }
      rr(ctx, 2470, -260, 70, 70, 10); fillStroke(ctx, '#3b82f6'); this.text('P', 2505, -225, { size: 46, color: '#fff' });
    }
    // --- city ---
    if (this.inView(4100, 1800)) {
      const cols = ['#ff8fab', '#ffd166', '#a0c4ff', '#caffbf', '#ffc6ff', '#9bf6ff'];
      let x = 2700, i = 0;
      while (x < 5500) { const bw = 180 + (hash('b' + i) % 120), bh = 260 + (hash('h' + i) % 320); if (x < 4000 || x > 4480) building(ctx, x, bw, bh, cols[i % cols.length], hash('w' + i)); x += bw + 40; i++; }
      // café with an awning (Uncommon lands on it)
      building(ctx, 4040, 380, 300, '#fff1d6', 99);
      ctx.save(); ctx.translate(4060, -170);
      for (let s = 0; s < 10; s++) { ctx.beginPath(); ctx.moveTo(s * 34, 0); ctx.lineTo(s * 34 + 34, 0); ctx.lineTo(s * 34 + 34 + 10, 46); ctx.lineTo(s * 34 + 10, 46); ctx.closePath(); fillStroke(ctx, s % 2 ? '#fff' : '#ff4d5e', 3); }
      ctx.restore();
      // traffic light and bus stop
      rr(ctx, 3500, -260, 10, 260, 3); fillStroke(ctx, '#41476b', 2); rr(ctx, 3486, -320, 38, 80, 8); fillStroke(ctx, '#2b2f45');
      const phase = Math.floor(t / 1500) % 3; ['#ff4d5e', '#ffc43d', '#22c55e'].forEach((c, k) => circle(ctx, 3505, -304 + k * 24, 8, k === phase ? c : '#41476b', 2));
      for (let k = 0; k < 2; k++) tree(ctx, 3200 + k * 1700, 0.8);
    }
    // --- park ---
    if (this.inView(6900, 1700)) {
      for (let k = 0; k < 8; k++) tree(ctx, 5750 + k * 320, 0.8 + (k % 3) * 0.2, k % 2 ? '#5bbf62' : '#3fae5a');
      rr(ctx, 6800, -70, 300, 70, 30); fillStroke(ctx, '#bfe8ff');
      for (let k = 0; k < 6; k++) ctx.fillStyle = '#4fc3f7', ctx.beginPath(), ctx.arc(6950 + Math.sin(t / 200 + k) * 40, -90 - ((t / 3 + k * 40) % 120), 6, 0, Math.PI * 2), ctx.fill();
      rr(ctx, 7400, -46, 140, 12, 4); fillStroke(ctx, '#a8744a'); rr(ctx, 7410, -34, 10, 34, 2); fillStroke(ctx, '#8b5e3c'); rr(ctx, 7520, -34, 10, 34, 2); fillStroke(ctx, '#8b5e3c');
      ctx.save(); ctx.translate(7700, -520 + Math.sin(t / 600) * 20); ctx.rotate(Math.sin(t / 800) * 0.2); ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(30, 0); ctx.lineTo(0, 50); ctx.lineTo(-30, 0); ctx.closePath(); fillStroke(ctx, '#ff4d5e'); ctx.restore();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(7700, -470 + Math.sin(t / 600) * 20); ctx.quadraticCurveTo(7760, -250, 7820, -40); ctx.stroke();
    }
    // --- beach ---
    if (this.inView(8800, 1400)) {
      palm(ctx, 8350, t); palm(ctx, 8900, t + 900);
      // lifeguard tower
      rr(ctx, 8560, -250, 140, 70, 6); fillStroke(ctx, '#fff'); ctx.beginPath(); ctx.moveTo(8550, -250); ctx.lineTo(8630, -300); ctx.lineTo(8710, -250); ctx.closePath(); fillStroke(ctx, '#ff4d5e');
      for (const px of [8575, 8685]) { rr(ctx, px, -180, 8, 180, 2); fillStroke(ctx, '#a8744a', 2); }
      // umbrella
      ctx.beginPath(); ctx.moveTo(9060, 0); ctx.lineTo(9060, -150); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(9060, -150, 90, Math.PI, 0); ctx.closePath(); fillStroke(ctx, '#ffc43d');
    }
    // --- sea and sky ---
    if (this.inView(10400, 2500)) {
      ctx.save(); ctx.translate(10650, Math.sin(t / 500) * 6); ctx.rotate(Math.sin(t / 700) * 0.04);
      ctx.beginPath(); ctx.moveTo(-90, -10); ctx.lineTo(90, -10); ctx.lineTo(60, 26); ctx.lineTo(-60, 26); ctx.closePath(); fillStroke(ctx, '#fff');
      ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(0, -170); ctx.lineTo(70, -30); ctx.closePath(); fillStroke(ctx, '#ff8fab');
      ctx.restore();
      // plane and satellite for the Outlier climb
      const px = 10200 + ((t / 4) % 2400) - 1200;
      ctx.save(); ctx.translate(px, -2300); rr(ctx, -70, -14, 140, 28, 14); fillStroke(ctx, '#fff'); ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-40, 50); ctx.lineTo(-10, 50); ctx.lineTo(20, 0); ctx.closePath(); fillStroke(ctx, '#3b82f6'); ctx.restore();
      ctx.save(); ctx.translate(11200, -4700); ctx.rotate(t / 4000); rr(ctx, -20, -20, 40, 40, 4); fillStroke(ctx, '#c9cde0'); rr(ctx, -100, -10, 70, 20, 2); fillStroke(ctx, '#3b82f6'); rr(ctx, 30, -10, 70, 20, 2); fillStroke(ctx, '#3b82f6'); ctx.restore();
    }
    if (this.inView(MOON.x, 1500) && this.cam.y < -2000) {
      circle(ctx, MOON.x, MOON.y, MOON.r, '#e6e6f2', 5);
      for (const [dx, dy, r] of [[-120, -60, 60], [90, 80, 45], [140, -160, 32], [-60, 170, 38]]) circle(ctx, MOON.x + dx, MOON.y + dy, r, '#cfcfe0', 3);
    }
  }
  drawFront() {
    // the window frame posts sit in front of the character
    const ctx = this.ctx;
    if (this.inView(700)) { ctx.fillStyle = INK; ctx.fillRect(688, -460, 4, 460); }
    if (this.inView(10150, 900)) {
      const a = Math.max(9300, this.cam.x - 200), b = this.cam.x + this.vw + 200;
      ctx.fillStyle = 'rgba(47,159,216,.82)'; ctx.beginPath(); ctx.moveTo(a, 900);
      for (let x = a; x <= b + 40; x += 40) ctx.lineTo(x, 12 + Math.sin(x / 50 + this.t / 260) * 6);
      ctx.lineTo(b + 40, 900); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.beginPath();
      for (let x = a; x <= b + 40; x += 40) ctx.lineTo(x, 12 + Math.sin(x / 50 + this.t / 260) * 6);
      ctx.stroke();
    }
  }
  drawFlags() {
    const ctx = this.ctx;
    for (const f of this.flags) {
      const k = clamp((this.t - f.born) / 400, 0, 1), up = easeOut(k);
      const bob = f.float ? Math.sin(this.t / 400) * 6 : 0;
      ctx.save(); ctx.translate(f.x, f.y + bob);
      ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -150 * up); ctx.stroke();
      if (up > 0.6) {
        const col = TIER_COLORS[f.tier];
        const wave = Math.sin(this.t / 160) * 4;
        ctx.beginPath(); ctx.moveTo(0, -150); ctx.lineTo(150, -140 + wave); ctx.lineTo(150, -84 + wave); ctx.lineTo(0, -92); ctx.closePath(); fillStroke(ctx, col);
        this.text(f.meters, 75, -122 + wave / 2, { size: 22, color: '#fff', stroke: INK });
        if (f.label) this.text(f.label.length > 18 ? f.label.slice(0, 17) + '…' : f.label, 75, -170, { size: 20, color: INK, stroke: '#fff' });
      }
      ctx.restore();
    }
  }
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}

/** Results map: the whole route as a strip, with a pin for every landing. */
export function drawMap(canvas, landings, { rtl = false, labels = {} } = {}) {
  const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = r.width * dpr; canvas.height = r.height * dpr;
  const ctx = canvas.getContext('2d'), W = r.width, H = r.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const segs = [['office', '#f6ead2'], ['lot', '#9aa1b8'], ['city', '#ffd6e0'], ['beach', '#f3d89b'], ['sea', '#5bc0f0'], ['space', '#1b1f4a']];
  const sw = W / segs.length, ground = H * 0.72;
  const X = i => rtl ? W - (i + 0.5) * sw : (i + 0.5) * sw;
  segs.forEach(([id, c], i) => {
    const x0 = rtl ? W - (i + 1) * sw : i * sw;
    ctx.fillStyle = c; ctx.fillRect(x0, 0, sw + 1, H);
    ctx.fillStyle = 'rgba(29,35,64,.75)'; ctx.font = '600 12px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = id === 'space' || id === 'sea' ? '#fff' : INK;
    ctx.fillText(labels[id] || id, X(i), H - 10);
  });
  ctx.fillStyle = INK; ctx.fillRect(0, ground, W, 3);
  // pins: tier 1 -> office, 2 -> lot, 3 -> city, 4 -> sea, 5 -> space; misses sit at the desk
  const seg = [0, 0, 1, 2, 4, 5];
  const counts = {};
  landings.forEach((l, i) => {
    const s = seg[l.tier || 0], n = (counts[s] = (counts[s] || 0) + 1) - 1;
    const x = X(s) + (n - 1) * 16 * (rtl ? -1 : 1), y = ground - 26 - n * 6;
    ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(x, ground); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y - 9, 10, 0, Math.PI * 2); ctx.fillStyle = l.tier ? TIER_COLORS[l.tier] : '#fff'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = l.tier ? '#fff' : INK; ctx.font = '800 11px Rubik, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y - 9); ctx.textBaseline = 'alphabetic';
  });
}
