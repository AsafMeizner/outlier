// Pixel-art toolkit: a 32-bit bitmap with integer-only drawing (no paths, no anti-aliasing),
// ordered dithering, sprites from text rows, exact rotations and auto-outlines.
// Colours are packed ABGR uint32 (the byte order of ImageData on little-endian machines); 0 = transparent.

export type Color = number;

/** '#rrggbb' to a packed colour. */
export function rgb(hex: string): Color {
  const n = parseInt(hex.slice(1, 7), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
}

/** Scale a colour's brightness (k < 1 darker, k > 1 lighter towards white). */
export function shade(c: Color, k: number): Color {
  const r = c & 0xff, g = (c >> 8) & 0xff, b = (c >> 16) & 0xff;
  const f = (v: number): number => Math.max(0, Math.min(255, Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1))));
  return (0xff000000 | (f(b) << 16) | (f(g) << 8) | f(r)) >>> 0;
}

/** Mix two colours (t = 0 → a, 1 → b). Only for building palettes, never per pixel at runtime. */
export function mix(a: Color, b: Color, t: number): Color {
  const ch = (s: number): number => Math.round(((a >> s) & 0xff) * (1 - t) + ((b >> s) & 0xff) * t);
  return (0xff000000 | (ch(16) << 16) | (ch(8) << 8) | ch(0)) >>> 0;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold for a pixel, in (0, 1). */
export const bayer = (x: number, y: number): number => ((BAYER[((y & 3) << 2) | (x & 3)] ?? 0) + 0.5) / 16;

/** Small deterministic random generator (mulberry32). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Bmp {
  readonly w: number;
  readonly h: number;
  readonly d: Uint32Array;
  /** Drawing is limited to [x0, y0, x1, y1). */
  clip: [number, number, number, number];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.d = new Uint32Array(w * h);
    this.clip = [0, 0, w, h];
  }

  set(x: number, y: number, c: Color): void {
    x = Math.floor(x); y = Math.floor(y);
    const k = this.clip;
    if (c && x >= k[0] && y >= k[1] && x < k[2] && y < k[3]) this.d[y * this.w + x] = c;
  }
  get(x: number, y: number): Color {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : (this.d[y * this.w + x] ?? 0);
  }
  clear(c: Color = 0): void { this.d.fill(c); }

  rect(x: number, y: number, w: number, h: number, c: Color): void {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const k = this.clip, x0 = Math.max(k[0], x), y0 = Math.max(k[1], y), x1 = Math.min(k[2], x + w), y1 = Math.min(k[3], y + h);
    if (x1 <= x0) return;
    for (let j = y0; j < y1; j++) this.d.fill(c, j * this.w + x0, j * this.w + x1);
  }
  /** Colour c over the area with ordered-dither coverage `level` (0..1). */
  dither(x: number, y: number, w: number, h: number, c: Color, level: number): void {
    if (level <= 0) return;
    x = Math.round(x); y = Math.round(y);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (bayer(i, j) < level) this.set(i, j, c);
  }
  /** Flat horizontal colour bands with a short dithered seam between neighbours. */
  bands(x: number, y: number, w: number, h: number, cols: readonly Color[], seam = 0.4): void {
    const n = cols.length;
    for (let j = 0; j < h; j++) {
      const p = (j / h) * n, k = Math.min(n - 1, Math.floor(p)), f = p - k;
      const a = cols[k] ?? 0, b = cols[Math.min(n - 1, k + 1)] ?? a, lvl = f > 1 - seam ? (f - (1 - seam)) / seam : 0;
      for (let i = 0; i < w; i++) this.set(x + i, y + j, bayer(x + i, y + j) < lvl ? b : a);
    }
  }
  circle(cx: number, cy: number, r: number, c: Color): void {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    for (let y = -r; y <= r; y++) { const dx = Math.floor(Math.sqrt(r * r - y * y) + 0.4); this.rect(cx - dx, cy + y, dx * 2 + 1, 1, c); }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color): void {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let y = -ry; y <= ry; y++) { const dx = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); this.rect(cx - dx, cy + y, dx * 2 + 1, 1, c); }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Color): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  /** Copy a sprite (transparent pixels skipped), optionally mirrored and scaled by a whole number. */
  blit(s: Bmp, x: number, y: number, flip = false, k = 1): void {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const c = s.d[j * s.w + (flip ? s.w - 1 - i : i)] ?? 0;
      if (!c) continue;
      if (k === 1) this.set(x + i, y + j, c);
      else this.rect(x + i * k, y + j * k, k, k, c);
    }
  }
  /** Add a 1px outline of colour c around every opaque pixel (in place; for sprites with a transparent margin). */
  outline(c: Color): this {
    const src = this.d.slice();
    const at = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < this.w && j < this.h && !!src[j * this.w + i] && src[j * this.w + i] !== c;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.d[y * this.w + x] = c;
    }
    return this;
  }
  /** Copy pixels to a canvas 2D context at the bitmap's own size. */
  toImageData(): ImageData {
    return new ImageData(new Uint8ClampedArray(this.d.buffer as ArrayBuffer, this.d.byteOffset, this.d.byteLength), this.w, this.h);
  }
}

/** Sprite from text rows: each character maps to a colour through `legend`; '.' and unknown characters are transparent. */
export function sprite(rows: readonly string[], legend: Readonly<Record<string, Color>>): Bmp {
  const b = new Bmp(rows[0]?.length ?? 0, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const c = legend[ch]; if (c) b.set(x, y, c); }));
  return b;
}

/** Rotate a sprite 90° clockwise (exact). */
export function rotateCW(s: Bmp): Bmp {
  const b = new Bmp(s.h, s.w);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) b.d[x * b.w + (s.h - 1 - y)] = s.d[y * s.w + x] ?? 0;
  return b;
}

/** Rotate a sprite by any angle with nearest-neighbour sampling (keeps hard pixels). */
export function rotate(s: Bmp, angle: number): Bmp {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const size = Math.ceil(Math.hypot(s.w, s.h)) + 2, b = new Bmp(size, size);
  const cx = (s.w - 1) / 2, cy = (s.h - 1) / 2, ox = (size - 1) / 2, oy = (size - 1) / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x - ox, dy = y - oy;
    const sx = Math.round(cos * dx + sin * dy + cx), sy = Math.round(-sin * dx + cos * dy + cy);
    if (sx >= 0 && sy >= 0 && sx < s.w && sy < s.h) b.d[y * size + x] = s.d[sy * s.w + sx] ?? 0;
  }
  return b;
}
