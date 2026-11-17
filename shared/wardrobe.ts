// Character customisation, shared by the server (validation) and the browser (drawing).
// Every theme has its own slots and items; unlock rules are the same everywhere:
//   points   = total points scored in daily + archive games
//   games    = daily games finished
//   outliers = tier-5 answers in daily + archive games
//   streak   = best daily streak
import { isThemeId, type ThemeId } from './themes.ts';

export interface UnlockStats {
  points: number;
  games: number;
  outliers: number;
  streak: number;
}
export type UnlockRule = Partial<UnlockStats> | null;

export interface WardrobeItem {
  id: string;
  /** Hex colour for colour items. */
  color?: string;
  unlock: UnlockRule;
}
export type Catalog = Record<string, WardrobeItem[]>;
/** Item id per slot. */
export type Look = Record<string, string>;

export interface Wardrobe {
  /** Slot order as shown in the wardrobe. */
  slots: readonly string[];
  /** Slots whose items are plain colours (shown as swatches). */
  colorSlots: readonly string[];
  catalog: Catalog;
}

const free: UnlockRule = null;
const colours = (list: Array<[string, string, UnlockRule?]>): WardrobeItem[] => list.map(([id, color, unlock = free]) => ({ id, color, unlock }));
const shapes = (list: Array<[string, UnlockRule]>): WardrobeItem[] => list.map(([id, unlock]) => ({ id, unlock }));

const SPACE: Wardrobe = {
  slots: ['hull', 'stripe', 'nose', 'fins', 'window', 'pilot', 'trail'],
  colorSlots: ['hull', 'stripe'],
  catalog: {
    hull: colours([
      ['white', '#f2efe6'], ['red', '#e83b3b'], ['sky', '#5cb0ff'], ['sun', '#ffcc33'], ['mint', '#7fe0b0'],
      ['purple', '#8a4bd6', { games: 2 }], ['pink', '#ff6fa8', { games: 4 }], ['green', '#3fbf5a', { points: 200 }],
      ['orange', '#ff8a1f', { points: 400 }], ['navy', '#3a4aa8', { games: 10 }], ['stealth', '#3a3a4e', { streak: 10 }],
      ['chrome', '#c7cbd8', { points: 1500 }], ['gold', '#e8b830', { points: 4000 }],
    ]),
    stripe: colours([
      ['red', '#e83b3b'], ['navy', '#2f3a78'], ['white', '#f2efe6'], ['cyan', '#3fe0ff', { points: 100 }],
      ['pink', '#ff6fa8', { outliers: 1 }], ['black', '#1b1b2f', { games: 6 }], ['gold', '#ffcc33', { streak: 7 }],
    ]),
    nose: shapes([['cone', free], ['dome', free], ['needle', { points: 100 }], ['twin', { games: 5 }], ['drill', { outliers: 3 }], ['star', { streak: 7 }]]),
    fins: shapes([['classic', free], ['delta', free], ['swept', { games: 3 }], ['wings', { points: 500 }], ['ring', { outliers: 5 }], ['triple', { streak: 21 }]]),
    window: shapes([['round', free], ['double', free], ['square', { games: 6 }], ['big', { points: 1200 }], ['visor', { outliers: 10 }]]),
    pilot: shapes([['astro', free], ['astro2', free], ['cat', { games: 8 }], ['dog', { points: 800 }], ['alien', { outliers: 15 }], ['robot', { points: 2500 }], ['monkey', { streak: 14 }]]),
    trail: shapes([['fire', free], ['blue', { points: 250 }], ['green', { games: 7 }], ['pink', { outliers: 1 }], ['smoke', { streak: 3 }], ['sparkle', { outliers: 8 }], ['rainbow', { points: 2000 }]]),
  },
};

export const WARDROBES: Record<ThemeId, Wardrobe> = { space: SPACE };

export function isUnlocked(item: WardrobeItem, stats: UnlockStats): boolean {
  if (!item.unlock) return true;
  return (Object.keys(item.unlock) as Array<keyof UnlockStats>).every(k => stats[k] >= (item.unlock?.[k] ?? 0));
}

function hash(seed: string): number {
  let h = 2166136261;
  for (const c of seed) { h ^= c.codePointAt(0) ?? 0; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic starting look from the username, using only free items. */
export function defaultLook(theme: ThemeId, seed: string): Look {
  const w = WARDROBES[theme];
  let h = hash(seed);
  const look: Look = {};
  for (const slot of w.slots) {
    const freeItems = (w.catalog[slot] ?? []).filter(i => !i.unlock);
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    look[slot] = freeItems[h % freeItems.length]?.id ?? '';
  }
  return look;
}

export class LookError extends Error {}

/** Merge a requested look with the current one, rejecting locked or unknown items. */
export function cleanLook(theme: ThemeId, requested: unknown, stats: UnlockStats, fallback: Look): Look {
  const w = WARDROBES[theme];
  const out: Look = { ...fallback };
  const req = (requested && typeof requested === 'object' ? requested : {}) as Record<string, unknown>;
  for (const slot of w.slots) {
    const id = req[slot];
    if (id === undefined) continue;
    const item = w.catalog[slot]?.find(i => i.id === id);
    if (!item) throw new LookError(`Unknown ${slot} "${String(id)}"`);
    if (!isUnlocked(item, stats)) throw new LookError('That item is still locked.');
    out[slot] = item.id;
  }
  return out;
}

/** Stored looks: JSON text of `{ [themeId]: Look }`. Anything else (including old single looks) reads as empty. */
function parseStored(stored: unknown): Partial<Record<ThemeId, Record<string, unknown>>> {
  try {
    const v: unknown = typeof stored === 'string' ? JSON.parse(stored || '{}') : stored;
    if (!v || typeof v !== 'object') return {};
    const out: Partial<Record<ThemeId, Record<string, unknown>>> = {};
    for (const [k, look] of Object.entries(v)) if (isThemeId(k) && look && typeof look === 'object') out[k] = look as Record<string, unknown>;
    return out;
  } catch {
    return {};
  }
}

/** A player's look for a theme, completed with defaults for missing or unknown slots. */
export function resolveLook(theme: ThemeId, stored: unknown, seed: string): Look {
  const w = WARDROBES[theme];
  const saved = parseStored(stored)[theme] ?? {};
  const look = defaultLook(theme, seed);
  for (const slot of w.slots) {
    const id = saved[slot];
    if (typeof id === 'string' && w.catalog[slot]?.some(i => i.id === id)) look[slot] = id;
  }
  return look;
}

/** The stored JSON with one theme's look replaced; other themes' looks are kept. */
export function storeLook(stored: unknown, theme: ThemeId, look: Look): string {
  return JSON.stringify({ ...parseStored(stored), [theme]: look });
}

export function colorOf(theme: ThemeId, slot: string, id: string | undefined, fallback: string): string {
  return WARDROBES[theme].catalog[slot]?.find(i => i.id === id)?.color ?? fallback;
}
