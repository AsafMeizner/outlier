/** FNV-1a hash of a string, as an unsigned 32-bit integer. */
export function hash(str: string | number): number {
  let h = 2166136261;
  for (const c of String(str)) { h ^= c.codePointAt(0) ?? 0; h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Deterministic pseudo-random generator in [0, 1). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
