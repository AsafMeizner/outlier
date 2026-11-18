// Application logic and JSON API. Transport-agnostic: handle(ApiRequest) -> ApiResponse.
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type * as Api from '../shared/api.ts';
import { TIERS, pointsFor } from '../shared/tiers.ts';
import { WARDROBES, isUnlocked, cleanLook, resolveLook, storeLook, LookError, type UnlockStats } from '../shared/wardrobe.ts';
import { DEFAULT_THEME, THEME_IDS } from '../shared/themes.ts';
import { installFriends } from './friends.ts';
import type { Kit, PoolPrompt as KitPoolPrompt } from './kit.ts';
import { installParty } from './party.ts';
import { installPractice } from './practice.ts';
import type { Db, SqlParam } from './db.ts';
import { buildIndex, matchAnswer, normalize, keysFor, type AnswerIndex } from './match.ts';
import { parsePack, toCsv, toText, type Pack, type PackPrompt } from './packs.ts';
import { hashPassword, verifyPassword, newToken, tokenHash, tempPassword, validUsername, validPassword } from './auth.ts';
import { gameDate, addDays, weekday, isDate, weekStartOf, monthStartOf, dateEndsAt, serverTimeZone, validTimeZone } from './time.ts';
import { HttpError, bad, asBody, str, optStr, int, oneOf, FileResult, CookieResult, type Body, type ApiRequest, type ApiResponse } from './http.ts';
import type { Answer, AnswerRow, Count, DayRow, GameRow, PromptRow, RoundRow, RunRow, SessionUserRow, UserRow } from './rows.ts';

export { HttpError };

const GRACE_MS = 1500;
const SESSION_DAYS = 30;
const MAX_GUESSES_PER_ROUND = 40;
export const COOKIE = 'outlier_session';

export const DEFAULT_SETTINGS: Api.Settings = {
  siteName: 'Outlier',
  tagline: 'Find the answer nobody else will.',
  promptsPerDay: 6,
  roundSeconds: 30,
  timeZone: serverTimeZone(),
  dayStartHour: 0,
  activeWeekdays: [0, 1, 2, 3, 4, 5, 6],
  weekStart: 0,
  autoSchedule: true,
  registration: 'open',
  inviteCode: '',
  typoTolerance: true,
  archivePlay: true,
  puzzleLanguage: 'alternate',
  theme: DEFAULT_THEME,
};

/** 'he' when the text contains Hebrew letters, otherwise 'en'. */
export const langOf = (text: string): Api.Lang => (/[\u05D0-\u05EA]/.test(text) ? 'he' : 'en');
const isGameKey = (k: string): boolean => /^g-[a-z0-9]{8}$/.test(k);

function shuffle<T>(a: T[], rnd: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

interface CleanAnswer { id: number | null; answer: string; tier: number; aliases: string[] }
interface CleanPrompt { text: string; category: string; answers: CleanAnswer[] }
interface DayPrompt { position: number; id: number; text: string; category: string; lang: Api.Lang }
interface RoundFields { outcome: Api.RoundOutcome; answerId?: number; answerText?: string; raw?: string; tier?: number; points?: number; fuzzy?: boolean }

export interface AppOptions {
  db: Db;
  now?: () => number;
  random?: () => number;
  secure?: boolean;
  log?: (msg: string) => void;
}

type Auth = 'user' | 'admin';
interface BaseCtx { req: ApiRequest; body: Body; query: URLSearchParams; m: RegExpMatchArray; ip: string }
interface PublicCtx extends BaseCtx { user: SessionUserRow | null }
interface UserCtx extends BaseCtx { user: SessionUserRow }
interface Route { method: string; re: RegExp; auth: Auth | null; fn: (ctx: PublicCtx) => unknown }

const param = (m: RegExpMatchArray, i: number): string => m[i] ?? bad('Not found', 404);

export function createApp({ db, now = () => Date.now(), random = Math.random, secure = false, log = () => {} }: AppOptions) {
  const count = (sql: string, ...p: SqlParam[]): number => db.get<Count>(sql, ...p)?.n ?? 0;

  // ---------- settings ----------
  let settingsCache: Api.Settings | null = null;
  function settings(): Api.Settings {
    if (!settingsCache) {
      const s: Api.Settings = { ...DEFAULT_SETTINGS };
      // Stored values were validated by saveSettings when written.
      for (const { key, value } of db.all<{ key: string; value: string }>('SELECT key, value FROM settings'))
        if (key in s) Object.assign(s, { [key]: JSON.parse(value) as unknown });
      settingsCache = s;
    }
    return settingsCache;
  }
  function saveSettings(patch: Body): Api.Settings {
    const s = settings(), out: Partial<Api.Settings> = {};
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      switch (k) {
        case 'siteName': out.siteName = str(v, 40, 'Site name') || 'Outlier'; break;
        case 'tagline': out.tagline = str(v, 120, 'Tagline'); break;
        case 'inviteCode': out.inviteCode = str(v, 60, 'Invite code'); break;
        case 'promptsPerDay': out.promptsPerDay = int(v, k, 1, 10); break;
        case 'roundSeconds': out.roundSeconds = int(v, k, 10, 120); break;
        case 'dayStartHour': out.dayStartHour = int(v, k, 0, 23); break;
        case 'weekStart': out.weekStart = int(v, k, 0, 6); break;
        case 'timeZone': if (!validTimeZone(v)) bad('Unknown time zone'); out.timeZone = v; break;
        case 'puzzleLanguage': out.puzzleLanguage = oneOf(v, ['en', 'he', 'alternate', 'any'] as const, 'puzzleLanguage must be en, he, alternate or any'); break;
        case 'theme': out.theme = oneOf(v, THEME_IDS, `theme must be one of ${THEME_IDS.join(', ')}`); break;
        case 'registration': out.registration = oneOf(v, ['open', 'code', 'closed'] as const, 'registration must be open, code or closed'); break;
        case 'activeWeekdays': {
          if (!Array.isArray(v) || !v.length || v.some(d => !Number.isInteger(d) || d < 0 || d > 6)) bad('Pick at least one weekday');
          out.activeWeekdays = [...new Set(v as number[])].sort();
          break;
        }
        case 'autoSchedule': case 'typoTolerance': case 'archivePlay': out[k] = Boolean(v); break;
        default: bad(`Unknown setting ${k}`);
      }
    }
    if ((out.registration ?? s.registration) === 'code' && !(out.inviteCode ?? s.inviteCode)) bad('Set an invite code to use invite-code registration');
    db.tx(() => { for (const [k, v] of Object.entries(out)) db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v)); });
    settingsCache = null;
    return settings();
  }
  const today = (): string => { const s = settings(); return gameDate(now(), s.timeZone, s.dayStartHour); };
  const publicSettings = (): Api.PublicSettings => {
    const s = settings();
    return { theme: s.theme, puzzleLanguage: s.puzzleLanguage, siteName: s.siteName, tagline: s.tagline, roundSeconds: s.roundSeconds, promptsPerDay: s.promptsPerDay, registration: s.registration, archivePlay: s.archivePlay, weekStart: s.weekStart, tiers: TIERS };
  };

  for (const p of db.all<{ id: number; text: string }>("SELECT id, text FROM prompts WHERE lang='en'")) if (langOf(p.text) === 'he') db.run("UPDATE prompts SET lang='he' WHERE id=?", p.id);

  // ---------- setup token ----------
  let setupToken: string | null = null;
  const hasAdmin = (): boolean => count("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND disabled=0") > 0;
  function ensureSetupToken(): string | null {
    if (hasAdmin()) return null;
    setupToken ??= randomBytes(12).toString('base64url');
    return setupToken;
  }

  // ---------- answers index cache ----------
  const indexCache = new Map<number, { answers: Answer[]; index: AnswerIndex }>();
  function promptAnswers(promptId: number): { answers: Answer[]; index: AnswerIndex } {
    let c = indexCache.get(promptId);
    if (!c) {
      const answers = db.all<AnswerRow>('SELECT id, answer, tier, aliases FROM answers WHERE prompt_id=? ORDER BY id', promptId)
        .map(a => ({ ...a, aliases: JSON.parse(a.aliases) as string[] }));
      c = { answers, index: buildIndex(answers) };
      indexCache.set(promptId, c);
    }
    return c;
  }

  // ---------- users & sessions ----------
  const loginFailures = new Map<string, { count: number; first: number }>();
  const userView = (u: UserRow): Api.UserView => ({
    id: u.id, username: u.username, displayName: u.display_name, team: u.team, role: u.role,
    mustChange: !!u.must_change, disabled: !!u.disabled, look: resolveLook(settings().theme, u.look, u.username),
  });
  const userById = (id: number | bigint): UserRow => db.get<UserRow>('SELECT * FROM users WHERE id=?', id) ?? bad('User not found', 404);
  function createSession(userId: number): string {
    const token = newToken(), t = now();
    db.run('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)', tokenHash(token), userId, t, t + SESSION_DAYS * 86400_000);
    db.run('DELETE FROM sessions WHERE expires_at < ?', t);
    return token;
  }
  const cookie = (token: string, maxAge: number): string => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const signedIn = <T>(userId: number, body: T): CookieResult<T> => new CookieResult(cookie(createSession(userId), SESSION_DAYS * 86400), body);
  const cookieToken = (req: ApiRequest): string | null => {
    const raw = req.headers['cookie'];
    const header = Array.isArray(raw) ? raw.join('; ') : raw ?? '';
    return header.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,})`))?.[1] ?? null;
  };
  function sessionUser(req: ApiRequest): SessionUserRow | null {
    const token = cookieToken(req);
    if (!token) return null;
    const t = now();
    const row = db.get<SessionUserRow>('SELECT u.*, s.expires_at, s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?', tokenHash(token));
    if (!row || row.expires_at < t || row.disabled) return null;
    if (!row.last_seen || t - row.last_seen > 60_000) {
      db.run('UPDATE users SET last_seen=? WHERE id=?', t, row.id);
      db.run('UPDATE sessions SET expires_at=? WHERE token_hash=?', t + SESSION_DAYS * 86400_000, row.token_hash);
    }
    return row;
  }
  interface NewUser { username: unknown; displayName?: unknown; team?: unknown; password: unknown; role?: Api.Role; mustChange?: boolean }
  function createUser({ username, displayName, team, password, role = 'player', mustChange = false }: NewUser): UserRow {
    if (!validUsername(username)) bad('Username: 2-32 letters, numbers, dot, dash or underscore');
    if (!validPassword(password)) bad('Password must be at least 8 characters');
    const dn = optStr(displayName, 40, 'Display name') || username;
    const tm = optStr(team, 40, 'Team');
    if (count('SELECT COUNT(*) AS n FROM users WHERE username=?', username)) bad('That username is taken', 409);
    const r = db.run('INSERT INTO users(username,display_name,team,pass_hash,role,must_change,created_at) VALUES(?,?,?,?,?,?,?)',
      username, dn, tm, hashPassword(password), role, mustChange ? 1 : 0, now());
    return userById(r.lastInsertRowid);
  }

  // ---------- schedule ----------
  const dayRow = (date: string): DayRow | undefined => db.get<DayRow>('SELECT * FROM days WHERE date=?', date);
  const dayPrompts = (date: string): DayPrompt[] =>
    db.all<DayPrompt>('SELECT dp.position, p.id, p.text, p.category, p.lang FROM day_prompts dp JOIN prompts p ON p.id=dp.prompt_id WHERE dp.date=? ORDER BY dp.position', date);
  interface PoolPrompt { id: number; text: string; category: string; lang: Api.Lang; used: number; practised: number }
  /**
   * Pick up to n prompts for a daily puzzle. Daily prompts are always brand new: never used on another day and never
   * seen in practice or party play. Random order, different categories where possible.
   */
  function pickPrompts(n: number, exclude: readonly number[] = [], lang: Api.Lang | null = null): PoolPrompt[] {
    const ex = new Set(exclude);
    let pool = db.all<PoolPrompt>(`SELECT p.id, p.text, p.category, p.lang, COUNT(dp.prompt_id) AS used,
        (SELECT COUNT(*) FROM practice_rounds pr WHERE pr.prompt_id=p.id) AS practised
      FROM prompts p LEFT JOIN day_prompts dp ON dp.prompt_id=p.id
      WHERE p.retired=0 AND p.owner_id IS NULL AND EXISTS (SELECT 1 FROM answers a WHERE a.prompt_id=p.id)
      GROUP BY p.id`).filter(p => !ex.has(p.id));
    pool = pool.filter(p => p.used === 0 && p.practised === 0);
    if (lang) { const same = pool.filter(p => p.lang === lang); if (same.length >= n) pool = same; }
    // least-used first; among equals, prompts nobody has seen in practice or party play
    shuffle(pool, random).sort((a, b) => a.used - b.used || a.practised - b.practised);
    const picked: PoolPrompt[] = [], cats = new Set<string>();
    for (const p of pool) { if (picked.length >= n) break; if (!cats.has(p.category)) { picked.push(p); cats.add(p.category); } }
    for (const p of pool) { if (picked.length >= n) break; if (!picked.includes(p)) picked.push(p); }
    return picked;
  }
  function setDay(date: string, promptIds: readonly number[], auto = false): void {
    db.tx(() => {
      db.run('DELETE FROM day_prompts WHERE date=?', date);
      db.run('INSERT INTO days(date,auto,created_at) VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET auto=excluded.auto', date, auto ? 1 : 0, now());
      promptIds.forEach((id, i) => db.run('INSERT INTO day_prompts(date,position,prompt_id) VALUES(?,?,?)', date, i, id));
    });
  }
  /** Which language a new day should use. 'alternate' flips each scheduled day, starting with English. */
  function langForDate(date: string): Api.Lang | null {
    const pl = settings().puzzleLanguage;
    if (pl === 'en' || pl === 'he') return pl;
    if (pl === 'any') return null;
    return count("SELECT COUNT(*) AS n FROM days WHERE date<? AND date NOT LIKE 'g-%'", date) % 2 === 0 ? 'en' : 'he';
  }
  function autoCreate(date: string): boolean {
    const picked = pickPrompts(settings().promptsPerDay, [], langForDate(date));
    if (!picked.length) return false;
    setDay(date, picked.map(p => p.id), true);
    log(`Scheduled ${date} automatically: ${picked.map(p => p.id).join(', ')}`);
    return true;
  }
  /** The prompts for a date, creating today's puzzle on demand. */
  function ensureDay(date: string): DayPrompt[] | null {
    if (!dayRow(date)) {
      const s = settings();
      if (date !== today() || !s.autoSchedule || !s.activeWeekdays.includes(weekday(date))) return null;
      db.tx(() => { if (!dayRow(date)) autoCreate(date); });
    }
    const prompts = dayPrompts(date);
    return prompts.length ? prompts : null;
  }
  const dayNumber = (date: string): number => count('SELECT COUNT(*) AS n FROM days WHERE date<=?', date);
  const gameRef = (key: string): Api.GameRef | null => (isGameKey(key) ? db.get<Api.GameRef>('SELECT slug, title FROM games WHERE slug=?', key.slice(2)) ?? null : null);

  // ---------- runs ----------
  const getRun = (userId: number, date: string): RunRow | undefined => db.get<RunRow>('SELECT * FROM runs WHERE user_id=? AND date=?', userId, date);
  const runById = (id: number): RunRow => db.get<RunRow>('SELECT * FROM runs WHERE id=?', id) ?? bad('Game not found', 404);
  const promptAt = (prompts: readonly DayPrompt[], i: number): DayPrompt => prompts[i] ?? bad('This game has no more prompts', 409);
  function finishRound(run: RunRow, prompts: readonly DayPrompt[], f: RoundFields): RunRow {
    const t = now(), full = settings().roundSeconds * 1000;
    const ms = f.outcome === 'answered' ? Math.max(0, Math.min(t - (run.round_started_at ?? t), full)) : full;
    db.tx(() => {
      db.run(`INSERT INTO rounds(run_id,position,prompt_id,answer_id,answer_text,raw,tier,points,fuzzy,ms,outcome,ended_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        run.id, run.position, promptAt(prompts, run.position).id, f.answerId ?? null, f.answerText ?? null, f.raw ?? null,
        f.tier ?? 0, f.points ?? 0, f.fuzzy ? 1 : 0, ms, f.outcome, t);
      const nextPos = run.position + 1;
      db.run('UPDATE runs SET position=?, round_started_at=NULL, score=score+?, total_ms=total_ms+?, finished_at=? WHERE id=?',
        nextPos, f.points ?? 0, ms, nextPos >= prompts.length ? t : null, run.id);
    });
    return runById(run.id);
  }
  function settle(run: RunRow, prompts: readonly DayPrompt[]): RunRow {
    if (run.round_started_at && !run.finished_at && now() > run.round_started_at + settings().roundSeconds * 1000 + GRACE_MS)
      return finishRound(run, prompts, { outcome: 'timeout' });
    return run;
  }
  function runState(run: RunRow, prompts: readonly DayPrompt[]): Api.RunState {
    const s = settings();
    type R = Pick<RoundRow, 'position' | 'prompt_id' | 'tier' | 'points' | 'outcome' | 'fuzzy'> & { answer: string | null };
    // Finished rounds carry their prompt; a round that scored nothing shows one example answer (the prompt is over).
    const rounds = db.all<R>('SELECT position, prompt_id, answer_text AS answer, tier, points, outcome, fuzzy FROM rounds WHERE run_id=? ORDER BY position', run.id)
      .map((r): Api.RoundSummary => {
        const p = prompts[r.position];
        let example: string | null = null;
        // No answers for a daily puzzle until its day is over (players could pass them on).
        if (!r.points && (isGameKey(run.date) || run.date < today())) { const ans = promptAnswers(r.prompt_id).answers; example = (ans.find(a => a.tier === 3) ?? ans[0])?.answer ?? null; }
        return { position: r.position, answer: r.answer, tier: r.tier, points: r.points, outcome: r.outcome, fuzzy: !!r.fuzzy, text: p?.text ?? '', category: p?.category ?? '', example };
      });
    let current: Api.CurrentRound | null = null, upNext: Api.UpNext | null = null;
    if (run.round_started_at && !run.finished_at) {
      const p = promptAt(prompts, run.position);
      current = { position: run.position, text: p.text, category: p.category, lang: p.lang, startedAt: run.round_started_at, deadline: run.round_started_at + s.roundSeconds * 1000 };
    } else if (!run.finished_at) {
      const p = promptAt(prompts, run.position);
      upNext = { position: run.position, category: p.category, lang: p.lang };
    }
    return {
      date: run.date, dayNumber: isGameKey(run.date) ? null : dayNumber(run.date), mode: run.mode, game: gameRef(run.date),
      total: prompts.length, position: run.position, score: run.score, finished: !!run.finished_at, roundSeconds: s.roundSeconds,
      serverNow: now(), rounds, current, upNext,
    };
  }
  function loadRun(user: UserRow, date: string, { create = false } = {}): { run: RunRow; prompts: DayPrompt[] } {
    if (isGameKey(date)) {
      if (!count('SELECT COUNT(*) AS n FROM games WHERE slug=?', date.slice(2))) bad('Game not found', 404);
      const prompts = dayPrompts(date);
      if (!prompts.length) bad('This game has no prompts', 404);
      let run = getRun(user.id, date);
      if (!run) {
        if (!create) bad('Not started', 404);
        db.run("INSERT OR IGNORE INTO runs(user_id,date,mode,started_at) VALUES(?,?,'custom',?)", user.id, date, now());
        run = getRun(user.id, date) ?? bad('Could not start the game', 500);
      }
      return { run: settle(run, prompts), prompts };
    }
    if (!isDate(date)) bad('Bad date');
    const t = today();
    if (date > t) bad('That day has not started yet', 403);
    const prompts = ensureDay(date) ?? bad(date === t ? 'There is no puzzle today.' : 'No puzzle was played on that day.', 404);
    let run = getRun(user.id, date);
    if (!run) {
      if (!create) bad('Not started', 404);
      if (date < t && !settings().archivePlay) bad('Archive play is turned off', 403);
      db.run('INSERT OR IGNORE INTO runs(user_id,date,mode,started_at) VALUES(?,?,?,?)', user.id, date, date === t ? 'live' : 'archive', now());
      run = getRun(user.id, date) ?? bad('Could not start the game', 500);
    }
    return { run: settle(run, prompts), prompts };
  }

  // ---------- reveal / popularity ----------
  function reveal(date: string, user: UserRow): Api.RevealResponse {
    const prompts = dayPrompts(date);
    if (!prompts.length) bad('No puzzle on that day', 404);
    const players = count('SELECT COUNT(*) AS n FROM runs WHERE date=? AND finished_at IS NOT NULL', date);
    const mine = getRun(user.id, date);
    const myRounds = mine ? db.all<RoundRow>('SELECT * FROM rounds WHERE run_id=?', mine.id) : [];
    return {
      date, dayNumber: isGameKey(date) ? null : dayNumber(date), players, game: gameRef(date),
      prompts: prompts.map((p): Api.RevealPrompt => {
        const counts = new Map(db.all<{ id: number; n: number }>(`SELECT r.answer_id AS id, COUNT(*) AS n FROM rounds r JOIN runs u ON u.id=r.run_id
          WHERE u.date=? AND r.position=? AND r.answer_id IS NOT NULL GROUP BY r.answer_id`, date, p.position).map(r => [r.id, r.n] as const));
        const missed = count('SELECT COUNT(*) AS n FROM rounds r JOIN runs u ON u.id=r.run_id WHERE u.date=? AND r.position=? AND r.points=0', date, p.position);
        const mr = myRounds.find(r => r.position === p.position);
        return {
          position: p.position, text: p.text, category: p.category, lang: p.lang, missed,
          mine: mr ? { answer: mr.answer_text, raw: mr.raw, tier: mr.tier, points: mr.points, outcome: mr.outcome, same: mr.answer_id ? (counts.get(mr.answer_id) ?? 1) - 1 : 0 } : null,
          answers: promptAnswers(p.id).answers.map(a => ({ answer: a.answer, tier: a.tier, count: counts.get(a.id) ?? 0 }))
            .sort((x, y) => y.count - x.count || x.tier - y.tier || x.answer.localeCompare(y.answer)),
        };
      }),
    };
  }

  // ---------- retro-award: zero-point rounds whose rejected guess now matches ----------
  function retroAward(promptId: number): number {
    const { answers, index } = promptAnswers(promptId);
    const typos = settings().typoTolerance;
    let awarded = 0;
    const rows = db.all<{ run_id: number; position: number }>('SELECT r.run_id, r.position FROM rounds r WHERE r.prompt_id=? AND r.points=0', promptId);
    db.tx(() => {
      for (const r of rows) {
        const guesses = db.all<{ raw: string }>('SELECT raw FROM guesses WHERE run_id=? AND position=? AND accepted=0 ORDER BY at', r.run_id, r.position);
        for (const g of guesses) {
          const m = matchAnswer(index, g.raw, { typos });
          const a = m ? answers[m.index] : undefined;
          if (!m || !a) continue;
          const pts = pointsFor(a.tier);
          db.run(`UPDATE rounds SET answer_id=?, answer_text=?, raw=?, tier=?, points=?, fuzzy=?, outcome='awarded' WHERE run_id=? AND position=?`,
            a.id, a.answer, g.raw, a.tier, pts, m.fuzzy ? 1 : 0, r.run_id, r.position);
          db.run('UPDATE runs SET score=score+? WHERE id=?', pts, r.run_id);
          awarded++;
          break;
        }
      }
    });
    return awarded;
  }

  // ---------- streaks ----------
  function streaks(userIds: readonly number[]): Map<number, Api.Streak> {
    const t = today();
    const scheduled = db.all<{ date: string }>('SELECT date FROM days WHERE date<=? ORDER BY date', t).map(r => r.date);
    const done = new Map<number, Set<string>>();
    for (const r of db.all<{ user_id: number; date: string }>("SELECT user_id, date FROM runs WHERE mode='live' AND finished_at IS NOT NULL")) {
      let set = done.get(r.user_id);
      if (!set) { set = new Set(); done.set(r.user_id, set); }
      set.add(r.date);
    }
    const out = new Map<number, Api.Streak>();
    for (const id of userIds) {
      const set = done.get(id) ?? new Set<string>();
      let best = 0, run = 0;
      for (const d of scheduled) { if (set.has(d)) { run++; best = Math.max(best, run); } else if (d !== t) run = 0; }
      let current = 0;
      for (let i = scheduled.length - 1; i >= 0; i--) {
        const d = scheduled[i] ?? '';
        if (set.has(d)) current++;
        else if (d === t) continue;
        else break;
      }
      out.set(id, { current, best, playedToday: set.has(t) });
    }
    return out;
  }
  const streakOf = (userId: number): Api.Streak => streaks([userId]).get(userId) ?? { current: 0, best: 0, playedToday: false };

  // ---------- leaderboards ----------
  function periodRange(period: string, date: string): [string, string] {
    if (period === 'week') return [weekStartOf(date, settings().weekStart), date];
    if (period === 'month') return [monthStartOf(date), date];
    if (period === 'all') return ['0000-01-01', date];
    return [date, date];
  }
  type WithLookText<T> = Omit<T, 'look'> & { look: string };
  const withLooks = <T extends Api.PlayerRef>(rows: Array<WithLookText<T>>): T[] => rows.map(r => ({ ...r, look: resolveLook(settings().theme, r.look, r.username) }) as unknown as T);
  function leaderboard(periodRaw: string, dateRaw: string): Api.LeaderboardResponse {
    const t = today();
    const date = isDate(dateRaw) && dateRaw <= t ? dateRaw : t;
    const period = oneOf(periodRaw, ['day', 'week', 'month', 'all', 'streak', 'teams'] as const, 'Unknown period');
    if (period === 'streak') {
      const users = db.all<Pick<UserRow, 'id' | 'username' | 'display_name' | 'team' | 'look'>>('SELECT id, username, display_name, team, look FROM users WHERE disabled=0');
      const st = streaks(users.map(u => u.id));
      const rows = users.map((u): Api.StreakRow => ({ userId: u.id, username: u.username, look: resolveLook(settings().theme, u.look, u.username), name: u.display_name, team: u.team, ...(st.get(u.id) ?? { current: 0, best: 0, playedToday: false }) }))
        .filter(r => r.current > 0 || r.best > 0).sort((a, b) => b.current - a.current || b.best - a.best || a.name.localeCompare(b.name));
      return { period, date, rows };
    }
    if (period === 'day') {
      const rows = db.all<WithLookText<Api.DayRow>>(`SELECT u.id AS userId, u.username, u.look, u.display_name AS name, u.team, r.score, r.total_ms AS ms,
          (SELECT COUNT(*) FROM rounds x WHERE x.run_id=r.id AND x.tier=5) AS outliers
        FROM runs r JOIN users u ON u.id=r.user_id
        WHERE r.date=? AND r.mode='live' AND r.finished_at IS NOT NULL ORDER BY r.score DESC, r.total_ms ASC`, date);
      return { period, date, rows: withLooks<Api.DayRow>(rows) };
    }
    if (period === 'teams') {
      const [from, to] = periodRange('week', date);
      const rows = db.all<Api.TeamRow>(`SELECT u.team, COUNT(DISTINCT u.id) AS players, COUNT(*) AS games, SUM(r.score) AS points, ROUND(AVG(r.score)) AS avg
        FROM runs r JOIN users u ON u.id=r.user_id
        WHERE r.mode='live' AND r.finished_at IS NOT NULL AND r.date BETWEEN ? AND ? AND u.team<>''
        GROUP BY u.team ORDER BY avg DESC, points DESC`, from, to);
      return { period, date, from, to, rows };
    }
    const [from, to] = periodRange(period, date);
    const rows = db.all<WithLookText<Api.PeriodRow>>(`SELECT u.id AS userId, u.username, u.look, u.display_name AS name, u.team, SUM(r.score) AS points, COUNT(*) AS games,
        ROUND(AVG(r.score)) AS avg, MAX(r.score) AS best, SUM(r.total_ms) AS ms
      FROM runs r JOIN users u ON u.id=r.user_id
      WHERE r.mode='live' AND r.finished_at IS NOT NULL AND r.date BETWEEN ? AND ?
      GROUP BY u.id ORDER BY points DESC, ms ASC`, from, to);
    return { period, date, from, to, rows: withLooks<Api.PeriodRow>(rows) };
  }

  // ---------- stats ----------
  function myStats(user: UserRow): Api.StatsResponse {
    const agg = db.get<{ games: number; points: number; bestScore: number; avg: number }>(`SELECT COUNT(*) AS games, COALESCE(SUM(score),0) AS points, COALESCE(MAX(score),0) AS bestScore, COALESCE(ROUND(AVG(score)),0) AS avg
      FROM runs WHERE user_id=? AND mode='live' AND finished_at IS NOT NULL`, user.id) ?? { games: 0, points: 0, bestScore: 0, avg: 0 };
    const tiers: Record<string, number> = { missed: 0 };
    for (const t of TIERS) tiers[t.name] = 0;
    for (const r of db.all<{ tier: number; n: number }>(`SELECT x.tier, COUNT(*) AS n FROM rounds x JOIN runs r ON r.id=x.run_id WHERE r.user_id=? AND r.mode='live' GROUP BY x.tier`, user.id)) {
      const name = TIERS.find(t => t.id === r.tier)?.name ?? 'missed';
      tiers[name] = (tiers[name] ?? 0) + r.n;
    }
    const history = db.all<Omit<Api.HistoryRow, 'finished'> & { finished: number }>(`SELECT r.date, r.mode, r.score, r.finished_at IS NOT NULL AS finished,
        (SELECT COUNT(*)+1 FROM runs o WHERE o.date=r.date AND o.mode='live' AND o.finished_at IS NOT NULL AND (o.score>r.score OR (o.score=r.score AND o.total_ms<r.total_ms))) AS rank,
        (SELECT COUNT(*) FROM runs o WHERE o.date=r.date AND o.mode='live' AND o.finished_at IS NOT NULL) AS players
      FROM runs r WHERE r.user_id=? AND r.mode<>'custom' ORDER BY r.date DESC LIMIT 60`, user.id).map(h => ({ ...h, finished: !!h.finished }));
    return { ...agg, streak: streakOf(user.id), tiers, history };
  }

  // ---------- prompts ----------
  function checkAnswers(answers: ReadonlyArray<{ answer: string; aliases: readonly string[] }>): void {
    const owner = new Map<string, number>();
    answers.forEach((a, i) => {
      for (const text of [a.answer, ...a.aliases]) for (const k of keysFor(text)) {
        const prev = owner.get(k);
        if (prev !== undefined && prev !== i) bad(`"${text}" is the same as "${answers[prev]?.answer ?? ''}" after ignoring case, accents and punctuation`);
        owner.set(k, i);
      }
    });
  }
  function cleanPromptInput(raw: unknown): CleanPrompt {
    const b = asBody(raw);
    const text = str(b['text'], 200, 'Prompt'); if (text.length < 5) bad('Prompt is too short');
    const category = optStr(b['category'], 40, 'Category') || 'General';
    const list = b['answers'];
    if (!Array.isArray(list) || !list.length) bad('Add at least one answer');
    if (list.length > 1000) bad('Too many answers');
    const answers = list.map((rawA: unknown): CleanAnswer => {
      const a = asBody(rawA);
      const answer = str(a['answer'], 100, 'Answer');
      if (!answer) bad('Empty answer');
      const tier = Number(a['tier']);
      if (!(Number.isInteger(tier) && tier >= 1 && tier <= 5)) bad(`"${answer}" needs a tier 1-5`);
      const al = a['aliases'];
      const aliases = (Array.isArray(al) ? al : String(al ?? '').split('|')).map(x => String(x).trim()).filter(Boolean).slice(0, 20);
      const id = a['id'];
      return { id: typeof id === 'number' && Number.isInteger(id) ? id : null, answer, tier, aliases };
    });
    checkAnswers(answers);
    return { text, category, answers };
  }
  function savePrompt(idIn: number | null, input: CleanPrompt, pack = ''): Api.SavePromptResponse {
    const t = now();
    return db.tx(() => {
      // Prompt text is unique within the question bank; prompts inside user-made games are exempt.
      const ownGame = idIn !== null && db.get<{ owner_id: number | null }>('SELECT owner_id FROM prompts WHERE id=?', idIn)?.owner_id;
      const dupe = ownGame ? undefined : db.get<{ id: number }>('SELECT id FROM prompts WHERE text=? COLLATE NOCASE AND owner_id IS NULL', input.text);
      if (dupe && dupe.id !== idIn) bad('A prompt with that text already exists', 409);
      let id: number;
      if (idIn === null) {
        id = Number(db.run('INSERT INTO prompts(text,category,pack,lang,created_at,updated_at) VALUES(?,?,?,?,?,?)', input.text, input.category, pack, langOf(input.text), t, t).lastInsertRowid);
      } else {
        id = idIn;
        if (!count('SELECT COUNT(*) AS n FROM prompts WHERE id=?', id)) bad('Prompt not found', 404);
        db.run('UPDATE prompts SET text=?, category=?, lang=?, updated_at=? WHERE id=?', input.text, input.category, langOf(input.text), t, id);
      }
      const existing = new Set(db.all<{ id: number }>('SELECT id FROM answers WHERE prompt_id=?', id).map(r => r.id));
      const keep = new Set<number>();
      for (const a of input.answers) {
        if (a.id !== null && existing.has(a.id)) {
          db.run('UPDATE answers SET answer=?, tier=?, aliases=? WHERE id=?', a.answer, a.tier, JSON.stringify(a.aliases), a.id);
          keep.add(a.id);
        } else db.run('INSERT INTO answers(prompt_id,answer,tier,aliases) VALUES(?,?,?,?)', id, a.answer, a.tier, JSON.stringify(a.aliases));
      }
      for (const old of existing) if (!keep.has(old)) db.run('DELETE FROM answers WHERE id=?', old);
      indexCache.delete(id);
      return { id, awarded: retroAward(id) };
    });
  }
  function promptFull(id: number): Api.PromptFull {
    const p = db.get<PromptRow>('SELECT * FROM prompts WHERE id=?', id) ?? bad('Prompt not found', 404);
    return {
      id: p.id, text: p.text, category: p.category, pack: p.pack, lang: p.lang, retired: !!p.retired,
      used: db.all<{ date: string }>('SELECT date FROM day_prompts WHERE prompt_id=? ORDER BY date', id).map(r => r.date),
      answers: promptAnswers(id).answers.map(a => ({ id: a.id, answer: a.answer, tier: a.tier, aliases: a.aliases })),
    };
  }
  function importPack(content: unknown, name: string, { mode = 'skip', dryRun = false, pack = '' }: { mode?: 'skip' | 'update'; dryRun?: boolean; pack?: string } = {}): Api.ImportResult {
    let parsed: Pack;
    try { parsed = parsePack(String(content), name); } catch (e) { bad(`Could not read the file: ${(e as Error).message}`); }
    const result: Api.ImportResult = { title: parsed.title, total: parsed.prompts.length, added: 0, updated: 0, skipped: 0, errors: [] };
    const packName = pack || parsed.title || name.replace(/\.[^.]+$/, '');
    db.tx(() => {
      for (const p of parsed.prompts) {
        try {
          const input = cleanPromptInput(p);
          const ex = db.get<{ id: number }>('SELECT id FROM prompts WHERE text=? COLLATE NOCASE AND owner_id IS NULL', input.text);
          if (ex && mode !== 'update') { result.skipped++; continue; }
          if (ex) {
            const merged: CleanAnswer[] = promptAnswers(ex.id).answers.map(a => ({ ...a, aliases: [...a.aliases] }));
            const byKey = new Map(merged.map(a => [normalize(a.answer), a]));
            for (const a of input.answers) {
              const hit = byKey.get(normalize(a.answer));
              if (hit) { hit.tier = a.tier; hit.aliases = [...new Set([...hit.aliases, ...a.aliases])]; }
              else merged.push(a);
            }
            checkAnswers(merged);
            if (!dryRun) savePrompt(ex.id, { text: input.text, category: input.category, answers: merged });
            result.updated++;
          } else {
            if (!dryRun) savePrompt(null, input, packName);
            result.added++;
          }
        } catch (e) { result.errors.push(`"${p.text}": ${(e as Error).message}`); }
      }
    });
    return result;
  }

  // ---------- routing ----------
  const routes: Route[] = [];
  const pub = (method: string, pattern: string, fn: (c: PublicCtx) => unknown): void => { routes.push({ method, re: new RegExp(`^${pattern}$`), auth: null, fn }); };
  const route = (method: string, pattern: string, auth: Auth, fn: (c: UserCtx) => unknown): void => {
    routes.push({ method, re: new RegExp(`^${pattern}$`), auth, fn: c => fn({ ...c, user: c.user ?? bad('Please sign in.', 401) }) });
  };
  const KEY = String.raw`(\d{4}-\d{2}-\d{2}|g-[a-z0-9]{8})`;
  const SLUG = '([a-z0-9]{8})';

  // Auth & profile
  pub('GET', '/api/me', ({ user }): Api.MeResponse => ({ user: user ? userView(user) : null, settings: publicSettings(), needsSetup: !hasAdmin(), today: today() }));
  pub('POST', '/api/login', ({ body, ip }) => {
    const username = String(body['username'] ?? '').trim(), key = `${ip}|${username.toLowerCase()}`, t = now();
    const f = loginFailures.get(key);
    if (f && f.count >= 8 && t - f.first < 15 * 60_000) bad('Too many attempts. Wait 15 minutes or ask an admin to reset your password.', 429);
    const u = db.get<UserRow>('SELECT * FROM users WHERE username=?', username);
    if (!u || u.disabled || !verifyPassword(String(body['password'] ?? ''), u.pass_hash)) {
      const cur = f && t - f.first < 15 * 60_000 ? f : { count: 0, first: t };
      cur.count++; loginFailures.set(key, cur);
      bad(u?.disabled ? 'This account is disabled.' : 'Wrong username or password.', 401);
    }
    loginFailures.delete(key);
    return signedIn<Api.AuthResponse>(u.id, { user: userView(u) });
  });
  pub('POST', '/api/logout', ({ req }) => {
    const token = cookieToken(req);
    if (token) db.run('DELETE FROM sessions WHERE token_hash=?', tokenHash(token));
    return new CookieResult<Api.OkResponse>(cookie('', 0), { ok: true });
  });
  pub('POST', '/api/register', ({ body }) => {
    const s = settings();
    if (s.registration === 'closed') bad('Sign-up is closed. Ask an admin for an account.', 403);
    if (s.registration === 'code' && String(body['inviteCode'] ?? '').trim() !== s.inviteCode) bad('Wrong invite code.', 403);
    if (!hasAdmin()) bad('Finish the first-time setup first.', 403);
    const u = createUser({ username: String(body['username'] ?? '').trim(), displayName: body['displayName'], team: body['team'], password: body['password'] });
    return signedIn<Api.AuthResponse>(u.id, { user: userView(u) });
  });
  pub('POST', '/api/setup', ({ body }) => {
    if (hasAdmin()) bad('Setup is already done.', 403);
    if (!setupToken || String(body['token'] ?? '') !== setupToken) bad('Wrong setup code. It is printed in the server window.', 403);
    const u = createUser({ username: String(body['username'] ?? '').trim(), displayName: body['displayName'], team: body['team'], password: body['password'], role: 'admin' });
    setupToken = null;
    return signedIn<Api.AuthResponse>(u.id, { user: userView(u) });
  });
  route('POST', '/api/password', 'user', ({ user, body }) => {
    if (!verifyPassword(String(body['current'] ?? ''), user.pass_hash)) bad('Current password is wrong.', 403);
    const next = body['next'];
    if (!validPassword(next)) bad('New password must be at least 8 characters');
    db.run('UPDATE users SET pass_hash=?, must_change=0 WHERE id=?', hashPassword(next), user.id);
    db.run('DELETE FROM sessions WHERE user_id=?', user.id);
    return signedIn<Api.OkResponse>(user.id, { ok: true });
  });
  route('POST', '/api/profile', 'user', ({ user, body }): Api.AuthResponse => {
    const dn = optStr(body['displayName'], 40, 'Display name', user.display_name); if (!dn) bad('Display name is required');
    db.run('UPDATE users SET display_name=?, team=? WHERE id=?', dn, optStr(body['team'], 40, 'Team', user.team), user.id);
    return { user: userView(userById(user.id)) };
  });

  // Game
  route('GET', '/api/today', 'user', ({ user }): Api.TodayResponse => {
    const s = settings(), t = today(), prompts = ensureDay(t);
    const run = prompts ? getRun(user.id, t) : undefined;
    const settled = run && prompts ? settle(run, prompts) : null;
    return {
      date: t, dayNumber: prompts ? dayNumber(t) : null, available: !!prompts, promptCount: prompts?.length ?? 0,
      categories: prompts ? prompts.map(p => p.category) : [], roundSeconds: s.roundSeconds,
      endsAt: dateEndsAt(t, s.timeZone, s.dayStartHour), serverNow: now(),
      players: count("SELECT COUNT(*) AS n FROM runs WHERE date=? AND mode='live' AND finished_at IS NOT NULL", t),
      status: !settled ? 'new' : settled.finished_at ? 'done' : 'playing',
      score: settled?.score ?? null, streak: streakOf(user.id),
    };
  });
  route('POST', `/api/play/${KEY}/start`, 'user', ({ user, m }): Api.RunState => { const { run, prompts } = loadRun(user, param(m, 1), { create: true }); return runState(run, prompts); });
  route('GET', `/api/play/${KEY}`, 'user', ({ user, m }): Api.RunState => { const { run, prompts } = loadRun(user, param(m, 1)); return runState(run, prompts); });
  route('POST', `/api/play/${KEY}/next`, 'user', ({ user, m }): Api.RunState => {
    let { run } = loadRun(user, param(m, 1));
    const { prompts } = loadRun(user, param(m, 1));
    if (!run.finished_at && !run.round_started_at) {
      db.run('UPDATE runs SET round_started_at=? WHERE id=? AND round_started_at IS NULL', now(), run.id);
      run = runById(run.id);
    }
    return runState(run, prompts);
  });
  route('POST', `/api/play/${KEY}/guess`, 'user', ({ user, m, body }): Api.GuessResponse => {
    const { run, prompts } = loadRun(user, param(m, 1));
    if (run.finished_at) return { result: 'finished', state: runState(run, prompts) };
    if (!run.round_started_at) return { result: 'expired', state: runState(run, prompts) };
    const raw = String(body['text'] ?? '').trim().slice(0, 100);
    if (!raw || !normalize(raw)) bad('Type an answer');
    const prompt = promptAt(prompts, run.position);
    if (count('SELECT COUNT(*) AS n FROM guesses WHERE run_id=? AND position=?', run.id, run.position) >= MAX_GUESSES_PER_ROUND) bad('That is a lot of guesses for one round.', 429);
    const { answers, index } = promptAnswers(prompt.id);
    const hit = matchAnswer(index, raw, { typos: settings().typoTolerance });
    // A typo-corrected match is only used once the player confirms it (a second Enter); nothing is recorded until then.
    if (hit?.fuzzy && body['confirm'] !== true) return { result: 'confirm', raw, answer: answers[hit.index]?.answer ?? raw };
    db.run('INSERT INTO guesses(run_id,position,prompt_id,raw,norm,accepted,at) VALUES(?,?,?,?,?,?,?)', run.id, run.position, prompt.id, raw, normalize(raw), hit ? 1 : 0, now());
    const a = hit ? answers[hit.index] : undefined;
    if (!hit || !a) return { result: 'rejected', raw };
    const tier = TIERS.find(x => x.id === a.tier) ?? bad('Answer has no tier', 500);
    const after = finishRound(run, prompts, { outcome: 'answered', answerId: a.id, answerText: a.answer, raw, tier: a.tier, points: tier.points, fuzzy: hit.fuzzy });
    const same = count('SELECT COUNT(*) AS n FROM rounds r JOIN runs u ON u.id=r.run_id WHERE u.date=? AND r.position=? AND r.answer_id=? AND r.run_id<>?', run.date, run.position, a.id, run.id);
    return { result: 'accepted', answer: a.answer, tier: tier.id, points: tier.points, fuzzy: hit.fuzzy, same, state: runState(after, prompts) };
  });
  route('POST', `/api/play/${KEY}/skip`, 'user', ({ user, m }): Api.RunState => {
    let { run } = loadRun(user, param(m, 1));
    const { prompts } = loadRun(user, param(m, 1));
    if (run.round_started_at && !run.finished_at) run = finishRound(run, prompts, { outcome: 'skipped' });
    return runState(run, prompts);
  });
  route('GET', `/api/reveal/${KEY}`, 'user', ({ user, m }): Api.RevealResponse => {
    const date = param(m, 1), run = getRun(user.id, date);
    const owner = isGameKey(date) && count('SELECT COUNT(*) AS n FROM games WHERE slug=? AND owner_id=?', date.slice(2), user.id) > 0;
    // Daily answers stay hidden until the day is over, so nobody can pass them on; a friend's game shows them once you finish it.
    if (!(owner || (isGameKey(date) && run?.finished_at) || (isDate(date) && date < today()))) bad('Answers are revealed after the day is over.', 403);
    return reveal(date, user);
  });
  route('GET', '/api/archive', 'user', ({ user }): Api.ArchiveResponse => {
    const t = today();
    ensureDay(t);
    type Row = Omit<Api.ArchiveDay, 'cats' | 'finished'> & { cats: string | null; finished: number };
    const rows = db.all<Row>(`SELECT d.date,
        (SELECT COUNT(*) FROM days x WHERE x.date<=d.date) AS dayNumber,
        (SELECT GROUP_CONCAT(p.category, '|') FROM day_prompts dp JOIN prompts p ON p.id=dp.prompt_id WHERE dp.date=d.date) AS cats,
        (SELECT COUNT(*) FROM runs r WHERE r.date=d.date AND r.mode='live' AND r.finished_at IS NOT NULL) AS players,
        (SELECT MAX(score) FROM runs r WHERE r.date=d.date AND r.mode='live' AND r.finished_at IS NOT NULL) AS top,
        m.mode, m.score, m.finished_at IS NOT NULL AS finished
      FROM days d LEFT JOIN runs m ON m.date=d.date AND m.user_id=?
      WHERE d.date<=? ORDER BY d.date DESC`, user.id, t);
    return { today: t, archivePlay: settings().archivePlay, days: rows.map(r => ({ ...r, cats: [...new Set((r.cats ?? '').split('|').filter(Boolean))], finished: !!r.finished })) };
  });
  route('GET', '/api/leaderboard', 'user', ({ query }) => leaderboard(query.get('period') ?? 'day', query.get('date') ?? today()));
  route('GET', '/api/stats', 'user', ({ user }) => myStats(user));

  // ---------- wardrobe ----------
  function unlockStats(userId: number): UnlockStats {
    return {
      points: count("SELECT COALESCE(SUM(score),0) AS n FROM runs WHERE user_id=? AND mode IN ('live','archive') AND finished_at IS NOT NULL", userId),
      games: count("SELECT COUNT(*) AS n FROM runs WHERE user_id=? AND mode='live' AND finished_at IS NOT NULL", userId),
      outliers: count("SELECT COUNT(*) AS n FROM rounds x JOIN runs r ON r.id=x.run_id WHERE r.user_id=? AND r.mode IN ('live','archive') AND x.tier=5", userId),
      streak: streakOf(userId).best,
    };
  }
  route('GET', '/api/wardrobe', 'user', ({ user }): Api.WardrobeResponse => {
    const stats = unlockStats(user.id), theme = settings().theme, w = WARDROBES[theme];
    const catalog: Api.CatalogWithUnlocks = Object.fromEntries(w.slots.map(slot => [slot, (w.catalog[slot] ?? []).map(i => ({ ...i, unlocked: isUnlocked(i, stats) }))]));
    return { theme, slots: [...w.slots], colorSlots: [...w.colorSlots], catalog, stats, look: resolveLook(theme, user.look, user.username) };
  });
  route('POST', '/api/wardrobe', 'user', ({ user, body }): Api.LookResponse => {
    const theme = settings().theme;
    let look;
    try { look = cleanLook(theme, body['look'], unlockStats(user.id), resolveLook(theme, user.look, user.username)); }
    catch (e) { if (e instanceof LookError) bad(e.message); throw e; }
    db.run('UPDATE users SET look=? WHERE id=?', storeLook(user.look, theme, look), user.id);
    return { look };
  });

  // ---------- user-made games ----------
  type GameWithOwner = GameRow & { ownerName: string; ownerUsername: string };
  function newSlug(): string {
    for (;;) {
      const s = Array.from(randomBytes(8), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
      if (!count('SELECT COUNT(*) AS n FROM games WHERE slug=?', s)) return s;
    }
  }
  const gameFor = (slug: string): GameWithOwner =>
    db.get<GameWithOwner>('SELECT g.*, u.display_name AS ownerName, u.username AS ownerUsername FROM games g JOIN users u ON u.id=g.owner_id WHERE g.slug=?', slug) ?? bad('Game not found', 404);
  const canEdit = (g: GameRow, user: UserRow): boolean => g.owner_id === user.id || user.role === 'admin';
  function cleanGameInput(raw: unknown): { title: string; prompts: CleanPrompt[] } {
    const b = asBody(raw);
    const title = str(b['title'], 60, 'Title'); if (!title) bad('Give the game a title');
    const list = b['prompts'];
    if (!Array.isArray(list) || !list.length || list.length > 10) bad('A game has 1 to 10 prompts');
    const prompts = list.map((p: unknown) => { const c = cleanPromptInput(p); if (c.answers.length < 3) bad(`"${c.text}" needs at least 3 answers`); return c; });
    return { title, prompts };
  }
  function writeGame(slug: string, ownerId: number, prompts: readonly CleanPrompt[]): void {
    const key = 'g-' + slug, t = now();
    const old = db.all<{ prompt_id: number }>('SELECT prompt_id FROM day_prompts WHERE date=?', key).map(r => r.prompt_id);
    db.run('DELETE FROM day_prompts WHERE date=?', key);
    for (const id of old) { db.run('DELETE FROM prompts WHERE id=?', id); indexCache.delete(id); }
    db.run('INSERT INTO days(date,auto,created_at) VALUES(?,0,?) ON CONFLICT(date) DO NOTHING', key, t);
    prompts.forEach((p, i) => {
      const id = Number(db.run('INSERT INTO prompts(text,category,pack,lang,owner_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)', p.text, p.category, 'game:' + slug, langOf(p.text), ownerId, t, t).lastInsertRowid);
      for (const a of p.answers) db.run('INSERT INTO answers(prompt_id,answer,tier,aliases) VALUES(?,?,?,?)', id, a.answer, a.tier, JSON.stringify(a.aliases));
      db.run('INSERT INTO day_prompts(date,position,prompt_id) VALUES(?,?,?)', key, i, id);
    });
  }
  function createGame(user: UserRow, input: { title: string; prompts: CleanPrompt[] }): Api.SlugResponse {
    if (count('SELECT COUNT(*) AS n FROM games WHERE owner_id=?', user.id) >= 50) bad('You already have 50 games. Delete one to make another.');
    const slug = newSlug(), t = now();
    db.tx(() => {
      db.run('INSERT INTO games(slug,owner_id,title,created_at,updated_at) VALUES(?,?,?,?,?)', slug, user.id, input.title, t, t);
      writeGame(slug, user.id, input.prompts);
    });
    return { slug };
  }
  const gamePlays = (key: string): number => count('SELECT COUNT(*) AS n FROM runs WHERE date=? AND finished_at IS NOT NULL', key);
  const gameContent = (key: string): Api.GameContentPrompt[] =>
    dayPrompts(key).map(p => ({ id: p.id, text: p.text, category: p.category, answers: promptAnswers(p.id).answers.map(a => ({ id: a.id, answer: a.answer, tier: a.tier, aliases: a.aliases })) }));
  route('GET', '/api/games', 'user', ({ user }): Api.GamesListResponse => {
    type Row = GameRow & { ownerName: string; score: number | null; finished: number };
    const row = (g: Row): Api.GameSummary => ({ slug: g.slug, title: g.title, ownerName: g.ownerName, createdAt: g.created_at, prompts: dayPrompts('g-' + g.slug).length, plays: gamePlays('g-' + g.slug), myScore: g.score ?? null, finished: !!g.finished });
    const mine = db.all<Row>(`SELECT g.*, u.display_name AS ownerName, r.score, r.finished_at IS NOT NULL AS finished FROM games g JOIN users u ON u.id=g.owner_id
      LEFT JOIN runs r ON r.date='g-'||g.slug AND r.user_id=? WHERE g.owner_id=? ORDER BY g.created_at DESC`, user.id, user.id).map(row);
    const played = db.all<Row>(`SELECT g.*, u.display_name AS ownerName, r.score, r.finished_at IS NOT NULL AS finished FROM runs r JOIN games g ON 'g-'||g.slug=r.date
      JOIN users u ON u.id=g.owner_id WHERE r.user_id=? AND g.owner_id<>? ORDER BY r.started_at DESC LIMIT 50`, user.id, user.id).map(row);
    const recent = db.all<Row>(`SELECT g.*, u.display_name AS ownerName, NULL AS score, 0 AS finished FROM games g JOIN users u ON u.id=g.owner_id
      WHERE g.owner_id<>? AND NOT EXISTS (SELECT 1 FROM runs r WHERE r.date='g-'||g.slug AND r.user_id=?) ORDER BY g.created_at DESC LIMIT 20`, user.id, user.id).map(row);
    return { mine, played, recent };
  });
  route('POST', '/api/games', 'user', ({ user, body }) => createGame(user, cleanGameInput(body)));
  route('GET', `/api/games/${SLUG}`, 'user', ({ user, m }): Api.GameInfo => {
    const g = gameFor(param(m, 1)), key = 'g-' + g.slug, run = getRun(user.id, key), prompts = dayPrompts(key);
    const players = db.all<WithLookText<Api.GameLeaderRow>>(`SELECT u.id AS userId, u.username, u.look, u.display_name AS name, u.team, r.score, r.total_ms AS ms FROM runs r JOIN users u ON u.id=r.user_id
      WHERE r.date=? AND r.finished_at IS NOT NULL ORDER BY r.score DESC, r.total_ms ASC LIMIT 100`, key);
    const others = count('SELECT COUNT(*) AS n FROM runs WHERE date=? AND user_id<>?', key, g.owner_id);
    return {
      slug: g.slug, title: g.title, ownerName: g.ownerName, ownerUsername: g.ownerUsername, isOwner: g.owner_id === user.id, canEdit: canEdit(g, user),
      editable: others === 0, createdAt: g.created_at, prompts: prompts.length, categories: [...new Set(prompts.map(p => p.category))], plays: players.length,
      myRun: run ? { finished: !!run.finished_at, score: run.score } : null, leaderboard: withLooks<Api.GameLeaderRow>(players),
      content: canEdit(g, user) ? gameContent(key) : null,
    };
  });
  route('PUT', `/api/games/${SLUG}`, 'user', ({ user, m, body }): Api.SlugResponse => {
    const g = gameFor(param(m, 1));
    if (!canEdit(g, user)) bad('Only the person who made this game can change it.', 403);
    const input = cleanGameInput(body), key = 'g-' + g.slug;
    db.tx(() => {
      if (count('SELECT COUNT(*) AS n FROM runs WHERE date=? AND user_id<>?', key, g.owner_id)) {
        // Already played: keep prompts and order, only add answers / change tiers and spellings (re-scores players).
        const current = dayPrompts(key);
        if (input.prompts.length !== current.length || input.prompts.some((p, i) => p.text !== current[i]?.text)) bad('People already played this game, so you can only add or change answers. Make a copy to change the prompts.', 409);
        input.prompts.forEach((p, i) => savePrompt(promptAt(current, i).id, p));
      } else {
        db.run('DELETE FROM runs WHERE date=?', key);
        writeGame(g.slug, g.owner_id, input.prompts);
      }
      db.run('UPDATE games SET title=?, updated_at=? WHERE id=?', input.title, now(), g.id);
    });
    return { slug: g.slug };
  });
  route('DELETE', `/api/games/${SLUG}`, 'user', ({ user, m }) => {
    const g = gameFor(param(m, 1));
    if (!canEdit(g, user)) bad('Only the person who made this game can delete it.', 403);
    db.tx(() => {
      const key = 'g-' + g.slug, ids = db.all<{ prompt_id: number }>('SELECT prompt_id FROM day_prompts WHERE date=?', key).map(r => r.prompt_id);
      db.run('DELETE FROM days WHERE date=?', key);
      for (const id of ids) { db.run('DELETE FROM prompts WHERE id=?', id); indexCache.delete(id); }
      db.run('DELETE FROM games WHERE id=?', g.id);
    });
    return { ok: true } satisfies Api.OkResponse;
  });
  route('POST', `/api/games/${SLUG}/copy`, 'user', ({ user, m }) => {
    const g = gameFor(param(m, 1));
    return createGame(user, cleanGameInput({ title: str(`${g.title} (copy)`, 60, 'Title'), prompts: gameContent('g-' + g.slug) }));
  });
  route('GET', `/api/games/${SLUG}/misses`, 'user', ({ user, m }): Api.MissesResponse => {
    const g = gameFor(param(m, 1));
    if (!canEdit(g, user)) bad('Only the person who made this game can see this.', 403);
    const rows = db.all<Api.MissRow>(`SELECT g.prompt_id AS promptId, p.text AS prompt, g.norm, MIN(g.raw) AS raw, COUNT(*) AS guesses, COUNT(DISTINCT r.user_id) AS players
      FROM guesses g JOIN runs r ON r.id=g.run_id JOIN prompts p ON p.id=g.prompt_id
      WHERE g.accepted=0 AND r.date=? GROUP BY g.prompt_id, g.norm ORDER BY players DESC, guesses DESC LIMIT 200`, 'g-' + g.slug);
    return { misses: rows.filter(r => !matchAnswer(promptAnswers(r.promptId).index, r.raw, { typos: false })) };
  });

  /** Fill the archive with the past n days, so a new install has history to play. Only on an empty calendar. */
  function backfillHistory(n = 30): number {
    if (count("SELECT COUNT(*) AS n FROM days WHERE date NOT LIKE 'g-%'")) return 0;
    const s = settings(), t = today();
    let made = 0;
    db.tx(() => {
      for (let i = n; i >= 1; i--) {
        const d = addDays(t, -i);
        if (s.activeWeekdays.includes(weekday(d)) && autoCreate(d)) made++;
      }
    });
    return made;
  }

  // ---------- admin ----------
  function listMisses(): Api.AdminMissRow[] {
    const rows = db.all<Api.AdminMissRow>(`SELECT g.prompt_id AS promptId, p.text AS prompt, g.norm, MIN(g.raw) AS raw, COUNT(*) AS guesses, COUNT(DISTINCT r.user_id) AS players, MAX(g.at) AS lastAt
      FROM guesses g JOIN runs r ON r.id=g.run_id JOIN prompts p ON p.id=g.prompt_id
      WHERE g.accepted=0 AND p.owner_id IS NULL AND NOT EXISTS (SELECT 1 FROM dismissed d WHERE d.prompt_id=g.prompt_id AND d.norm=g.norm)
      GROUP BY g.prompt_id, g.norm ORDER BY players DESC, guesses DESC, lastAt DESC LIMIT 500`);
    return rows.filter(r => !matchAnswer(promptAnswers(r.promptId).index, r.raw, { typos: false }));
  }
  route('GET', '/api/admin/overview', 'admin', (): Api.AdminOverview => {
    const t = today(), s = settings();
    const bank = count('SELECT COUNT(*) AS n FROM prompts WHERE retired=0 AND owner_id IS NULL');
    const unused = count('SELECT COUNT(*) AS n FROM prompts p WHERE retired=0 AND owner_id IS NULL AND NOT EXISTS (SELECT 1 FROM day_prompts dp WHERE dp.prompt_id=p.id) AND NOT EXISTS (SELECT 1 FROM practice_rounds pr WHERE pr.prompt_id=p.id) AND EXISTS (SELECT 1 FROM answers a WHERE a.prompt_id=p.id)');
    return {
      today: t, users: count('SELECT COUNT(*) AS n FROM users'),
      activeWeek: count('SELECT COUNT(*) AS n FROM users WHERE last_seen>?', now() - 7 * 86400_000),
      playersToday: count("SELECT COUNT(*) AS n FROM runs WHERE date=? AND mode='live' AND finished_at IS NOT NULL", t),
      startedToday: count("SELECT COUNT(*) AS n FROM runs WHERE date=? AND mode='live'", t),
      bank, unused, daysLeft: Math.floor(unused / s.promptsPerDay),
      scheduledAhead: count("SELECT COUNT(*) AS n FROM days WHERE date>? AND date NOT LIKE 'g-%'", t),
      misses: listMisses().length,
      todayPrompts: dayPrompts(t),
      participation: db.all<{ date: string; players: number }>(`SELECT d.date, (SELECT COUNT(*) FROM runs r WHERE r.date=d.date AND r.mode='live' AND r.finished_at IS NOT NULL) AS players
        FROM days d WHERE d.date<=? ORDER BY d.date DESC LIMIT 14`, t).reverse(),
    };
  });
  route('GET', '/api/admin/prompts', 'admin', (): Api.AdminPromptsResponse => ({
    prompts: db.all<Omit<Api.AdminPromptRow, 'retired'> & { retired: number }>(`SELECT p.id, p.text, p.category, p.pack, p.lang, p.retired,
        (SELECT COUNT(*) FROM answers a WHERE a.prompt_id=p.id) AS answers,
        (SELECT COUNT(*) FROM day_prompts dp WHERE dp.prompt_id=p.id) AS used,
        (SELECT MAX(date) FROM day_prompts dp WHERE dp.prompt_id=p.id) AS lastUsed
      FROM prompts p WHERE p.owner_id IS NULL ORDER BY p.id DESC`).map(p => ({ ...p, retired: !!p.retired })),
    categories: db.all<{ category: string; n: number }>('SELECT category, COUNT(*) AS n FROM prompts WHERE owner_id IS NULL GROUP BY category ORDER BY category'),
  }));
  route('GET', String.raw`/api/admin/prompts/(\d+)`, 'admin', ({ m }) => promptFull(Number(param(m, 1))));
  route('POST', '/api/admin/prompts', 'admin', ({ body }) => savePrompt(null, cleanPromptInput(body), 'custom'));
  route('PUT', String.raw`/api/admin/prompts/(\d+)`, 'admin', ({ m, body }) => {
    const id = Number(param(m, 1));
    if (typeof body['retired'] === 'boolean' && !body['answers']) {
      db.run('UPDATE prompts SET retired=?, updated_at=? WHERE id=?', body['retired'] ? 1 : 0, now(), id);
      return { id, awarded: 0 } satisfies Api.SavePromptResponse;
    }
    return savePrompt(id, cleanPromptInput(body));
  });
  route('DELETE', String.raw`/api/admin/prompts/(\d+)`, 'admin', ({ m }) => {
    const id = Number(param(m, 1));
    if (count('SELECT COUNT(*) AS n FROM day_prompts WHERE prompt_id=?', id)) {
      db.run('UPDATE prompts SET retired=1 WHERE id=?', id);
      return { id, retired: true };
    }
    db.run('DELETE FROM prompts WHERE id=?', id); indexCache.delete(id);
    return { id, deleted: true };
  });
  route('POST', '/api/admin/import', 'admin', ({ body }) =>
    importPack(body['content'], String(body['name'] ?? 'upload.txt'), { mode: body['mode'] === 'update' ? 'update' : 'skip', dryRun: !!body['dryRun'] }));
  route('GET', '/api/admin/export', 'admin', ({ query }) => {
    const ids = db.all<{ id: number }>(`SELECT id FROM prompts WHERE owner_id IS NULL ${query.get('all') === '1' ? '' : 'AND retired=0'} ORDER BY category, id`).map(r => r.id);
    const prompts: PackPrompt[] = ids.map(id => { const p = promptFull(id); return { text: p.text, category: p.category, answers: p.answers.map(({ answer, tier, aliases }) => ({ answer, tier, aliases })) }; });
    const fmt = query.get('format') ?? 'json', stamp = today(), title = `${settings().siteName} bank ${stamp}`;
    if (fmt === 'csv') return new FileResult({ name: `outlier-bank-${stamp}.csv`, type: 'text/csv; charset=utf-8', data: '\uFEFF' + toCsv(prompts) });
    if (fmt === 'txt') return new FileResult({ name: `outlier-bank-${stamp}.txt`, type: 'text/plain; charset=utf-8', data: toText(prompts, title) });
    const json = { title, prompts: prompts.map(p => ({ ...p, answers: p.answers.map(a => (a.aliases.length ? a : { answer: a.answer, tier: a.tier })) })) };
    return new FileResult({ name: `outlier-bank-${stamp}.json`, type: 'application/json', data: JSON.stringify(json, null, 1) });
  });

  route('GET', '/api/admin/schedule', 'admin', ({ query }): Api.ScheduleResponse => {
    const t = today(), qf = query.get('from'), qt = query.get('to');
    const from = isDate(qf) ? qf : addDays(t, -14);
    const to = isDate(qt) ? qt : addDays(t, 42);
    const days = db.all<{ date: string; auto: number }>('SELECT date, auto FROM days WHERE date BETWEEN ? AND ? ORDER BY date', from, to).map(d => ({
      date: d.date, auto: !!d.auto, prompts: dayPrompts(d.date), runs: count('SELECT COUNT(*) AS n FROM runs WHERE date=?', d.date),
    }));
    return { today: t, from, to, activeWeekdays: settings().activeWeekdays, promptsPerDay: settings().promptsPerDay, days };
  });
  route('GET', '/api/admin/schedule/suggest', 'admin', ({ query }): Api.SuggestResponse => {
    const exclude = (query.get('exclude') ?? '').split(',').map(Number).filter(Boolean);
    const ql = query.get('lang'), qd = query.get('date');
    const lang: Api.Lang | null = ql === 'en' || ql === 'he' ? ql : isDate(qd) ? langForDate(qd) : null;
    return { lang, prompts: pickPrompts(Number(query.get('n')) || settings().promptsPerDay, exclude, lang) };
  });
  route('PUT', String.raw`/api/admin/schedule/(\d{4}-\d{2}-\d{2})`, 'admin', ({ m, body }) => {
    const date = param(m, 1);
    if (!isDate(date)) bad('Bad date');
    if (date < today()) bad('You can only schedule today or later.');
    const runs = count('SELECT COUNT(*) AS n FROM runs WHERE date=?', date);
    if (runs) bad(`${runs} player(s) already started this day, so it can't be changed.`, 409);
    const ids = body['promptIds'];
    if (!Array.isArray(ids) || !ids.length || ids.length > 10 || ids.some(x => !Number.isInteger(x))) bad('Pick 1 to 10 prompts');
    const promptIds = ids as number[];
    if (new Set(promptIds).size !== promptIds.length) bad('The same prompt is picked twice');
    for (const id of promptIds) {
      if (!count('SELECT COUNT(*) AS n FROM prompts WHERE id=? AND owner_id IS NULL AND EXISTS (SELECT 1 FROM answers a WHERE a.prompt_id=prompts.id)', id)) bad(`Prompt ${id} not found or has no answers`);
      // daily prompts are always new: not used on another day, not seen in practice
      if (count("SELECT COUNT(*) AS n FROM day_prompts WHERE prompt_id=? AND date<>? AND date NOT LIKE 'g-%'", id, date) || count('SELECT COUNT(*) AS n FROM practice_rounds WHERE prompt_id=?', id))
        bad('That prompt was already used. Every daily puzzle gets brand-new prompts.', 409);
    };
    setDay(date, promptIds, false);
    return { date, prompts: dayPrompts(date) };
  });
  route('DELETE', String.raw`/api/admin/schedule/(\d{4}-\d{2}-\d{2})`, 'admin', ({ m }) => {
    const date = param(m, 1);
    const runs = count('SELECT COUNT(*) AS n FROM runs WHERE date=?', date);
    if (runs) bad(`${runs} player(s) already played this day, so it can't be removed.`, 409);
    if (date < today()) bad('Past days without players have nothing to remove.');
    db.run('DELETE FROM days WHERE date=?', date);
    return { ok: true } satisfies Api.OkResponse;
  });
  route('POST', '/api/admin/schedule/autofill', 'admin', ({ body }): Api.AutofillResponse => {
    const s = settings(), t = today(), from = body['from'];
    let date = isDate(from) && from >= t ? from : t;
    const days = Math.min(Math.max(Number(body['days']) || 14, 1), 120);
    const created: string[] = [];
    db.tx(() => {
      for (let i = 0; i < days; i++, date = addDays(date, 1)) {
        if (!s.activeWeekdays.includes(weekday(date)) || dayRow(date)) continue;
        if (autoCreate(date)) created.push(date);
      }
    });
    return { created };
  });
  route('GET', '/api/admin/misses', 'admin', (): Api.AdminMissesResponse => ({ misses: listMisses() }));
  function acceptMiss(promptId: number, body: Body): Api.SavePromptResponse {
    const p = promptFull(promptId);
    const text = str(body['text'], 100, 'Answer'); if (!text) bad('Answer is required');
    const answers: CleanAnswer[] = p.answers.map(a => ({ ...a, aliases: [...a.aliases] }));
    if (body['aliasOf']) {
      const target = answers.find(a => a.id === Number(body['aliasOf'])) ?? bad('Answer not found', 404);
      target.aliases.push(text);
    } else answers.push({ id: null, answer: text, tier: Number(body['tier']), aliases: [] });
    return savePrompt(p.id, cleanPromptInput({ text: p.text, category: p.category, answers }));
  }
  route('POST', '/api/admin/misses/accept', 'admin', ({ body }) => acceptMiss(Number(body['promptId']), body));
  route('POST', `/api/games/${SLUG}/misses/accept`, 'user', ({ user, m, body }) => {
    const g = gameFor(param(m, 1)), promptId = Number(body['promptId']);
    if (!canEdit(g, user)) bad('Only the person who made this game can change it.', 403);
    if (!dayPrompts('g-' + g.slug).some(p => p.id === promptId)) bad('That prompt is not in this game', 404);
    return acceptMiss(promptId, body);
  });
  route('POST', '/api/admin/misses/dismiss', 'admin', ({ body }) => {
    db.run('INSERT OR IGNORE INTO dismissed(prompt_id,norm) VALUES(?,?)', Number(body['promptId']), String(body['norm'] ?? ''));
    return { ok: true } satisfies Api.OkResponse;
  });

  route('GET', '/api/admin/users', 'admin', (): Api.AdminUsersResponse => ({
    users: db.all<UserRow & { games: number; points: number }>(`SELECT u.*, (SELECT COUNT(*) FROM runs r WHERE r.user_id=u.id AND r.mode='live' AND r.finished_at IS NOT NULL) AS games,
      (SELECT COALESCE(SUM(score),0) FROM runs r WHERE r.user_id=u.id AND r.mode='live') AS points
      FROM users u ORDER BY u.display_name COLLATE NOCASE`).map(u => ({ ...userView(u), games: u.games, points: u.points, lastSeen: u.last_seen, createdAt: u.created_at })),
  }));
  route('POST', '/api/admin/users', 'admin', ({ body }): Api.CreateUsersResponse => {
    const make = (b: { username: unknown; displayName?: unknown; team?: unknown; role?: unknown }): Api.CreatedUser => {
      const password = tempPassword();
      const u = createUser({ username: b.username, displayName: b.displayName, team: b.team, role: b.role === 'admin' ? 'admin' : 'player', password, mustChange: true });
      return { username: u.username, displayName: u.display_name, password };
    };
    const bulk = body['bulk'];
    if (typeof bulk === 'string') {
      const created: Api.CreatedUser[] = [], errors: string[] = [];
      db.tx(() => {
        for (const l of bulk.split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 500)) {
          const [username = '', displayName, team] = l.split(/[,\t;]/).map(x => x.trim());
          try { created.push(make({ username, displayName, team })); } catch (e) { errors.push(`${username}: ${(e as Error).message}`); }
        }
      });
      return { created, errors };
    }
    return { created: [make({ username: body['username'], displayName: body['displayName'], team: body['team'], role: body['role'] })], errors: [] };
  });
  function lastAdminGuard(id: number, becomesNonAdmin: boolean): UserRow {
    const u = userById(id);
    if (becomesNonAdmin && u.role === 'admin' && count("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND disabled=0") <= 1) bad('Keep at least one active admin.');
    return u;
  }
  route('PUT', String.raw`/api/admin/users/(\d+)`, 'admin', ({ m, body, user }): Api.AuthResponse => {
    const id = Number(param(m, 1));
    const demote = (body['role'] !== undefined && body['role'] !== 'admin') || body['disabled'] === true;
    const u = lastAdminGuard(id, demote);
    if (id === user.id && demote) bad("You can't demote or disable yourself.");
    const role: Api.Role = body['role'] === 'admin' || body['role'] === 'player' ? body['role'] : u.role;
    const dn = body['displayName'] !== undefined ? str(body['displayName'], 40, 'Display name') || u.display_name : u.display_name;
    const team = body['team'] !== undefined ? str(body['team'], 40, 'Team') : u.team;
    const disabled = body['disabled'] !== undefined ? (body['disabled'] ? 1 : 0) : u.disabled;
    db.run('UPDATE users SET role=?, display_name=?, team=?, disabled=? WHERE id=?', role, dn, team, disabled, id);
    if (disabled) db.run('DELETE FROM sessions WHERE user_id=?', id);
    return { user: userView(userById(id)) };
  });
  route('POST', String.raw`/api/admin/users/(\d+)/reset`, 'admin', ({ m }) => {
    const id = Number(param(m, 1)); lastAdminGuard(id, false);
    const password = tempPassword();
    db.run('UPDATE users SET pass_hash=?, must_change=1 WHERE id=?', hashPassword(password), id);
    db.run('DELETE FROM sessions WHERE user_id=?', id);
    return { password };
  });
  route('DELETE', String.raw`/api/admin/users/(\d+)`, 'admin', ({ m, user }) => {
    const id = Number(param(m, 1));
    if (id === user.id) bad("You can't delete yourself.");
    lastAdminGuard(id, true);
    db.run('DELETE FROM users WHERE id=?', id);
    return { ok: true } satisfies Api.OkResponse;
  });
  route('GET', String.raw`/api/admin/users/(\d+)/runs`, 'admin', ({ m }) => ({
    runs: db.all<Omit<Api.UserRunRow, 'finished'> & { finished: number }>('SELECT date, mode, score, position, finished_at IS NOT NULL AS finished FROM runs WHERE user_id=? ORDER BY date DESC LIMIT 100', Number(param(m, 1)))
      .map((r): Api.UserRunRow => ({ ...r, finished: !!r.finished })),
  }));
  route('DELETE', String.raw`/api/admin/users/(\d+)/runs/(\d{4}-\d{2}-\d{2}|g-[a-z0-9]{8})`, 'admin', ({ m }) => {
    db.run('DELETE FROM runs WHERE user_id=? AND date=?', Number(param(m, 1)), param(m, 2));
    return { ok: true } satisfies Api.OkResponse;
  });
  route('GET', '/api/admin/settings', 'admin', (): Api.SettingsResponse => ({ settings: settings() }));
  route('PUT', '/api/admin/settings', 'admin', ({ body }): Api.SettingsResponse => ({ settings: saveSettings(body) }));
  route('GET', '/api/admin/backup', 'admin', () => {
    const dir = mkdtempSync(join(tmpdir(), 'outlier-'));
    const file = join(dir, 'backup.db');
    try {
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      return new FileResult({ name: `outlier-backup-${today()}.db`, type: 'application/octet-stream', data: readFileSync(file) });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  // ---------- feature modules: practice (unlimited, packs), friends, party ----------
  const kit: Kit = {
    db, now, random, settings, today, count, promptAnswers, streakOf,
    route: (method, pattern, auth, fn) => route(method, pattern, auth, fn),
    playerRef: u => ({ userId: u.id, username: u.username, name: u.display_name, team: u.team, look: resolveLook(settings().theme, u.look, u.username) }),
    practicePool: (lang, category) => db.all<KitPoolPrompt>(`SELECT p.id, p.text, p.category, p.lang FROM prompts p
        WHERE p.retired=0 AND p.owner_id IS NULL AND EXISTS (SELECT 1 FROM answers a WHERE a.prompt_id=p.id)
        AND EXISTS (SELECT 1 FROM day_prompts dp WHERE dp.prompt_id=p.id AND dp.date<? AND dp.date NOT LIKE 'g-%')
        AND (? IS NULL OR p.lang=?) AND (? IS NULL OR p.category=?)`, today(), lang, lang, category ?? null, category ?? null),
  };
  installPractice(kit);
  installFriends(kit);
  installParty(kit);

  async function handle(req: ApiRequest): Promise<ApiResponse> {
    const method = req.method.toUpperCase();
    const r = routes.find(x => x.method === method && x.re.test(req.path));
    if (!r) {
      const any = routes.some(x => x.re.test(req.path));
      return { status: any ? 405 : 404, body: { error: any ? 'Method not allowed' : 'Not found' } };
    }
    try {
      if (method !== 'GET' && req.headers['x-outlier'] !== '1') bad('Missing request header', 403);
      const user = sessionUser(req);
      if (r.auth && !user) bad('Please sign in.', 401);
      if (r.auth === 'admin' && user?.role !== 'admin') bad('Admins only.', 403);
      if (r.auth && user?.must_change && !['/api/password', '/api/me', '/api/logout'].includes(req.path)) bad('Please choose a new password first.', 428);
      const out = await r.fn({ req, user, body: asBody(req.body), query: req.query, m: req.path.match(r.re) ?? bad('Not found', 404), ip: req.ip });
      if (out instanceof FileResult) return { status: 200, file: out.file };
      if (out instanceof CookieResult) return { status: 200, headers: { 'Set-Cookie': out.cookie }, body: out.body };
      return { status: 200, body: out };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
      log(`ERROR ${method} ${req.path}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
      return { status: 500, body: { error: 'Something went wrong on the server.' } };
    }
  }

  return { handle, settings, saveSettings, today, ensureSetupToken, importPack, createUser, ensureDay, retroAward, backfillHistory, db };
}

export type App = ReturnType<typeof createApp>;
