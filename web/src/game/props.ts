// Scenery along the route: office, parking, city, park, beach, sea, sky and the Moon.
import { INK, rr, fs, circle, poly } from './draw.ts';
import { hash, rng } from './random.ts';
import { PPM, X, ZONES, MOON_Y, WINDOW_M, altitudeAt } from './world.ts';

type Ctx = CanvasRenderingContext2D;

/** What the props need to know about the current frame. */
export interface View {
  t: number;
  camX: number;
  camY: number;
  vw: number;
  meters: number;
  /** Fraction of round time left, or null when no round is running. */
  clock: number | null;
  windowBroken: boolean;
  carAlarmAt: number;
}

const inView = (v: View, x: number, pad = 400): boolean => x > v.camX - pad && x < v.camX + v.vw + pad;

function car(ctx: Ctx, x: number, color: string, t = 0, flash = false): void {
  ctx.save(); ctx.translate(x, 0);
  rr(ctx, -70, -50, 140, 34, 12); fs(ctx, color);
  poly(ctx, [[-40, -50], [-24, -78], [30, -78], [48, -50]], color);
  poly(ctx, [[-30, -52], [-19, -72], [0, -72], [0, -52]], '#bfe8ff', 2); poly(ctx, [[6, -52], [6, -72], [27, -72], [40, -52]], '#bfe8ff', 2);
  circle(ctx, -40, -14, 15, '#2b2f45'); circle(ctx, -40, -14, 6, '#c9cde0', 2); circle(ctx, 42, -14, 15, '#2b2f45'); circle(ctx, 42, -14, 6, '#c9cde0', 2);
  if (flash) { ctx.fillStyle = Math.floor(t / 160) % 2 ? '#ffc43d' : '#ff4d5e'; ctx.fillRect(60, -44, 12, 10); ctx.fillRect(-72, -44, 12, 10); }
  ctx.restore();
}
function tree(ctx: Ctx, x: number, s = 1, c = '#5bbf62', blossom = false): void {
  ctx.save(); ctx.translate(x, 0); ctx.scale(s, s);
  rr(ctx, -8, -70, 16, 70, 4); fs(ctx, '#8b5e3c');
  circle(ctx, 0, -100, 44, c); circle(ctx, -28, -78, 28, c); circle(ctx, 30, -80, 30, c);
  if (blossom) { ctx.fillStyle = '#fff1f6'; for (const [px, py] of [[-14, -112], [10, -92], [24, -110], [-30, -84], [2, -128]] as const) ctx.fillRect(px, py, 6, 6); }
  ctx.restore();
}
function palm(ctx: Ctx, x: number, t: number): void {
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
function building(ctx: Ctx, x: number, w: number, h: number, color: string, seed: number): void {
  const r = rng(seed);
  rr(ctx, x, -h, w, h, 3); fs(ctx, color);
  for (let yy = -h + 22; yy < -46; yy += 40) for (let xx = x + 14; xx < x + w - 24; xx += 32) { rr(ctx, xx, yy, 18, 24, 2); fs(ctx, r() < 0.3 ? '#ffe28a' : '#bfe8ff', 2); }
  rr(ctx, x + w / 2 - 18, -44, 36, 44, 3); fs(ctx, '#41476b', 2);
}
export function cloud(ctx: Ctx, x: number, y: number, s = 1, alpha = 0.95): void {
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (const [dx, dy, r] of [[0, 0, 34], [36, -14, 40], [76, 0, 32], [36, 10, 34]] as const) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); }
}
function signpost(ctx: Ctx, x: number, color = '#ffd23f'): void {
  rr(ctx, x - 4, -90, 8, 90, 2); fs(ctx, '#8b5e3c', 2);
  rr(ctx, x - 26, -104, 52, 30, 4); fs(ctx, color);
  ctx.fillStyle = INK; ctx.fillRect(x - 16, -92, 32, 4); ctx.fillRect(x - 16, -84, 20, 4);
}

export function drawParallax(ctx: Ctx, v: View): void {
  const { camX: cx, camY: cy } = v;
  ctx.save(); ctx.translate(cx * 0.88, cy * 0.88);
  ctx.fillStyle = '#a7d3e6';
  const base = Math.floor((cx * 0.12) / 900) * 900 - 1800, end = base + v.vw * 2 + 3600;
  ctx.beginPath(); ctx.moveTo(base, 60);
  for (let x = base; x <= end; x += 150) ctx.lineTo(x, -150 - Math.sin(x / 260) * 60 - Math.sin(x / 97) * 22);
  ctx.lineTo(end, 60); ctx.closePath(); ctx.fill();
  ctx.restore();
  if (v.meters < 2800) {
    ctx.save(); ctx.translate(cx * 0.65, cy * 0.62);
    const b2 = Math.floor((cx * 0.35) / 400) * 400 - 800;
    ctx.fillStyle = '#8fbfd6';
    for (let x = b2; x < b2 + v.vw * 3 + 1600; x += 80) { const hh = 120 + (hash(Math.floor(x / 80)) % 240); ctx.fillRect(x, -hh, 70, hh + 60); }
    ctx.restore();
  }
  ctx.save(); ctx.translate(cx * 0.75, cy * 0.7);
  const b3 = Math.floor((cx * 0.25) / 700) * 700 - 1400;
  for (let x = b3; x < b3 + v.vw * 4 + 2800; x += 700) { const r = rng(hash('c' + x)); cloud(ctx, x + (v.t / 60) % 700, -360 - r() * 500, 1 + r()); }
  ctx.restore();
}

export function drawGround(ctx: Ctx, v: View): void {
  const l = v.camX - 300, r = v.camX + v.vw + 300;
  const colours: Record<string, string> = { office: '#c99a6b', parking: '#5b6275', city: '#8a90a6', park: '#7bc96f', beach: '#f3d89b' };
  for (const zn of ZONES) {
    const a = Math.max(l, X(zn.from)), b = Math.min(r, X(zn.to));
    if (a >= b) continue;
    if (zn.id === 'sea') {
      ctx.fillStyle = '#2f9fd8'; ctx.fillRect(a, 0, b - a, 1200);
      ctx.fillStyle = '#5bc0f0'; ctx.beginPath(); ctx.moveTo(a, 1200);
      for (let x = a; x <= b + 40; x += 40) ctx.lineTo(x, Math.sin(x / 60 + v.t / 300) * 7);
      ctx.lineTo(b + 40, 1200); ctx.closePath(); ctx.fill();
      continue;
    }
    if (zn.id === 'sky') { for (let x = Math.floor(a / 120) * 120; x < b; x += 120) cloud(ctx, x - 60, altitudeAt(x / PPM) + 30, 1.8, 1); continue; }
    if (zn.id === 'moon') {
      ctx.fillStyle = '#d9d9e8'; ctx.fillRect(a, MOON_Y, b - a, 3000); ctx.fillStyle = INK; ctx.fillRect(a, MOON_Y, b - a, 4);
      ctx.fillStyle = '#c3c3d6'; for (let x = Math.ceil(a / 260) * 260; x < b; x += 260) { ctx.beginPath(); ctx.ellipse(x, MOON_Y + 40 + (hash(x) % 60), 50, 14, 0, 0, Math.PI * 2); ctx.fill(); }
      continue;
    }
    ctx.fillStyle = colours[zn.id] ?? '#8a90a6'; ctx.fillRect(a, 0, b - a, 1200); ctx.fillStyle = INK; ctx.fillRect(a, 0, b - a, 4);
    if (zn.id === 'office') { ctx.strokeStyle = 'rgba(29,35,64,.25)'; ctx.lineWidth = 2; for (let x = Math.ceil(a / 90) * 90; x < b; x += 90) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x - 30, 60); ctx.stroke(); } }
    if (zn.id === 'parking') { ctx.fillStyle = '#ffd34d'; for (let x = Math.ceil(a / 240) * 240; x < b; x += 240) ctx.fillRect(x, 26, 90, 8); }
    if (zn.id === 'city') { ctx.fillStyle = '#c3c7d6'; ctx.fillRect(a, 4, b - a, 22); ctx.fillStyle = '#fff'; for (let x = Math.ceil(a / 200) * 200; x < b; x += 200) ctx.fillRect(x, 50, 80, 6); }
    if (zn.id === 'park') { ctx.fillStyle = '#5fb257'; for (let x = Math.ceil(a / 50) * 50; x < b; x += 50) { ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x + 8, -10); ctx.lineTo(x + 14, 4); ctx.fill(); } }
  }
}

function drawOffice(ctx: Ctx, v: View): void {
  const t = v.t;
  // the tower above the ground-floor office
  rr(ctx, -800, -1500, 1160, 1040, 0); fs(ctx, '#9aa7c7', 4);
  for (let fy = -1440; fy < -520; fy += 150) for (let fx = -740; fx < 320; fx += 130) { rr(ctx, fx, fy, 84, 96, 4); fs(ctx, (fx + fy) % 3 ? '#bfe8ff' : '#ffe28a', 3); }
  rr(ctx, -820, -1530, 1200, 40, 4); fs(ctx, '#41476b', 4);
  rr(ctx, -780, -460, 1120, 460, 0); fs(ctx, '#f6ead2', 4);
  ctx.fillStyle = '#e9d9b8'; ctx.fillRect(-776, -150, 1112, 150);
  for (const lx of [-560, -200, 140]) {
    rr(ctx, lx, -452, 150, 14, 4); fs(ctx, '#fffbe6', 2);
    ctx.fillStyle = 'rgba(255,251,200,.22)'; ctx.beginPath(); ctx.moveTo(lx, -438); ctx.lineTo(lx + 150, -438); ctx.lineTo(lx + 210, -150); ctx.lineTo(lx - 60, -150); ctx.closePath(); ctx.fill();
  }
  // wall clock: the round timer
  const left = v.clock ?? 1, hot = v.clock !== null && left < 0.25;
  ctx.save(); ctx.translate(-300 + (hot ? Math.sin(t / 25) * 2 : 0), -330);
  circle(ctx, 0, 0, 46, hot ? '#ffd6da' : '#fff', 4);
  if (v.clock !== null) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); ctx.closePath(); ctx.fillStyle = hot ? 'rgba(255,77,94,.5)' : 'rgba(46,196,182,.4)'; ctx.fill(); }
  const hand = v.clock !== null ? -Math.PI / 2 + Math.PI * 2 * (1 - left) : t / 3000;
  ctx.lineWidth = 4; ctx.strokeStyle = hot ? '#ff4d5e' : INK; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(hand) * 32, Math.sin(hand) * 32); ctx.stroke();
  ctx.restore();
  // whiteboard, colleague, plant, desk, water cooler
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
  rr(ctx, -190, -200, 100, 64, 3); fs(ctx, v.clock !== null ? '#7be3d6' : '#5ab8ff', 2);
  if (v.clock !== null) { ctx.fillStyle = INK; for (let i = 0; i < 4; i++) ctx.fillRect(-180, -190 + i * 14, 30 + ((i * 37 + Math.floor(t / 200)) % 50), 6); }
  rr(ctx, -146, -126, 12, 16, 2); fs(ctx, '#41476b', 2);
  rr(ctx, -76, -138, 24, 28, 5); fs(ctx, '#ff4d5e');
  rr(ctx, 160, -120, 56, 120, 6); fs(ctx, '#e8edf7'); rr(ctx, 166, -200, 44, 80, 16); fs(ctx, 'rgba(120,200,255,.75)');
  const wx = X(WINDOW_M);
  if (!v.windowBroken) { rr(ctx, wx, -440, 22, 440, 2); fs(ctx, 'rgba(191,232,255,.55)', 3); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx + 4, -380); ctx.lineTo(wx + 18, -420); ctx.stroke(); }
  else { ctx.fillStyle = INK; ctx.fillRect(wx, -440, 22, 16); ctx.fillRect(wx, -14, 22, 14); }
}

function drawParking(ctx: Ctx, v: View): void {
  const t = v.t;
  rr(ctx, X(66), -120, 90, 120, 6); fs(ctx, '#ffd34d'); rr(ctx, X(66) + 12, -104, 66, 40, 4); fs(ctx, '#bfe8ff', 2);
  ctx.save(); ctx.translate(X(66) + 90, -70); ctx.rotate(-0.15 + Math.sin(t / 2000) * 0.05); rr(ctx, 0, -6, 220, 12, 6); fs(ctx, '#ff4d5e'); ctx.restore();
  const cols = ['#7b5cff', '#2ec4b6', '#ff4d5e', '#ffc43d', '#3b82f6', '#ff8fab'];
  for (let i = 0; i < 7; i++) { const cxm = 110 + i * 32; car(ctx, X(cxm), cols[i % cols.length] ?? '#ff4d5e', t, t - v.carAlarmAt < 4000 && Math.abs(v.meters - cxm) < 20); }
  car(ctx, X(350), '#f5c542'); signpost(ctx, X(350) + 110, '#f5c542');
  rr(ctx, X(150), -260, 70, 70, 8); fs(ctx, '#3b82f6'); ctx.fillStyle = '#fff';
  ctx.fillRect(X(150) + 24, -246, 8, 44); ctx.fillRect(X(150) + 24, -246, 24, 8); ctx.fillRect(X(150) + 24, -228, 24, 8); ctx.fillRect(X(150) + 44, -246, 8, 26);
  for (const lm of [100, 270, 320]) { rr(ctx, X(lm), -300, 10, 300, 3); fs(ctx, '#41476b', 2); rr(ctx, X(lm) - 24, -310, 44, 14, 6); fs(ctx, '#41476b', 2); }
}

function drawCity(ctx: Ctx, v: View): void {
  const t = v.t;
  const cols = ['#ff8fab', '#ffd166', '#a0c4ff', '#caffbf', '#ffc6ff', '#9bf6ff'];
  let x = X(410), i = 0;
  while (x < X(1590)) {
    const bw = 180 + (hash('b' + i) % 120), bh = 260 + (hash('h' + i) % 360), m = x / PPM;
    const near = Math.abs(m - 1000) < 70 || Math.abs(m - 1400) < 60 || Math.abs(m - 600) < 40;
    if (!near && inView(v, x, 500)) building(ctx, x, bw, bh, cols[i % cols.length] ?? '#ff8fab', hash('w' + i));
    x += bw + 50; i++;
  }
  const c = X(600);
  rr(ctx, c - 60, -90, 120, 70, 8); fs(ctx, '#8b5e3c'); poly(ctx, [[c - 70, -90], [c + 70, -90], [c + 50, -130], [c - 50, -130]], '#ff4d5e');
  circle(ctx, c - 40, -14, 14, '#2b2f45'); circle(ctx, c + 40, -14, 14, '#2b2f45');
  const h = X(1000);
  rr(ctx, h - 180, -260, 360, 260, 4); fs(ctx, '#f1ead8'); poly(ctx, [[h - 200, -260], [h, -340], [h + 200, -260]], '#e3d6b8');
  for (let k = -150; k <= 150; k += 60) { rr(ctx, h + k - 10, -240, 20, 240, 2); fs(ctx, '#fff', 2); }
  ctx.beginPath(); ctx.arc(h, -340, 60, Math.PI, 0); ctx.closePath(); fs(ctx, '#5bc0a8');
  const tw = X(1400);
  rr(ctx, tw - 90, -1200, 180, 1200, 4); fs(ctx, '#7aa5d6');
  for (let yy = -1170; yy < -40; yy += 46) for (let xx = -70; xx < 70; xx += 34) { rr(ctx, tw + xx, yy, 22, 28, 2); fs(ctx, (yy + xx) % 4 ? '#bfe8ff' : '#ffe28a', 2); }
  rr(ctx, tw - 4, -1320, 8, 120, 2); fs(ctx, '#41476b', 2); circle(ctx, tw, -1324, 8, Math.floor(t / 500) % 2 ? '#ff4d5e' : '#7a1f2b', 2);
  const tl = X(800);
  rr(ctx, tl, -260, 10, 260, 3); fs(ctx, '#41476b', 2); rr(ctx, tl - 14, -320, 38, 80, 8); fs(ctx, '#2b2f45');
  const ph = Math.floor(t / 1500) % 3;
  ['#ff4d5e', '#ffc43d', '#22c55e'].forEach((col, k) => circle(ctx, tl + 5, -304 + k * 24, 8, k === ph ? col : '#41476b', 2));
}

function drawPark(ctx: Ctx, v: View): void {
  const t = v.t;
  for (let k = 0; k < 14; k++) { const m = 1640 + k * 70 + (hash('t' + k) % 30); if (Math.abs(m - 2000) > 60 && Math.abs(m - 2400) > 50) tree(ctx, X(m), 0.8 + (k % 3) * 0.2, k % 2 ? '#5bbf62' : '#3fae5a', k % 3 === 0); }
  const f = X(2000);
  rr(ctx, f - 150, -70, 300, 70, 30); fs(ctx, '#bfe8ff');
  for (let k = 0; k < 8; k++) { ctx.fillStyle = '#4fc3f7'; ctx.beginPath(); ctx.arc(f + Math.sin(t / 200 + k) * 40, -90 - ((t / 3 + k * 40) % 140), 6, 0, Math.PI * 2); ctx.fill(); }
  const ic = X(2400);
  rr(ctx, ic - 110, -150, 220, 120, 12); fs(ctx, '#fff'); rr(ctx, ic - 80, -130, 80, 50, 4); fs(ctx, '#bfe8ff', 2);
  poly(ctx, [[ic + 40, -150], [ic + 60, -200], [ic + 80, -150]], '#f3d89b'); circle(ctx, ic + 60, -206, 14, '#ff8fab');
  circle(ctx, ic - 70, -26, 18, '#2b2f45'); circle(ctx, ic + 70, -26, 18, '#2b2f45');
}

function drawBeach(ctx: Ctx, v: View): void {
  palm(ctx, X(2650), v.t); palm(ctx, X(3000), v.t + 900); palm(ctx, X(3150), v.t + 400);
  const lg = X(2800);
  rr(ctx, lg - 70, -250, 140, 70, 6); fs(ctx, '#fff'); poly(ctx, [[lg - 80, -250], [lg, -300], [lg + 80, -250]], '#ff4d5e');
  for (const px of [-55, 55]) { rr(ctx, lg + px - 4, -180, 8, 180, 2); fs(ctx, '#a8744a', 2); }
  for (const [m, c] of [[2700, '#ffc43d'], [2900, '#2ec4b6'], [3080, '#ff8fab']] as const) {
    ctx.beginPath(); ctx.moveTo(X(m), 0); ctx.lineTo(X(m), -150); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
    ctx.beginPath(); ctx.arc(X(m), -150, 90, Math.PI, 0); ctx.closePath(); fs(ctx, c);
  }
}

function drawSea(ctx: Ctx, v: View): void {
  const t = v.t;
  rr(ctx, X(3450), -40, 400, 16, 2); fs(ctx, '#a8744a'); for (let k = 0; k < 5; k++) { rr(ctx, X(3450) + k * 90, -24, 10, 80, 2); fs(ctx, '#8b5e3c', 2); }
  for (const [m, c] of [[3550, '#ff8fab'], [3800, '#ffc43d'], [4050, '#2ec4b6']] as const) {
    ctx.save(); ctx.translate(X(m), Math.sin(t / 500 + m) * 6); ctx.rotate(Math.sin(t / 700 + m) * 0.04);
    poly(ctx, [[-90, -10], [90, -10], [60, 26], [-60, 26]], '#fff'); poly(ctx, [[0, -14], [0, -170], [70, -30]], c); ctx.restore();
  }
  const lh = X(4300);
  ctx.beginPath(); ctx.ellipse(lh, 10, 260, 60, 0, Math.PI, 0); ctx.closePath(); fs(ctx, '#c9b98f');
  rr(ctx, lh - 40, -360, 80, 340, 6); fs(ctx, '#fff'); for (let k = 0; k < 3; k++) { rr(ctx, lh - 40, -320 + k * 100, 80, 40, 0); fs(ctx, '#ff4d5e', 2); }
  rr(ctx, lh - 50, -420, 100, 60, 6); fs(ctx, '#ffe28a');
  ctx.fillStyle = `rgba(255,235,140,${0.25 + 0.15 * Math.sin(t / 300)})`; ctx.beginPath(); ctx.moveTo(lh, -390); ctx.lineTo(lh + 700, -520); ctx.lineTo(lh + 700, -260); ctx.closePath(); ctx.fill();
}

function drawSky(ctx: Ctx, v: View): void {
  const t = v.t;
  ctx.save(); ctx.translate(X(5000) + Math.sin(t / 3000) * 200, altitudeAt(5000) - 300);
  rr(ctx, -110, -20, 220, 40, 20); fs(ctx, '#fff'); poly(ctx, [[-20, 0], [-60, 70], [-20, 70], [30, 0]], '#3b82f6'); poly(ctx, [[-100, -20], [-120, -70], [-80, -20]], '#3b82f6');
  for (let k = -60; k < 80; k += 30) { rr(ctx, k, -10, 14, 12, 4); fs(ctx, '#bfe8ff', 2); }
  ctx.restore();
  const by = altitudeAt(5500) - 420 + Math.sin(t / 900) * 30, bx = X(5500);
  circle(ctx, bx, by, 70, '#fff'); ctx.beginPath(); ctx.moveTo(bx, by + 70); ctx.lineTo(bx, by + 200); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke(); rr(ctx, bx - 16, by + 200, 32, 26, 3); fs(ctx, '#ffc43d');
}

function drawMoon(ctx: Ctx, v: View): void {
  const f = X(5900);
  ctx.beginPath(); ctx.moveTo(f, MOON_Y); ctx.lineTo(f, MOON_Y - 220); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
  poly(ctx, [[f, MOON_Y - 220], [f + 120, MOON_Y - 200 + Math.sin(v.t / 200) * 4], [f, MOON_Y - 170]], '#ff4d5e');
  circle(ctx, X(5700), MOON_Y - 900, 160, '#3b8cff'); ctx.fillStyle = '#2fd06a'; ctx.fillRect(X(5700) - 80, MOON_Y - 950, 70, 50); ctx.fillRect(X(5700) + 20, MOON_Y - 880, 60, 40);
}

export function drawProps(ctx: Ctx, v: View): void {
  if (inView(v, 0, 1000)) drawOffice(ctx, v);
  if (inView(v, X(230), 1400)) drawParking(ctx, v);
  if (inView(v, X(1000), X(700))) drawCity(ctx, v);
  if (inView(v, X(2100), X(600))) drawPark(ctx, v);
  if (inView(v, X(2900), X(400))) drawBeach(ctx, v);
  if (inView(v, X(4000), X(900))) drawSea(ctx, v);
  if (inView(v, X(5300), X(700))) drawSky(ctx, v);
  if (inView(v, X(5900), 1200)) drawMoon(ctx, v);
}

/** The window frame post sits in front of the character. */
export function drawFront(ctx: Ctx, v: View): void {
  if (inView(v, X(WINDOW_M + 1))) { ctx.fillStyle = INK; ctx.fillRect(X(WINDOW_M) - 2, -460, 4, 460); }
}
