// Calendar helpers. Dates are 'YYYY-MM-DD' strings in the configured time zone.

export function serverTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function validTimeZone(tz) {
  try { Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

/** The game date for an instant: the day starts at `startHour` local time in `tz`. */
const formatters = new Map();
export function gameDate(ms, tz, startHour = 0) {
  let f = formatters.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }); formatters.set(tz, f); }
  return f.format(new Date(ms - startHour * 3600_000)); // en-CA formats as YYYY-MM-DD
}

const toUtc = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const fromUtc = ms => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d, n) => fromUtc(toUtc(d) + n * 86400_000);
export const weekday = d => new Date(toUtc(d)).getUTCDay(); // 0 = Sunday
export const isDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && fromUtc(toUtc(d)) === d;
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400_000);

/** First day of the week containing d. weekStart: 0 = Sunday, 1 = Monday. */
export function weekStartOf(d, weekStart = 0) {
  const back = (weekday(d) - weekStart + 7) % 7;
  return addDays(d, -back);
}

export const monthStartOf = d => d.slice(0, 8) + '01';

/** When the given game date ends, as epoch ms (approximate across DST, good to the minute). */
export function dateEndsAt(date, tz, startHour = 0) {
  // Walk forward from midnight UTC of the next day until the game date changes.
  let t = toUtc(addDays(date, 1)) - 14 * 3600_000;
  for (let i = 0; i < 60 * 4; i++, t += 15 * 60_000) if (gameDate(t, tz, startHour) !== date) return t;
  return toUtc(addDays(date, 1));
}
