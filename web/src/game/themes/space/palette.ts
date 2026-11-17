// The space theme's fixed palette. Everything in the world is drawn from these colours (plus wardrobe colours).
import { rgb } from '../../pixel/bmp.ts';

export const HEX = {
  ink: '#1b1b2f', black: '#0b0a16', night: '#140c2e', violet: '#2a1650', purpleD: '#4b2a8a', purple: '#8a4bd6', pink: '#ff6fa8', pinkL: '#ffd0e4',
  navy: '#1e2350', navyM: '#2f3a78', cyan: '#3fe0ff', white: '#f7f4ea', grayL: '#c7cbd8', gray: '#8b93a8', grayD: '#545b73',
  red: '#e83b3b', redD: '#a3233a', sun: '#ffcc33', orange: '#ff8a1f', tan: '#e3b77a', brown: '#7a4a2e', rust: '#c46a3a',
  sky: '#5cb0ff', blue: '#3e6fd8', blueD: '#24408f', green: '#3fbf5a', greenD: '#1f7a46', lime: '#b8ff9a', skin: '#f2c49b', skinD: '#c98e5f',
  sand: '#f3dfae', ice: '#a8dcff',
} as const;

export type PaletteKey = keyof typeof HEX;
export const P = Object.fromEntries(Object.entries(HEX).map(([k, v]) => [k, rgb(v)])) as Record<PaletteKey, number>;
