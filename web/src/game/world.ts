// The world the chair flies through, measured in metres from the desk. 1 m = PPM world pixels.

export const PPM = 6;
export const X = (m: number): number => m * PPM;

export type ZoneId = 'office' | 'parking' | 'city' | 'park' | 'beach' | 'sea' | 'sky' | 'moon';
export interface Zone { id: ZoneId; from: number; to: number }

export const ZONES: readonly Zone[] = [
  { id: 'office', from: -130, to: 58 },
  { id: 'parking', from: 58, to: 400 },
  { id: 'city', from: 400, to: 1600 },
  { id: 'park', from: 1600, to: 2600 },
  { id: 'beach', from: 2600, to: 3200 },
  { id: 'sea', from: 3200, to: 4800 },
  { id: 'sky', from: 4800, to: 5800 },
  { id: 'moon', from: 5800, to: Number.POSITIVE_INFINITY },
];

export const zoneAt = (m: number): ZoneId => ZONES.find(z => m >= z.from && m < z.to)?.id ?? 'moon';

export type LandmarkKey =
  | 'lm_desk' | 'lm_window' | 'lm_visitor' | 'lm_ceo' | 'lm_coffee' | 'lm_cityhall' | 'lm_tower' | 'lm_fountain'
  | 'lm_icecream' | 'lm_lifeguard' | 'lm_sailing' | 'lm_lighthouse' | 'lm_cruising' | 'lm_balloon' | 'lm_moon';
export interface Landmark { m: number; key: LandmarkKey }

export const LANDMARKS: readonly Landmark[] = [
  { m: 0, key: 'lm_desk' }, { m: 56, key: 'lm_window' }, { m: 150, key: 'lm_visitor' }, { m: 350, key: 'lm_ceo' },
  { m: 600, key: 'lm_coffee' }, { m: 1000, key: 'lm_cityhall' }, { m: 1400, key: 'lm_tower' }, { m: 2000, key: 'lm_fountain' },
  { m: 2400, key: 'lm_icecream' }, { m: 2800, key: 'lm_lifeguard' }, { m: 3500, key: 'lm_sailing' }, { m: 4300, key: 'lm_lighthouse' },
  { m: 5000, key: 'lm_cruising' }, { m: 5500, key: 'lm_balloon' }, { m: 5900, key: 'lm_moon' },
];

/** The furthest landmark at or before a distance. */
export const landmarkAt = (m: number): Landmark => [...LANDMARKS].reverse().find(l => l.m <= m) ?? LANDMARKS[0] ?? { m: 0, key: 'lm_desk' };

export const WINDOW_M = 56;
const SKY_TOP = -2600;
export const MOON_Y = -5200;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Ground height (world px, negative = up) at a distance in metres: flat to the sea, then a road of clouds, then the Moon. */
export function altitudeAt(m: number): number {
  if (m < 4800) return 0;
  if (m < 5750) return SKY_TOP * smooth(clamp((m - 4800) / 700, 0, 1));
  return MOON_Y;
}

/** Where the chair rests at a distance (the sea is entered up to the waist). */
export const restY = (m: number): number => altitudeAt(m) + (zoneAt(m) === 'sea' ? 46 : 0);
