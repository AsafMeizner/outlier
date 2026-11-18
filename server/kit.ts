// What feature modules (practice, friends, party) get from the app: the database, routing and shared helpers.
// Keeps app.ts the owner of auth and the daily game, while each mode lives in its own file.
import { randomInt } from 'node:crypto';
import type * as Api from '../shared/api.ts';
import type { Db, SqlParam } from './db.ts';
import type { ApiRequest, Body } from './http.ts';
import type { AnswerIndex } from './match.ts';
import type { Answer, SessionUserRow, UserRow } from './rows.ts';

export interface RouteCtx { req: ApiRequest; user: SessionUserRow; body: Body; query: URLSearchParams; m: RegExpMatchArray; ip: string }

export interface PoolPrompt { id: number; text: string; category: string; lang: Api.Lang }

export interface Kit {
  db: Db;
  now(): number;
  random(): number;
  settings(): Api.Settings;
  today(): string;
  count(sql: string, ...p: SqlParam[]): number;
  route(method: string, pattern: string, auth: 'user' | 'admin', fn: (c: RouteCtx) => unknown): void;
  promptAnswers(promptId: number): { answers: Answer[]; index: AnswerIndex };
  playerRef(u: Pick<UserRow, 'id' | 'username' | 'display_name' | 'team' | 'look'>): Api.PlayerRef;
  streakOf(userId: number): Api.Streak;
  /**
   * Prompts that may be shown outside the daily puzzle: only prompts from past days (already public in the archive).
   * Fresh prompts are kept for future daily puzzles, which are always brand new.
   */
  practicePool(lang: Api.Lang | null, category?: string): PoolPrompt[];
}

/** Random token from an unambiguous alphabet (crypto randomness: keys must not repeat, even under a seeded game RNG). */
export function token(length: number, alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'): string {
  let s = '';
  for (let i = 0; i < length; i++) s += alphabet[randomInt(alphabet.length)] ?? 'a';
  return s;
}

/** Fisher-Yates shuffle with the app's random source. */
export function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j] as T, a[i] as T]; }
  return a;
}
