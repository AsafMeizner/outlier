'use strict';
// Pixel-art showcase. Everything is drawn into 320x180 bitmaps with integer pixel writes only:
// no paths, no anti-aliasing, no smoothing. Canvases are scaled up by CSS with image-rendering: pixelated.

const W = 320, H = 180;

// ---------------------------------------------------------------- palette
const HEX = {
  ink: '#1b1b2f', black: '#0b0a16', white: '#f7f4ea', cream: '#fff2cc', paper: '#f3dfae', paperD: '#d8bd7f',
  sun: '#ffcc33', orange: '#ff8a1f', red: '#e83b3b', redD: '#a3233a', pink: '#ff6fa8', coral: '#ff6b5b',
  purple: '#8a4bd6', purpleD: '#4b2a8a', violet: '#2a1650', night: '#140c2e',
  navy: '#1e2350', navyM: '#2f3a78', blue: '#3e6fd8', sky: '#5cb0ff', skyL: '#a8dcff', skyXL: '#d6f1ff',
  cyan: '#3fe0ff', teal: '#24b3a8', tealD: '#137a7a', sea1: '#2fb7c9', sea2: '#1a7f9a', sea3: '#0f4f74', sea4: '#0a2f52', abyss: '#051427', abyss2: '#020812',
  green: '#3fbf5a', greenD: '#1f7a46', brown: '#7a4a2e', brownL: '#b8794a', wood: '#d39a62', woodD: '#a86f40',
  skin: '#f2c49b', skinD: '#c98e5f', gray: '#8b93a8', grayD: '#545b73', grayL: '#c7cbd8', tan: '#e3b77a', rust: '#c46a3a',
  wall: '#f6e3b4', wallD: '#e3c98c',
};
const C = {};
for (const [k, v] of Object.entries(HEX)) {
  const n = parseInt(v.slice(1), 16);
  C[k] = (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | ((n >> 16) & 0xff)) >>> 0;
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const bayer = (x, y) => (BAYER[y & 3][x & 3] + 0.5) / 16;

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- bitmap
class Bmp {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint32Array(w * h); this.clip = [0, 0, w, h]; }
  set(x, y, c) { x |= 0; y |= 0; const k = this.clip; if (c && x >= k[0] && y >= k[1] && x < k[2] && y < k[3]) this.d[y * this.w + x] = c; }
  get(x, y) { return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.d[y * this.w + x]; }
  rect(x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y);
    const k = this.clip, x0 = Math.max(k[0], x), y0 = Math.max(k[1], y), x1 = Math.min(k[2], x + w), y1 = Math.min(k[3], y + h);
    for (let j = y0; j < y1; j++) this.d.fill(c, j * this.w + x0, j * this.w + Math.max(x0, x1));
  }
  /** Ordered-dither colour c over the area with coverage `level` (0..1). */
  dither(x, y, w, h, c, level) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (bayer(i, j) < level) this.set(i, j, c);
  }
  /** Flat colour bands with a short dithered seam between neighbours (classic pixel-art sky). */
  bands(x, y, w, h, cols, seam = 0.35) {
    const n = cols.length;
    for (let j = 0; j < h; j++) {
      const p = (j / h) * n, k = Math.min(n - 1, Math.floor(p)), f = p - k;
      const next = cols[Math.min(n - 1, k + 1)], lvl = f > 1 - seam ? (f - (1 - seam)) / seam : 0;
      for (let i = 0; i < w; i++) this.set(x + i, y + j, bayer(x + i, y + j) < lvl ? next : cols[k]);
    }
  }
  circle(cx, cy, r, c) {
    for (let y = -r; y <= r; y++) { const dx = Math.floor(Math.sqrt(r * r - y * y) + 0.4); this.rect(cx - dx, cy + y, dx * 2 + 1, 1, c); }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = -ry; y <= ry; y++) { const dx = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); this.rect(cx - dx, cy + y, dx * 2 + 1, 1, c); }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  /** Copy a sprite; transparent pixels (0) are skipped. */
  blit(s, x, y, flip = false) {
    x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) { const c = s.d[j * s.w + (flip ? s.w - 1 - i : i)]; if (c) this.set(x + i, y + j, c); }
  }
  /** 1px outline around every opaque pixel (sprites only). */
  outline(c) {
    const src = this.d.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[y * this.w + x]) continue;
      const at = (i, j) => i >= 0 && j >= 0 && i < this.w && j < this.h && src[j * this.w + i] && src[j * this.w + i] !== c;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.d[y * this.w + x] = c;
    }
    return this;
  }
}

/** Sprite from text rows; each character maps to a palette key through `legend` ('.' = transparent). */
function sprite(rows, legend) {
  const b = new Bmp(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const k = legend[ch]; if (k) b.set(x, y, C[k]); }));
  return b;
}
/** Rotate a sprite 90° clockwise (exact for pixel art). */
function rotateCW(s) {
  const b = new Bmp(s.h, s.w);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) b.d[x * b.w + (s.h - 1 - y)] = s.d[y * s.w + x];
  return b;
}

// ---------------------------------------------------------------- bitmap font (5x7)
const GLYPHS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'], B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'], F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'], H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'], J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'], X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], 1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], 3: ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  4: ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'], 5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'], 7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], 9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'], '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '..#..', '.#...'], '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'], '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'], ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
const textW = (s, k = 1) => s.length * 6 * k - k;
function text(b, s, x, y, c, k = 1, outline = 0) {
  if (outline) for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1], [1, 2], [0, 2], [-1, 2]]) text(b, s, x + ox * k, y + oy * k, outline, k);
  [...s].forEach((ch, n) => {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    g.forEach((row, gy) => [...row].forEach((p, gx) => { if (p === '#') b.rect(x + n * 6 * k + gx * k, y + gy * k, k, k, c); }));
  });
}
const textC = (b, s, cx, y, c, k = 1, outline = 0) => text(b, s, Math.round(cx - textW(s, k) / 2), y, c, k, outline);

// ---------------------------------------------------------------- UI kit (themeable)
/** Panel with notched corners, inner bevel and a hard drop shadow. */
function panel(b, x, y, w, h, ui, fill = ui.panel) {
  b.rect(x + 2, y + h, w - 1, 2, ui.shadow); b.rect(x + w, y + 2, 2, h - 1, ui.shadow);
  b.rect(x + 1, y + 1, w - 2, h - 2, fill);
  b.rect(x + 1, y, w - 2, 1, ui.border); b.rect(x + 1, y + h - 1, w - 2, 1, ui.border);
  b.rect(x, y + 1, 1, h - 2, ui.border); b.rect(x + w - 1, y + 1, 1, h - 2, ui.border);
  if (fill === ui.panel) { b.rect(x + 1, y + 1, w - 2, 1, ui.hi); b.rect(x + 1, y + h - 2, w - 2, 1, ui.lo); }
}
function button(b, x, y, w, h, label, ui, pressed = false) {
  const dy = pressed ? 1 : 0;
  b.rect(x + 1, y + h, w - 2, 2 - dy, ui.border);
  b.rect(x + 1, y + dy, w - 2, h, ui.border); b.rect(x, y + 1 + dy, w, h - 2, ui.border);
  b.rect(x + 1, y + 1 + dy, w - 2, h - 2, ui.accent);
  b.rect(x + 1, y + 1 + dy, w - 2, 1, ui.accentHi); b.rect(x + 1, y + h - 3 + dy, w - 2, 2, ui.accentLo);
  textC(b, label, x + w / 2, y + Math.round((h - 7) / 2) - 1 + dy, ui.accentText);
}
function dial(b, cx, cy, frac, secs, ui) {
  b.circle(cx, cy, 11, ui.border); b.circle(cx, cy, 10, ui.dialFace);
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2, x = Math.round(cx + Math.cos(a) * 8), y = Math.round(cy + Math.sin(a) * 8);
    b.rect(x - 1, y - 1, 2, 2, i / n < frac ? (frac > 0.3 ? ui.dialOn : C.red) : ui.dialOff);
  }
  textC(b, String(secs), cx + 1, cy - 3, ui.dialText);
}
function hud(b, ui, t) {
  // logo: chair icon block + wordmark
  b.rect(5, 5, 11, 11, C.ink); b.rect(6, 6, 9, 9, ui.logo);
  b.rect(8, 7, 5, 3, C.white); b.rect(8, 10, 5, 1, C.white); b.rect(10, 11, 1, 2, C.white); b.rect(8, 13, 5, 1, C.white);
  text(b, 'OUTLIER', 20, 7, C.white, 1, C.ink);
  // corner buttons
  [271, 286, 301].forEach((x, i) => {
    b.rect(x, 5, 13, 13, C.ink); b.rect(x + 1, 6, 11, 10, i === 2 ? C.sun : ui.iconBtn); b.rect(x + 1, 16, 11, 1, C.ink);
    const g = i === 2 ? C.ink : C.white;
    if (i === 0) { b.rect(x + 3, 9, 2, 4, g); b.rect(x + 5, 8, 1, 6, g); b.rect(x + 6, 7, 1, 8, g); b.rect(x + 8, 9, 1, 4, g); b.rect(x + 10, 8, 1, 6, g); }
    if (i === 1) { b.rect(x + 3, 7, 7, 3, g); b.rect(x + 2, 8, 9, 2, g); b.rect(x + 4, 10, 5, 4, g); }
    if (i === 2) { b.rect(x + 3, 8, 7, 1, g); b.rect(x + 3, 10, 7, 1, g); b.rect(x + 3, 12, 7, 1, g); }
  });
  void t;
}
function questionUI(b, ui, t, opts) {
  hud(b, ui, t);
  const px = 66, pw = 188;
  panel(b, px, 22, pw, 44, ui);
  textC(b, 'PROMPT 1 OF 5', 160, 28, ui.sub);
  for (let i = 0; i < 5; i++) { b.rect(136 + i * 10, 37, 7, 3, ui.border); b.rect(137 + i * 10, 37, 5, 2, i === 0 ? (t % 800 < 400 ? ui.accent : ui.sub) : ui.pip); }
  textC(b, opts.prompt, 160, 46, ui.text, 2);
  const left = 0.72 - ((t / 1000) % 20) / 60;
  dial(b, px + pw - 4, 24, left, Math.ceil(left * 20), ui);
  // answer bar
  panel(b, 48, 146, 156, 24, ui, ui.input);
  text(b, opts.answer, 56, 151, ui.inputText, 2);
  if (t % 900 < 450) b.rect(56 + textW(opts.answer, 2) + 4, 163, 10, 2, ui.inputText);
  button(b, 212, 146, 62, 24, opts.go, ui, t % 2600 > 2400);
  text(b, 'PASS', 280, 155, ui.dim, 1, 0);
}
function flightUI(b, ui, t, o) {
  hud(b, ui, t);
  textC(b, o.dist, 160, 24, ui.distance, 3, C.ink);
  const cw = textW(o.caption) + 14;
  panel(b, 160 - cw / 2, 52, cw, 14, { ...ui, panel: ui.caption, hi: ui.caption, lo: ui.caption, border: C.ink }, ui.caption);
  textC(b, o.caption, 160, 55, ui.captionText);
  // tier banner
  const tw = Math.max(textW(o.tier, 2), textW(o.gain, 2)) + 24;
  const bx = 160 - tw / 2, pop = Math.min(1, ((t % 3000) / 250));
  if (pop > 0.3) {
    panel(b, bx, 132, tw, 38, { ...ui, border: C.ink, hi: o.tierHi, lo: o.tierLo }, o.tierCol);
    b.rect(bx + 1, 133, tw - 2, 1, o.tierHi); b.rect(bx + 1, 167, tw - 2, 2, o.tierLo);
    textC(b, o.tier, 160, 136, C.white, 2, C.ink);
    textC(b, o.gain, 160, 153, C.white, 2, C.ink);
  }
}

// ---------------------------------------------------------------- sprites
const WORKER = sprite([
  '......KKKKK.......',
  '.....KHHHHHK......',
  '....KHHHHHHHK.....',
  '....KHHHSSSSK.....',
  '....KHHSSSKSK.....',
  '....KHSSSSSSSK....',
  '....KSSSSSSKK.....',
  '.....KSSSSSK......',
  '..KK..KKKKK.......',
  '..KcK.KTTTK.......',
  '..KcKKTTTTTK......',
  '..KcKtTTTTTTKKK...',
  '..KcKtTTTTSSSSSK..',
  '..KcKtTTTTKKKKK...',
  '..KcKtTTTTK.......',
  '..KcKKKKKKKKKKK...',
  '..KcKPPPPPPPPPPK..',
  '..KCKPPPPPPPPPPPK.',
  '..KCCCCCCCCCKKPPK.',
  '..KKKKKKKKKKK.KPPK',
  '......KMK.....KPPK',
  '......KMK.....KPPK',
  '......KMK....KBBBK',
  '...KKKKMKKKK.KKKK.',
  '..KWK..K..KWK.....',
  '...K.......K......',
], { K: 'ink', H: 'brown', S: 'skin', T: 'teal', t: 'tealD', P: 'navyM', B: 'ink', C: 'grayD', c: 'gray', M: 'grayL', W: 'grayD' });

// arms up, legs out: the flying pose
const WORKER_FLY = sprite([
  '..KK.....KKKKK....',
  '.KSSK...KHHHHHK...',
  '.KSSK..KHHHHHHHK..',
  '..KTK..KHHHSSSSK..',
  '..KTK..KHHSSSKSK..',
  '..KTTK.KHSSSSSSSK.',
  '...KTK.KSSSSSKKKK.',
  '...KTTKKSSSSSKSSK.',
  '..KKKTTKKKKKKKKK..',
  '..KcKTTTTTTKTTK...',
  '..KcKtTTTTTTTK....',
  '..KcKtTTTTTTK.....',
  '..KcKtTTTTTK......',
  '..KcKKKKKKKKKKKKK.',
  '..KcKPPPPPPPPPPPPK',
  '..KCKPPPPPPPPPPPPK',
  '..KCCCCCCCCCKKKKBK',
  '..KKKKKKKKKKK..KBK',
  '......KMK.......K.',
  '......KMK.........',
  '...KKKKMKKKK......',
  '..KWK..K..KWK.....',
  '...K.......K......',
], { K: 'ink', H: 'brown', S: 'skin', T: 'teal', t: 'tealD', P: 'navyM', B: 'ink', C: 'grayD', c: 'gray', M: 'grayL', W: 'grayD' });

const PLANT = sprite([
  '....KK....', '...KGGK...', '.KKKGgKKK.', 'KGGKGgKGGK', 'KGgGKGKgGK', '.KGgGGGgK.', '..KKGgKK..',
  '...KGGK...', '..KKKKKK..', '..KRRRRK..', '..KRrRRK..', '..KRrRRK..', '...KRRK...', '...KKKK...',
], { K: 'ink', G: 'green', g: 'greenD', R: 'rust', r: 'brown' });

const ROCKET = sprite([
  '......K......', '.....KRK.....', '.....KRK.....', '....KRRrK....', '....KRRrK....', '...KRRRRrK...',
  '...KWWWWwK...', '...KWWWWwK...', '..KWWKKKWwK..', '..KWKbBBKwK..', '..KWKbBBKwK..', '..KWKBBBKwK..',
  '..KWWKKKWwK..', '..KWWWWWWwK..', '..KWWWWWWwK..', '..KRRRRRRrK..', '..KWWWWWWwK..', '..KWWWWWWwK..',
  '..KWWWWWWwK..', '..KWWWWWWwK..', '..KRRRRRRrK..', '..KWWWWWWwK..', '.KKWWWWWWwKK.', 'KRKWWWWWWwKRK',
  'KRRKWWWWwKRrK', 'KRRKWWWWwKRrK', 'KRRKKKKKKKRrK', 'KRRK.KMK.KRrK', 'KKKK.KMK.KKKK', '.....KKK.....',
], { K: 'ink', R: 'red', r: 'redD', W: 'white', w: 'grayL', B: 'cyan', b: 'white', M: 'grayD' });
const ROCKET_SIDE = rotateCW(ROCKET);

const ANGLER = sprite([
  'LL................', 'LLl...............', '..l...............', '...l..KKKKKK......',
  '....lKdddddDK...KK', '....KdEKddddDK.KDK', '...KdddddddddDKDDK', '..KTKTdddddddDDDDK',
  '..K...KddddddDKDDK', '..KTKTddddddDK.KDK', '...KKddddddDK...KK', '.....KKKKKKK......',
], { K: 'ink', d: 'purple', D: 'purpleD', T: 'white', E: 'sun', L: 'sun', l: 'grayD' });

const FISH = sprite(['K..KKK.', 'KKKoooK', 'KoooKoK', 'KKKoooK', 'K..KKK.'], { K: 'ink', o: 'orange' });
const FISH_B = sprite(['K..KKK.', 'KKKoooK', 'KoooKoK', 'KKKoooK', 'K..KKK.'], { K: 'ink', o: 'sun' });

function makeSub() {
  const b = new Bmp(38, 22);
  b.ellipse(19, 13, 15, 6, C.sun);
  for (let y = 15; y <= 19; y++) for (let x = 0; x < 38; x++) if (b.get(x, y) === C.sun) b.set(x, y, C.orange);
  b.rect(14, 3, 9, 6, C.sun); b.rect(21, 3, 2, 6, C.orange);
  b.rect(18, 0, 1, 3, C.grayD); b.rect(18, 0, 4, 1, C.grayD);
  for (const cx of [12, 19, 26]) { b.circle(cx, 12, 2, C.grayL); b.circle(cx, 12, 1, C.sky); b.set(cx - 1, 11, C.white); }
  b.rect(2, 10, 2, 7, C.grayD); b.rect(0, 12, 2, 3, C.gray);
  b.rect(34, 12, 2, 2, C.cream);
  return b.outline(C.ink);
}
const SUB = makeSub();

function makeAsteroid(seed, r) {
  const R = rng(seed), b = new Bmp(r * 2 + 4, r * 2 + 4), c = r + 2;
  const bumps = Array.from({ length: 8 }, () => 0.75 + R() * 0.35);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const dx = x - c, dy = y - c, a = (Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1, k = bumps[Math.floor(a * 8)];
    if (Math.hypot(dx, dy) <= r * k) b.set(x, y, dx + dy > r * 0.4 ? C.grayD : C.gray);
  }
  b.set(c - 1, c - 1, C.grayL); b.set(c, c - 2, C.grayL);
  b.set(c + 1, c + 1, C.ink); b.set(c - 2, c + 1, C.grayD);
  return b.outline(C.ink);
}
const ROCKS = [makeAsteroid(3, 4), makeAsteroid(9, 6), makeAsteroid(21, 3)];

// ---------------------------------------------------------------- scenery helpers
function cloud(b, x, y, s, top, shade) {
  const parts = [[0, 4, 5], [7, 0, 7], [15, 3, 6], [21, 5, 4]];
  for (const [dx, dy, r] of parts) b.circle(Math.round(x + dx * s), Math.round(y + dy * s), Math.round(r * s), shade);
  for (const [dx, dy, r] of parts) b.circle(Math.round(x + dx * s), Math.round(y + dy * s - 1), Math.round(r * s), top);
  b.rect(Math.round(x), Math.round(y + 5 * s), Math.round(22 * s), Math.round(3 * s), top);
}
function skyline(b, seed, y0, minH, maxH, cols, win, lit) {
  const R = rng(seed);
  let x = -4;
  while (x < W) {
    const w = 12 + Math.floor(R() * 18), h = minH + Math.floor(R() * (maxH - minH)), c = cols[Math.floor(R() * cols.length)];
    b.rect(x, y0 - h, w, h + 40, C.ink); b.rect(x + 1, y0 - h + 1, w - 2, h + 40, c);
    if (win) for (let wy = y0 - h + 4; wy < H; wy += 5) for (let wx = x + 3; wx < x + w - 3; wx += 4) b.rect(wx, wy, 2, 2, R() < lit ? win : C.ink);
    if (R() < 0.3) { b.rect(x + w / 2, y0 - h - 6, 1, 6, C.ink); b.set(x + w / 2, y0 - h - 7, C.red); }
    x += w + Math.floor(R() * 3);
  }
}
function stars(b, seed, n, t, area = [0, 0, W, H]) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = area[0] + Math.floor(R() * area[2]), y = area[1] + Math.floor(R() * area[3]), big = R() < 0.12, ph = R() * 6;
    const on = Math.sin(t / 300 + ph) > -0.2;
    b.set(x, y, on ? C.white : C.gray);
    if (big && on) { b.set(x - 1, y, C.grayL); b.set(x + 1, y, C.grayL); b.set(x, y - 1, C.grayL); b.set(x, y + 1, C.grayL); }
  }
}

// ---------------------------------------------------------------- UI themes
const UI = {
  office: { panel: C.cream, hi: C.white, lo: C.paper, border: C.ink, shadow: C.ink, text: C.ink, sub: C.brownL, dim: C.brown, pip: C.paperD,
    accent: C.coral, accentHi: C.pink, accentLo: C.redD, accentText: C.white, input: C.white, inputText: C.ink,
    dialFace: C.ink, dialOn: C.green, dialOff: C.grayD, dialText: C.white, logo: C.coral, iconBtn: C.navyM,
    distance: C.sun, caption: C.sun, captionText: C.ink },
  space: { panel: C.navy, hi: C.navyM, lo: C.night, border: C.cyan, shadow: C.black, text: C.white, sub: C.skyL, dim: C.gray, pip: C.navyM,
    accent: C.pink, accentHi: C.white, accentLo: C.purple, accentText: C.white, input: C.black, inputText: C.cyan,
    dialFace: C.black, dialOn: C.cyan, dialOff: C.navyM, dialText: C.white, logo: C.pink, iconBtn: C.navyM,
    distance: C.cyan, caption: C.cyan, captionText: C.black },
  sea: { panel: C.cream, hi: C.white, lo: C.paper, border: C.ink, shadow: C.abyss, text: C.sea4, sub: C.sea2, dim: C.skyXL, pip: C.paperD,
    accent: C.sun, accentHi: C.cream, accentLo: C.orange, accentText: C.ink, input: C.white, inputText: C.sea4,
    dialFace: C.sea4, dialOn: C.sun, dialOff: C.sea3, dialText: C.white, logo: C.sun, iconBtn: C.sea3,
    distance: C.skyXL, caption: C.sun, captionText: C.ink },
};

// ---------------------------------------------------------------- scenes
const SCENES = {
  'office-desk': {
    bg(b) {
      b.rect(0, 0, W, 132, C.wall);
      b.rect(0, 104, W, 28, C.wallD); b.rect(0, 103, W, 1, C.woodD);
      b.dither(0, 96, W, 7, C.wallD, 0.3);
      // floor planks
      b.rect(0, 132, W, 48, C.wood); b.rect(0, 132, W, 1, C.ink); b.rect(0, 133, W, 2, C.woodD);
      for (let r = 0; r < 4; r++) { const y = 140 + r * 11; b.rect(0, y, W, 1, C.woodD); for (let x = (r * 23) % 46; x < W; x += 46) b.rect(x, y - 10, 1, 10, C.woodD); }
      b.dither(0, 160, W, 20, C.woodD, 0.25);
      // window
      b.rect(194, 14, 112, 94, C.ink); b.rect(196, 16, 108, 90, C.grayL);
      b.rect(199, 19, 102, 84, C.ink);
      b.bands(200, 20, 100, 82, [C.sky, C.sky, C.skyL, C.skyXL], 0.5);
      b.clip = [200, 20, 300, 102];
      skyline(b, 7, 102, 12, 34, [C.skyL, C.grayL], 0, 0);
      cloud(b, 210, 34, 0.8, C.white, C.skyXL);
      cloud(b, 262, 52, 0.6, C.white, C.skyXL);
      b.clip = [0, 0, W, H];
      b.rect(248, 20, 3, 82, C.grayL); b.rect(200, 60, 100, 3, C.grayL);
      b.rect(190, 106, 120, 5, C.woodD); b.rect(190, 106, 120, 1, C.ink); b.rect(190, 111, 120, 1, C.ink);
      // poster
      b.rect(140, 70, 30, 22, C.ink); b.rect(141, 71, 28, 20, C.purpleD); b.circle(155, 81, 5, C.sun); b.rect(141, 85, 28, 6, C.purple);
      // desk with monitor and mug
      b.rect(16, 106, 100, 7, C.ink); b.rect(17, 107, 98, 5, C.brownL); b.rect(17, 111, 98, 1, C.woodD);
      b.rect(20, 113, 5, 19, C.ink); b.rect(21, 113, 3, 19, C.brown); b.rect(106, 113, 5, 19, C.ink); b.rect(107, 113, 3, 19, C.brown);
      b.rect(80, 113, 26, 16, C.ink); b.rect(81, 113, 24, 15, C.brownL); b.rect(90, 119, 6, 2, C.ink);
      b.rect(34, 74, 42, 30, C.ink); b.rect(36, 76, 38, 24, C.navy); b.rect(52, 100, 6, 6, C.ink); b.rect(46, 104, 18, 2, C.ink);
      b.rect(86, 97, 8, 9, C.ink); b.rect(87, 98, 6, 7, C.red); b.rect(94, 99, 2, 4, C.ink); b.rect(87, 98, 6, 1, C.pink);
      b.blit(PLANT, 4, 118);
      // wall clock
      b.circle(124, 46, 9, C.ink); b.circle(124, 46, 8, C.white); b.rect(124, 40, 1, 6, C.ink); b.rect(124, 46, 4, 1, C.ink);
    },
    draw(b, t) {
      // monitor: scrolling code
      const R = rng(Math.floor(t / 400));
      for (let row = 0; row < 7; row++) { const w = 6 + Math.floor(R() * 24); b.rect(39, 79 + row * 3, w, 1, row % 3 ? C.green : C.cyan); }
      // worker: bob, blink, wheels
      const y = 106 + (Math.floor(t / 500) % 2);
      b.blit(WORKER, 112, y);
      if (t % 3200 < 140) b.set(122, y + 4, C.skin);
      questionUI(b, UI.office, t, { prompt: 'NAME A FRUIT', answer: 'RAMBUTAN', go: 'LAUNCH!' });
    },
  },

  'office-fly': {
    bg(b) {
      b.bands(0, 0, W, 150, [C.blue, C.sky, C.sky, C.skyL, C.skyXL], 0.45);
      b.circle(282, 36, 12, C.cream); b.circle(282, 36, 10, C.sun);
      skyline(b, 11, 150, 26, 60, [C.skyL, C.grayL], 0, 0);
      skyline(b, 5, 162, 18, 48, [C.navyM, C.purpleD, C.tealD, C.navy], C.sun, 0.45);
      b.rect(0, 166, W, 14, C.grayD); b.rect(0, 166, W, 1, C.ink); for (let x = 0; x < W; x += 16) b.rect(x, 172, 8, 1, C.sun);
    },
    draw(b, t) {
      const s = t / 1000;
      for (let i = 0; i < 4; i++) { const x = ((i * 97 - s * 60) % 400 + 400) % 400 - 40; cloud(b, x, 30 + i * 22, 0.7 + (i % 2) * 0.3, C.white, C.skyXL); }
      // speed lines
      const R = rng(Math.floor(t / 70));
      for (let i = 0; i < 9; i++) b.rect(Math.floor(R() * W), Math.floor(R() * 120), 10 + Math.floor(R() * 20), 1, C.white);
      // paper trail
      for (let i = 0; i < 7; i++) {
        const px = 140 - i * 15 - ((t / 40) % 15), py = 86 + Math.round(Math.sin(t / 160 + i) * 6) + i * 2;
        b.rect(px, py, 5, 4, C.ink); b.rect(px + 1, py + 1, 3, 2, C.white);
      }
      const y = 72 + Math.round(Math.sin(t / 250) * 3);
      b.blit(WORKER_FLY, 146, y);
      flightUI(b, UI.office, t, { dist: '1,240 M', caption: 'PASSING CITY HALL', tier: 'OUTLIER!', gain: '+1,000 M', tierCol: C.orange, tierHi: C.sun, tierLo: C.redD });
    },
  },

  'space-pad': {
    bg(b) {
      b.bands(0, 0, W, 132, [C.black, C.night, C.violet, C.purpleD], 0.5);
      b.dither(0, 118, W, 14, C.pink, 0.18);
      stars(b, 4, 90, 0, [0, 0, W, 110]);
      // moon with craters and a dithered terminator
      b.circle(48, 50, 22, C.grayL);
      for (let y = -22; y <= 22; y++) for (let x = -22; x <= 22; x++) if (x * x + y * y <= 484 && x > 6) { if (bayer(48 + x, 50 + y) < (x - 6) / 16) b.set(48 + x, 50 + y, C.gray); }
      b.circle(40, 42, 4, C.gray); b.circle(54, 60, 3, C.gray); b.circle(36, 58, 2, C.gray); b.circle(57, 38, 2, C.gray);
      // mountains
      const R = rng(12); let h = 120;
      for (let x = 0; x < W; x++) { h += (R() - 0.5) * 3; h = Math.max(108, Math.min(128, h)); b.rect(x, Math.round(h), 1, 140 - Math.round(h), C.violet); b.set(x, Math.round(h), C.purple); }
      // pad
      b.rect(0, 136, W, 44, C.grayD); b.rect(0, 136, W, 1, C.ink); b.dither(0, 150, W, 30, C.ink, 0.3);
      for (let x = 120; x < 236; x += 8) { b.rect(x, 136, 4, 3, C.sun); b.rect(x + 4, 136, 4, 3, C.ink); }
      // tower lattice
      b.rect(150, 70, 2, 66, C.ink); b.rect(164, 70, 2, 66, C.ink);
      for (let y = 70; y < 136; y += 8) { b.line(151, y, 165, y + 8, C.grayD); b.line(165, y, 151, y + 8, C.grayD); b.rect(150, y, 16, 1, C.ink); }
      b.rect(148, 66, 20, 4, C.ink); b.rect(166, 90, 12, 2, C.ink);
    },
    draw(b, t) {
      stars(b, 4, 90, t, [0, 0, W, 110]);
      b.set(158, 64, t % 1000 < 500 ? C.red : C.redD); b.set(158, 63, t % 1000 < 500 ? C.red : C.redD);
      b.blit(ROCKET, 176, 106);
      // steam puffs at the base
      for (let i = 0; i < 5; i++) {
        const k = ((t / 1400 + i / 5) % 1), x = 182 + (i % 2 ? 1 : -1) * (6 + k * 26), y = 134 - k * 6;
        b.circle(Math.round(x), Math.round(y), Math.round(2 + k * 5), C.grayL); b.circle(Math.round(x), Math.round(y) - 1, Math.round(1 + k * 4), C.white);
      }
      questionUI(b, UI.space, t, { prompt: 'NAME A FRUIT', answer: 'RAMBUTAN', go: 'LAUNCH!' });
    },
  },

  'space-fly': {
    bg(b) {
      b.bands(0, 0, W, H, [C.black, C.night, C.black], 0.5);
      // nebula
      for (const [cx, cy, rx, ry, c, lvl] of [[90, 60, 70, 30, C.purpleD, 0.5], [70, 70, 40, 16, C.purple, 0.3], [260, 140, 80, 30, C.violet, 0.6]])
        for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) { const d = (x * x) / (rx * rx) + (y * y) / (ry * ry); if (d < 1 && bayer(cx + x, cy + y) < lvl * (1 - d)) b.set(cx + x, cy + y, c); }
      stars(b, 21, 120, 0);
      // ringed planet: back half of the ring, the planet, then the front half
      const cx = 238, cy = 78, r = 26;
      const ring = front => { for (let a = 0; a < 720; a++) { const th = (a / 720) * Math.PI * 2, s = Math.sin(th); if (front ? s < 0 : s >= 0) continue; for (const rr of [40, 42, 44]) b.set(Math.round(cx + Math.cos(th) * rr), Math.round(cy - s * rr * 0.22), rr === 42 ? C.paper : C.tan); } };
      ring(false);
      b.circle(cx, cy, r + 1, C.ink); b.circle(cx, cy, r, C.tan);
      for (const [dy, c] of [[-14, C.orange], [-6, C.rust], [4, C.orange], [12, C.brownL]]) for (let x = -r; x <= r; x++) for (let k = 0; k < 3; k++) if (x * x + (dy + k) ** 2 < r * r) b.set(cx + x, cy + dy + k, c);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r && x + y > 4 && bayer(cx + x, cy + y) < (x + y - 4) / 26) b.set(cx + x, cy + y, C.brown);
      ring(true);
    },
    draw(b, t) {
      // streaking stars
      const R = rng(5);
      for (let i = 0; i < 40; i++) { const sp = 40 + R() * 160, y = Math.floor(R() * H), x = Math.floor(((R() * W - (t / 1000) * sp) % W + W) % W); b.rect(x, y, 2 + Math.floor(sp / 40), 1, sp > 140 ? C.white : C.gray); }
      // asteroids drifting
      ROCKS.forEach((s, i) => { const x = ((300 - (t / 1000) * (30 + i * 18) - i * 110) % 380 + 380) % 380 - 30; b.blit(s, x, 30 + i * 46 + Math.round(Math.sin(t / 600 + i) * 2)); });
      // rocket with a flickering flame
      const rx = 70, ry = 84 + Math.round(Math.sin(t / 220) * 2), len = 14 + (Math.floor(t / 60) % 3) * 4;
      for (let i = 0; i < len; i++) { const half = Math.max(0, Math.round(5 * (1 - i / len))); b.rect(rx - 1 - i, ry + 6 - half, 1, half * 2 + 1, i < len * 0.3 ? C.white : i < len * 0.6 ? C.sun : C.orange); }
      b.dither(rx - len - 6, ry + 2, 8, 9, C.red, 0.4);
      b.blit(ROCKET_SIDE, rx, ry);
      flightUI(b, UI.space, t, { dist: '384,400 KM', caption: 'PASSING THE MOON', tier: 'RARE!', gain: '+750 KM', tierCol: C.purple, tierHi: C.pink, tierLo: C.purpleD });
    },
  },

  'sea-surface': {
    bg(b) {
      b.bands(0, 0, W, 66, [C.sky, C.skyL, C.skyXL], 0.5);
      b.circle(40, 22, 9, C.cream); b.circle(40, 22, 7, C.sun);
      cloud(b, 210, 12, 0.7, C.white, C.skyXL); cloud(b, 90, 30, 0.5, C.white, C.skyXL);
      b.bands(0, 66, W, 114, [C.sea1, C.sea2, C.sea3, C.sea4], 0.5);
      // light rays
      for (let k = 0; k < 5; k++) for (let y = 70; y < 150; y++) { const x0 = 30 + k * 64 + (y - 70) * 0.5; for (let x = 0; x < 10; x++) if (bayer(Math.round(x0) + x, y) < 0.18 * (1 - (y - 70) / 80)) b.set(Math.round(x0) + x, y, C.skyL); }
      // support ship
      b.rect(268, 52, 60, 4, C.ink); b.rect(270, 56, 56, 12, C.ink); b.rect(272, 56, 52, 10, C.red); b.rect(272, 64, 52, 2, C.redD); b.rect(270, 52, 56, 3, C.white);
      b.rect(290, 34, 34, 18, C.ink); b.rect(292, 36, 32, 16, C.white); for (let x = 296; x < 320; x += 8) b.rect(x, 40, 5, 4, C.sea3);
      b.rect(306, 24, 4, 10, C.ink); b.rect(307, 25, 2, 9, C.orange);
      // crane
      b.rect(278, 22, 3, 30, C.ink); b.line(280, 24, 262, 76, C.ink); b.line(279, 22, 266, 18, C.ink); b.line(279, 23, 266, 19, C.sun); b.line(279, 24, 266, 20, C.ink);
    },
    draw(b, t) {
      // waves
      for (let x = 0; x < W; x++) { const y = 66 + Math.round(Math.sin(x / 7 + t / 300) * 1.4); b.rect(x, y - 1, 1, 2, C.skyXL); b.set(x, y + 1, C.sea1); }
      // cable and sub swinging gently
      const sx = 226 + Math.round(Math.sin(t / 700) * 2), sy = 74;
      b.line(266, 20, sx + 19, sy, C.ink);
      b.blit(SUB, sx, sy);
      // fish school
      for (let i = 0; i < 6; i++) { const x = ((t / 30 + i * 13) % 360) - 20, y = 128 + (i % 3) * 7 + Math.round(Math.sin(t / 200 + i) * 2); b.blit(i % 2 ? FISH : FISH_B, x, y); }
      // bubbles
      for (let i = 0; i < 6; i++) { const k = ((t / 2400 + i / 6) % 1), x = 232 + Math.round(Math.sin(k * 9 + i) * 3), y = Math.round(140 - k * 60); b.set(x, y, C.skyL); b.set(x + 1, y - 1, C.white); }
      questionUI(b, UI.sea, t, { prompt: 'NAME A FRUIT', answer: 'RAMBUTAN', go: 'DIVE!' });
    },
  },

  'sea-deep': {
    bg(b) {
      b.bands(0, 0, W, H, [C.sea4, C.abyss, C.abyss2, C.abyss2], 0.5);
      // trench walls
      const R = rng(33); let l = 30, r = 290;
      for (let y = 100; y < H; y++) { l += (R() - 0.3) * 2; r -= (R() - 0.3) * 2; b.rect(0, y, Math.round(l), 1, C.black); b.rect(Math.round(r), y, W, 1, C.black); b.set(Math.round(l), y, C.sea4); b.set(Math.round(r), y, C.sea4); }
    },
    draw(b, t) {
      // marine snow
      const R = rng(77);
      for (let i = 0; i < 60; i++) { const x = Math.floor(R() * W) + Math.round(Math.sin(t / 900 + i) * 2), y = Math.floor((R() * H + t / 60) % H); b.set(x, y, R() < 0.3 ? C.grayL : C.gray); }
      const sx = 54, sy = 82 + Math.round(Math.sin(t / 500) * 2);
      // headlight cone
      for (let x = 0; x < 180; x++) { const half = 3 + x * 0.32; for (let y = -half; y <= half; y++) if (bayer(sx + 36 + x, Math.round(sy + 13 + y)) < 0.32 * (1 - x / 180) * (1 - Math.abs(y) / (half + 1))) b.set(sx + 36 + x, Math.round(sy + 13 + y), C.sea2); }
      b.blit(SUB, sx, sy);
      // anglerfish with a pulsing lure
      const ax = 196, ay = 88 + Math.round(Math.sin(t / 650) * 3);
      const glow = 4 + (Math.floor(t / 250) % 2);
      for (let y = -glow * 2; y <= glow * 2; y++) for (let x = -glow * 2; x <= glow * 2; x++) { const d = Math.hypot(x, y) / (glow * 2); if (d < 1 && bayer(ax + 1 + x, ay + 1 + y) < 0.5 * (1 - d)) b.set(ax + 1 + x, ay + 1 + y, C.sun); }
      b.blit(ANGLER, ax, ay);
      // bubbles from the propeller
      for (let i = 0; i < 7; i++) { const k = ((t / 1800 + i / 7) % 1), x = sx - 2 + Math.round(Math.sin(k * 8 + i) * 2), y = Math.round(sy + 12 - k * 70); if (k > 0.1) { b.set(x, y, C.skyL); b.set(x + 1, y, C.skyL); b.set(x, y - 1, C.white); } }
      flightUI(b, UI.sea, t, { dist: '-3,200 M', caption: 'PASSING THE ANGLERFISH', tier: 'OUTLIER!', gain: '+1,000 M', tierCol: C.orange, tierHi: C.sun, tierLo: C.redD });
    },
  },
};

// ---------------------------------------------------------------- run
const views = [...document.querySelectorAll('canvas[data-scene]')].map(cv => {
  const scene = SCENES[cv.dataset.scene];
  const bg = new Bmp(W, H); scene.bg(bg);
  return { ctx: cv.getContext('2d'), scene, bg, frame: new Bmp(W, H) };
});
const PALS = {
  office: ['ink', 'wall', 'wallD', 'wood', 'woodD', 'brownL', 'cream', 'coral', 'redD', 'teal', 'tealD', 'navyM', 'sky', 'skyL', 'sun', 'green'],
  space: ['black', 'night', 'violet', 'purpleD', 'purple', 'pink', 'navy', 'cyan', 'white', 'grayL', 'gray', 'grayD', 'red', 'sun', 'tan', 'orange'],
  sea: ['sky', 'skyL', 'sea1', 'sea2', 'sea3', 'sea4', 'abyss', 'abyss2', 'sun', 'orange', 'red', 'cream', 'purple', 'purpleD', 'grayL', 'ink'],
};
for (const el of document.querySelectorAll('[data-pal]')) for (const k of PALS[el.dataset.pal]) { const i = document.createElement('i'); i.style.background = HEX[k]; i.title = k; el.appendChild(i); }

const t0 = performance.now();
function loop(now) {
  const t = now - t0;
  for (const v of views) {
    v.frame.d.set(v.bg.d);
    v.scene.draw(v.frame, t);
    v.ctx.putImageData(new ImageData(new Uint8ClampedArray(v.frame.d.buffer), W, H), 0, 0);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
