// The stage: one canvas, an integer pixel scale, the animation loop and flight timing.
// Everything visible is drawn by the active theme's World into a low-resolution bitmap,
// which is then scaled up by a whole number with smoothing off, so every art pixel is an exact square.
import type { Look } from '../../../shared/wardrobe.ts';
import type { AnyKey } from '../i18n/index.tsx';
import { Bmp } from './pixel/bmp.ts';
import { sfx } from './sfx.ts';
import type { FrameState, Mode, ThemeModule, World } from './themes/types.ts';

const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = (k: number): number => 1 - Math.pow(1 - k, 3);

export interface StageOptions {
  theme: ThemeModule;
  look: Look;
  rtl?: boolean;
  sound?: boolean;
  /** Live distance (points) while flying. */
  onDistance?: (points: number) => void;
  onLandmark?: (key: AnyKey) => void;
  /** Size of one art pixel in CSS pixels; the UI uses it as its grid unit. */
  onScale?: (cssPx: number) => void;
}

export interface LaunchOptions {
  points: number;
  tier: number;
  onLand?: () => void;
  onDone?: () => void;
}

interface Flight extends LaunchOptions { from: number; to: number; start: number; dur: number; passed: Set<number>; landed: boolean }

export class Stage {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly art = document.createElement('canvas');
  private readonly artCtx: CanvasRenderingContext2D;
  private readonly ro: ResizeObserver;
  private frame = new Bmp(1, 1);
  private world: World;
  private theme: ThemeModule;
  private raf = 0;
  private alive = true;
  private t = 0;
  private last = performance.now();
  private scale = 4;
  private dpr = 1;
  private mode: Mode = 'idle';
  private modeAt = 0;
  private flight: Flight | null = null;
  private rejectAt = -1e9;
  private missKind: 'timeout' | 'pass' | null = null;
  private dist = 0;
  private clock: number | null = null;
  private companionsWanted = 0;
  private companionsShown = 0;
  private announce = false;
  private joinAt = -1e9;
  private pokeAt = -1e9;
  private readonly onPointer = (e: PointerEvent): void => this.poke(e);

  rtl: boolean;
  sound: boolean;
  onDistance: StageOptions['onDistance'];
  onLandmark: StageOptions['onLandmark'];
  onScale: StageOptions['onScale'];

  constructor(canvas: HTMLCanvasElement, o: StageOptions) {
    const ctx = canvas.getContext('2d'), artCtx = this.art.getContext('2d');
    if (!ctx || !artCtx) throw new Error('Canvas 2D is not available');
    this.canvas = canvas; this.ctx = ctx; this.artCtx = artCtx;
    this.theme = o.theme; this.world = o.theme.createWorld(o.look);
    this.rtl = o.rtl ?? false; this.sound = o.sound ?? true;
    this.onDistance = o.onDistance; this.onLandmark = o.onLandmark; this.onScale = o.onScale;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    const loop = (now: number): void => {
      if (!this.alive) return;
      const dt = Math.min(50, now - this.last);
      this.last = now; this.t += dt;
      this.step(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    window.addEventListener('pointerdown', this.onPointer);
  }

  destroy(): void { this.alive = false; cancelAnimationFrame(this.raf); this.ro.disconnect(); window.removeEventListener('pointerdown', this.onPointer); }

  setTheme(theme: ThemeModule, look: Look): void { this.theme = theme; this.world = theme.createWorld(look); }
  setLook(look: Look): void { this.world.setLook(look); }

  // ---------- game events ----------
  get distance(): number { return this.dist; }
  get busy(): boolean { return this.mode === 'fly' || this.mode === 'landed'; }

  /** Jump to a distance without animating (resuming a day). */
  setPosition(points: number): void {
    this.dist = points; this.flight = null; this.setMode('idle');
  }
  setClock(left: number | null): void { this.clock = left; }
  /**
   * How many companions fly along. With announce, new ones arrive one by one (after any flight) with a sound;
   * without it (loading a page) they are simply there.
   */
  setCompanions(n: number, announce = false): void {
    this.companionsWanted = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    if (!announce || n < this.companionsShown) { this.companionsShown = this.companionsWanted; return; }
    this.announce = true;
  }
  /** Build-up while the tier reveal plays. */
  charge(on = true): void {
    if (this.mode === 'fly') return;
    this.setMode(on ? 'charge' : 'idle');
    if (on && this.sound) sfx.ignition();
  }

  launch(o: LaunchOptions): void {
    const from = this.dist, to = from + o.points;
    if (reducedMotion() || o.points <= 0) {
      this.dist = to; this.onDistance?.(to);
      o.onLand?.(); o.onDone?.(); this.setMode('idle'); return;
    }
    this.flight = { ...o, from, to, start: this.t, dur: this.theme.flightMs(o.points), passed: new Set(), landed: false };
    this.setMode('fly');
    if (this.sound) sfx.whoosh(this.flight.dur / 1000);
    this.world.launched?.(this.state(0));
  }

  miss(kind: 'timeout' | 'pass'): void {
    this.missKind = kind; this.setMode('miss');
    this.world.missed?.(this.state(0));
    if (!this.sound) return;
    if (kind === 'timeout') sfx.ring();
    window.setTimeout(() => sfx.sad(), kind === 'timeout' ? 550 : 0);
  }

  /** Confetti and a shake, for a new personal best. */
  celebrate(): void { this.world.celebrate?.(this.state(0)); }

  reject(): void { this.rejectAt = this.t; if (this.sound) sfx.buzz(); }

  // ---------- internals ----------
  /** A tap on the hero (not on a panel or control) makes it hop and boop. */
  private poke(e: PointerEvent): void {
    const el = e.target instanceof Element ? e.target : null;
    if (el?.closest('button, a, input, textarea, select, label, .px-window, .menu-layer, .hud, .toast')) return;
    const h = this.world.hero?.(); if (!h) return;
    const r = this.canvas.getBoundingClientRect();
    let x = (e.clientX - r.left) / this.scale; const y = (e.clientY - r.top) / this.scale;
    if (this.rtl) x = this.frame.w - x;
    if (Math.hypot(x - h.x, y - h.y) > h.r) return;
    this.pokeAt = this.t;
    if (this.sound) sfx.boop();
  }

  private setMode(m: Mode): void { this.mode = m; this.modeAt = this.t; }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    // About 320x180 art pixels on a landscape screen, never less than 2 CSS px per art pixel.
    const scale = Math.max(2, Math.min(8, Math.floor(Math.min(r.width / 300, r.height / 170))));
    this.scale = scale; this.dpr = dpr;
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    const W = Math.ceil(r.width / scale), H = Math.ceil(r.height / scale);
    if (W !== this.frame.w || H !== this.frame.h) { this.frame = new Bmp(W, H); this.art.width = W; this.art.height = H; }
    this.onScale?.(scale);
  }

  private state(dt: number): FrameState {
    const f = this.flight;
    return {
      t: this.t, dt, dist: this.dist, mode: this.mode, modeT: this.t - this.modeAt,
      flight: f ? { from: f.from, to: f.to, k: f.landed ? 1 : easeOut(Math.min(1, (this.t - f.start) / f.dur)), tier: f.tier } : null,
      clock: this.clock, sinceReject: this.t - this.rejectAt, missKind: this.missKind,
      companions: this.companionsShown, sinceJoin: this.t - this.joinAt, sincePoke: this.t - this.pokeAt,
    };
  }

  private step(dt: number): void {
    const f = this.flight;
    // companions earned this run join one at a time, never mid-flight
    if (this.companionsShown < this.companionsWanted && (this.mode === 'idle' || this.mode === 'miss') && this.t - this.joinAt > 900) {
      this.companionsShown++; this.joinAt = this.t;
      if (this.announce && this.sound) sfx.alien();
    }
    if (this.mode === 'fly' && f) {
      const k = Math.min(1, (this.t - f.start) / f.dur);
      this.dist = f.from + (f.to - f.from) * easeOut(k);
      this.onDistance?.(this.dist);
      for (const lm of this.theme.landmarks) if (lm.at > f.from && lm.at <= this.dist && !f.passed.has(lm.at)) { f.passed.add(lm.at); this.onLandmark?.(lm.key); }
      if (k >= 1) {
        f.landed = true; this.dist = f.to; this.setMode('landed');
        this.world.landed?.(this.state(dt));
        if (this.sound) { sfx.thud(); window.setTimeout(() => sfx.fanfare(f.tier), 140); }
        f.onLand?.();
      }
    } else if (this.mode === 'landed' && this.t - this.modeAt > 900) {
      this.setMode('idle'); f?.onDone?.();
    } else if (this.mode === 'miss' && this.t - this.modeAt > 1600) {
      this.setMode('idle');
    }
    this.render(dt);
  }

  private render(dt: number): void {
    const fr = this.frame;
    if (fr.w < 2) return;
    this.world.render(fr, this.state(dt));
    this.artCtx.putImageData(fr.toImageData(), 0, 0);
    const s = this.world.shake, ox = s ? Math.round((Math.random() - 0.5) * s) : 0, oy = s ? Math.round((Math.random() - 0.5) * s) : 0;
    const k = this.scale * this.dpr, { ctx } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(this.rtl ? -1 : 1, 0, 0, 1, this.rtl ? this.canvas.width : 0, 0);
    ctx.fillStyle = '#0b0a16';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.art, ox * k, oy * k, fr.w * k, fr.h * k);
  }
}
