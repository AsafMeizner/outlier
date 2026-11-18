// The space world. Distance (points) decides where we are:
//   0..ASCENT   launch pad, then straight up through the clouds into the dark (rocket upright)
//   ASCENT..    sideways through the solar system: orbit, Moon, Mars, asteroid belt, Jupiter, Saturn, Neptune, black hole
// Every pixel is written by integer drawing calls; colours come from the palette or the wardrobe.
import type { Look } from '../../../../../shared/wardrobe.ts';
import { bayer, rng, rotate, rotateCW, type Bmp, type Color } from '../../pixel/bmp.ts';
import type { FrameState, World } from '../types.ts';
import { P } from './palette.ts';
import { buildRocket, flame, trailColors, ROCKET_H, ROCKET_W } from './rocket.ts';

export const ASCENT = 20;
/** Art pixels the starfield scrolls per point travelled. */
const SCROLL = 26;
/** Art pixels between a planet and the rocket per point of distance. */
const BODY = 5;

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const mod = (a: number, n: number): number => ((a % n) + n) % n;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; age: number; c: Color; size: number; kind: 'sq' | 'puff' | 'spark' }

/** Smooth value noise in [0, 1] on an integer lattice (seeded), for planet textures. */
function noise(x: number, y: number, seed: number): number {
  const h = (i: number, j: number): number => { let n = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ---------------------------------------------------------------- planets
interface Planet {
  at: number;
  /** Radius as a fraction of the frame height. */
  r: number;
  dy: number;
  draw: (b: Bmp, cx: number, cy: number, r: number, t: number) => void;
}

/** A shaded ball: base colour, a texture function, dithered night side to the lower right, ink rim. */
function ball(b: Bmp, cx: number, cy: number, r: number, base: Color, night: Color, tex?: (x: number, y: number) => Color | 0): void {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  b.circle(cx, cy, r + 1, P.ink);
  for (let y = -r; y <= r; y++) {
    const dx = Math.floor(Math.sqrt(r * r - y * y) + 0.4);
    for (let x = -dx; x <= dx; x++) {
      const px = cx + x, py = cy + y;
      if (px < b.clip[0] || px >= b.clip[2] || py < b.clip[1] || py >= b.clip[3]) continue;
      let c: Color = (tex && tex(x / r, y / r)) || base;
      const lit = (x + y * 0.8) / r; // > 0 = away from the light
      if (lit > 0.35 && bayer(px, py) < (lit - 0.35) * 1.4) c = night;
      b.set(px, py, c);
    }
  }
}

const PLANETS: Planet[] = [
  {
    at: 90, r: 0.24, dy: -0.12,
    draw: (b, cx, cy, r) => {
      const craters = [[-0.35, -0.3, 0.22], [0.25, 0.2, 0.16], [-0.1, 0.45, 0.12], [0.4, -0.35, 0.1], [-0.55, 0.15, 0.09]] as const;
      ball(b, cx, cy, r, P.grayL, P.grayD, (x, y) => {
        for (const [ax, ay, ar] of craters) { const d = Math.hypot(x - ax, y - ay); if (d < ar) return d > ar * 0.7 ? P.grayL : P.gray; }
        return 0;
      });
    },
  },
  {
    at: 160, r: 0.2, dy: 0.05,
    draw: (b, cx, cy, r) => ball(b, cx, cy, r, P.rust, P.brown, (x, y) => {
      if (y < -0.78) return P.white;
      const n = Math.sin(x * 9 + y * 4) + Math.sin(x * 4 - y * 7);
      return n > 1.1 ? P.brown : n < -1.3 ? P.orange : 0;
    }),
  },
  {
    at: 320, r: 0.46, dy: 0.08,
    draw: (b, cx, cy, r) => ball(b, cx, cy, r, P.tan, P.brown, (x, y) => {
      const sx = (x - 0.25) / 0.22, sy = (y - 0.2) / 0.12;
      if (sx * sx + sy * sy < 1) return sx * sx + sy * sy < 0.45 ? P.redD : P.rust;
      const band = Math.floor((y + 1) * 7 + Math.sin(x * 6) * 0.35);
      return [P.sand, P.tan, P.orange, P.tan, P.rust, P.tan, P.sand, P.orange, P.tan, P.brown, P.tan, P.sand, P.orange, P.tan][band] ?? 0;
    }),
  },
  {
    at: 400, r: 0.22, dy: -0.06,
    draw: (b, cx, cy, r) => {
      const ring = (front: boolean): void => {
        for (let a = 0; a < 900; a++) {
          const th = (a / 900) * Math.PI * 2, s = Math.sin(th);
          if (front ? s < 0 : s >= 0) continue;
          for (const [k, c] of [[1.55, P.tan], [1.65, P.sand], [1.75, P.tan], [1.9, P.brown]] as const) b.set(Math.round(cx + Math.cos(th) * r * k), Math.round(cy - s * r * k * 0.28), c);
        }
      };
      ring(false);
      ball(b, cx, cy, r, P.sand, P.brown, (_x, y) => [P.tan, P.sand, P.orange, P.sand, P.tan][Math.floor((y + 1) * 2.5)] ?? 0);
      ring(true);
    },
  },
  {
    at: 470, r: 0.2, dy: 0.1,
    draw: (b, cx, cy, r) => ball(b, cx, cy, r, P.blue, P.blueD, (x, y) => (Math.abs(Math.sin(y * 9 + x * 2)) > 0.92 ? P.sky : y > 0.2 && y < 0.35 && x < 0.1 && x > -0.4 ? P.navyM : 0)),
  },
];

// ---------------------------------------------------------------- world
export function createSpaceWorld(initial: Look): World {
  let look = initial;
  let up = buildRocket(look), diag = rotate(up, Math.PI / 4), side = rotateCW(up);
  const parts: Particle[] = [];
  let shake = 0;
  let lastT = 0;

  const emit = (p: Omit<Particle, 'age'>): void => { if (parts.length < 400) parts.push({ ...p, age: 0 }); };

  const world: World = {
    get shake() { return shake; },
    set shake(v: number) { shake = v; },
    setLook(l) { look = l; up = buildRocket(l); diag = rotate(up, Math.PI / 4); side = rotateCW(up); },
    launched() { shake = 6; },
    landed(s) {
      const tier = s.flight?.tier ?? 1;
      shake = [0, 2, 3, 4, 6, 8, 11][tier] ?? 3;
      ringBurst = { at: s.t, tier };
    },
    missed() { shake = 3; },
    render(f, s) {
      const dt = s.t - lastT; lastT = s.t;
      f.clip = [0, 0, f.w, f.h];
      const W = f.w, H = f.h, d = s.dist;
      const a = clamp(d / ASCENT, 0, 1);
      const portrait = H > W;
      const heroX = Math.round(portrait ? W * 0.5 : W * 0.3);
      const ground0 = H - Math.max(24, Math.round(H * 0.17));

      // --- sky: night atmosphere fading into black space
      sky(f, a);
      stars(f, s, d, a);

      // --- far objects: nebulae and planets (only out in space)
      if (d > ASCENT * 0.6) {
        const vis = smooth(clamp((d - ASCENT * 0.6) / (ASCENT * 0.5), 0, 1));
        nebula(f, d, vis);
        earth(f, d, heroX, s.t);
        station(f, d, heroX, s.t);
        for (const pl of PLANETS) {
          const x = heroX + (pl.at - d) * BODY, r = Math.round(H * pl.r);
          if (x + r < -4 || x - r > W + 4) continue;
          pl.draw(f, x, H * (0.45 + pl.dy), r, s.t);
        }
        blackHole(f, d, heroX, s.t);
        asteroids(f, d, heroX, s.t, false);
      }

      // --- the launch pad, sliding down as we climb
      const climb = d * H * 0.22; // art px the ground has dropped
      if (climb < H) pad(f, s, heroX, ground0 + climb, look);
      clouds(f, d, s.t);

      // --- the rocket
      const lift = smooth(clamp(d / 3, 0, 1));
      let cy = lerp(ground0 - ROCKET_H / 2 - 1, H * 0.52, lift);
      if (s.mode !== 'fly' && d > 0.5) cy += Math.round(Math.sin(s.t / 600) * 1.5);
      const sprite = d < 12 ? up : d < 17 ? diag : side;
      const dir = sprite === up ? { x: 0, y: 1 } : sprite === diag ? { x: -0.7071, y: 0.7071 } : { x: -1, y: 0 };
      // nozzle position relative to the sprite centre
      const nozzle = sprite === up ? { x: 0, y: ROCKET_H / 2 } : sprite === side ? { x: -ROCKET_H / 2, y: 0 } : { x: -ROCKET_H / 2.83, y: ROCKET_H / 2.83 };
      const jx = s.mode === 'charge' ? Math.round((Math.random() - 0.5) * 2) : s.mode === 'miss' && s.modeT < 900 ? Math.round(Math.sin(s.t / 30)) : 0;
      const sinceReject = s.sinceReject;
      const rx = heroX + jx + (sinceReject < 400 ? Math.round(Math.sin(sinceReject / 25) * 2) : 0);

      // exhaust
      const onPad = d < 0.05 && s.mode !== 'fly';
      let len = 0;
      if (s.mode === 'fly') len = 16 + Math.round(Math.sin(s.t / 35) * 3) + Math.round((s.flight?.tier ?? 1) * 2);
      else if (s.mode === 'charge') len = 4 + Math.min(14, Math.round(s.modeT / 110)) + Math.round(Math.sin(s.t / 30) * 2);
      else if (s.mode === 'landed') len = Math.max(0, 10 - Math.round(s.modeT / 60));
      else if (!onPad && s.mode !== 'miss') len = 4 + Math.round(Math.sin(s.t / 50) * 1.5);
      const nx = Math.round(rx + nozzle.x), ny = Math.round(cy + nozzle.y);
      if (len > 0) flame(f, nx, ny, Math.round(dir.x * 10) / 10 === 0 ? 0 : Math.sign(dir.x), Math.sign(dir.y), len, s.mode === 'fly' ? 4 : 3, look['trail'], s.t);
      trailParticles(s, nx, ny, dir, len);

      f.blit(sprite, Math.round(rx - sprite.w / 2), Math.round(cy - sprite.h / 2));
      // warning light when the clock runs low
      if (s.clock !== null && s.clock < 0.3 && Math.floor(s.t / 250) % 2 === 0) {
        const lx = sprite === up ? rx : sprite === side ? rx + 6 : rx + 4, ly = sprite === up ? cy - 6 : sprite === side ? cy - 1 : cy - 4;
        f.rect(Math.round(lx), Math.round(ly), 2, 2, P.red);
      }

      // foreground asteroids pass in front of the rocket
      if (d > ASCENT) asteroids(f, d, heroX, s.t, true);

      // particles
      stepParticles(f, dt);

      // landing ring and confetti
      if (ringBurst && s.t - ringBurst.at < 700) {
        const k = (s.t - ringBurst.at) / 700, r = Math.round(6 + k * 34);
        const c = [P.gray, P.grayL, P.green, P.sky, P.purple, P.orange, P.sun][ringBurst.tier] ?? P.white;
        for (let i = 0; i < 64; i++) { const th = (i / 64) * Math.PI * 2; f.set(Math.round(rx + Math.cos(th) * r), Math.round(cy + Math.sin(th) * r * 0.8), c); }
        if (k < 0.05 && ringBurst.tier >= 4) for (let i = 0; i < (ringBurst.tier >= 6 ? 120 : ringBurst.tier === 5 ? 70 : 40); i++) {
          const th = Math.random() * Math.PI * 2, sp = 0.04 + Math.random() * 0.08;
          emit({ x: rx, y: cy, vx: Math.cos(th) * sp, vy: Math.sin(th) * sp, life: 900 + Math.random() * 700, c: [P.sun, P.pink, P.cyan, P.lime, P.white, P.orange][i % 6] ?? P.white, size: 1 + (i % 2), kind: 'spark' });
        }
      }
      shake = Math.max(0, shake - dt * 0.012);
      if (s.mode === 'charge') shake = Math.max(shake, Math.min(3, s.modeT / 500));
    },
  };
  let ringBurst: { at: number; tier: number } | null = null;

  function trailParticles(s: FrameState, nx: number, ny: number, dir: { x: number; y: number }, len: number): void {
    const trail = look['trail'];
    const flying = s.mode === 'fly';
    const tipX = nx + dir.x * len, tipY = ny + dir.y * len;
    if (flying || s.mode === 'charge') {
      const rate = flying ? 0.9 : 0.35;
      if (Math.random() < rate) {
        const cols = trailColors(trail);
        const kind: Particle['kind'] = trail === 'smoke' ? 'puff' : trail === 'sparkle' ? 'spark' : 'sq';
        const c = trail === 'smoke' ? P.grayL : cols[2 + Math.floor(Math.random() * Math.max(1, cols.length - 2))] ?? P.orange;
        emit({ x: tipX + (Math.random() - 0.5) * 3, y: tipY + (Math.random() - 0.5) * 3, vx: dir.x * 0.06 + (Math.random() - 0.5) * 0.02, vy: dir.y * 0.06 + (Math.random() - 0.5) * 0.02, life: 400 + Math.random() * 500, c, size: kind === 'puff' ? 3 : 1, kind });
      }
    }
    // steam on the pad, smoke when the engine sputters
    if (s.dist < 0.05 && s.mode === 'idle' && Math.random() < 0.08) emit({ x: nx + (Math.random() < 0.5 ? -6 : 6), y: ny + 1, vx: (Math.random() - 0.5) * 0.03, vy: -0.01, life: 1400, c: P.grayL, size: 2, kind: 'puff' });
    if (s.mode === 'miss' && s.modeT < 1200 && Math.random() < 0.3) emit({ x: nx, y: ny, vx: dir.x * 0.02 + (Math.random() - 0.5) * 0.02, vy: dir.y * 0.02 - 0.01, life: 1100, c: Math.random() < 0.5 ? P.gray : P.grayD, size: 3, kind: 'puff' });
  }

  function stepParticles(f: Bmp, dt: number): void {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!p) continue;
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.age > p.life) { parts.splice(i, 1); continue; }
      const k = p.age / p.life;
      if (p.kind === 'puff') {
        const r = Math.round(p.size * (0.6 + k * 1.4));
        if (k < 0.85) f.circle(p.x, p.y, r, p.c);
      } else if (p.kind === 'spark') {
        if (Math.floor(p.age / 80) % 3 !== 2) { f.set(p.x, p.y, p.c); if (p.size > 1 && k < 0.5) { f.set(p.x - 1, p.y, p.c); f.set(p.x + 1, p.y, p.c); f.set(p.x, p.y - 1, p.c); f.set(p.x, p.y + 1, p.c); } }
      } else if (k < 0.9) f.rect(Math.round(p.x), Math.round(p.y), p.size, p.size, p.c);
    }
  }

  return world;
}

// ---------------------------------------------------------------- scenery
function sky(f: Bmp, a: number): void {
  const stages: Color[][] = [
    [P.night, P.violet, P.purpleD, P.purple],
    [P.black, P.night, P.violet, P.purpleD],
    [P.black, P.black, P.night, P.violet],
    [P.black, P.black, P.black, P.night],
  ];
  const p = a * (stages.length - 1), i = Math.min(stages.length - 2, Math.floor(p)), k = p - i;
  const A = stages[i] ?? [P.black], B = stages[i + 1] ?? A;
  const n = A.length;
  for (let y = 0; y < f.h; y++) {
    const q = (y / f.h) * n, j = Math.min(n - 1, Math.floor(q)), fr = q - j;
    const seam = fr > 0.84 ? (fr - 0.84) / 0.16 : 0;
    for (let x = 0; x < f.w; x++) {
      const th = bayer(x, y);
      const pick = (cols: Color[]): Color => (th < seam ? cols[Math.min(n - 1, j + 1)] : cols[j]) ?? P.black;
      // cross-fade between the two stages with a second dither pattern (shifted so it doesn't line up with the seams)
      f.d[y * f.w + x] = bayer(x + 2, y + 1) < k ? pick(B) : pick(A);
    }
  }
}

function stars(f: Bmp, s: FrameState, d: number, a: number): void {
  const layers = [
    { n: 70, speed: 0.15, seed: 11, c: P.gray },
    { n: 40, speed: 0.45, seed: 23, c: P.grayL },
    { n: 18, speed: 1, seed: 37, c: P.white },
  ];
  const space = d > ASCENT * 0.8;
  const climb = d * f.h * 0.22;
  for (const L of layers) {
    const r = rng(L.seed);
    for (let i = 0; i < L.n; i++) {
      const x0 = r() * 4000, y0 = r() * 4000, tw = r() * 6, show = r();
      if (show > 0.25 + a * 0.75) continue; // a few stars even at the pad (it's night), all of them in space
      const x = space ? mod(x0 - d * SCROLL * L.speed, f.w) : mod(x0, f.w);
      const y = space ? mod(y0, f.h) : mod(y0 + climb * L.speed * 0.3, f.h);
      const on = Math.sin(s.t / 400 + tw) > -0.4;
      const c = on ? L.c : P.grayD;
      if (s.mode === 'fly' && space) {
        const streak = Math.min(14, Math.round((L.speed * 10 * (s.flight ? s.flight.to - s.flight.from : 0)) / 60));
        f.rect(Math.round(x), Math.round(y), 1 + streak, 1, c);
      } else {
        f.set(x, y, c);
        if (L.speed === 1 && on && i % 5 === 0) { f.set(x - 1, y, P.gray); f.set(x + 1, y, P.gray); f.set(x, y - 1, P.gray); f.set(x, y + 1, P.gray); }
      }
    }
  }
}

function pad(f: Bmp, s: FrameState, heroX: number, gy: number, look: Look): void {
  void look;
  const W = f.w, H = f.h;
  gy = Math.round(gy);
  // horizon glow and mountains
  f.dither(0, gy - 22, W, 14, P.pink, 0.12);
  const r = rng(12);
  let h = 0;
  for (let x = 0; x < W; x++) {
    h += (r() - 0.5) * 1.6; h = clamp(h, -8, 6);
    const top = Math.round(gy - 16 + h);
    f.rect(x, top, 1, gy - top + 1, P.violet); f.set(x, top, P.purpleD);
  }
  // ground with a dithered edge
  f.rect(0, gy, W, H - gy + 200, P.grayD);
  f.rect(0, gy, W, 1, P.ink);
  f.dither(0, gy + 6, W, H, P.ink, 0.25);
  // pad with hazard stripes
  const px = heroX - 22;
  f.rect(px, gy - 3, 44, 3, P.gray); f.rect(px, gy - 3, 44, 1, P.grayL);
  for (let x = px; x < px + 44; x += 6) { f.rect(x, gy, 3, 2, P.sun); f.rect(x + 3, gy, 3, 2, P.ink); }
  // launch tower lattice with a blinking top light
  const tx = heroX + 13, top = gy - 58;
  f.rect(tx, top, 2, gy - top, P.ink); f.rect(tx + 10, top, 2, gy - top, P.ink);
  for (let y = top; y < gy - 3; y += 7) { f.line(tx + 1, y, tx + 11, y + 7, P.grayD); f.line(tx + 11, y, tx + 1, y + 7, P.grayD); f.rect(tx, y, 12, 1, P.ink); }
  f.rect(tx - 2, top - 3, 16, 3, P.ink);
  const blink = Math.floor(s.t / 500) % 2 === 0;
  f.rect(tx + 5, top - 5, 2, 2, blink ? P.red : P.redD);
  // service arm: swings away while charging, gone once we leave
  if (s.dist < 0.05) {
    const swing = s.mode === 'charge' ? Math.min(1, s.modeT / 600) : 0;
    const ay = gy - 30, ax0 = tx - 1, ax1 = Math.round(lerp(heroX + 6, tx - 2, swing));
    if (ax1 < ax0) f.rect(ax1, ay, ax0 - ax1, 2, P.ink);
  }
}

function clouds(f: Bmp, d: number, t: number): void {
  if (d < 1 || d > ASCENT * 0.9) return;
  const k = d / (ASCENT * 0.9);
  const r = rng(5);
  for (let i = 0; i < 7; i++) {
    const x0 = r() * f.w * 1.4 - f.w * 0.2, y0 = r() * f.h * 6;
    const y = Math.round(mod(y0 + d * f.h * 0.5, f.h * 6) - f.h * 2.5);
    if (y < -20 || y > f.h + 20) continue;
    const x = Math.round(x0 + Math.sin(t / 3000 + i) * 4), s = 0.8 + r() * 0.8;
    const top = k < 0.5 ? P.purple : P.purpleD, sh = k < 0.5 ? P.purpleD : P.violet;
    for (const [dx, dy, rr] of [[0, 4, 5], [7, 0, 7], [15, 3, 6], [21, 5, 4]] as const) f.circle(x + dx * s, y + dy * s, Math.round(rr * s), sh);
    for (const [dx, dy, rr] of [[0, 4, 5], [7, 0, 7], [15, 3, 6], [21, 5, 4]] as const) f.circle(x + dx * s, y + dy * s - 1, Math.round(rr * s), top);
  }
}

function nebula(f: Bmp, d: number, vis: number): void {
  const zones = [
    { at: 60, c: P.purpleD }, { at: 150, c: P.redD }, { at: 240, c: P.navyM }, { at: 330, c: P.violet }, { at: 420, c: P.blueD }, { at: 520, c: P.purple },
  ];
  for (const z of zones) {
    const cx = f.w * 0.5 + (z.at - d) * BODY * 0.6, cy = f.h * 0.35;
    const rx = f.w * 0.7, ry = f.h * 0.3;
    if (cx + rx < 0 || cx - rx > f.w) continue;
    for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(f.h, cy + ry); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(f.w, cx + rx); x++) {
        const q = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (q < 1 && bayer(x, y) < 0.32 * (1 - q) * (1 - q) * vis) f.set(x, y, z.c);
      }
    }
  }
}

/** Low orbit: the curve of the Earth fills the bottom of the frame. */
function earth(f: Bmp, d: number, heroX: number, t: number): void {
  if (d < ASCENT * 0.7 || d > 75) return;
  const fade = smooth(clamp((d - ASCENT * 0.7) / 6, 0, 1)) * smooth(clamp((75 - d) / 15, 0, 1));
  const R = Math.round(f.w * 1.1), cx = heroX + (35 - d) * 2, cy = Math.round(f.h + R * 0.86 - fade * f.h * 0.22);
  const rot = t / 4000 + d * 0.02;
  for (let y = Math.max(0, cy - R - 3); y < f.h; y++) {
    const dy = y - cy, dx = Math.floor(Math.sqrt(Math.max(0, R * R - dy * dy)));
    for (let x = Math.max(0, cx - dx - 3); x <= Math.min(f.w - 1, cx + dx + 3); x++) {
      const dist = Math.hypot(x - cx, dy);
      if (dist > R + 2) continue;
      if (dist > R) { if (bayer(x, y) < 0.6) f.set(x, y, P.sky); continue; }
      if (dist > R - 1) { f.set(x, y, P.cyan); continue; }
      const u = (x - cx) / R + rot, v = dy / R;
      const landN = noise(u * 9, v * 9, 1) * 0.65 + noise(u * 22, v * 22, 2) * 0.35;
      const cloudN = noise(u * 14 + t / 9000, v * 30, 3) * 0.7 + noise(u * 40, v * 60, 4) * 0.3;
      const c = cloudN > 0.66 ? P.white : cloudN > 0.62 && bayer(x, y) < 0.5 ? P.white
        : landN > 0.6 ? (landN > 0.72 ? P.greenD : P.green) : landN > 0.57 ? P.sand
        : bayer(x, y) < 0.12 ? P.blueD : P.blue;
      f.set(x, y, c);
    }
  }
}

/** A space station drifting by in orbit. */
function station(f: Bmp, d: number, heroX: number, t: number): void {
  const x = Math.round(heroX + (30 - d) * BODY * 2.2), y = Math.round(f.h * 0.3 + Math.sin(t / 2000) * 2);
  if (x < -40 || x > f.w + 40) return;
  for (const side of [-1, 1]) {
    const px = side < 0 ? x - 28 : x + 8;
    f.rect(px - 1, y - 7, 22, 15, P.ink);
    for (let j = 0; j < 13; j++) for (let i = 0; i < 20; i++) f.set(px + i, y - 6 + j, (i % 5 === 4 || j % 4 === 3) ? P.navyM : P.blue);
  }
  f.rect(x - 8, y - 1, 16, 3, P.ink); f.rect(x - 7, y, 14, 1, P.grayL);
  f.rect(x - 4, y - 5, 8, 11, P.ink); f.rect(x - 3, y - 4, 6, 9, P.grayL); f.rect(x - 3, y - 4, 2, 9, P.white);
  f.rect(x, y - 9, 1, 4, P.ink); f.set(x, y - 10, Math.floor(t / 400) % 2 ? P.red : P.redD);
}

function asteroids(f: Bmp, d: number, heroX: number, t: number, front: boolean): void {
  const centre = 240, spread = 55;
  const density = Math.exp(-(((d - centre) / spread) ** 2));
  if (density < 0.05) return;
  const r = rng(front ? 91 : 57), n = front ? 6 : 26;
  for (let i = 0; i < n; i++) {
    const wx = r() * 2400, y0 = r() * f.h, size = front ? 4 + Math.floor(r() * 5) : 2 + Math.floor(r() * 4), keep = r();
    if (keep > density) continue;
    const speed = front ? 1.4 : 0.7;
    const x = Math.round(mod(wx - d * SCROLL * speed, f.w + 60) - 30);
    const y = Math.round(y0 + Math.sin(t / 900 + i) * 2);
    if (front && Math.abs(y - f.h * 0.52) < 16 && Math.abs(x - heroX) < 30) continue; // never hide the rocket
    rock(f, x, y, size, i);
  }
}

function rock(f: Bmp, x: number, y: number, r: number, seed: number): void {
  const R = rng(seed * 7 + 3), bumps = Array.from({ length: 8 }, () => 0.72 + R() * 0.4);
  for (let j = -r - 1; j <= r + 1; j++) for (let i = -r - 1; i <= r + 1; i++) {
    const ang = (Math.atan2(j, i) / (Math.PI * 2) + 1) % 1, k = bumps[Math.floor(ang * 8)] ?? 1, dd = Math.hypot(i, j);
    if (dd <= r * k) f.set(x + i, y + j, i + j > r * 0.3 ? P.grayD : (i + j < -r * 0.6 ? P.grayL : P.gray));
    else if (dd <= r * k + 1) f.set(x + i, y + j, P.ink);
  }
}

function blackHole(f: Bmp, d: number, heroX: number, t: number): void {
  const x = Math.round(heroX + (560 - d) * BODY), y = Math.round(f.h * 0.42), r = Math.round(f.h * 0.12);
  if (x < -r * 4 || x > f.w + r * 4) return;
  // accretion disk: rotating dithered ellipse bands
  for (let j = -r * 2; j <= r * 2; j++) for (let i = -r * 4; i <= r * 4; i++) {
    const q = (i / (r * 3.6)) ** 2 + (j / (r * 0.9)) ** 2;
    if (q > 1 || q < 0.12) continue;
    const ang = Math.atan2(j * 4, i) + t / 900;
    const band = Math.sin(ang * 3 + q * 12);
    const c = q < 0.35 ? P.white : band > 0.3 ? P.sun : band > -0.4 ? P.orange : P.redD;
    if (bayer(x + i, y + j) < 1 - q * 0.7) f.set(x + i, y + j, c);
  }
  f.circle(x, y, r + 1, P.orange);
  f.circle(x, y, r, P.black);
  for (let i = 0; i < 80; i++) { const th = (i / 80) * Math.PI * 2; f.set(Math.round(x + Math.cos(th) * (r + 2)), Math.round(y + Math.sin(th) * (r + 2)), P.sun); }
}

export { ROCKET_W };
