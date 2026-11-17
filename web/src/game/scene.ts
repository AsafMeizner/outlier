// The office-chair launch world. Everything is drawn in code (no image files) and rendered through a
// low-resolution buffer for a chunky pixel look. Distances are in metres; 1 m = PPM world pixels.
// The day is one journey: each launch continues from where the last one landed.
import { CATALOG, resolveLook } from './wardrobe.js';

const INK = '#141833';
export const TIER_COLORS = ['#94a3b8', '#9aa6b8', '#2fd06a', '#3b8cff', '#b45cff', '#ff9a1f'];
export const PPM = 6;
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - t, 3);
const smooth = t => t * t * (3 - 2 * t);

export function hash(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// ---------- world layout (metres) ----------
export const ZONES = [
  { id: 'office', from: -130, to: 58 }, { id: 'parking', from: 58, to: 400 }, { id: 'city', from: 400, to: 1600 },
  { id: 'park', from: 1600, to: 2600 }, { id: 'beach', from: 2600, to: 3200 }, { id: 'sea', from: 3200, to: 4800 },
  { id: 'sky', from: 4800, to: 5800 }, { id: 'moon', from: 5800, to: 99999 },
];
export const zoneAt = m => ZONES.find(z => m >= z.from && m < z.to)?.id || 'moon';
export const LANDMARKS = [
  { m: 0, key: 'lm_desk' }, { m: 56, key: 'lm_window' }, { m: 150, key: 'lm_visitor' }, { m: 350, key: 'lm_ceo' },
  { m: 600, key: 'lm_coffee' }, { m: 1000, key: 'lm_cityhall' }, { m: 1400, key: 'lm_tower' }, { m: 2000, key: 'lm_fountain' },
  { m: 2400, key: 'lm_icecream' }, { m: 2800, key: 'lm_lifeguard' }, { m: 3500, key: 'lm_sailing' }, { m: 4300, key: 'lm_lighthouse' },
  { m: 5000, key: 'lm_cruising' }, { m: 5500, key: 'lm_balloon' }, { m: 5900, key: 'lm_moon' },
];
const SKY_TOP = -2600, MOON_Y = -5200;
/** Ground height (world px, negative = up) at a distance in metres. */
export function altitudeAt(m) {
  if (m < 4800) return 0;
  if (m < 5750) return SKY_TOP * smooth(clamp((m - 4800) / 700, 0, 1));
  return MOON_Y;
}
const X = m => m * PPM;

// ---------- looks ----------
const colorOf = (slot, id, fallback) => CATALOG[slot].find(i => i.id === id)?.color ?? fallback;
export function lookFor(seed, stored) { return resolveLook(stored, seed); }

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
    this.env(ac, o, t, 0.008, peak, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  filtered(type, f0, f1, dur, peak, q = 1, delay = 0) {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + delay, n = this.noise(ac, dur + 0.1), f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    n.connect(f); this.env(ac, f, t, 0.02, peak, dur); n.start(t); n.stop(t + dur + 0.1);
  }
  step(i) { this.tone('square', 330 * Math.pow(1.26, i), 330 * Math.pow(1.26, i), 0.07, 0.09); }
  lock(tier) { [0, 4, 7, 12].slice(0, Math.max(2, tier - 1)).forEach((n, i) => this.tone('square', 523 * Math.pow(2, n / 12), 523 * Math.pow(2, n / 12), 0.12, 0.08, i * 0.06)); }
  whoosh(dur = 0.8) { this.filtered('bandpass', 300, 2600, dur, 0.5, 2); }
  crash() { this.filtered('highpass', 2500, 6000, 0.5, 0.4); for (let i = 0; i < 6; i++) this.tone('sine', 2200 + Math.random() * 3000, 1800 + Math.random() * 2000, 0.25, 0.05, i * 0.04); }
  thud() { this.tone('sine', 140, 40, 0.3, 0.55); this.filtered('lowpass', 600, 120, 0.25, 0.35); }
  splash() { this.filtered('lowpass', 2500, 300, 0.8, 0.45); this.tone('sine', 600, 200, 0.2, 0.07, 0.05); }
  boing() { this.tone('sine', 180, 520, 0.25, 0.25); this.tone('sine', 520, 260, 0.3, 0.12, 0.2); }
  fanfare(tier) {
    const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, tier + 1);
    notes.forEach((f, i) => this.tone('square', f, f, 0.13, 0.07, i * 0.075));
    if (tier >= 5) [1047, 1319, 1568, 2093].forEach(f => this.tone('triangle', f, f, 0.9, 0.06, notes.length * 0.075 + 0.05));
  }
  buzz() { this.tone('square', 160, 120, 0.22, 0.11); this.tone('square', 107, 90, 0.22, 0.07); }
  tick() { this.tone('square', 1500, 1500, 0.025, 0.04); }
  sad() { [392, 370, 349].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.28, 0.06, i * 0.3)); this.tone('sawtooth', 330, 300, 0.6, 0.06, 0.9); }
  pop() { this.tone('square', 500, 900, 0.06, 0.08); }
  ring() { for (let i = 0; i < 8; i++) this.tone('square', 1800, 1800, 0.04, 0.04, i * 0.07); }
}
export const sfx = new Sfx();

// ---------- drawing primitives ----------
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function fs(ctx, fill, lw = 3) { ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); } }
function circle(ctx, x, y, r, fill, lw = 3) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fs(ctx, fill, lw); }
function poly(ctx, pts, fill, lw = 3) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); fs(ctx, fill, lw); }
function shirtFill(ctx, look, x, y, w, h) {
  const c = colorOf('shirt', look.shirt, '#ff4d5e');
  if (c !== 'rainbow') return c;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  ['#ff4d5e', '#ffc43d', '#2fd06a', '#3b8cff', '#b45cff'].forEach((col, i, a) => { g.addColorStop(i / a.length, col); g.addColorStop((i + 1) / a.length - 0.001, col); });
  return g;
}

// ---------- the worker on their chair ----------
function drawChair(ctx, look, pose, front) {
  const kind = look.chair || 'office', spin = pose.spinWheels || 0;
  const wheels = xs => xs.forEach(wx => { circle(ctx, wx, -6, 6.5, '#2b2f45'); ctx.strokeStyle = '#8a91b4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wx, -6); ctx.lineTo(wx + Math.cos(spin) * 5, -6 + Math.sin(spin) * 5); ctx.stroke(); });
  if (kind === 'beanbag') {
    if (!front) { ctx.beginPath(); ctx.ellipse(-4, -40, 52, 40, 0, 0, Math.PI * 2); fs(ctx, '#ff8a3d'); }
    return;
  }
  if (kind === 'cart') {
    if (front) return;
    rr(ctx, -46, -96, 92, 56, 4); fs(ctx, 'rgba(200,210,230,.85)');
    ctx.strokeStyle = '#7b84a8'; ctx.lineWidth = 2; for (let x = -38; x < 46; x += 12) { ctx.beginPath(); ctx.moveTo(x, -94); ctx.lineTo(x, -42); ctx.stroke(); }
    rr(ctx, -50, -40, 100, 8, 3); fs(ctx, '#7b84a8'); ctx.beginPath(); ctx.moveTo(-46, -96); ctx.lineTo(-62, -118); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    wheels([-34, 34]); return;
  }
  if (front) return;
  const seat = { office: '#4b5275', stool: '#a8744a', gaming: '#22253a', rocket: '#4b5275', throne: '#b8860b' }[kind] || '#4b5275';
  rr(ctx, -34, -14, 68, 8, 4); fs(ctx, '#3a3f58');
  wheels([-30, 0, 30]);
  rr(ctx, -4, -52, 8, 40, 3); fs(ctx, '#8a91b4');
  if (kind === 'gaming') { rr(ctx, -50, -172, 22, 116, 10); fs(ctx, '#22253a'); rr(ctx, -46, -160, 6, 90, 3); fs(ctx, '#ff4d5e', 0); rr(ctx, -36, -160, 6, 90, 3); fs(ctx, '#ff4d5e', 0); }
  else if (kind === 'throne') { poly(ctx, [[-54, -60], [-54, -176], [-44, -196], [-34, -176], [-24, -196], [-24, -60]], '#f5c542'); rr(ctx, -48, -150, 18, 80, 6); fs(ctx, '#c0303f'); }
  else if (kind === 'rocket') {
    rr(ctx, -46, -138, 16, 82, 8); fs(ctx, '#3a3f58');
    rr(ctx, -70, -112, 24, 60, 10); fs(ctx, '#e8edf7'); poly(ctx, [[-70, -112], [-58, -132], [-46, -112]], '#ff4d5e');
    if (pose.flame) { const f = 26 + Math.random() * 22; poly(ctx, [[-68, -52], [-58, -52 + f], [-48, -52]], '#ffb703', 2); poly(ctx, [[-64, -52], [-58, -52 + f * 0.6], [-52, -52]], '#fff3b0', 0); }
  } else if (kind !== 'stool') { rr(ctx, -46, -138, 16, 82, 8); fs(ctx, '#3a3f58'); rr(ctx, -34, -66, 6, 16, 2); fs(ctx, '#3a3f58'); }
  rr(ctx, -36, -70, 72, 14, 7); fs(ctx, seat);
}

function drawHair(ctx, look, behind) {
  const c = colorOf('hair', look.hair, '#2b1d14');
  ctx.fillStyle = c; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  const st = look.hairStyle;
  if (behind) {
    if (st === 'long') { ctx.beginPath(); ctx.ellipse(-24, 12, 11, 24, 0.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (st === 'bun') circle(ctx, -24, -14, 11, c);
    return;
  }
  if (st === 'bald') return;
  if (st === 'spiky') { ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = Math.PI * (1.0 + i / 6), r = i % 2 ? 36 : 25; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r - 2); } ctx.closePath(); ctx.fill(); ctx.stroke(); return; }
  if (st === 'curly') { for (const [x, y] of [[-20, -10], [-10, -20], [4, -22], [16, -16], [-24, 4]]) circle(ctx, x, y, 10, c); return; }
  ctx.beginPath(); ctx.arc(0, -2, 25, Math.PI * 1.02, Math.PI * 2.02); ctx.lineTo(18, -8); ctx.quadraticCurveTo(0, -14, -22, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawHat(ctx, hat, t) {
  switch (hat) {
    case 'cap': poly(ctx, [[-24, -10], [-22, -24], [-4, -32], [16, -26], [22, -14]], '#3b8cff'); rr(ctx, 14, -16, 26, 6, 3); fs(ctx, '#2a6fd6'); break;
    case 'beanie': ctx.beginPath(); ctx.arc(0, -6, 26, Math.PI, 0); ctx.closePath(); fs(ctx, '#ff4d5e'); rr(ctx, -27, -10, 54, 9, 4); fs(ctx, '#ffd23f'); circle(ctx, 0, -34, 7, '#fff'); break;
    case 'headphones': ctx.beginPath(); ctx.arc(0, -2, 30, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); rr(ctx, -8, -8, 16, 22, 6); fs(ctx, '#2fd06a'); break;
    case 'party': poly(ctx, [[-16, -18], [6, -64], [18, -16]], '#b45cff'); circle(ctx, 6, -66, 6, '#ffd23f'); ctx.fillStyle = '#ffd23f'; ctx.fillRect(-6, -36, 6, 6); ctx.fillRect(6, -26, 6, 6); break;
    case 'propeller': ctx.beginPath(); ctx.arc(0, -8, 25, Math.PI, 0); ctx.closePath(); fs(ctx, '#ffd23f'); rr(ctx, -2, -44, 4, 14, 2); fs(ctx, INK, 0);
      { const a = Math.sin(t / 40); rr(ctx, -22 * Math.abs(a), -48, 44 * Math.abs(a) + 2, 6, 3); fs(ctx, '#ff4d5e', 2); } break;
    case 'chef': rr(ctx, -20, -40, 40, 30, 6); fs(ctx, '#fff'); circle(ctx, -12, -44, 12, '#fff'); circle(ctx, 4, -50, 14, '#fff'); circle(ctx, 16, -42, 11, '#fff'); break;
    case 'cowboy': rr(ctx, -40, -18, 80, 8, 4); fs(ctx, '#a0662d'); poly(ctx, [[-22, -18], [-18, -44], [0, -38], [18, -44], [22, -18]], '#b97a3a'); rr(ctx, -21, -26, 42, 6, 2); fs(ctx, '#5a3a1a', 0); break;
    case 'crown': poly(ctx, [[-22, -14], [-24, -44], [-12, -30], [0, -50], [12, -30], [24, -44], [22, -14]], '#f5c542'); circle(ctx, 0, -24, 4, '#ff4d5e', 2); break;
    case 'viking': ctx.beginPath(); ctx.arc(0, -6, 27, Math.PI, 0); ctx.closePath(); fs(ctx, '#9aa6b8');
      poly(ctx, [[-24, -18], [-44, -40], [-40, -54], [-30, -26]], '#fff7e0'); poly(ctx, [[24, -18], [44, -40], [40, -54], [30, -26]], '#fff7e0'); break;
    case 'wizard': poly(ctx, [[-32, -14], [-4, -86], [30, -14]], '#3b2a8f'); ctx.fillStyle = '#ffd23f'; ctx.fillRect(-6, -48, 5, 5); ctx.fillRect(6, -30, 5, 5); rr(ctx, -34, -18, 68, 8, 4); fs(ctx, '#3b2a8f'); break;
    case 'astronaut': ctx.beginPath(); ctx.arc(2, 2, 40, 0, Math.PI * 2); ctx.fillStyle = 'rgba(190,230,255,.35)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#e8edf7'; ctx.stroke(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(14, -26, 8, 8); break;
    default: break;
  }
}

function drawGlasses(ctx, g) {
  ctx.lineWidth = 2.4; ctx.strokeStyle = INK;
  switch (g) {
    case 'round': ctx.beginPath(); ctx.arc(8, 0, 6.5, 0, Math.PI * 2); ctx.moveTo(24.5, 0); ctx.arc(18, 0, 6.5, 0, Math.PI * 2); ctx.moveTo(1.5, 0); ctx.lineTo(-8, -3); ctx.stroke(); break;
    case 'square': ctx.strokeRect(2, -6, 12, 11); ctx.strokeRect(15, -6, 12, 11); ctx.beginPath(); ctx.moveTo(2, -2); ctx.lineTo(-8, -4); ctx.stroke(); break;
    case 'sun': rr(ctx, 1, -6, 13, 11, 4); fs(ctx, '#141833', 2); rr(ctx, 15, -6, 13, 11, 4); fs(ctx, '#141833', 2); ctx.beginPath(); ctx.moveTo(1, -2); ctx.lineTo(-8, -4); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(4, -4, 3, 3); ctx.fillRect(18, -4, 3, 3); break;
    case '3d': rr(ctx, 1, -6, 13, 11, 2); fs(ctx, '#ff3b5c', 2); rr(ctx, 15, -6, 13, 11, 2); fs(ctx, '#2fb7ff', 2); break;
    case 'monocle': ctx.beginPath(); ctx.arc(18, 0, 7, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(18, 7); ctx.quadraticCurveTo(14, 26, 4, 30); ctx.lineWidth = 1.5; ctx.strokeStyle = '#f5c542'; ctx.stroke(); break;
    case 'star': for (const cx of [8, 20]) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.5 : 8; ctx.lineTo(cx + Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); fs(ctx, '#ffd23f', 2); } break;
    case 'visor': rr(ctx, -4, -6, 34, 10, 5); fs(ctx, '#2fd06a', 2); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(4, -4, 10, 2); break;
    default: break;
  }
}

/** Draw the worker at the origin (chair base on the ground). */
export function drawWorker(ctx, look, pose = {}, t = 0) {
  const { arm = 0, legs = 0, mouth = 'smile', blink = false, headShake = 0, ring = false } = pose;
  const skin = colorOf('skin', look.skin, '#f1c27d');
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawChair(ctx, look, pose, false);
  const sitY = look.chair === 'beanbag' ? 22 : look.chair === 'cart' ? 8 : 0;
  ctx.translate(0, sitY);
  // legs
  const knee = { x: 26, y: -66 - legs * 10 }, foot = { x: 34 + legs * 18, y: -24 - legs * 26 };
  ctx.lineWidth = 13; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-8, -64); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
  ctx.lineWidth = 9; ctx.strokeStyle = look.shirt === 'suit' || look.shirt === 'tux' ? '#1f2a44' : '#41476b'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(foot.x + 6, foot.y + 2, 11, 6, legs * 0.6, 0, Math.PI * 2); fs(ctx, '#2b2f45');
  // torso
  rr(ctx, -26, -132, 38, 70, 14); fs(ctx, shirtFill(ctx, look, -26, -132, 38, 70));
  if (look.shirt === 'hoodie') { ctx.beginPath(); ctx.arc(-14, -128, 16, Math.PI * 0.9, Math.PI * 1.9); fs(ctx, '#6b7280'); }
  if (look.shirt === 'hawaii') { ctx.fillStyle = '#ffe66d'; for (const [x, y] of [[-16, -116], [-2, -100], [-14, -84], [2, -122]]) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); } }
  if (look.shirt === 'gold') { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-18, -124, 5, 40); }
  if (look.shirt === 'suit' || look.shirt === 'tux') {
    poly(ctx, [[-14, -132], [-4, -132], [-6, -110]], '#fff', 2);
    if (look.shirt === 'tux') { poly(ctx, [[-12, -128], [-4, -124], [-12, -120]], INK, 0); poly(ctx, [[2, -128], [-6, -124], [2, -120]], INK, 0); }
    else poly(ctx, [[-7, -126], [-1, -126], [1, -98], [-4, -92], [-9, -98]], '#ff4d5e', 2);
  }
  if (ring) { ctx.beginPath(); ctx.ellipse(-6, -84, 44, 14, 0, 0, Math.PI * 2); ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 8; ctx.strokeStyle = '#ff4d5e'; ctx.stroke(); }
  // arm
  const sh = { x: -6, y: -118 }, a1 = 0.9 + arm, a2 = a1 - 0.9 - arm * 0.6;
  const el = { x: sh.x + Math.cos(a1) * 30, y: sh.y + Math.sin(a1) * 30 }, hd = { x: el.x + Math.cos(a2) * 28, y: el.y + Math.sin(a2) * 28 };
  ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(el.x, el.y); ctx.lineTo(hd.x, hd.y); ctx.stroke();
  const sleeve = colorOf('shirt', look.shirt, '#ff4d5e');
  ctx.lineWidth = 8; ctx.strokeStyle = sleeve === 'rainbow' ? '#b45cff' : sleeve; ctx.stroke();
  circle(ctx, hd.x, hd.y, 6.5, skin, 2.5);
  // head
  ctx.save(); ctx.translate(-4 + headShake, -158);
  drawHair(ctx, look, true);
  circle(ctx, 0, 0, 25, skin);
  drawHair(ctx, look, false);
  if (blink) { ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(11, 0); ctx.moveTo(15, 0); ctx.lineTo(22, 0); ctx.stroke(); }
  else { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(8, 0, 3.2, 0, Math.PI * 2); ctx.arc(18, 0, 3.2, 0, Math.PI * 2); ctx.fill(); }
  drawGlasses(ctx, look.glasses);
  ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.beginPath();
  if (mouth === 'o') { ctx.fillStyle = '#7a1f2b'; ctx.ellipse(14, 12, 5, 6.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  else if (mouth === 'sad') { ctx.arc(14, 17, 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  else if (mouth === 'grin') { ctx.fillStyle = '#fff'; ctx.moveTo(6, 9); ctx.quadraticCurveTo(14, 20, 23, 9); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else { ctx.arc(14, 8, 6.5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,120,120,.35)'; ctx.beginPath(); ctx.arc(22, 8, 4, 0, Math.PI * 2); ctx.fill();
  drawHat(ctx, look.hat, t);
  ctx.restore();
  ctx.restore();
  drawChair(ctx, look, pose, true);
}

/** Round avatar (head and shoulders). */
export function drawAvatar(canvas, look, size = 36) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr; canvas.height = size * dpr; canvas.style.width = canvas.style.height = size + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr * size / 80, 0, 0, dpr * size / 80, 0, 0);
  const bg = colorOf('shirt', look.shirt, '#3b8cff');
  ctx.fillStyle = bg === 'rainbow' ? '#b45cff' : bg; ctx.beginPath(); ctx.arc(40, 40, 39, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(40, 40, 38, 0, Math.PI * 2); ctx.clip(); ctx.translate(36, 206); drawWorker(ctx, { ...look, chair: 'stool' }, {}); ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(40, 40, 38, 0, Math.PI * 2); ctx.stroke();
}

// ---------- props ----------
function car(ctx, x, color, t = 0, flash = 0, y = 0) {
  ctx.save(); ctx.translate(x, y);
  rr(ctx, -70, -50, 140, 34, 12); fs(ctx, color);
  poly(ctx, [[-40, -50], [-24, -78], [30, -78], [48, -50]], color);
  poly(ctx, [[-30, -52], [-19, -72], [0, -72], [0, -52]], '#bfe8ff', 2); poly(ctx, [[6, -52], [6, -72], [27, -72], [40, -52]], '#bfe8ff', 2);
  circle(ctx, -40, -14, 15, '#2b2f45'); circle(ctx, -40, -14, 6, '#c9cde0', 2); circle(ctx, 42, -14, 15, '#2b2f45'); circle(ctx, 42, -14, 6, '#c9cde0', 2);
  if (flash) { ctx.fillStyle = (Math.floor(t / 160) % 2) ? '#ffc43d' : '#ff4d5e'; ctx.fillRect(60, -44, 12, 10); ctx.fillRect(-72, -44, 12, 10); }
  ctx.restore();
}
function tree(ctx, x, s = 1, c = '#5bbf62', blossom = false) {
  ctx.save(); ctx.translate(x, 0); ctx.scale(s, s);
  rr(ctx, -8, -70, 16, 70, 4); fs(ctx, '#8b5e3c');
  circle(ctx, 0, -100, 44, c); circle(ctx, -28, -78, 28, c); circle(ctx, 30, -80, 30, c);
  if (blossom) { ctx.fillStyle = '#fff1f6'; for (const [px, py] of [[-14, -112], [10, -92], [24, -110], [-30, -84], [2, -128]]) ctx.fillRect(px, py, 6, 6); }
  ctx.restore();
}
function palm(ctx, x, t) {
  ctx.save(); ctx.translate(x, 0);
  ctx.lineWidth = 14; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(20, -90, 10, -190); ctx.stroke(); ctx.lineWidth = 9; ctx.strokeStyle = '#b07a46'; ctx.stroke();
  const sway = Math.sin(t / 700) * 0.08;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.55 + sway;
    ctx.beginPath(); ctx.moveTo(10, -190); ctx.quadraticCurveTo(10 + Math.cos(a) * 60, -210 + Math.sin(a) * 60, 10 + Math.cos(a) * 95, -165 + Math.sin(a) * 95);
    ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = 11; ctx.strokeStyle = '#3fae5a'; ctx.stroke();
  }
  ctx.restore();
}
function building(ctx, x, w, h, color, seed, lit = 0.3) {
  const r = rng(seed);
  rr(ctx, x, -h, w, h, 3); fs(ctx, color);
  for (let yy = -h + 22; yy < -46; yy += 40) for (let xx = x + 14; xx < x + w - 24; xx += 32) { rr(ctx, xx, yy, 18, 24, 2); fs(ctx, r() < lit ? '#ffe28a' : '#bfe8ff', 2); }
  rr(ctx, x + w / 2 - 18, -44, 36, 44, 3); fs(ctx, '#41476b', 2);
}
function cloud(ctx, x, y, s = 1, alpha = 0.95) {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (const [dx, dy, r] of [[0, 0, 34], [36, -14, 40], [76, 0, 32], [36, 10, 34]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); }
}
function signpost(ctx, x, y = 0, color = '#ffd23f') {
  rr(ctx, x - 4, y - 90, 8, 90, 2); fs(ctx, '#8b5e3c', 2);
  rr(ctx, x - 26, y - 104, 52, 30, 4); fs(ctx, color);
  ctx.fillStyle = INK; ctx.fillRect(x - 16, y - 92, 32, 4); ctx.fillRect(x - 16, y - 84, 20, 4);
}

// ---------- particles ----------
class Particles {
  constructor() { this.list = []; }
  add(p) { this.list.push({ vx: 0, vy: 0, g: 0, life: 1000, age: 0, rot: 0, vr: 0, size: 8, ...p }); if (this.list.length > 500) this.list.shift(); }
  burst(n, f) { for (let i = 0; i < n; i++) this.add(f(i)); }
  step(dt) {
    for (const p of this.list) { p.age += dt; p.vy += p.g * dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.rot += p.vr * dt / 1000; }
    this.list = this.list.filter(p => p.age < p.life);
  }
  draw(ctx) {
    for (const p of this.list) {
      const k = 1 - p.age / p.life;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, k * 1.6);
      const s = p.size;
      switch (p.type) {
        case 'dust': ctx.fillStyle = p.color || '#e9dcc3'; ctx.fillRect(-s * (1.6 - k) / 2, -s * (1.6 - k) / 2, s * (1.6 - k), s * (1.6 - k)); break;
        case 'shard': poly(ctx, [[0, -s], [s * 0.7, s], [-s * 0.6, s * 0.4]], 'rgba(191,232,255,.9)', 1.5); break;
        case 'paper': ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.fillRect(-9, -12, 18, 24); ctx.strokeRect(-9, -12, 18, 24); break;
        case 'square': ctx.fillStyle = p.color; ctx.fillRect(-s / 2, -s / 2, s, s); break;
        case 'confetti': ctx.fillStyle = p.color; ctx.fillRect(-s / 2, -s / 4, s, s / 2); break;
        case 'drop': ctx.fillStyle = p.color || '#4fc3f7'; ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); break;
        case 'bubble': ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke(); break;
        case 'spark': ctx.fillStyle = p.color || '#ffd166'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); break;
        case 'ring': ctx.globalAlpha = k; ctx.strokeStyle = p.color; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, s * (1.4 - k), 0, Math.PI * 2); ctx.stroke(); break;
        default: break;
      }
      ctx.restore();
    }
  }
}

// ---------- the scene ----------
export class Scene {
  constructor(canvas, { look, rtl = false, sound = true, pixel = 3, meters = 0, onLandmark } = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.buf = document.createElement('canvas'); this.b = this.buf.getContext('2d');
    this.look = look || lookFor('guest'); this.rtl = rtl; this.sound = sound; this.pixel = pixel; this.onLandmark = onLandmark;
    this.t = 0; this.last = performance.now(); this.shake = 0; this.zoomK = 1; this.flash = 0;
    this.parts = new Particles();
    this.windowBroken = meters > 56; this.carAlarm = 0;
    this.clock = null; this.state = 'idle'; this.anim = null;
    this.setPosition(meters);
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
    this.px = r.width < 700 ? Math.max(2, this.pixel - 1) : this.pixel;
    this.buf.width = Math.ceil(r.width / this.px); this.buf.height = Math.ceil(r.height / this.px);
    this.baseZ = clamp(Math.min(r.height / 560, r.width / 720), 0.5, 1.5);
  }
  get vw() { return this.w / (this.baseZ * this.zoomK); }
  get vh() { return this.h / (this.baseZ * this.zoomK); }

  // ---------- public API ----------
  setLook(look) { this.look = look; }
  setClock(left) { this.clock = left; }
  setPosition(m) {
    this.meters = m;
    this.char = { x: X(m), y: altitudeAt(m) + (zoneAt(m) === 'sea' ? 46 : 0), rot: 0, pose: {} };
    this.windowBroken = this.windowBroken || m > 56;
    this.state = 'idle'; this.anim = null;
    this.cam = null; // snap on the next frame
  }
  /** Build-up while the tier reveal plays. */
  charge(on = true) { this.state = on ? 'charge' : 'idle'; this.chargeStart = this.t; }
  launch({ meters, tier, onLand, onDone }) {
    const from = this.meters, to = from + meters;
    if (reducedMotion() || !meters) {
      this.setPosition(to); this.state = 'landed'; this.anim = { tier, landedAt: this.t, doneFired: true };
      onLand?.(); onDone?.(); return;
    }
    const D = to - from;
    this.anim = { tier, from, to, start: this.t, dur: 1000 + Math.min(3200, D * 2.4), apex: Math.max(140, X(D) * 0.3), onLand, onDone, passed: new Set() };
    this.state = 'fly';
    if (this.sound) sfx.whoosh(this.anim.dur / 1000);
    this.parts.burst(14, () => ({ type: 'dust', x: this.char.x - 20, y: this.char.y - 6, vx: -Math.random() * 300, vy: -Math.random() * 120, life: 700, size: 10 + Math.random() * 10 }));
    this.shake = 10;
  }
  miss(kind = 'timeout') {
    this.state = 'miss'; this.anim = { start: this.t };
    if (this.sound) { if (kind === 'timeout') sfx.ring(); setTimeout(() => sfx.sad(), kind === 'timeout' ? 550 : 0); }
  }
  reject() { if (this.sound) sfx.buzz(); this.rejectAt = this.t; this.shake = Math.max(this.shake, 6); }

  // ---------- simulation ----------
  update(dt) {
    this.parts.step(dt);
    this.shake *= Math.pow(0.002, dt / 1000);
    this.flash = Math.max(0, this.flash - dt / 400);
    const a = this.anim, ch = this.char, inSea = zoneAt(this.meters) === 'sea';
    ch.pose = { blink: (this.t % 3400) < 120, ring: inSea && this.state !== 'fly' };
    if (this.state === 'idle') {
      ch.rot = Math.sin(this.t / 900) * 0.03;
      ch.pose.arm = this.clock !== null ? Math.sin(this.t / 110) * 0.3 - 0.6 : Math.sin(this.t / 600) * 0.15;
      ch.pose.mouth = this.clock !== null && this.clock < 0.25 ? 'o' : 'smile';
      if (inSea) ch.y = altitudeAt(this.meters) + 46 + Math.sin(this.t / 400) * 5;
      if (this.rejectAt && this.t - this.rejectAt < 500) { ch.pose.headShake = Math.sin((this.t - this.rejectAt) / 30) * 6; ch.pose.mouth = 'sad'; }
    } else if (this.state === 'charge') {
      const k = Math.min(1, (this.t - this.chargeStart) / 1500);
      ch.rot = -0.08 - Math.sin(this.t / 30) * 0.03 * k; ch.pose.mouth = 'grin'; ch.pose.arm = -0.5; ch.pose.legs = -0.4; ch.pose.spinWheels = this.t / 30;
      this.shake = Math.max(this.shake, 2 + 4 * k);
      if (Math.random() < dt / 40) this.parts.add({ type: 'square', x: ch.x - 30 + Math.random() * 30, y: ch.y - 4, vx: -80 - Math.random() * 160, vy: -40 - Math.random() * 80, g: 300, life: 500, size: 6, color: '#cfd6ea' });
    } else if (this.state === 'fly') {
      const k = Math.min(1, (this.t - a.start) / a.dur), kx = easeOut(k);
      const x0 = X(a.from), x1 = X(a.to), y0 = altitudeAt(a.from), y1 = altitudeAt(a.to) + (zoneAt(a.to) === 'sea' ? 46 : 0);
      const prev = { x: ch.x, y: ch.y };
      ch.x = lerp(x0, x1, kx); ch.y = lerp(y0, y1, kx) - a.apex * 4 * kx * (1 - kx);
      this.meters = lerp(a.from, a.to, kx);
      const vx = (ch.x - prev.x) / Math.max(1, dt) * 1000;
      ch.rot = kx * (2 + a.tier) * Math.PI * 0.6; ch.pose.arm = Math.sin(this.t / 70) * 1.3 - 0.6; ch.pose.legs = Math.sin(this.t / 90) * 0.6; ch.pose.mouth = 'o'; ch.pose.spinWheels = this.t / 30; ch.pose.flame = true;
      this.speed = Math.abs(vx);
      this.zoomK = 1 - 0.38 * Math.sin(Math.PI * k) * clamp((a.to - a.from) / 700, 0, 1);
      if (!this.windowBroken && this.meters > 56) this.shatter();
      for (const lm of LANDMARKS) if (lm.m > a.from && lm.m <= this.meters && !a.passed.has(lm.key)) { a.passed.add(lm.key); this.onLandmark?.(lm); }
      this.emitTrail(dt, vx);
      if (k >= 1) this.land();
    } else if (this.state === 'landed') {
      const k = (this.t - a.landedAt) / 1000;
      ch.rot = lerp(ch.rot, 0, Math.min(1, dt / 120));
      ch.pose.mouth = a.tier >= 3 ? 'grin' : 'smile'; ch.pose.arm = a.tier >= 3 ? -1.3 + Math.sin(this.t / 140) * 0.35 : -0.2;
      if (inSea) ch.y = altitudeAt(this.meters) + 46 + Math.sin(this.t / 400) * 5;
      if (zoneAt(this.meters) === 'moon') ch.y = altitudeAt(this.meters) - Math.abs(Math.sin(k * 2.2)) * 60 * Math.exp(-k * 0.9);
      this.zoomK = lerp(this.zoomK, 1, Math.min(1, dt / 300));
      if (!a.doneFired && k > 0.9) { a.doneFired = true; this.state = 'idle'; a.onDone?.(); }
    } else if (this.state === 'miss') {
      const k = (this.t - a.start) / 1000;
      ch.rot = Math.sin(k * 6) * 0.05 * Math.max(0, 2 - k); ch.pose.mouth = 'sad'; ch.pose.arm = 0.6; ch.pose.spinWheels = k * 4;
      if (k > 1.6) this.state = 'idle';
    }
    this.followCamera(dt);
  }
  emitTrail(dt, vx) {
    const ch = this.char, kind = this.look.trail || 'paper', back = -Math.sign(vx || 1);
    const at = { x: ch.x - 30, y: ch.y - 90 };
    const rate = { paper: 80, sparkle: 30, coffee: 40, bubbles: 35, fire: 18, rainbow: 12, stars: 28 }[kind] || 80;
    if (Math.random() > dt / rate) return;
    const base = { x: at.x + (Math.random() - 0.5) * 20, y: at.y + (Math.random() - 0.5) * 30, vx: back * Math.abs(vx) * 0.12 + (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80 };
    const cols = ['#ff4d5e', '#ffc43d', '#2fd06a', '#3b8cff', '#b45cff'];
    if (kind === 'paper') this.parts.add({ ...base, type: 'paper', g: 120, vr: (Math.random() - 0.5) * 8, life: 1600 });
    else if (kind === 'sparkle') this.parts.add({ ...base, type: 'spark', life: 700, size: 8 + Math.random() * 6, color: Math.random() < 0.5 ? '#ffd166' : '#fff' });
    else if (kind === 'coffee') this.parts.add({ ...base, type: 'drop', g: 700, life: 900, size: 5, color: '#6f4e37' });
    else if (kind === 'bubbles') this.parts.add({ ...base, type: 'bubble', vy: -60, life: 1200, size: 6 + Math.random() * 6 });
    else if (kind === 'fire') this.parts.add({ ...base, type: 'square', vy: -40 - Math.random() * 60, life: 500, size: 10 + Math.random() * 8, color: Math.random() < 0.5 ? '#ff7a1f' : '#ffd23f' });
    else if (kind === 'rainbow') this.parts.add({ ...base, x: at.x, y: at.y + 30, vx: 0, vy: 0, type: 'square', life: 900, size: 16, color: cols[Math.floor(this.t / 60) % cols.length] });
    else this.parts.add({ ...base, type: 'spark', life: 900, size: 10, color: cols[Math.floor(Math.random() * cols.length)] });
  }
  shatter() {
    this.windowBroken = true; this.shake = 14; this.flash = 0.35;
    if (this.sound) sfx.crash();
    this.parts.burst(26, () => ({ type: 'shard', x: X(57), y: -60 - Math.random() * 300, vx: 150 + Math.random() * 500, vy: -200 + Math.random() * 250, g: 900, vr: (Math.random() - 0.5) * 14, life: 1300, size: 6 + Math.random() * 10 }));
  }
  land() {
    const a = this.anim, ch = this.char, zone = zoneAt(a.to), tier = a.tier;
    this.meters = a.to; this.state = 'landed'; a.landedAt = this.t;
    ch.x = X(a.to); ch.y = altitudeAt(a.to) + (zone === 'sea' ? 46 : 0); ch.rot = Math.atan2(Math.sin(ch.rot), Math.cos(ch.rot));
    this.shake = [0, 8, 12, 16, 20, 26][tier] || 10; this.flash = tier >= 4 ? 0.5 : 0.2;
    if (zone === 'sea') { if (this.sound) sfx.splash(); this.parts.burst(40, () => ({ type: 'drop', x: ch.x + (Math.random() - 0.5) * 60, y: ch.y - 30, vx: (Math.random() - 0.5) * 420, vy: -300 - Math.random() * 520, g: 1100, life: 1300, size: 5 + Math.random() * 7, color: Math.random() < 0.5 ? '#4fc3f7' : '#e1f5fe' })); }
    else if (zone === 'sky') { if (this.sound) sfx.boing(); this.parts.burst(20, () => ({ type: 'dust', x: ch.x + (Math.random() - 0.5) * 120, y: ch.y, vx: (Math.random() - 0.5) * 200, vy: -60 - Math.random() * 60, life: 1000, size: 14 + Math.random() * 12, color: '#fff' })); }
    else { if (this.sound) sfx.thud(); if (zone === 'parking') this.carAlarm = this.t; this.parts.burst(16, () => ({ type: 'dust', x: ch.x + (Math.random() - 0.5) * 80, y: ch.y - 4, vx: (Math.random() - 0.5) * 220, vy: -40 - Math.random() * 90, life: 800, size: 8 + Math.random() * 10, color: zone === 'moon' ? '#d9d9e8' : '#e9dcc3' })); }
    this.parts.add({ type: 'ring', x: ch.x, y: ch.y - 60, life: 600, size: 140, color: TIER_COLORS[tier] });
    if (tier >= 4) {
      const cols = ['#ff4d5e', '#ffc43d', '#2fd06a', '#3b8cff', '#b45cff', '#ff8fab'];
      this.parts.burst(tier === 5 ? 90 : 55, () => ({ type: 'confetti', x: ch.x + (Math.random() - 0.5) * 60, y: ch.y - 160, vx: (Math.random() - 0.5) * 700, vy: -400 - Math.random() * 500, g: 700, vr: (Math.random() - 0.5) * 16, life: 2200, size: 9 + Math.random() * 7, color: cols[Math.floor(Math.random() * cols.length)] }));
    }
    if (this.sound) setTimeout(() => sfx.fanfare(tier), 140);
    a.onLand?.();
  }
  followCamera(dt) {
    const ch = this.char;
    const tx = ch.x - this.vw * (this.state === 'fly' ? 0.45 : 0.38), ty = ch.y + this.vh * 0.18;
    if (!this.cam) { this.cam = { x: tx, y: ty }; return; }
    const k = this.state === 'fly' ? Math.min(1, dt / 40) : Math.min(1, dt / 200);
    this.cam.x = lerp(this.cam.x, tx, k); this.cam.y = lerp(this.cam.y, ty, k);
  }

  // ---------- rendering ----------
  inView(x, pad = 400) { return x > this.cam.x - pad && x < this.cam.x + this.vw + pad; }
  draw() {
    if (!this.w || !this.cam) return;
    const { b, buf } = this, W = buf.width, H = buf.height, z = this.baseZ * this.zoomK / this.px;
    const alt = -(this.cam.y - this.vh * 0.5);
    b.setTransform(1, 0, 0, 1, 0, 0);
    const space = clamp((alt - 1600) / 3200, 0, 1), dusk = clamp((alt - 600) / 1400, 0, 1) * (1 - space);
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mix(mix('#5ab8ff', '#7a5cc8', dusk), '#04061a', space)); g.addColorStop(1, mix(mix('#cfeeff', '#ffb38a', dusk), '#1b1f4a', space));
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    if (space > 0.05) { const r = rng(7); b.fillStyle = `rgba(255,255,255,${space})`; for (let i = 0; i < 140; i++) { const sx = (r() * W * 4 - this.cam.x * 0.01 / this.px) % W; b.fillRect((sx + W) % W, (r() * H + alt * 0.02 / this.px) % H, 1, 1); } }
    const sunY = H * 0.18 + alt * 0.02 / this.px;
    b.fillStyle = space > 0.6 ? 'rgba(255,240,200,.25)' : 'rgba(255,233,140,.9)'; b.fillRect(W * 0.78, sunY, W * 0.06, W * 0.06);
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    b.setTransform(z * (this.rtl ? -1 : 1), 0, 0, z, this.rtl ? W : 0, 0);
    b.translate(-this.cam.x + sx, -this.cam.y + this.vh * 0.5 + sy);
    this.drawParallax(b);
    this.drawGround(b);
    this.drawProps(b);
    b.save(); b.translate(this.char.x, this.char.y); b.rotate(this.char.rot); drawWorker(b, this.look, this.char.pose, this.t); b.restore();
    this.drawFront(b);
    this.parts.draw(b);
    b.setTransform(1, 0, 0, 1, 0, 0);
    if (this.state === 'fly' && this.speed > 1500) {
      b.fillStyle = `rgba(255,255,255,${clamp((this.speed - 1500) / 6000, 0, 0.6)})`;
      const r = rng(Math.floor(this.t / 50));
      for (let i = 0; i < 14; i++) b.fillRect(r() * W, r() * H, 20 + r() * 40, 1);
    }
    if (this.flash > 0) { b.fillStyle = `rgba(255,255,255,${this.flash})`; b.fillRect(0, 0, W, H); }
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W * this.px * this.dpr, H * this.px * this.dpr);
  }
  drawParallax(ctx) {
    const cx = this.cam.x, cy = this.cam.y;
    ctx.save(); ctx.translate(cx * 0.88, cy * 0.88);
    ctx.fillStyle = '#a7d3e6';
    const base = Math.floor((cx * 0.12) / 900) * 900 - 1800;
    ctx.beginPath(); ctx.moveTo(base, 60);
    for (let x = base; x <= base + this.vw * 2 + 3600; x += 150) ctx.lineTo(x, -150 - Math.sin(x / 260) * 60 - Math.sin(x / 97) * 22);
    ctx.lineTo(base + this.vw * 2 + 3600, 60); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (this.meters < 2800) {
      ctx.save(); ctx.translate(cx * 0.65, cy * 0.62);
      const b2 = Math.floor((cx * 0.35) / 400) * 400 - 800;
      ctx.fillStyle = '#8fbfd6';
      for (let x = b2; x < b2 + this.vw * 3 + 1600; x += 80) { const hh = 120 + (hash(Math.floor(x / 80)) % 240); ctx.fillRect(x, -hh, 70, hh + 60); }
      ctx.restore();
    }
    ctx.save(); ctx.translate(cx * 0.75, cy * 0.7);
    const b3 = Math.floor((cx * 0.25) / 700) * 700 - 1400;
    for (let x = b3; x < b3 + this.vw * 4 + 2800; x += 700) { const r = rng(hash('c' + x)); cloud(ctx, x + (this.t / 60) % 700, -360 - r() * 500, 1 + r()); }
    ctx.restore();
  }
  drawGround(ctx) {
    const l = this.cam.x - 300, r = this.cam.x + this.vw + 300;
    for (const zn of ZONES) {
      const a = Math.max(l, X(zn.from)), b = Math.min(r, X(zn.to));
      if (a >= b) continue;
      if (zn.id === 'sea') {
        ctx.fillStyle = '#2f9fd8'; ctx.fillRect(a, 0, b - a, 1200);
        ctx.fillStyle = '#5bc0f0'; ctx.beginPath(); ctx.moveTo(a, 1200);
        for (let x = a; x <= b + 40; x += 40) ctx.lineTo(x, Math.sin(x / 60 + this.t / 300) * 7);
        ctx.lineTo(b + 40, 1200); ctx.closePath(); ctx.fill();
        continue;
      }
      if (zn.id === 'sky') { for (let x = Math.floor(a / 120) * 120; x < b; x += 120) cloud(ctx, x - 60, altitudeAt(x / PPM) + 30, 1.8, 1); continue; }
      if (zn.id === 'moon') {
        ctx.fillStyle = '#d9d9e8'; ctx.fillRect(a, MOON_Y, b - a, 3000); ctx.fillStyle = INK; ctx.fillRect(a, MOON_Y, b - a, 4);
        ctx.fillStyle = '#c3c3d6'; for (let x = Math.ceil(a / 260) * 260; x < b; x += 260) { ctx.beginPath(); ctx.ellipse(x, MOON_Y + 40 + (hash(x) % 60), 50, 14, 0, 0, Math.PI * 2); ctx.fill(); }
        continue;
      }
      const col = { office: '#c99a6b', parking: '#5b6275', city: '#8a90a6', park: '#7bc96f', beach: '#f3d89b' }[zn.id];
      ctx.fillStyle = col; ctx.fillRect(a, 0, b - a, 1200); ctx.fillStyle = INK; ctx.fillRect(a, 0, b - a, 4);
      if (zn.id === 'office') { ctx.strokeStyle = 'rgba(29,35,64,.25)'; ctx.lineWidth = 2; for (let x = Math.ceil(a / 90) * 90; x < b; x += 90) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x - 30, 60); ctx.stroke(); } }
      if (zn.id === 'parking') { ctx.fillStyle = '#ffd34d'; for (let x = Math.ceil(a / 240) * 240; x < b; x += 240) ctx.fillRect(x, 26, 90, 8); }
      if (zn.id === 'city') { ctx.fillStyle = '#c3c7d6'; ctx.fillRect(a, 4, b - a, 22); ctx.fillStyle = '#fff'; for (let x = Math.ceil(a / 200) * 200; x < b; x += 200) ctx.fillRect(x, 50, 80, 6); }
      if (zn.id === 'park') { ctx.fillStyle = '#5fb257'; for (let x = Math.ceil(a / 50) * 50; x < b; x += 50) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 8, -10); ctx.lineTo(x + 14, 4); ctx.fill(); } }
    }
  }
  drawProps(ctx) {
    const t = this.t;
    if (this.inView(0, 1000)) {
      rr(ctx, -800, -1500, 1160, 1040, 0); fs(ctx, '#9aa7c7', 4);
      for (let fy = -1440; fy < -520; fy += 150) for (let fx = -740; fx < 320; fx += 130) { rr(ctx, fx, fy, 84, 96, 4); fs(ctx, (fx + fy) % 3 ? '#bfe8ff' : '#ffe28a', 3); }
      rr(ctx, -820, -1530, 1200, 40, 4); fs(ctx, '#41476b', 4);
      rr(ctx, -780, -460, 1120, 460, 0); fs(ctx, '#f6ead2', 4);
      ctx.fillStyle = '#e9d9b8'; ctx.fillRect(-776, -150, 1112, 150);
      for (const lx of [-560, -200, 140]) { rr(ctx, lx, -452, 150, 14, 4); fs(ctx, '#fffbe6', 2); ctx.fillStyle = 'rgba(255,251,200,.22)'; ctx.beginPath(); ctx.moveTo(lx, -438); ctx.lineTo(lx + 150, -438); ctx.lineTo(lx + 210, -150); ctx.lineTo(lx - 60, -150); ctx.closePath(); ctx.fill(); }
      const left = this.clock ?? 1, hot = this.clock !== null && left < 0.25;
      ctx.save(); ctx.translate(-300 + (hot ? Math.sin(t / 25) * 2 : 0), -330);
      circle(ctx, 0, 0, 46, hot ? '#ffd6da' : '#fff', 4);
      if (this.clock !== null) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.closePath(); ctx.fillStyle = hot ? 'rgba(255,77,94,.5)' : 'rgba(46,196,182,.4)'; ctx.fill(); }
      const hand = this.clock !== null ? -Math.PI / 2 + Math.PI * 2 * (1 - left) : t / 3000;
      ctx.lineWidth = 4; ctx.strokeStyle = hot ? '#ff4d5e' : INK; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hand) * 32, Math.sin(hand) * 32); ctx.stroke();
      ctx.restore();
      rr(ctx, -700, -360, 220, 150, 6); fs(ctx, '#fff', 4);
      ctx.lineWidth = 4; ctx.strokeStyle = '#2ec4b6'; ctx.beginPath(); ctx.moveTo(-680, -240); ctx.lineTo(-640, -262); ctx.lineTo(-600, -250); ctx.lineTo(-560, -300); ctx.lineTo(-510, -330); ctx.stroke();
      const peek = Math.max(0, Math.sin(t / 1300)) * 26;
      circle(ctx, -530, -168 - peek, 24, '#e0ac69'); ctx.fillStyle = INK; ctx.fillRect(-524, -174 - peek, 5, 5); ctx.fillRect(-512, -174 - peek, 5, 5);
      rr(ctx, -620, -170, 210, 170, 6); fs(ctx, '#9aa7c7', 4);
      rr(ctx, -360, -70, 54, 70, 8); fs(ctx, '#d9784c');
      for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate(-333, -70); ctx.rotate(-0.9 + i * 0.45 + Math.sin(t / 900 + i) * 0.05); ctx.beginPath(); ctx.ellipse(0, -40, 13, 40, 0, 0, Math.PI * 2); fs(ctx, '#3fae5a', 3); ctx.restore(); }
      rr(ctx, -230, -110, 200, 18, 4); fs(ctx, '#a8744a');
      rr(ctx, -220, -92, 14, 92, 3); fs(ctx, '#8b5e3c'); rr(ctx, -54, -92, 14, 92, 3); fs(ctx, '#8b5e3c');
      rr(ctx, -200, -210, 120, 84, 6); fs(ctx, '#2b2f45');
      rr(ctx, -190, -200, 100, 64, 3); fs(ctx, this.clock !== null ? '#7be3d6' : '#5ab8ff', 2);
      if (this.clock !== null) { ctx.fillStyle = INK; for (let i = 0; i < 4; i++) ctx.fillRect(-180, -190 + i * 14, 30 + ((i * 37 + Math.floor(t / 200)) % 50), 6); }
      rr(ctx, -146, -126, 12, 16, 2); fs(ctx, '#41476b', 2);
      rr(ctx, -76, -138, 24, 28, 5); fs(ctx, '#ff4d5e');
      rr(ctx, 160, -120, 56, 120, 6); fs(ctx, '#e8edf7'); rr(ctx, 166, -200, 44, 80, 16); fs(ctx, 'rgba(120,200,255,.75)');
      if (!this.windowBroken) { rr(ctx, X(56), -440, 22, 440, 2); fs(ctx, 'rgba(191,232,255,.55)', 3); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(56) + 4, -380); ctx.lineTo(X(56) + 18, -420); ctx.stroke(); }
      else { ctx.fillStyle = INK; ctx.fillRect(X(56), -440, 22, 16); ctx.fillRect(X(56), -14, 22, 14); }
    }
    if (this.inView(X(230), 1400)) {
      rr(ctx, X(66), -120, 90, 120, 6); fs(ctx, '#ffd34d'); rr(ctx, X(66) + 12, -104, 66, 40, 4); fs(ctx, '#bfe8ff', 2);
      ctx.save(); ctx.translate(X(66) + 90, -70); ctx.rotate(-0.15 + Math.sin(t / 2000) * 0.05); rr(ctx, 0, -6, 220, 12, 6); fs(ctx, '#ff4d5e'); ctx.restore();
      const cols = ['#7b5cff', '#2ec4b6', '#ff4d5e', '#ffc43d', '#3b82f6', '#ff8fab'];
      for (let i = 0; i < 7; i++) { const cxm = 110 + i * 32; car(ctx, X(cxm), cols[i % cols.length], t, this.carAlarm && t - this.carAlarm < 4000 && Math.abs(this.meters - cxm) < 20); }
      car(ctx, X(350), '#f5c542'); signpost(ctx, X(350) + 110, 0, '#f5c542');
      rr(ctx, X(150), -260, 70, 70, 8); fs(ctx, '#3b82f6'); ctx.fillStyle = '#fff'; ctx.fillRect(X(150) + 24, -246, 8, 44); ctx.fillRect(X(150) + 24, -246, 24, 8); ctx.fillRect(X(150) + 24, -228, 24, 8); ctx.fillRect(X(150) + 44, -246, 8, 26);
      for (const lm of [100, 270, 320]) { rr(ctx, X(lm), -300, 10, 300, 3); fs(ctx, '#41476b', 2); rr(ctx, X(lm) - 24, -310, 44, 14, 6); fs(ctx, '#41476b', 2); }
    }
    if (this.inView(X(1000), X(700))) {
      const cols = ['#ff8fab', '#ffd166', '#a0c4ff', '#caffbf', '#ffc6ff', '#9bf6ff'];
      let x = X(410), i = 0;
      while (x < X(1590)) {
        const bw = 180 + (hash('b' + i) % 120), bh = 260 + (hash('h' + i) % 360);
        const near = Math.abs(x / PPM - 1000) < 70 || Math.abs(x / PPM - 1400) < 60 || Math.abs(x / PPM - 600) < 40;
        if (!near && this.inView(x, 500)) building(ctx, x, bw, bh, cols[i % cols.length], hash('w' + i));
        x += bw + 50; i++;
      }
      rr(ctx, X(600) - 60, -90, 120, 70, 8); fs(ctx, '#8b5e3c'); poly(ctx, [[X(600) - 70, -90], [X(600) + 70, -90], [X(600) + 50, -130], [X(600) - 50, -130]], '#ff4d5e');
      circle(ctx, X(600) - 40, -14, 14, '#2b2f45'); circle(ctx, X(600) + 40, -14, 14, '#2b2f45');
      rr(ctx, X(1000) - 180, -260, 360, 260, 4); fs(ctx, '#f1ead8'); poly(ctx, [[X(1000) - 200, -260], [X(1000), -340], [X(1000) + 200, -260]], '#e3d6b8');
      for (let c = -150; c <= 150; c += 60) { rr(ctx, X(1000) + c - 10, -240, 20, 240, 2); fs(ctx, '#fff', 2); }
      ctx.beginPath(); ctx.arc(X(1000), -340, 60, Math.PI, 0); ctx.closePath(); fs(ctx, '#5bc0a8');
      rr(ctx, X(1400) - 90, -1200, 180, 1200, 4); fs(ctx, '#7aa5d6');
      for (let yy = -1170; yy < -40; yy += 46) for (let xx = -70; xx < 70; xx += 34) { rr(ctx, X(1400) + xx, yy, 22, 28, 2); fs(ctx, (yy + xx) % 4 ? '#bfe8ff' : '#ffe28a', 2); }
      rr(ctx, X(1400) - 4, -1320, 8, 120, 2); fs(ctx, '#41476b', 2); circle(ctx, X(1400), -1324, 8, (Math.floor(t / 500) % 2) ? '#ff4d5e' : '#7a1f2b', 2);
      rr(ctx, X(800), -260, 10, 260, 3); fs(ctx, '#41476b', 2); rr(ctx, X(800) - 14, -320, 38, 80, 8); fs(ctx, '#2b2f45');
      const ph = Math.floor(t / 1500) % 3; ['#ff4d5e', '#ffc43d', '#22c55e'].forEach((c, k) => circle(ctx, X(800) + 5, -304 + k * 24, 8, k === ph ? c : '#41476b', 2));
    }
    if (this.inView(X(2100), X(600))) {
      for (let k = 0; k < 14; k++) { const m = 1640 + k * 70 + (hash('t' + k) % 30); if (Math.abs(m - 2000) > 60 && Math.abs(m - 2400) > 50) tree(ctx, X(m), 0.8 + (k % 3) * 0.2, k % 2 ? '#5bbf62' : '#3fae5a', k % 3 === 0); }
      rr(ctx, X(2000) - 150, -70, 300, 70, 30); fs(ctx, '#bfe8ff');
      for (let k = 0; k < 8; k++) { ctx.fillStyle = '#4fc3f7'; ctx.beginPath(); ctx.arc(X(2000) + Math.sin(t / 200 + k) * 40, -90 - ((t / 3 + k * 40) % 140), 6, 0, Math.PI * 2); ctx.fill(); }
      rr(ctx, X(2400) - 110, -150, 220, 120, 12); fs(ctx, '#fff'); rr(ctx, X(2400) - 80, -130, 80, 50, 4); fs(ctx, '#bfe8ff', 2);
      poly(ctx, [[X(2400) + 40, -150], [X(2400) + 60, -200], [X(2400) + 80, -150]], '#f3d89b'); circle(ctx, X(2400) + 60, -206, 14, '#ff8fab');
      circle(ctx, X(2400) - 70, -26, 18, '#2b2f45'); circle(ctx, X(2400) + 70, -26, 18, '#2b2f45');
    }
    if (this.inView(X(2900), X(400))) {
      palm(ctx, X(2650), t); palm(ctx, X(3000), t + 900); palm(ctx, X(3150), t + 400);
      rr(ctx, X(2800) - 70, -250, 140, 70, 6); fs(ctx, '#fff'); poly(ctx, [[X(2800) - 80, -250], [X(2800), -300], [X(2800) + 80, -250]], '#ff4d5e');
      for (const px of [-55, 55]) { rr(ctx, X(2800) + px - 4, -180, 8, 180, 2); fs(ctx, '#a8744a', 2); }
      for (const [m, c] of [[2700, '#ffc43d'], [2900, '#2ec4b6'], [3080, '#ff8fab']]) { ctx.beginPath(); ctx.moveTo(X(m), 0); ctx.lineTo(X(m), -150); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke(); ctx.beginPath(); ctx.arc(X(m), -150, 90, Math.PI, 0); ctx.closePath(); fs(ctx, c); }
    }
    if (this.inView(X(4000), X(900))) {
      rr(ctx, X(3450), -40, 400, 16, 2); fs(ctx, '#a8744a'); for (let k = 0; k < 5; k++) { rr(ctx, X(3450) + k * 90, -24, 10, 80, 2); fs(ctx, '#8b5e3c', 2); }
      for (const [m, c] of [[3550, '#ff8fab'], [3800, '#ffc43d'], [4050, '#2ec4b6']]) {
        ctx.save(); ctx.translate(X(m), Math.sin(t / 500 + m) * 6); ctx.rotate(Math.sin(t / 700 + m) * 0.04);
        poly(ctx, [[-90, -10], [90, -10], [60, 26], [-60, 26]], '#fff'); poly(ctx, [[0, -14], [0, -170], [70, -30]], c); ctx.restore();
      }
      ctx.beginPath(); ctx.ellipse(X(4300), 10, 260, 60, 0, Math.PI, 0); ctx.closePath(); fs(ctx, '#c9b98f');
      rr(ctx, X(4300) - 40, -360, 80, 340, 6); fs(ctx, '#fff'); for (let k = 0; k < 3; k++) { rr(ctx, X(4300) - 40, -320 + k * 100, 80, 40, 0); fs(ctx, '#ff4d5e', 2); }
      rr(ctx, X(4300) - 50, -420, 100, 60, 6); fs(ctx, '#ffe28a');
      ctx.fillStyle = `rgba(255,235,140,${0.25 + 0.15 * Math.sin(t / 300)})`; ctx.beginPath(); ctx.moveTo(X(4300), -390); ctx.lineTo(X(4300) + 700, -520); ctx.lineTo(X(4300) + 700, -260); ctx.closePath(); ctx.fill();
    }
    if (this.inView(X(5300), X(700))) {
      const px = X(5000) + Math.sin(t / 3000) * 200, py = altitudeAt(5000) - 300;
      ctx.save(); ctx.translate(px, py); rr(ctx, -110, -20, 220, 40, 20); fs(ctx, '#fff'); poly(ctx, [[-20, 0], [-60, 70], [-20, 70], [30, 0]], '#3b82f6'); poly(ctx, [[-100, -20], [-120, -70], [-80, -20]], '#3b82f6');
      for (let k = -60; k < 80; k += 30) { rr(ctx, k, -10, 14, 12, 4); fs(ctx, '#bfe8ff', 2); } ctx.restore();
      const by = altitudeAt(5500) - 420 + Math.sin(t / 900) * 30;
      circle(ctx, X(5500), by, 70, '#fff'); ctx.beginPath(); ctx.moveTo(X(5500), by + 70); ctx.lineTo(X(5500), by + 200); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); rr(ctx, X(5500) - 16, by + 200, 32, 26, 3); fs(ctx, '#ffc43d');
    }
    if (this.inView(X(5900), 1200)) {
      ctx.beginPath(); ctx.moveTo(X(5900), MOON_Y); ctx.lineTo(X(5900), MOON_Y - 220); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
      poly(ctx, [[X(5900), MOON_Y - 220], [X(5900) + 120, MOON_Y - 200 + Math.sin(t / 200) * 4], [X(5900), MOON_Y - 170]], '#ff4d5e');
      circle(ctx, X(5700), MOON_Y - 900, 160, '#3b8cff'); ctx.fillStyle = '#2fd06a'; ctx.fillRect(X(5700) - 80, MOON_Y - 950, 70, 50); ctx.fillRect(X(5700) + 20, MOON_Y - 880, 60, 40);
    }
  }
  drawFront(ctx) { if (this.inView(X(57))) { ctx.fillStyle = INK; ctx.fillRect(X(56) - 2, -460, 4, 460); } }
}

function mix(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',')})`;
}
