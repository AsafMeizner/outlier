// Character customisation. Items unlock from play; the look is stored per user.
// Unlock rule kinds: meters (total distance in daily + archive games), games (daily games finished),
// outliers (tier-5 answers in daily + archive games), streak (best daily streak).

export const SLOTS = ['skin', 'hairStyle', 'hair', 'shirt', 'hat', 'glasses', 'chair', 'trail'];

const free = null;
export const CATALOG = {
  skin: [['s1', '#f9d7b5'], ['s2', '#f1c27d'], ['s3', '#e0ac69'], ['s4', '#c68642'], ['s5', '#8d5524'], ['s6', '#ffdbac']].map(([id, color]) => ({ id, color, unlock: free })),
  hairStyle: ['short', 'spiky', 'long', 'bald', 'curly', 'bun'].map(id => ({ id, unlock: free })),
  hair: [['h1', '#2b1d14'], ['h2', '#4a2f1b'], ['h3', '#7a4b26'], ['h4', '#d6a756'], ['h5', '#a33b20'], ['h6', '#9aa0a6'],
    ['h7', '#ff5fa2', { meters: 3000 }], ['h8', '#3fd0ff', { meters: 8000 }], ['h9', '#7cf06a', { outliers: 5 }]]
    .map(([id, color, unlock = free]) => ({ id, color, unlock })),
  shirt: [['red', '#ff4d5e'], ['teal', '#2ec4b6'], ['yellow', '#ffc43d'], ['blue', '#3b82f6'],
    ['purple', '#7b5cff', { games: 2 }], ['pink', '#ff8fab', { games: 4 }], ['green', '#22c55e', { meters: 2000 }], ['orange', '#f97316', { meters: 4000 }],
    ['hoodie', '#6b7280', { games: 3 }], ['hawaii', '#ff7a59', { meters: 6000 }], ['suit', '#1f2a44', { games: 10 }], ['tux', '#111827', { streak: 10 }],
    ['gold', '#f5c542', { meters: 40000 }], ['rainbow', 'rainbow', { streak: 14 }]].map(([id, color, unlock = free]) => ({ id, color, unlock })),
  hat: [['none', free], ['cap', free], ['beanie', { meters: 1000 }], ['headphones', { games: 5 }], ['party', { outliers: 1 }], ['propeller', { meters: 5000 }],
    ['chef', { games: 8 }], ['cowboy', { meters: 12000 }], ['crown', { streak: 7 }], ['viking', { meters: 25000 }], ['wizard', { outliers: 10 }], ['astronaut', { outliers: 25 }]]
    .map(([id, unlock]) => ({ id, unlock })),
  glasses: [['none', free], ['round', free], ['square', free], ['sun', { meters: 1500 }], ['3d', { games: 6 }], ['monocle', { outliers: 3 }], ['star', { streak: 5 }], ['visor', { meters: 15000 }]]
    .map(([id, unlock]) => ({ id, unlock })),
  chair: [['office', free], ['stool', { games: 2 }], ['gaming', { meters: 3000 }], ['beanbag', { games: 12 }], ['cart', { meters: 10000 }], ['rocket', { outliers: 15 }], ['throne', { streak: 21 }]]
    .map(([id, unlock]) => ({ id, unlock })),
  trail: [['paper', free], ['sparkle', { outliers: 1 }], ['coffee', { meters: 2500 }], ['bubbles', { games: 7 }], ['fire', { streak: 3 }], ['rainbow', { meters: 20000 }], ['stars', { outliers: 8 }]]
    .map(([id, unlock]) => ({ id, unlock })),
};

export const isUnlocked = (item, stats) => !item.unlock || Object.entries(item.unlock).every(([k, v]) => (stats[k] || 0) >= v);

/** Deterministic starting look from the username, using only free items. */
export function defaultLook(seed) {
  let h = 2166136261;
  for (const c of String(seed)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  const pick = slot => { const freeItems = CATALOG[slot].filter(i => !i.unlock); h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; return freeItems[h % freeItems.length].id; };
  return { skin: pick('skin'), hairStyle: pick('hairStyle'), hair: pick('hair'), shirt: pick('shirt'), hat: 'none', glasses: (h & 3) === 0 ? 'round' : 'none', chair: 'office', trail: 'paper' };
}

/** Merge a requested look with the stored one, rejecting locked or unknown items. */
export function cleanLook(requested, stats, fallback) {
  const out = { ...fallback };
  for (const slot of SLOTS) {
    const id = requested?.[slot];
    if (id === undefined) continue;
    const item = CATALOG[slot].find(i => i.id === id);
    if (!item) throw new Error(`Unknown ${slot} "${id}"`);
    if (!isUnlocked(item, stats)) throw new Error('That item is still locked.');
    out[slot] = id;
  }
  return out;
}

/** Look as stored (JSON) completed with defaults for any missing slot. */
export function resolveLook(stored, seed) {
  let parsed = {};
  try { parsed = typeof stored === 'string' ? JSON.parse(stored || '{}') : (stored || {}); } catch { /* fall back to default */ }
  return { ...defaultLook(seed), ...parsed };
}
