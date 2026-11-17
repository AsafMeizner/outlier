// The hero: a rocket assembled from the player's wardrobe (hull and stripe colours, nose, fins, window, pilot).
import { colorOf, type Look } from '../../../../../shared/wardrobe.ts';
import { Bmp, rgb, shade, sprite, type Color } from '../../pixel/bmp.ts';
import { P } from './palette.ts';

export const ROCKET_W = 21;
export const ROCKET_H = 44;
const BX = 5, BW = 11, CX = 10, TOP = 14, BOTTOM = 37;

/** Pilot faces seen through the window, 5x5. */
const FACES: Record<string, { rows: string[]; legend: Record<string, Color> }> = {
  astro: { rows: ['.SSS.', 'SKSKS', 'SSSSS', 'SSmSS', '.SSS.'], legend: { S: P.skin, K: P.ink, m: P.redD } },
  astro2: { rows: ['.SSS.', 'SKSKS', 'SSSSS', 'SSmSS', '.SSS.'], legend: { S: P.skinD, K: P.ink, m: P.redD } },
  cat: { rows: ['O...O', 'OOOOO', 'OKOKO', 'OOPOO', '.OOO.'], legend: { O: P.orange, K: P.ink, P: P.pink } },
  dog: { rows: ['bBBBb', 'bKBKb', 'BBBBB', 'BBKBB', '.BBB.'], legend: { B: P.tan, b: P.brown, K: P.ink } },
  alien: { rows: ['.GGG.', 'KKGKK', 'KKGKK', 'GGGGG', '.GmG.'], legend: { G: P.green, K: P.ink, m: P.greenD } },
  robot: { rows: ['MMMMM', 'MRRRM', 'MMMMM', 'MmmmM', 'MMMMM'], legend: { M: P.grayL, R: P.red, m: P.grayD } },
  monkey: { rows: ['.BBB.', 'BKTKB', 'BTTTB', 'BTmTB', '.BBB.'], legend: { B: P.brown, T: P.tan, K: P.ink, m: P.redD } },
};
export function faceSprite(pilot: string | undefined): Bmp {
  const f = FACES[pilot ?? ''] ?? FACES['astro'];
  return sprite(f?.rows ?? [], f?.legend ?? {});
}

/** Left fins as rows (5 wide) and the art row they start on; the right fin is the mirror image. */
const FINS: Record<string, { y: number; rows: string[] }> = {
  classic: { y: 29, rows: ['....F', '...FF', '...FF', '..FFF', '..FFF', '.FFFF', '.FFFF', 'FFFFF', 'FFFFF', 'FFF..', 'FF...', 'F....'] },
  delta: { y: 24, rows: ['....F', '....F', '...FF', '...FF', '..FFF', '..FFF', '..FFF', '.FFFF', '.FFFF', '.FFFF', 'FFFFF', 'FFFFF', 'FFFFF', 'FFFFF', 'FFFFF', 'FFFF.', 'FFF..'] },
  swept: { y: 29, rows: ['...FF', '..FFF', '..FFF', '.FFF.', '.FFF.', 'FFFF.', 'FFF..', 'FFF..', 'FFF..', 'FF...', 'FF...', 'F....'] },
  wings: { y: 22, rows: ['....F', '...FF', '..FFF', '.FFFF', 'FFFFF', 'FFFFF', 'FFFF.', 'FF...', 'F....'] },
  triple: { y: 29, rows: ['....F', '...FF', '...FF', '..FFF', '..FFF', '.FFFF', '.FFFF', 'FFFFF', 'FFFFF', 'FFF..', 'FF...', 'F....'] },
};

/** Build the upright rocket (nose up), outlined, ROCKET_W x ROCKET_H. */
export function buildRocket(look: Look): Bmp {
  const b = new Bmp(ROCKET_W, ROCKET_H);
  const hull = rgb(colorOf('space', 'hull', look['hull'], '#f2efe6')), hullD = shade(hull, 0.72), hullL = shade(hull, 1.3);
  const st = rgb(colorOf('space', 'stripe', look['stripe'], '#e83b3b')), stD = shade(st, 0.72);

  // fins sit behind the body
  const fin = FINS[look['fins'] ?? ''];
  if (fin) fin.rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch !== 'F') return;
    b.set(BX - 5 + i, fin.y + j, st);
    b.set(BX + BW + 4 - i, fin.y + j, stD);
  }));
  if (look['fins'] === 'ring') { b.rect(BX - 2, 33, BW + 4, 4, st); b.rect(BX + BW, 33, 2, 4, stD); }

  // body with a lit edge and a shaded side
  b.rect(BX, TOP, BW, BOTTOM - TOP, hull);
  b.rect(BX + BW - 3, TOP, 3, BOTTOM - TOP, hullD);
  b.rect(BX + 1, TOP, 1, BOTTOM - TOP, hullL);
  for (const y of [17, 32]) { b.rect(BX, y, BW, 2, st); b.rect(BX + BW - 3, y, 3, 2, stD); }
  if (look['fins'] === 'triple') b.rect(CX - 1, 33, 3, 8, stD);

  drawNose(b, look['nose'] ?? 'cone', st, stD, hull, hullD);
  drawWindow(b, look['window'] ?? 'round', look['pilot']);

  // engine bell
  b.rect(CX - 3, BOTTOM, 7, 2, P.grayD); b.rect(CX - 4, BOTTOM + 2, 9, 2, P.grayD); b.rect(CX - 3, BOTTOM, 2, 2, P.gray);
  return b.outline(P.ink);
}

function cone(b: Bmp, cx: number, y0: number, y1: number, maxHalf: number, c: Color, cd: Color): void {
  for (let y = y0; y <= y1; y++) {
    const half = Math.round(((y - y0) / Math.max(1, y1 - y0)) * maxHalf);
    b.rect(cx - half, y, half * 2 + 1, 1, c);
    if (half > 1) b.rect(cx + Math.ceil(half / 3), y, half - Math.ceil(half / 3) + 1, 1, cd);
  }
}

function drawNose(b: Bmp, kind: string, st: Color, stD: Color, hull: Color, hullD: Color): void {
  switch (kind) {
    case 'dome':
      for (let y = 6; y < TOP; y++) { const half = Math.round(5 * Math.sqrt(1 - ((TOP - y) / 8) ** 2)); b.rect(CX - half, y, half * 2 + 1, 1, hull); if (half > 1) b.rect(CX + 2, y, half - 1, 1, hullD); }
      b.rect(CX - 2, 8, 2, 1, P.white);
      break;
    case 'needle':
      b.rect(CX, 0, 1, 6, P.grayL); b.set(CX, 0, P.white);
      cone(b, CX, 5, TOP - 1, 5, st, stD);
      break;
    case 'twin':
      cone(b, CX - 3, 4, TOP - 1, 2, st, stD); cone(b, CX + 3, 4, TOP - 1, 2, st, stD);
      b.rect(CX - 1, 9, 3, TOP - 9, hull);
      break;
    case 'drill':
      for (let y = 2; y < TOP; y++) {
        const half = Math.round(((y - 2) / (TOP - 3)) * 5);
        for (let x = CX - half; x <= CX + half; x++) b.set(x, y, (x + y) % 3 === 0 ? P.grayD : x > CX ? P.gray : P.grayL);
      }
      break;
    case 'star':
      cone(b, CX, 4, TOP - 1, 5, st, stD);
      for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [0, 3], [-1, 2], [1, 2], [-2, 2], [2, 2], [-1, 3], [1, 3], [-1, 4], [1, 4]] as const) b.set(CX + dx, dy, P.sun);
      break;
    default:
      cone(b, CX, 1, TOP - 1, 5, st, stD);
  }
}

/** Glass, then the pilot drawn only where the glass is. */
function drawWindow(b: Bmp, kind: string, pilot: string | undefined): void {
  const glass = P.navy;
  const face = faceSprite(pilot);
  const fill = (x0: number, y0: number): void => {
    for (let j = 0; j < face.h; j++) for (let i = 0; i < face.w; i++) { const c = face.d[j * face.w + i] ?? 0; if (c && b.get(x0 + i, y0 + j) === glass) b.set(x0 + i, y0 + j, c); }
  };
  switch (kind) {
    case 'double':
      b.circle(CX, 21, 3, P.grayL); b.circle(CX, 21, 2, glass); fill(CX - 2, 19);
      b.circle(CX, 28, 2, P.grayL); b.circle(CX, 28, 1, glass); b.set(CX - 1, 27, P.white);
      break;
    case 'square':
      b.rect(CX - 4, 20, 9, 8, P.grayL); b.rect(CX - 3, 21, 7, 6, glass); fill(CX - 2, 21); b.set(CX - 3, 21, P.white);
      break;
    case 'big':
      b.circle(CX, 24, 4, P.grayL); b.circle(CX, 24, 3, glass); fill(CX - 2, 22); b.set(CX - 2, 22, P.white);
      break;
    case 'visor':
      b.rect(CX - 5, 21, 11, 6, P.grayL); b.rect(CX - 4, 22, 9, 4, glass); fill(CX - 2, 21); b.rect(CX - 4, 22, 9, 1, P.cyan);
      break;
    default:
      b.circle(CX, 24, 3, P.grayL); b.circle(CX, 24, 2, glass); fill(CX - 2, 22);
  }
}

/** Exhaust colours per trail item, from the hot core outwards. */
export const TRAILS: Record<string, readonly Color[]> = {
  fire: [P.white, P.sun, P.orange, P.red],
  blue: [P.white, P.cyan, P.sky, P.blue],
  green: [P.white, P.lime, P.green, P.greenD],
  pink: [P.white, P.pinkL, P.pink, P.purple],
  smoke: [P.white, P.sun, P.orange, P.grayD],
  sparkle: [P.white, P.sun, P.orange, P.red],
  rainbow: [P.white, P.sun, P.green, P.sky, P.purple, P.pink],
};
export const trailColors = (id: string | undefined): readonly Color[] => TRAILS[id ?? ''] ?? TRAILS['fire'] ?? [];

/**
 * A flame flowing from (x, y) in direction (dx, dy) (a unit axis vector): `len` long, `half` wide at the root.
 * Colours step from the core outwards along the length; the edge flickers with t.
 */
export function flame(b: Bmp, x: number, y: number, dx: number, dy: number, len: number, half: number, trail: string | undefined, t: number): void {
  const cols = trailColors(trail);
  const rainbow = trail === 'rainbow';
  for (let i = 0; i < len; i++) {
    const k = i / len, w = Math.max(0, Math.round(half * (1 - k * 0.85) + Math.sin(t / 40 + i) * 0.6));
    for (let s = -w; s <= w; s++) {
      const edge = Math.abs(s) / (w + 0.01);
      const band = rainbow ? (Math.floor((s + w) / Math.max(1, (2 * w + 1) / 5)) + 1) % cols.length : Math.min(cols.length - 1, Math.floor(k * (cols.length - 1) + edge * 1.4));
      const c = cols[band] ?? P.orange;
      b.set(x + dx * i - dy * s, y + dy * i + dx * s, c);
    }
  }
}
