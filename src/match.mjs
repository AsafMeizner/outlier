// Answer normalisation and matching. Shared by the server, the importer and the bank validator.

export const TIERS = [
  null,
  { id: 1, name: 'Mainstream', points: 10, blurb: 'Half the office said this.' },
  { id: 2, name: 'Familiar', points: 25, blurb: 'A solid, popular pick.' },
  { id: 3, name: 'Uncommon', points: 50, blurb: 'Off the beaten path.' },
  { id: 4, name: 'Rare', points: 75, blurb: 'Few people go there.' },
  { id: 5, name: 'Outlier', points: 100, blurb: 'Nobody saw that coming.' },
];

const LEADING = /^(the|a|an) /;

/** Lowercase, strip accents, punctuation and a leading article. */
export function normalize(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(LEADING, '')
    .trim();
}

/** Simple English singular of the last word ("strawberries" -> "strawberry"). */
export function singular(key) {
  const m = key.match(/^(.*?)([a-z]+)$/);
  if (!m) return key;
  const [, head, w] = m;
  let s = w;
  if (w.length > 4 && w.endsWith('ies')) s = w.slice(0, -3) + 'y';
  else if (w.length > 4 && /(ches|shes|sses|xes|zes)$/.test(w)) s = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) s = w.slice(0, -1);
  return head + s;
}

/** All lookup keys for a written answer. */
export function keysFor(text) {
  const n = normalize(text);
  if (!n) return [];
  const s = singular(n);
  const compact = n.replace(/ /g, '');
  return [...new Set([n, s, compact, singular(compact)])];
}

function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let cur = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) { prev2[j] = prev[j]; }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/**
 * Build an index for one prompt's answers.
 * answers: [{ answer, tier, aliases? }]
 */
export function buildIndex(answers) {
  const exact = new Map();
  const entries = [];
  answers.forEach((a, i) => {
    for (const text of [a.answer, ...(a.aliases || [])]) {
      for (const k of keysFor(text)) {
        if (!exact.has(k)) exact.set(k, i);
        entries.push([k, i]);
      }
    }
  });
  return { exact, entries };
}

/**
 * Match a guess. Returns { index, fuzzy } or null.
 * Typo tolerance: 1 edit for 6+ letters, 2 edits for 10+, only when one answer is that close.
 */
export function matchAnswer(index, guess, { typos = true } = {}) {
  const keys = keysFor(guess);
  for (const k of keys) if (index.exact.has(k)) return { index: index.exact.get(k), fuzzy: false };
  if (!typos) return null;
  const k = singular(normalize(guess));
  if (k.length < 6) return null;
  const max = k.length >= 10 ? 2 : 1;
  let best = null, bestD = max + 1, tie = false;
  for (const [key, i] of index.entries) {
    if (key.length < 5) continue;
    const d = editDistance(k, key, max);
    if (d < bestD) { bestD = d; best = i; tie = false; }
    else if (d === bestD && i !== best) tie = true;
  }
  return best !== null && bestD <= max && !tie ? { index: best, fuzzy: true } : null;
}
