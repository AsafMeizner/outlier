import { describe, expect, it } from 'vitest';
import { fmtClock, gameKey, isDateKey, isGameKey, untilParts } from './format.ts';

describe('format helpers', () => {
  it('shows tenths under ten seconds, then minutes:seconds', () => {
    expect(fmtClock(9_950)).toBe('9.9');
    expect(fmtClock(-5)).toBe('0.0');
    expect(fmtClock(75_000)).toBe('1:15');
  });

  it('rounds the time left up to the next minute', () => {
    expect(untilParts(1)).toEqual({ h: 0, m: 1 });
    expect(untilParts(61 * 60_000)).toEqual({ h: 1, m: 1 });
    expect(untilParts(-1000)).toEqual({ h: 0, m: 0 });
  });

  it('tells game keys and date keys apart', () => {
    expect(isGameKey(gameKey('ab12cd34'))).toBe(true);
    expect(isGameKey('g-short')).toBe(false);
    expect(isDateKey('2026-11-18')).toBe(true);
    expect(isDateKey('p-abcdefghij')).toBe(false);
  });
});
