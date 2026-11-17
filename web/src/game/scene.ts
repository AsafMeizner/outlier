// The launch scene: owns the canvas, the camera and the animation loop.
// Rendering goes through a low-resolution buffer that is scaled up without smoothing, for a chunky pixel look.
import type { Look } from '../../../shared/wardrobe.ts';
import { drawWorker, tierColor, type Pose } from './draw.ts';
import { Particles } from './particles.ts';
import { drawFront, drawGround, drawParallax, drawProps, type View } from './props.ts';
import { rng } from './random.ts';
import { sfx } from './sfx.ts';
import { LANDMARKS, WINDOW_M, X, altitudeAt, restY, zoneAt, type Landmark } from './world.ts';

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c: Rgb): string => `rgb(${c.map(Math.round).join(',')})`;
const SKY = { dayTop: hex('#5ab8ff'), dayLow: hex('#cfeeff'), duskTop: hex('#7a5cc8'), duskLow: hex('#ffb38a'), spaceTop: hex('#04061a'), spaceLow: hex('#1b1f4a') };

export type SceneState = 'idle' | 'charge' | 'fly' | 'landed' | 'miss';

export interface SceneOptions {
  look: Look;
  rtl?: boolean;
  sound?: boolean;
  /** Size of one art pixel in screen pixels. */
  pixel?: number;
  meters?: number;
  onLandmark?: (lm: Landmark) => void;
  /** Distance while flying, for the live counter. */
  onMeters?: (m: number) => void;
}

export interface LaunchOptions {
  meters: number;
  tier: number;
  onLand?: () => void;
  onDone?: () => void;
}

interface Flight extends LaunchOptions { from: number; to: number; start: number; dur: number; apex: number; passed: Set<string>; landedAt: number; doneFired: boolean }

export class Scene {
  private readonly c: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly buf: HTMLCanvasElement;
  private readonly b: CanvasRenderingContext2D;
  private readonly ro: ResizeObserver;
  private readonly parts = new Particles();
  private raf = 0;
  private alive = true;

  look: Look;
  rtl: boolean;
  sound: boolean;
  onLandmark: ((lm: Landmark) => void) | undefined;
  onMeters: ((m: number) => void) | undefined;

  private readonly pixel: number;
  private t = 0;
  private last = performance.now();
  private shake = 0;
  private zoomK = 1;
  private flash = 0;
  private speed = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private px = 3;
  private baseZ = 1;
  private cam: { x: number; y: number } | null = null;
  private char: { x: number; y: number; rot: number; pose: Pose } = { x: 0, y: 0, rot: 0, pose: {} };
  private flight: Flight | null = null;
  private missAt = 0;
  private chargeAt = 0;
  private rejectAt = -1e9;
  private carAlarmAt = -1e9;
  private windowBroken = false;
  /** Where the character sits on screen while not flying, as fractions of the width and height. */
  focusX = 0.3;
  focusY = 0.64;
  meters = 0;
  state: SceneState = 'idle';
  clock: number | null = null;

  constructor(canvas: HTMLCanvasElement, opts: SceneOptions) {
    this.c = canvas;
    const ctx = canvas.getContext('2d');
    this.buf = document.createElement('canvas');
    const b = this.buf.getContext('2d');
    if (!ctx || !b) throw new Error('Canvas 2D is not available');
    this.ctx = ctx; this.b = b;
    this.look = opts.look; this.rtl = opts.rtl ?? false; this.sound = opts.sound ?? true; this.pixel = opts.pixel ?? 4;
    this.onLandmark = opts.onLandmark; this.onMeters = opts.onMeters;
    this.setPosition(opts.meters ?? 0);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    const loop = (now: number): void => {
      if (!this.alive) return;
      const dt = Math.min(50, now - this.last); this.last = now; this.t += dt;
      this.update(dt); this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy(): void { this.alive = false; cancelAnimationFrame(this.raf); this.ro.disconnect(); }

  private resize(): void {
    const r = this.c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width || !r.height) return;
    this.w = r.width; this.h = r.height; this.dpr = dpr;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.px = r.width < 700 ? Math.max(2, this.pixel - 1) : this.pixel;
    this.buf.width = Math.ceil(r.width / this.px); this.buf.height = Math.ceil(r.height / this.px);
    this.baseZ = clamp(Math.min(r.height / 560, r.width / 720), 0.5, 1.5);
  }
  private get vw(): number { return this.w / (this.baseZ * this.zoomK); }
  private get vh(): number { return this.h / (this.baseZ * this.zoomK); }

  // ---------- public API ----------
  setClock(left: number | null): void { this.clock = left; }

  /** Place the character at a distance without animating (e.g. when resuming a day). */
  setPosition(m: number): void {
    this.meters = m;
    this.char = { x: X(m), y: restY(m), rot: 0, pose: {} };
    this.windowBroken ||= m > WINDOW_M;
    this.state = 'idle'; this.flight = null; this.cam = null;
  }

  /** Build-up while the tier reveal plays: shaking, wheels spinning, dust. */
  charge(on = true): void { this.state = on ? 'charge' : 'idle'; this.chargeAt = this.t; }

  launch(o: LaunchOptions): void {
    const from = this.meters, to = from + o.meters;
    if (reducedMotion() || o.meters <= 0) {
      this.setPosition(to); this.onMeters?.(to);
      o.onLand?.(); o.onDone?.(); return;
    }
    const D = to - from;
    this.flight = { ...o, from, to, start: this.t, dur: 1000 + Math.min(3200, D * 2.4), apex: Math.max(140, X(D) * 0.3), passed: new Set(), landedAt: 0, doneFired: false };
    this.state = 'fly';
    if (this.sound) sfx.whoosh(this.flight.dur / 1000);
    this.parts.burst(14, () => ({ type: 'dust', x: this.char.x - 20, y: this.char.y - 6, vx: -Math.random() * 300, vy: -Math.random() * 120, life: 700, size: 10 + Math.random() * 10 }));
    this.shake = 10;
  }

  miss(kind: 'timeout' | 'pass'): void {
    this.state = 'miss'; this.missAt = this.t;
    if (!this.sound) return;
    if (kind === 'timeout') sfx.ring();
    setTimeout(() => sfx.sad(), kind === 'timeout' ? 550 : 0);
  }

  reject(): void { if (this.sound) sfx.buzz(); this.rejectAt = this.t; this.shake = Math.max(this.shake, 6); }

  // ---------- simulation ----------
  private update(dt: number): void {
    this.parts.step(dt);
    this.shake *= Math.pow(0.002, dt / 1000);
    this.flash = Math.max(0, this.flash - dt / 400);
    const ch = this.char, inSea = zoneAt(this.meters) === 'sea', f = this.flight;
    ch.pose = { blink: this.t % 3400 < 120, ring: inSea && this.state !== 'fly' };
    switch (this.state) {
      case 'idle': {
        ch.rot = Math.sin(this.t / 900) * 0.03;
        ch.pose.arm = this.clock !== null ? Math.sin(this.t / 110) * 0.3 - 0.6 : Math.sin(this.t / 600) * 0.15;
        ch.pose.mouth = this.clock !== null && this.clock < 0.25 ? 'o' : 'smile';
        if (inSea) ch.y = restY(this.meters) + Math.sin(this.t / 400) * 5;
        if (this.t - this.rejectAt < 500) { ch.pose.headShake = Math.sin((this.t - this.rejectAt) / 30) * 6; ch.pose.mouth = 'sad'; }
        break;
      }
      case 'charge': {
        const k = Math.min(1, (this.t - this.chargeAt) / 1500);
        ch.rot = -0.08 - Math.sin(this.t / 30) * 0.03 * k;
        ch.pose = { ...ch.pose, mouth: 'grin', arm: -0.5, legs: -0.4, spinWheels: this.t / 30 };
        this.shake = Math.max(this.shake, 2 + 4 * k);
        if (Math.random() < dt / 40) this.parts.add({ type: 'square', x: ch.x - 30 + Math.random() * 30, y: ch.y - 4, vx: -80 - Math.random() * 160, vy: -40 - Math.random() * 80, g: 300, life: 500, size: 6, color: '#cfd6ea' });
        break;
      }
      case 'fly': {
        if (!f) break;
        const k = Math.min(1, (this.t - f.start) / f.dur), kx = easeOut(k);
        const prevX = ch.x;
        ch.x = lerp(X(f.from), X(f.to), kx);
        ch.y = lerp(restY(f.from), restY(f.to), kx) - f.apex * 4 * kx * (1 - kx);
        this.meters = lerp(f.from, f.to, kx);
        this.onMeters?.(this.meters);
        const vx = (ch.x - prevX) / Math.max(1, dt) * 1000;
        ch.rot = kx * (2 + f.tier) * Math.PI * 0.6;
        ch.pose = { ...ch.pose, arm: Math.sin(this.t / 70) * 1.3 - 0.6, legs: Math.sin(this.t / 90) * 0.6, mouth: 'o', spinWheels: this.t / 30, flame: true };
        this.speed = Math.abs(vx);
        this.zoomK = 1 - 0.38 * Math.sin(Math.PI * k) * clamp((f.to - f.from) / 700, 0, 1);
        if (!this.windowBroken && this.meters > WINDOW_M) this.shatter();
        for (const lm of LANDMARKS) if (lm.m > f.from && lm.m <= this.meters && !f.passed.has(lm.key)) { f.passed.add(lm.key); this.onLandmark?.(lm); }
        this.emitTrail(dt, vx);
        if (k >= 1) this.land(f);
        break;
      }
      case 'landed': {
        if (!f) break;
        const k = (this.t - f.landedAt) / 1000;
        ch.rot = lerp(ch.rot, 0, Math.min(1, dt / 120));
        ch.pose.mouth = f.tier >= 3 ? 'grin' : 'smile';
        ch.pose.arm = f.tier >= 3 ? -1.3 + Math.sin(this.t / 140) * 0.35 : -0.2;
        if (inSea) ch.y = restY(this.meters) + Math.sin(this.t / 400) * 5;
        if (zoneAt(this.meters) === 'moon') ch.y = altitudeAt(this.meters) - Math.abs(Math.sin(k * 2.2)) * 60 * Math.exp(-k * 0.9);
        this.zoomK = lerp(this.zoomK, 1, Math.min(1, dt / 300));
        if (!f.doneFired && k > 0.9) { f.doneFired = true; this.state = 'idle'; f.onDone?.(); }
        break;
      }
      case 'miss': {
        const k = (this.t - this.missAt) / 1000;
        ch.rot = Math.sin(k * 6) * 0.05 * Math.max(0, 2 - k);
        ch.pose = { ...ch.pose, mouth: 'sad', arm: 0.6, spinWheels: k * 4 };
        if (k > 1.6) this.state = 'idle';
        break;
      }
    }
    this.followCamera(dt);
  }

  private emitTrail(dt: number, vx: number): void {
    const ch = this.char, kind = this.look.trail, back = -Math.sign(vx || 1);
    const at = { x: ch.x - 30, y: ch.y - 90 };
    const rate: Record<string, number> = { paper: 80, sparkle: 30, coffee: 40, bubbles: 35, fire: 18, rainbow: 12, stars: 28 };
    if (Math.random() > dt / (rate[kind] ?? 80)) return;
    const base = { x: at.x + (Math.random() - 0.5) * 20, y: at.y + (Math.random() - 0.5) * 30, vx: back * Math.abs(vx) * 0.12 + (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80 };
    const cols = ['#ff4d5e', '#ffc43d', '#2fd06a', '#3b8cff', '#b45cff'];
    const pick = (): string => cols[Math.floor(Math.random() * cols.length)] ?? '#fff';
    switch (kind) {
      case 'sparkle': this.parts.add({ ...base, type: 'spark', life: 700, size: 8 + Math.random() * 6, color: Math.random() < 0.5 ? '#ffd166' : '#fff' }); break;
      case 'coffee': this.parts.add({ ...base, type: 'drop', g: 700, life: 900, size: 5, color: '#6f4e37' }); break;
      case 'bubbles': this.parts.add({ ...base, type: 'bubble', vy: -60, life: 1200, size: 6 + Math.random() * 6 }); break;
      case 'fire': this.parts.add({ ...base, type: 'square', vy: -40 - Math.random() * 60, life: 500, size: 10 + Math.random() * 8, color: Math.random() < 0.5 ? '#ff7a1f' : '#ffd23f' }); break;
      case 'rainbow': this.parts.add({ ...base, x: at.x, y: at.y + 30, vx: 0, vy: 0, type: 'square', life: 900, size: 16, color: cols[Math.floor(this.t / 60) % cols.length] ?? '#fff' }); break;
      case 'stars': this.parts.add({ ...base, type: 'spark', life: 900, size: 10, color: pick() }); break;
      default: this.parts.add({ ...base, type: 'paper', g: 120, vr: (Math.random() - 0.5) * 8, life: 1600 });
    }
  }

  private shatter(): void {
    this.windowBroken = true; this.shake = 14; this.flash = 0.35;
    if (this.sound) sfx.crash();
    this.parts.burst(26, () => ({ type: 'shard', x: X(WINDOW_M + 1), y: -60 - Math.random() * 300, vx: 150 + Math.random() * 500, vy: -200 + Math.random() * 250, g: 900, vr: (Math.random() - 0.5) * 14, life: 1300, size: 6 + Math.random() * 10 }));
  }

  private land(f: Flight): void {
    const ch = this.char, zone = zoneAt(f.to), tier = f.tier;
    this.meters = f.to; this.state = 'landed'; f.landedAt = this.t;
    this.onMeters?.(f.to);
    ch.x = X(f.to); ch.y = restY(f.to); ch.rot = Math.atan2(Math.sin(ch.rot), Math.cos(ch.rot));
    this.shake = [0, 8, 12, 16, 20, 26][tier] ?? 10; this.flash = tier >= 4 ? 0.5 : 0.2;
    if (zone === 'sea') {
      if (this.sound) sfx.splash();
      this.parts.burst(40, () => ({ type: 'drop', x: ch.x + (Math.random() - 0.5) * 60, y: ch.y - 30, vx: (Math.random() - 0.5) * 420, vy: -300 - Math.random() * 520, g: 1100, life: 1300, size: 5 + Math.random() * 7, color: Math.random() < 0.5 ? '#4fc3f7' : '#e1f5fe' }));
    } else if (zone === 'sky') {
      if (this.sound) sfx.boing();
      this.parts.burst(20, () => ({ type: 'dust', x: ch.x + (Math.random() - 0.5) * 120, y: ch.y, vx: (Math.random() - 0.5) * 200, vy: -60 - Math.random() * 60, life: 1000, size: 14 + Math.random() * 12, color: '#fff' }));
    } else {
      if (this.sound) sfx.thud();
      if (zone === 'parking') this.carAlarmAt = this.t;
      this.parts.burst(16, () => ({ type: 'dust', x: ch.x + (Math.random() - 0.5) * 80, y: ch.y - 4, vx: (Math.random() - 0.5) * 220, vy: -40 - Math.random() * 90, life: 800, size: 8 + Math.random() * 10, color: zone === 'moon' ? '#d9d9e8' : '#e9dcc3' }));
    }
    this.parts.add({ type: 'ring', x: ch.x, y: ch.y - 60, life: 600, size: 140, color: tierColor(tier) });
    if (tier >= 4) {
      const cols = ['#ff4d5e', '#ffc43d', '#2fd06a', '#3b8cff', '#b45cff', '#ff8fab'];
      this.parts.burst(tier === 5 ? 90 : 55, () => ({ type: 'confetti', x: ch.x + (Math.random() - 0.5) * 60, y: ch.y - 160, vx: (Math.random() - 0.5) * 700, vy: -400 - Math.random() * 500, g: 700, vr: (Math.random() - 0.5) * 16, life: 2200, size: 9 + Math.random() * 7, color: cols[Math.floor(Math.random() * cols.length)] ?? '#fff' }));
    }
    if (this.sound) setTimeout(() => sfx.fanfare(tier), 140);
    f.onLand?.();
  }

  private followCamera(dt: number): void {
    const ch = this.char;
    const tx = ch.x - this.vw * (this.state === 'fly' ? 0.45 : this.focusX), ty = ch.y - this.vh * (this.focusY - 0.5);
    if (!this.cam) { this.cam = { x: tx, y: ty }; return; }
    const k = this.state === 'fly' ? Math.min(1, dt / 40) : Math.min(1, dt / 200);
    this.cam.x = lerp(this.cam.x, tx, k); this.cam.y = lerp(this.cam.y, ty, k);
  }

  // ---------- rendering ----------
  private draw(): void {
    if (!this.w || !this.cam) return;
    const { b, buf } = this, W = buf.width, H = buf.height, z = this.baseZ * this.zoomK / this.px;
    const alt = -(this.cam.y - this.vh * 0.5);
    b.setTransform(1, 0, 0, 1, 0, 0);
    // sky: day, dusk on the way up, space above the clouds
    const space = clamp((alt - 1600) / 3200, 0, 1), dusk = clamp((alt - 600) / 1400, 0, 1) * (1 - space);
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, css(mixRgb(mixRgb(SKY.dayTop, SKY.duskTop, dusk), SKY.spaceTop, space)));
    g.addColorStop(1, css(mixRgb(mixRgb(SKY.dayLow, SKY.duskLow, dusk), SKY.spaceLow, space)));
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    if (space > 0.05) {
      const r = rng(7); b.fillStyle = `rgba(255,255,255,${space})`;
      for (let i = 0; i < 140; i++) { const sx = (r() * W * 4 - this.cam.x * 0.01 / this.px) % W; b.fillRect((sx + W) % W, (r() * H + alt * 0.02 / this.px) % H, 1, 1); }
    }
    b.fillStyle = space > 0.6 ? 'rgba(255,240,200,.25)' : 'rgba(255,233,140,.9)';
    b.fillRect(W * 0.78, H * 0.18 + alt * 0.02 / this.px, W * 0.06, W * 0.06);

    // world, mirrored for right-to-left languages
    const sx = this.shake ? (Math.random() - 0.5) * this.shake : 0, sy = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    b.setTransform(z * (this.rtl ? -1 : 1), 0, 0, z, this.rtl ? W : 0, 0);
    b.translate(-this.cam.x + sx, -this.cam.y + this.vh * 0.5 + sy);
    const view: View = { t: this.t, camX: this.cam.x, camY: this.cam.y, vw: this.vw, meters: this.meters, clock: this.clock, windowBroken: this.windowBroken, carAlarmAt: this.carAlarmAt };
    drawParallax(b, view);
    drawGround(b, view);
    drawProps(b, view);
    b.save(); b.translate(this.char.x, this.char.y); b.rotate(this.char.rot); drawWorker(b, this.look, this.char.pose, this.t); b.restore();
    drawFront(b, view);
    this.parts.draw(b);

    // speed lines and flash
    b.setTransform(1, 0, 0, 1, 0, 0);
    if (this.state === 'fly' && this.speed > 1500) {
      b.fillStyle = `rgba(255,255,255,${clamp((this.speed - 1500) / 6000, 0, 0.6)})`;
      const r = rng(Math.floor(this.t / 50));
      for (let i = 0; i < 14; i++) b.fillRect(r() * W, r() * H, 20 + r() * 40, 1);
    }
    if (this.flash > 0) { b.fillStyle = `rgba(255,255,255,${this.flash})`; b.fillRect(0, 0, W, H); }

    // present, pixelated
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W * this.px * this.dpr, H * this.px * this.dpr);
  }
}
