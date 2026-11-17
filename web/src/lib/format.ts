// Display helpers. Distances (points shown in the theme's unit) come from useDistance() in app/stage-context.tsx.

const numberFormats = new Map<string, Intl.NumberFormat>();
export function fmtNumber(locale: string, n: number): string {
  let f = numberFormats.get(locale);
  if (!f) { f = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }); numberFormats.set(locale, f); }
  return f.format(n);
}

/** A YYYY-MM-DD date as a short weekday + date in the given locale (dates are calendar days, so format in UTC). */
export function fmtDate(locale: string, ymd: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Seconds as m:ss (or ss.s under ten seconds). */
export function fmtClock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return s.toFixed(1);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Time a round took, in seconds with one decimal. */
export const fmtSeconds = (ms: number): string => (ms / 1000).toFixed(1);

/** Hours and minutes until a timestamp. */
export function untilParts(ms: number): { h: number; m: number } {
  const mins = Math.max(0, Math.ceil(ms / 60_000));
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

/** A user-made game key ("g-xxxxxxxx") from its slug and back. */
export const gameKey = (slug: string): string => `g-${slug}`;
export const isGameKey = (key: string): boolean => /^g-[a-z0-9]{8}$/.test(key);
export const isDateKey = (key: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(key);
