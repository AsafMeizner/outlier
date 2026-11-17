// Drawing primitives and the office worker on their chair. Everything is vector art drawn in code.
import { colorOf, type Look } from '../../../shared/wardrobe.ts';

export const INK = '#141833';
/** Rarity colours, indexed by tier (0 = missed). Loot-style: grey, green, blue, purple, orange. */
export const TIER_COLORS = ['#94a3b8', '#9aa6b8', '#2fd06a', '#3b8cff', '#b45cff', '#ff9a1f'] as const;
export const tierColor = (tier: number): string => TIER_COLORS[tier] ?? TIER_COLORS[0];

type Ctx = CanvasRenderingContext2D;
type Fill = string | CanvasGradient;

export function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
export function fs(ctx: Ctx, fill: Fill, lw = 3): void { ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); } }
export function circle(ctx: Ctx, x: number, y: number, r: number, fill: Fill, lw = 3): void { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fs(ctx, fill, lw); }
export function poly(ctx: Ctx, pts: ReadonlyArray<readonly [number, number]>, fill: Fill, lw = 3): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath(); fs(ctx, fill, lw);
}

export interface Pose {
  arm?: number;
  legs?: number;
  mouth?: 'smile' | 'o' | 'sad' | 'grin';
  blink?: boolean;
  headShake?: number;
  /** Rubber ring, when floating in the sea. */
  ring?: boolean;
  spinWheels?: number;
  /** Rocket chair flame, while flying. */
  flame?: boolean;
}

const RAINBOW = ['#ff4d5e', '#ffc43d', '#2fd06a', '#3b8cff', '#b45cff'];

function shirtFill(ctx: Ctx, look: Look, y: number, h: number): Fill {
  const c = colorOf('shirt', look.shirt, '#ff4d5e');
  if (c !== 'rainbow') return c;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  RAINBOW.forEach((col, i) => { g.addColorStop(i / RAINBOW.length, col); g.addColorStop((i + 1) / RAINBOW.length - 0.001, col); });
  return g;
}

function drawChair(ctx: Ctx, look: Look, pose: Pose, front: boolean): void {
  const kind = look.chair, spin = pose.spinWheels ?? 0;
  const wheels = (xs: number[]): void => xs.forEach(wx => {
    circle(ctx, wx, -6, 6.5, '#2b2f45');
    ctx.strokeStyle = '#8a91b4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(wx, -6); ctx.lineTo(wx + Math.cos(spin) * 5, -6 + Math.sin(spin) * 5); ctx.stroke();
  });
  if (kind === 'beanbag') { if (!front) { ctx.beginPath(); ctx.ellipse(-4, -40, 52, 40, 0, 0, Math.PI * 2); fs(ctx, '#ff8a3d'); } return; }
  if (kind === 'cart') {
    if (front) return;
    rr(ctx, -46, -96, 92, 56, 4); fs(ctx, 'rgba(200,210,230,.85)');
    ctx.strokeStyle = '#7b84a8'; ctx.lineWidth = 2;
    for (let x = -38; x < 46; x += 12) { ctx.beginPath(); ctx.moveTo(x, -94); ctx.lineTo(x, -42); ctx.stroke(); }
    rr(ctx, -50, -40, 100, 8, 3); fs(ctx, '#7b84a8');
    ctx.beginPath(); ctx.moveTo(-46, -96); ctx.lineTo(-62, -118); ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.stroke();
    wheels([-34, 34]); return;
  }
  if (front) return;
  const seat: Record<string, string> = { office: '#4b5275', stool: '#a8744a', gaming: '#22253a', rocket: '#4b5275', throne: '#b8860b' };
  rr(ctx, -34, -14, 68, 8, 4); fs(ctx, '#3a3f58');
  wheels([-30, 0, 30]);
  rr(ctx, -4, -52, 8, 40, 3); fs(ctx, '#8a91b4');
  if (kind === 'gaming') {
    rr(ctx, -50, -172, 22, 116, 10); fs(ctx, '#22253a'); rr(ctx, -46, -160, 6, 90, 3); fs(ctx, '#ff4d5e', 0); rr(ctx, -36, -160, 6, 90, 3); fs(ctx, '#ff4d5e', 0);
  } else if (kind === 'throne') {
    poly(ctx, [[-54, -60], [-54, -176], [-44, -196], [-34, -176], [-24, -196], [-24, -60]], '#f5c542'); rr(ctx, -48, -150, 18, 80, 6); fs(ctx, '#c0303f');
  } else if (kind === 'rocket') {
    rr(ctx, -46, -138, 16, 82, 8); fs(ctx, '#3a3f58');
    rr(ctx, -70, -112, 24, 60, 10); fs(ctx, '#e8edf7'); poly(ctx, [[-70, -112], [-58, -132], [-46, -112]], '#ff4d5e');
    if (pose.flame) { const f = 26 + Math.random() * 22; poly(ctx, [[-68, -52], [-58, -52 + f], [-48, -52]], '#ffb703', 2); poly(ctx, [[-64, -52], [-58, -52 + f * 0.6], [-52, -52]], '#fff3b0', 0); }
  } else if (kind !== 'stool') {
    rr(ctx, -46, -138, 16, 82, 8); fs(ctx, '#3a3f58'); rr(ctx, -34, -66, 6, 16, 2); fs(ctx, '#3a3f58');
  }
  rr(ctx, -36, -70, 72, 14, 7); fs(ctx, seat[kind] ?? '#4b5275');
}

function drawHair(ctx: Ctx, look: Look, behind: boolean): void {
  const c = colorOf('hair', look.hair, '#2b1d14');
  ctx.fillStyle = c; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  const st = look.hairStyle;
  if (behind) {
    if (st === 'long') { ctx.beginPath(); ctx.ellipse(-24, 12, 11, 24, 0.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    if (st === 'bun') circle(ctx, -24, -14, 11, c);
    return;
  }
  if (st === 'bald') return;
  if (st === 'spiky') { ctx.beginPath(); for (let i = 0; i <= 6; i++) { const a = Math.PI * (1 + i / 6), r = i % 2 ? 36 : 25; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r - 2); } ctx.closePath(); ctx.fill(); ctx.stroke(); return; }
  if (st === 'curly') { for (const [x, y] of [[-20, -10], [-10, -20], [4, -22], [16, -16], [-24, 4]] as const) circle(ctx, x, y, 10, c); return; }
  ctx.beginPath(); ctx.arc(0, -2, 25, Math.PI * 1.02, Math.PI * 2.02); ctx.lineTo(18, -8); ctx.quadraticCurveTo(0, -14, -22, -6); ctx.closePath(); ctx.fill(); ctx.stroke();
}

function drawHat(ctx: Ctx, hat: string, t: number): void {
  switch (hat) {
    case 'cap': poly(ctx, [[-24, -10], [-22, -24], [-4, -32], [16, -26], [22, -14]], '#3b8cff'); rr(ctx, 14, -16, 26, 6, 3); fs(ctx, '#2a6fd6'); break;
    case 'beanie': ctx.beginPath(); ctx.arc(0, -6, 26, Math.PI, 0); ctx.closePath(); fs(ctx, '#ff4d5e'); rr(ctx, -27, -10, 54, 9, 4); fs(ctx, '#ffd23f'); circle(ctx, 0, -34, 7, '#fff'); break;
    case 'headphones': ctx.beginPath(); ctx.arc(0, -2, 30, Math.PI * 1.05, Math.PI * 1.95); ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke(); rr(ctx, -8, -8, 16, 22, 6); fs(ctx, '#2fd06a'); break;
    case 'party': poly(ctx, [[-16, -18], [6, -64], [18, -16]], '#b45cff'); circle(ctx, 6, -66, 6, '#ffd23f'); ctx.fillStyle = '#ffd23f'; ctx.fillRect(-6, -36, 6, 6); ctx.fillRect(6, -26, 6, 6); break;
    case 'propeller': {
      ctx.beginPath(); ctx.arc(0, -8, 25, Math.PI, 0); ctx.closePath(); fs(ctx, '#ffd23f'); rr(ctx, -2, -44, 4, 14, 2); fs(ctx, INK, 0);
      const a = Math.abs(Math.sin(t / 40)); rr(ctx, -22 * a, -48, 44 * a + 2, 6, 3); fs(ctx, '#ff4d5e', 2); break;
    }
    case 'chef': rr(ctx, -20, -40, 40, 30, 6); fs(ctx, '#fff'); circle(ctx, -12, -44, 12, '#fff'); circle(ctx, 4, -50, 14, '#fff'); circle(ctx, 16, -42, 11, '#fff'); break;
    case 'cowboy': rr(ctx, -40, -18, 80, 8, 4); fs(ctx, '#a0662d'); poly(ctx, [[-22, -18], [-18, -44], [0, -38], [18, -44], [22, -18]], '#b97a3a'); rr(ctx, -21, -26, 42, 6, 2); fs(ctx, '#5a3a1a', 0); break;
    case 'crown': poly(ctx, [[-22, -14], [-24, -44], [-12, -30], [0, -50], [12, -30], [24, -44], [22, -14]], '#f5c542'); circle(ctx, 0, -24, 4, '#ff4d5e', 2); break;
    case 'viking':
      ctx.beginPath(); ctx.arc(0, -6, 27, Math.PI, 0); ctx.closePath(); fs(ctx, '#9aa6b8');
      poly(ctx, [[-24, -18], [-44, -40], [-40, -54], [-30, -26]], '#fff7e0'); poly(ctx, [[24, -18], [44, -40], [40, -54], [30, -26]], '#fff7e0'); break;
    case 'wizard': poly(ctx, [[-32, -14], [-4, -86], [30, -14]], '#3b2a8f'); ctx.fillStyle = '#ffd23f'; ctx.fillRect(-6, -48, 5, 5); ctx.fillRect(6, -30, 5, 5); rr(ctx, -34, -18, 68, 8, 4); fs(ctx, '#3b2a8f'); break;
    case 'astronaut':
      ctx.beginPath(); ctx.arc(2, 2, 40, 0, Math.PI * 2); ctx.fillStyle = 'rgba(190,230,255,.35)'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#e8edf7'; ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(14, -26, 8, 8); break;
  }
}

function drawGlasses(ctx: Ctx, g: string): void {
  ctx.lineWidth = 2.4; ctx.strokeStyle = INK;
  switch (g) {
    case 'round': ctx.beginPath(); ctx.arc(8, 0, 6.5, 0, Math.PI * 2); ctx.moveTo(24.5, 0); ctx.arc(18, 0, 6.5, 0, Math.PI * 2); ctx.moveTo(1.5, 0); ctx.lineTo(-8, -3); ctx.stroke(); break;
    case 'square': ctx.strokeRect(2, -6, 12, 11); ctx.strokeRect(15, -6, 12, 11); ctx.beginPath(); ctx.moveTo(2, -2); ctx.lineTo(-8, -4); ctx.stroke(); break;
    case 'sun':
      rr(ctx, 1, -6, 13, 11, 4); fs(ctx, INK, 2); rr(ctx, 15, -6, 13, 11, 4); fs(ctx, INK, 2);
      ctx.beginPath(); ctx.moveTo(1, -2); ctx.lineTo(-8, -4); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(4, -4, 3, 3); ctx.fillRect(18, -4, 3, 3); break;
    case '3d': rr(ctx, 1, -6, 13, 11, 2); fs(ctx, '#ff3b5c', 2); rr(ctx, 15, -6, 13, 11, 2); fs(ctx, '#2fb7ff', 2); break;
    case 'monocle': ctx.beginPath(); ctx.arc(18, 0, 7, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(18, 7); ctx.quadraticCurveTo(14, 26, 4, 30); ctx.lineWidth = 1.5; ctx.strokeStyle = '#f5c542'; ctx.stroke(); break;
    case 'star':
      for (const cx of [8, 20]) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 3.5 : 8; ctx.lineTo(cx + Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); fs(ctx, '#ffd23f', 2); }
      break;
    case 'visor': rr(ctx, -4, -6, 34, 10, 5); fs(ctx, '#2fd06a', 2); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(4, -4, 10, 2); break;
  }
}

/** Draw the worker at the origin (chair base on the ground, facing +x). */
export function drawWorker(ctx: Ctx, look: Look, pose: Pose = {}, t = 0): void {
  const { arm = 0, legs = 0, mouth = 'smile', blink = false, headShake = 0, ring = false } = pose;
  const skin = colorOf('skin', look.skin, '#f1c27d');
  const formal = look.shirt === 'suit' || look.shirt === 'tux';
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawChair(ctx, look, pose, false);
  ctx.translate(0, look.chair === 'beanbag' ? 22 : look.chair === 'cart' ? 8 : 0);
  // legs
  const knee = { x: 26, y: -66 - legs * 10 }, foot = { x: 34 + legs * 18, y: -24 - legs * 26 };
  ctx.lineWidth = 13; ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(-8, -64); ctx.lineTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y); ctx.stroke();
  ctx.lineWidth = 9; ctx.strokeStyle = formal ? '#1f2a44' : '#41476b'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(foot.x + 6, foot.y + 2, 11, 6, legs * 0.6, 0, Math.PI * 2); fs(ctx, '#2b2f45');
  // torso
  rr(ctx, -26, -132, 38, 70, 14); fs(ctx, shirtFill(ctx, look, -132, 70));
  if (look.shirt === 'hoodie') { ctx.beginPath(); ctx.arc(-14, -128, 16, Math.PI * 0.9, Math.PI * 1.9); fs(ctx, '#6b7280'); }
  if (look.shirt === 'hawaii') { ctx.fillStyle = '#ffe66d'; for (const [x, y] of [[-16, -116], [-2, -100], [-14, -84], [2, -122]] as const) { ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill(); } }
  if (look.shirt === 'gold') { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-18, -124, 5, 40); }
  if (formal) {
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

/**
 * Round avatar (head and shoulders) on a canvas of `size` CSS pixels.
 * Pass `dpr` 1 with a small size and scale the canvas up with CSS for the chunky pixel look.
 */
export function drawAvatar(canvas: HTMLCanvasElement, look: Look, size = 36, dpr = window.devicePixelRatio || 1): void {
  canvas.width = size * dpr; canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr * size / 80, 0, 0, dpr * size / 80, 0, 0);
  const bg = colorOf('shirt', look.shirt, '#3b8cff');
  ctx.fillStyle = bg === 'rainbow' ? '#b45cff' : bg; ctx.beginPath(); ctx.arc(40, 40, 39, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(40, 40, 38, 0, Math.PI * 2); ctx.clip(); ctx.translate(36, 206); drawWorker(ctx, { ...look, chair: 'stool' }); ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(40, 40, 38, 0, Math.PI * 2); ctx.stroke();
}

/**
 * Full-body preview (used by the wardrobe), worker centred in the canvas.
 * `px` is the size of one art pixel in CSS pixels; the canvas must be scaled up with `image-rendering: pixelated`.
 */
export function drawPreview(canvas: HTMLCanvasElement, look: Look, t: number, px = 3): void {
  const r = canvas.getBoundingClientRect(), dpr = 1 / px;
  if (!r.width) return;
  if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const s = Math.min(r.width, r.height) / 260;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
  ctx.translate(r.width / 2, r.height * 0.86); ctx.scale(s, s);
  ctx.fillStyle = 'rgba(20,24,51,.18)'; ctx.beginPath(); ctx.ellipse(0, 2, 70, 10, 0, 0, Math.PI * 2); ctx.fill();
  drawWorker(ctx, look, { arm: Math.sin(t / 500) * 0.25 - 0.2, blink: t % 3400 < 120, spinWheels: t / 200, mouth: 'smile' }, t);
}
