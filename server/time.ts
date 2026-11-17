// Calendar helpers. Dates are 'YYYY-MM-DD' strings in the configured time zone.

export function serverTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try { Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** The game date for an instant: the day starts at `startHour` local time in `tz`. */
export function gameDate(ms: number, tz: string, startHour = 0): string {
  let f = formatters.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); formatters.set(tz, f); }
  return f.format(new Date(ms - startHour * 3600_000)); // en-CA formats as YYYY-MM-DD
}

const toUtc = (d: string): number => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, n: number): string => fromUtc(toUtc(d) + n * 86400_000);
/** 0 = Sunday. */
export const weekday = (d: string): number => new Date(toUtc(d)).getUTCDay();
export const isDate = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && fromUtc(toUtc(d)) === d;
export const daysBetween = (a: string, b: string): number => Math.round((toUtc(b) - toUtc(a)) / 86400_000);

/** First day of the week containing d. weekStart: 0 = Sunday, 1 = Monday. */
export function weekStartOf(d: string, weekStart = 0): string {
  return addDays(d, -((weekday(d) - weekStart + 7) % 7));
}

export const monthStartOf = (d: string): string => d.slice(0, 8) + '01';

/** When the given game date ends, as epoch ms (good to 15 minutes across DST changes). */
export function dateEndsAt(date: string, tz: string, startHour = 0): number {
  let t = toUtc(addDays(date, 1)) - 14 * 3600_000;
  for (let i = 0; i < 60 * 4; i++, t += 15 * 60_000) if (gameDate(t, tz, startHour) !== date) return t;
  return toUtc(addDays(date, 1));
}
