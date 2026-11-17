// Answer normalisation and matching (English + Hebrew). Shared by the server, the importer and the bank validator.

export const TIERS = [
  null,
  { id: 1, name: 'Mainstream', points: 10, blurb: 'Half the office said this.' },
  { id: 2, name: 'Familiar', points: 25, blurb: 'A solid, popular pick.' },
  { id: 3, name: 'Uncommon', points: 50, blurb: 'Off the beaten path.' },
  { id: 4, name: 'Rare', points: 75, blurb: 'Few people go there.' },
  { id: 5, name: 'Outlier', points: 100, blurb: 'Nobody saw that coming.' },
];

const LEADING = /^(the|a|an) /;
const HE_ARTICLE = /^\u05D4(?=[\u05D0-\u05EA]{3,})/;
const FINALS = { '\u05DA': '\u05DB', '\u05DD': '\u05DE', '\u05DF': '\u05E0', '\u05E3': '\u05E4', '\u05E5': '\u05E6' };
const isHebrew = s => /[\u05D0-\u05EA]/.test(s);

/** Lowercase; strip accents, niqqud, punctuation and a leading English article; unify Hebrew final letters. */
export function normalize(input) {
  return String(input ?? '')
    .normalize('NFKD')
    .replace(/\u05BE/g, ' ') // maqaf (Hebrew hyphen) separates words
    .replace(/[\u0300-\u036F\u0591-\u05C7]/g, '') // Latin accents, Hebrew niqqud and cantillation
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/([a-z])\+\+/g, '$1 plus plus') // C++ is not C
    .replace(/([a-z])#/g, '$1 sharp') // C#, F#
    .replace(/([a-z0-9])\+(?=\s|$)/g, '$1 plus') // Google+, Disney+
    .replace(/['’`"\u05F3\u05F4“”]/g, '') // apostrophes, geresh and gershayim join letters
    .replace(/[\u05DA\u05DD\u05DF\u05E3\u05E5]/g, c => FINALS[c])
    .replace(/[^a-z0-9\u05D0-\u05EA]+/g, ' ')
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

/** Exact lookup keys for a written answer. */
export function keysFor(text) {
  const n = normalize(text);
  if (!n) return [];
  const compact = n.replace(/ /g, '');
  const keys = [n, singular(n), compact, singular(compact)];
  // Hebrew definite article: "\u05D4\u05E4\u05D9\u05DC" also matches "\u05E4\u05D9\u05DC" (only before 3+ letters, so short words stay intact).
  if (isHebrew(n)) keys.push(n.replace(HE_ARTICLE, ''), compact.replace(HE_ARTICLE, ''));
  return [...new Set(keys)];
}

/**
 * Loose Hebrew key: drops vav and yod after the first letter of each word (full vs defective spelling)
 * and a plural ending. Used only as a fallback, and only when exactly one answer has the key.
 */
export function looseKey(text) {
  const n = normalize(text);
  if (!isHebrew(n)) return null;
  return n.replace(HE_ARTICLE, '').split(' ').map(w => {
    // plural endings (im / ot), then a feminine final he, so "sfina" and "sfinot" share a key
    let x = w.length > 3 ? w.replace(/(\u05D9\u05DE|\u05D5\u05EA)$/, '') : w;
    if (x === w) x = w.replace(/(?<=..)(\u05D9\u05EA|\u05D4)$/, ''); // feminine -it / -a singular
    return x[0] + x.slice(1).replace(/[\u05D5\u05D9]/g, '');
  }).join('');
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
  const exact = new Map(), loose = new Map();
  const entries = [];
  answers.forEach((a, i) => {
    for (const text of [a.answer, ...(a.aliases || [])]) {
      for (const k of keysFor(text)) {
        if (!exact.has(k)) exact.set(k, i);
        entries.push([k, i]);
      }
      const l = looseKey(text);
      if (l) loose.set(l, loose.has(l) && loose.get(l) !== i ? -1 : i);
    }
  });
  return { exact, loose, entries };
}

/**
 * Match a guess. Returns { index, fuzzy } or null.
 * Order: exact keys, then Hebrew loose spelling, then typo tolerance
 * (1 edit for 6+ letters, 5+ in Hebrew; 2 edits for 10+), only when exactly one answer is that close.
 */
export function matchAnswer(index, guess, { typos = true } = {}) {
  for (const k of keysFor(guess)) if (index.exact.has(k)) return { index: index.exact.get(k), fuzzy: false };
  const l = looseKey(guess);
  if (l && index.loose?.get(l) >= 0) return { index: index.loose.get(l), fuzzy: false };
  if (!typos) return null;
  const k = singular(normalize(guess));
  if (k.length < (isHebrew(k) ? 5 : 6)) return null;
  const max = k.length >= 10 ? 2 : 1;
  let best = null, bestD = max + 1, tie = false;
  for (const [key, i] of index.entries) {
    if (key.length < 4) continue;
    const d = editDistance(k, key, max);
    if (d < bestD) { bestD = d; best = i; tie = false; }
    else if (d === bestD && i !== best) tie = true;
  }
  return best !== null && bestD <= max && !tie ? { index: best, fuzzy: true } : null;
}
