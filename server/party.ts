// Party mode: a real-time, turn-based "hot potato" for 2-10 players in a room.
// Everyone gets one category; on your turn, name a valid answer nobody has used yet before your fuse runs out.
// The fuse gets shorter with every pass. Run out and you lose a life, and a new category starts.
// Answers fill your meter by their rarity points; a full meter (100) gives an extra life. Last player standing wins.
// Rooms live in memory (they're short-lived); clients long-poll GET /api/party/:code?v=<version> for changes.
import type * as Api from '../shared/api.ts';
import { TIERS } from '../shared/tiers.ts';
import { bad } from './http.ts';
import { matchAnswer, normalize } from './match.ts';
import { token, type Kit, type PoolPrompt } from './kit.ts';
import type { UserRow } from './rows.ts';

const MAX_PLAYERS = 10;
const START_LIVES = 3;
const MAX_LIVES = 5;
const METER_FULL = 100;
const FUSE_START = 15_000;
const FUSE_MIN = 6_000;
const FUSE_STEP = 1_000;
const POLL_MS = 20_000;
const ROOM_TTL = 2 * 3600_000;
const MIN_ANSWERS = 12;
const CODE = '([A-Z]{4})';

interface Player { userId: number; ref: Api.PlayerRef; lives: number; meter: number; out: boolean; correct: number }
interface Room {
  code: string;
  hostId: number;
  lang: Api.Lang;
  status: Api.PartyStatus;
  players: Player[];
  turn: number;
  deadline: number;
  fuseMs: number;
  passes: number;
  prompt: PoolPrompt | null;
  used: Array<Api.PartyUsed & { answerId: number }>;
  seen: Set<number>;
  log: Api.PartyLog[];
  winner: number | null;
  version: number;
  touched: number;
  timer: ReturnType<typeof setTimeout> | null;
  waiters: Set<() => void>;
}

export function installParty(k: Kit): void {
  const rooms = new Map<string, Room>();
  const { route, db } = k;

  const userRow = (id: number): Pick<UserRow, 'id' | 'username' | 'display_name' | 'team' | 'look'> =>
    db.get('SELECT id, username, display_name, team, look FROM users WHERE id=?', id) ?? bad('Player not found', 404);

  function sweep(): void {
    const t = k.now();
    for (const [code, r] of rooms) if (t - r.touched > ROOM_TTL) { if (r.timer) clearTimeout(r.timer); r.waiters.forEach(w => w()); rooms.delete(code); }
  }
  function roomFor(code: string): Room {
    sweep();
    const r = rooms.get(code) ?? bad('That party doesn’t exist (any more).', 404);
    r.touched = k.now();
    return r;
  }
  function changed(r: Room): void {
    r.version++;
    const ws = [...r.waiters];
    r.waiters.clear();
    ws.forEach(w => w());
  }
  const log = (r: Room, e: Omit<Api.PartyLog, 'at'>): void => { r.log.push({ ...e, at: k.now() }); if (r.log.length > 60) r.log.splice(0, r.log.length - 60); };
  const alive = (r: Room): Player[] => r.players.filter(p => !p.out);
  /** Index of the next player still in, after index i. */
  function nextAlive(r: Room, i: number): number {
    for (let s = 1; s <= r.players.length; s++) { const j = (i + s) % r.players.length; if (!r.players[j]?.out) return j; }
    return i;
  }

  function pickPrompt(r: Room): PoolPrompt | null {
    const pool = k.practicePool(r.lang).filter(p => !r.seen.has(p.id) && k.promptAnswers(p.id).answers.length >= MIN_ANSWERS);
    const from = pool.length ? pool : k.practicePool(r.lang).filter(p => k.promptAnswers(p.id).answers.length >= MIN_ANSWERS);
    const p = from[Math.floor(k.random() * from.length)] ?? null;
    if (p) r.seen.add(p.id);
    return p;
  }
  function newPrompt(r: Room, starter: number): void {
    r.prompt = pickPrompt(r);
    r.used = [];
    r.passes = 0;
    r.turn = starter;
    r.fuseMs = FUSE_START;
    r.deadline = k.now() + r.fuseMs;
    schedule(r);
  }
  function schedule(r: Room): void {
    if (r.timer) clearTimeout(r.timer);
    r.timer = null;
    if (r.status !== 'playing') return;
    const t = setTimeout(() => { if (tick(r)) changed(r); }, Math.max(0, r.deadline - k.now()) + 25);
    t.unref?.();
    r.timer = t;
  }
  /** Apply any fuse that has run out. Returns whether anything changed. */
  function tick(r: Room): boolean {
    let any = false;
    while (r.status === 'playing' && k.now() >= r.deadline) {
      any = true;
      const p = r.players[r.turn];
      if (!p) break;
      p.lives--;
      log(r, { kind: 'pop', userId: p.userId });
      if (p.lives <= 0) { p.lives = 0; p.out = true; }
      if (!finishIfWon(r)) newPrompt(r, nextAlive(r, r.turn));
    }
    return any;
  }
  function finishIfWon(r: Room): boolean {
    const left = alive(r);
    if (left.length > 1) return false;
    r.status = 'over';
    r.winner = left[0]?.userId ?? null;
    if (r.winner !== null) log(r, { kind: 'win', userId: r.winner });
    if (r.timer) clearTimeout(r.timer);
    r.timer = null;
    return true;
  }

  function view(r: Room, you: number): Api.PartyState {
    const turnUser = r.status === 'playing' ? r.players[r.turn]?.userId ?? null : null;
    return {
      code: r.code, hostId: r.hostId, lang: r.lang, status: r.status, maxPlayers: MAX_PLAYERS,
      players: r.players.map(p => ({ ...p.ref, lives: p.lives, meter: p.meter, out: p.out, correct: p.correct })),
      turnUserId: turnUser, deadline: r.status === 'playing' ? r.deadline : null, fuseMs: r.fuseMs, serverNow: k.now(),
      prompt: r.prompt ? { text: r.prompt.text, category: r.prompt.category, lang: r.prompt.lang } : null,
      used: r.used.map(({ answer, tier, by }) => ({ answer, tier, by })), log: r.log.slice(-12), winner: r.winner, version: r.version, you,
    };
  }

  function join(r: Room, userId: number): void {
    if (r.players.some(p => p.userId === userId)) return;
    if (r.status !== 'lobby') bad('This party has already started. Wait for the next one.', 409);
    if (r.players.length >= MAX_PLAYERS) bad('This party is full.', 409);
    r.players.push({ userId, ref: k.playerRef(userRow(userId)), lives: START_LIVES, meter: 0, out: false, correct: 0 });
    log(r, { kind: 'join', userId });
  }

  // ---------- routes ----------
  route('GET', '/api/party', 'user', (): Api.PartyListResponse => {
    sweep();
    return { rooms: [...rooms.values()].filter(r => r.status !== 'over' || k.now() - r.touched < 600_000).map(r => ({
      code: r.code, host: r.players.find(p => p.userId === r.hostId)?.ref.name ?? '', players: r.players.length, maxPlayers: MAX_PLAYERS, status: r.status, lang: r.lang,
    })) };
  });

  route('POST', '/api/party', 'user', ({ user, body }) => {
    sweep();
    let code: string;
    do code = token(4, 'ABCDEFGHJKLMNPQRSTUVWXYZ'); while (rooms.has(code));
    const r: Room = {
      code, hostId: user.id, lang: body['lang'] === 'he' ? 'he' : 'en', status: 'lobby', players: [], turn: 0, deadline: 0, fuseMs: FUSE_START, passes: 0,
      prompt: null, used: [], seen: new Set(), log: [], winner: null, version: 1, touched: k.now(), timer: null, waiters: new Set(),
    };
    rooms.set(code, r);
    join(r, user.id);
    return view(r, user.id);
  });

  route('GET', `/api/party/${CODE}`, 'user', async ({ user, m, query }) => {
    const r = roomFor(m[1] ?? '');
    if (tick(r)) changed(r);
    const since = Number(query.get('v') ?? 0);
    if (r.version <= since) {
      await new Promise<void>(resolve => {
        const t = setTimeout(resolve, POLL_MS);
        t.unref?.();
        r.waiters.add(() => { clearTimeout(t); resolve(); });
      });
      if (tick(r)) changed(r);
    }
    return view(r, user.id);
  });

  route('POST', `/api/party/${CODE}/join`, 'user', ({ user, m }) => {
    const r = roomFor(m[1] ?? '');
    join(r, user.id);
    changed(r);
    return view(r, user.id);
  });

  route('POST', `/api/party/${CODE}/leave`, 'user', ({ user, m }) => {
    const r = roomFor(m[1] ?? '');
    const i = r.players.findIndex(p => p.userId === user.id);
    if (i < 0) return { ok: true };
    log(r, { kind: 'leave', userId: user.id });
    if (r.status === 'lobby' || r.status === 'over') r.players.splice(i, 1);
    else {
      const p = r.players[i];
      if (p) { p.out = true; p.lives = 0; }
      if (!finishIfWon(r) && r.turn === i) { r.turn = nextAlive(r, i); r.fuseMs = FUSE_START; r.deadline = k.now() + r.fuseMs; schedule(r); }
    }
    if (!r.players.length) { if (r.timer) clearTimeout(r.timer); rooms.delete(r.code); r.waiters.forEach(w => w()); return { ok: true }; }
    if (r.hostId === user.id) r.hostId = r.players.find(p => !p.out)?.userId ?? r.players[0]?.userId ?? r.hostId;
    changed(r);
    return { ok: true };
  });

  route('POST', `/api/party/${CODE}/start`, 'user', ({ user, m }) => {
    const r = roomFor(m[1] ?? '');
    if (r.hostId !== user.id) bad('Only the host can start the party.', 403);
    if (r.status === 'playing') bad('The party is already running.', 409);
    if (r.players.length < 2) bad('You need at least 2 players.', 409);
    for (const p of r.players) { p.lives = START_LIVES; p.meter = 0; p.out = false; p.correct = 0; }
    r.status = 'playing'; r.winner = null; r.seen = new Set(); r.log = [];
    log(r, { kind: 'start', userId: user.id });
    newPrompt(r, Math.floor(k.random() * r.players.length));
    if (!r.prompt) { r.status = 'lobby'; bad('There are no prompts for a party in this language right now.', 409); }
    changed(r);
    return view(r, user.id);
  });

  route('POST', `/api/party/${CODE}/answer`, 'user', ({ user, m, body }): Api.PartyAnswerResponse => {
    const r = roomFor(m[1] ?? '');
    if (tick(r)) changed(r);
    if (r.status !== 'playing' || !r.prompt) bad('The party isn’t running.', 409);
    const me = r.players[r.turn];
    if (!me || me.userId !== user.id) bad('It’s not your turn.', 409);
    const raw = String(body['text'] ?? '').trim().slice(0, 100);
    if (!raw || !normalize(raw)) bad('Type an answer');
    const { answers, index } = k.promptAnswers(r.prompt.id);
    const hit = matchAnswer(index, raw, { typos: k.settings().typoTolerance });
    const a = hit ? answers[hit.index] : undefined;
    if (!hit || !a) return { result: 'rejected', raw };
    if (r.used.some(u => u.answerId === a.id)) return { result: 'used', raw, answer: a.answer };
    if (hit.fuzzy && body['confirm'] !== true) return { result: 'confirm', raw, answer: a.answer };
    const points = TIERS.find(t => t.id === a.tier)?.points ?? 0;
    r.used.push({ answerId: a.id, answer: a.answer, tier: a.tier, by: user.id });
    me.correct++;
    me.meter += points;
    log(r, { kind: 'answer', userId: user.id, text: a.answer, tier: a.tier });
    if (me.meter >= METER_FULL) {
      me.meter -= METER_FULL;
      if (me.lives < MAX_LIVES) { me.lives++; log(r, { kind: 'life', userId: user.id }); }
    }
    r.passes++;
    r.fuseMs = Math.max(FUSE_MIN, FUSE_START - r.passes * FUSE_STEP);
    r.turn = nextAlive(r, r.turn);
    r.deadline = k.now() + r.fuseMs;
    schedule(r);
    changed(r);
    return { result: 'accepted', answer: a.answer, tier: a.tier, points, state: view(r, user.id) };
  });
}
