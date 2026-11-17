// Character customisation, shared by the server (validation) and the browser (drawing).
// Unlock rule kinds: meters (total distance in daily + archive games), games (daily games finished),
// outliers (tier-5 answers in daily + archive games), streak (best daily streak).

export const SLOTS = ['skin', 'hairStyle', 'hair', 'shirt', 'hat', 'glasses', 'chair', 'trail'] as const;
export type Slot = (typeof SLOTS)[number];

export interface UnlockStats {
  meters: number;
  games: number;
  outliers: number;
  streak: number;
}
export type UnlockRule = Partial<UnlockStats> | null;

export interface WardrobeItem {
  id: string;
  /** Hex colour for colour items, 'rainbow' for the striped shirt. */
  color?: string;
  unlock: UnlockRule;
}
export type Catalog = Record<Slot, WardrobeItem[]>;
export type Look = Record<Slot, string>;

const free: UnlockRule = null;
const colours = (list: Array<[string, string, UnlockRule?]>): WardrobeItem[] => list.map(([id, color, unlock = free]) => ({ id, color, unlock }));
const plain = (list: Array<[string, UnlockRule]>): WardrobeItem[] => list.map(([id, unlock]) => ({ id, unlock }));

export const CATALOG: Catalog = {
  skin: colours([['s1', '#f9d7b5'], ['s2', '#f1c27d'], ['s3', '#e0ac69'], ['s4', '#c68642'], ['s5', '#8d5524'], ['s6', '#ffdbac']]),
  hairStyle: plain([['short', free], ['spiky', free], ['long', free], ['bald', free], ['curly', free], ['bun', free]]),
  hair: colours([['h1', '#2b1d14'], ['h2', '#4a2f1b'], ['h3', '#7a4b26'], ['h4', '#d6a756'], ['h5', '#a33b20'], ['h6', '#9aa0a6'],
    ['h7', '#ff5fa2', { meters: 3000 }], ['h8', '#3fd0ff', { meters: 8000 }], ['h9', '#7cf06a', { outliers: 5 }]]),
  shirt: colours([['red', '#ff4d5e'], ['teal', '#2ec4b6'], ['yellow', '#ffc43d'], ['blue', '#3b82f6'],
    ['purple', '#7b5cff', { games: 2 }], ['pink', '#ff8fab', { games: 4 }], ['green', '#22c55e', { meters: 2000 }], ['orange', '#f97316', { meters: 4000 }],
    ['hoodie', '#6b7280', { games: 3 }], ['hawaii', '#ff7a59', { meters: 6000 }], ['suit', '#1f2a44', { games: 10 }], ['tux', '#111827', { streak: 10 }],
    ['gold', '#f5c542', { meters: 40000 }], ['rainbow', 'rainbow', { streak: 14 }]]),
  hat: plain([['none', free], ['cap', free], ['beanie', { meters: 1000 }], ['headphones', { games: 5 }], ['party', { outliers: 1 }], ['propeller', { meters: 5000 }],
    ['chef', { games: 8 }], ['cowboy', { meters: 12000 }], ['crown', { streak: 7 }], ['viking', { meters: 25000 }], ['wizard', { outliers: 10 }], ['astronaut', { outliers: 25 }]]),
  glasses: plain([['none', free], ['round', free], ['square', free], ['sun', { meters: 1500 }], ['3d', { games: 6 }], ['monocle', { outliers: 3 }], ['star', { streak: 5 }], ['visor', { meters: 15000 }]]),
  chair: plain([['office', free], ['stool', { games: 2 }], ['gaming', { meters: 3000 }], ['beanbag', { games: 12 }], ['cart', { meters: 10000 }], ['rocket', { outliers: 15 }], ['throne', { streak: 21 }]]),
  trail: plain([['paper', free], ['sparkle', { outliers: 1 }], ['coffee', { meters: 2500 }], ['bubbles', { games: 7 }], ['fire', { streak: 3 }], ['rainbow', { meters: 20000 }], ['stars', { outliers: 8 }]]),
};

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
export function defaultLook(seed: string): Look {
  let h = hash(seed);
  const pick = (slot: Slot): string => {
    const freeItems = CATALOG[slot].filter(i => !i.unlock);
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return freeItems[h % freeItems.length]?.id ?? '';
  };
  return { skin: pick('skin'), hairStyle: pick('hairStyle'), hair: pick('hair'), shirt: pick('shirt'), hat: 'none', glasses: (h & 3) === 0 ? 'round' : 'none', chair: 'office', trail: 'paper' };
}

export class LookError extends Error {}

/** Merge a requested look with the stored one, rejecting locked or unknown items. */
export function cleanLook(requested: unknown, stats: UnlockStats, fallback: Look): Look {
  const out: Look = { ...fallback };
  const req = (requested && typeof requested === 'object' ? requested : {}) as Record<string, unknown>;
  for (const slot of SLOTS) {
    const id = req[slot];
    if (id === undefined) continue;
    const item = CATALOG[slot].find(i => i.id === id);
    if (!item) throw new LookError(`Unknown ${slot} "${String(id)}"`);
    if (!isUnlocked(item, stats)) throw new LookError('That item is still locked.');
    out[slot] = item.id;
  }
  return out;
}

/** Stored look (JSON text or object) completed with defaults for missing or unknown slots. */
export function resolveLook(stored: unknown, seed: string): Look {
  let parsed: Record<string, unknown> = {};
  try {
    const v: unknown = typeof stored === 'string' ? JSON.parse(stored || '{}') : stored;
    if (v && typeof v === 'object') parsed = v as Record<string, unknown>;
  } catch { /* fall back to the default look */ }
  const look = defaultLook(seed);
  for (const slot of SLOTS) {
    const id = parsed[slot];
    if (typeof id === 'string' && CATALOG[slot].some(i => i.id === id)) look[slot] = id;
  }
  return look;
}

export function colorOf(slot: Slot, id: string, fallback: string): string {
  return CATALOG[slot].find(i => i.id === id)?.color ?? fallback;
}
