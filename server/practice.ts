// Practice modes: Unlimited (prompts until 3 rounds without distance) and themed packs (10 prompts of one category).
// They never count for leaderboards, streaks or unlocks, and only use prompts that are not scheduled as a daily
// puzzle (see Kit.practicePool). The API mirrors /api/play so the web client reuses its play screen.
import type * as Api from '../shared/api.ts';
import { TIERS } from '../shared/tiers.ts';
import { bad } from './http.ts';
import { matchAnswer, normalize } from './match.ts';
import { token, type Kit, type PoolPrompt } from './kit.ts';

const PACK_SIZE = 10;
const MAX_STRIKES = 3;
const MIN_PACK = 3;
const GRACE_MS = 1500;
const KEY = String.raw`(p-[a-z0-9]{10})`;

interface SessionRow {
  key: string; user_id: number; kind: Api.PracticeKind; pack: string; lang: Api.Lang; size: number; position: number; score: number; strikes: number;
  next_prompt_id: number | null; round_prompt_id: number | null; round_started_at: number | null; created_at: number; finished_at: number | null;
}
interface RoundRow { position: number; prompt_id: number; answer_text: string | null; tier: number; points: number; outcome: Api.RoundOutcome; fuzzy: number }
interface PromptRow { id: number; text: string; category: string; lang: Api.Lang }

export function installPractice(k: Kit): void {
  const { db, route } = k;
  const promptRow = (id: number | null): PromptRow | undefined => (id === null ? undefined : db.get<PromptRow>('SELECT id, text, category, lang FROM prompts WHERE id=?', id));
  const sessionFor = (key: string, userId: number): SessionRow => {
    const s = db.get<SessionRow>('SELECT * FROM practice_sessions WHERE key=?', key);
    if (!s || s.user_id !== userId) bad('Practice run not found', 404);
    return s;
  };
  const best = (s: Pick<SessionRow, 'user_id' | 'kind' | 'pack' | 'lang'>, except = ''): number =>
    k.count('SELECT COALESCE(MAX(score),0) AS n FROM practice_sessions WHERE user_id=? AND kind=? AND pack=? AND lang=? AND finished_at IS NOT NULL AND key<>?', s.user_id, s.kind, s.pack, s.lang, except);

  /** The next prompt: unplayed in this run, preferring ones this player has never practised. */
  function pick(s: Pick<SessionRow, 'key' | 'user_id' | 'kind' | 'pack' | 'lang'>): PoolPrompt | null {
    const done = new Set(db.all<{ prompt_id: number }>('SELECT prompt_id FROM practice_rounds WHERE session=?', s.key).map(r => r.prompt_id));
    const pool = k.practicePool(s.lang, s.kind === 'pack' ? s.pack : undefined).filter(p => !done.has(p.id));
    if (!pool.length) return null;
    const seen = new Set(db.all<{ prompt_id: number }>('SELECT r.prompt_id FROM practice_rounds r JOIN practice_sessions x ON x.key=r.session WHERE x.user_id=?', s.user_id).map(r => r.prompt_id));
    const fresh = pool.filter(p => !seen.has(p.id));
    const from = fresh.length ? fresh : pool;
    return from[Math.floor(k.random() * from.length)] ?? null;
  }

  function settle(s: SessionRow): SessionRow {
    if (s.round_started_at && !s.finished_at && k.now() > s.round_started_at + k.settings().roundSeconds * 1000 + GRACE_MS) return finishRound(s, { outcome: 'timeout' });
    return s;
  }

  function finishRound(s: SessionRow, f: { outcome: Api.RoundOutcome; answer?: string; tier?: number; points?: number; fuzzy?: boolean }): SessionRow {
    const t = k.now(), points = f.points ?? 0;
    return db.tx(() => {
      db.run('INSERT INTO practice_rounds(session,position,prompt_id,answer_text,tier,points,outcome,fuzzy,at) VALUES(?,?,?,?,?,?,?,?,?)',
        s.key, s.position, s.round_prompt_id ?? 0, f.answer ?? null, f.tier ?? 0, points, f.outcome, f.fuzzy ? 1 : 0, t);
      const position = s.position + 1, strikes = s.strikes + (points ? 0 : 1), score = s.score + points;
      let finished = s.kind === 'pack' ? position >= s.size : strikes >= MAX_STRIKES;
      const next = finished ? null : pick(s);
      if (!next) finished = true;
      db.run('UPDATE practice_sessions SET position=?, strikes=?, score=?, round_prompt_id=NULL, round_started_at=NULL, next_prompt_id=?, finished_at=? WHERE key=?',
        position, strikes, score, next?.id ?? null, finished ? t : null, s.key);
      return db.get<SessionRow>('SELECT * FROM practice_sessions WHERE key=?', s.key) ?? bad('Practice run not found', 404);
    });
  }

  function state(s: SessionRow): Api.RunState {
    const rounds = db.all<RoundRow>('SELECT position, prompt_id, answer_text, tier, points, outcome, fuzzy FROM practice_rounds WHERE session=? ORDER BY position', s.key).map((r): Api.RoundSummary => {
      const p = promptRow(r.prompt_id);
      // practice prompts are not daily puzzles, so a missed round may show an accepted answer straight away
      const ans = r.points ? null : k.promptAnswers(r.prompt_id).answers;
      return { position: r.position, answer: r.answer_text, tier: r.tier, points: r.points, outcome: r.outcome, fuzzy: !!r.fuzzy, text: p?.text ?? '', category: p?.category ?? '', example: ans ? ((ans.find(a => a.tier === 3) ?? ans[0])?.answer ?? null) : null };
    });
    const cur = promptRow(s.round_prompt_id), nxt = promptRow(s.next_prompt_id), secs = k.settings().roundSeconds;
    const prev = best(s, s.key);
    return {
      date: s.key, dayNumber: null, mode: 'practice', game: null, total: s.kind === 'pack' ? s.size : 0, position: s.position, score: s.score,
      finished: !!s.finished_at, roundSeconds: secs, serverNow: k.now(), rounds,
      current: cur && s.round_started_at ? { position: s.position, text: cur.text, category: cur.category, lang: cur.lang, startedAt: s.round_started_at, deadline: s.round_started_at + secs * 1000 } : null,
      upNext: !s.finished_at && !s.round_started_at && nxt ? { position: s.position, lang: nxt.lang } : null,
      practice: { kind: s.kind, pack: s.pack, lang: s.lang, strikes: s.strikes, maxStrikes: MAX_STRIKES, best: prev, newBest: !!s.finished_at && s.score > prev && s.score > 0 },
    };
  }

  // ---------- routes ----------
  route('GET', '/api/practice', 'user', ({ user }): Api.PracticeHome => {
    const counts = new Map<string, Api.PackInfo>();
    for (const p of k.practicePool(null)) {
      const id = `${p.lang}|${p.category}`;
      const c = counts.get(id) ?? { category: p.category, lang: p.lang, prompts: 0, best: null, played: 0 };
      c.prompts++;
      counts.set(id, c);
    }
    const stats = new Map(db.all<{ pack: string; lang: Api.Lang; best: number; played: number }>(`SELECT pack, lang, MAX(score) AS best, COUNT(*) AS played FROM practice_sessions
      WHERE user_id=? AND kind='pack' AND finished_at IS NOT NULL GROUP BY pack, lang`, user.id).map(r => [`${r.lang}|${r.pack}`, r]));
    const packs = [...counts.entries()].filter(([, c]) => c.prompts >= MIN_PACK).map(([id, c]) => ({ ...c, best: stats.get(id)?.best ?? null, played: stats.get(id)?.played ?? 0 }))
      .sort((a, b) => a.lang.localeCompare(b.lang) || a.category.localeCompare(b.category));
    const unl = (lang: Api.Lang): number | null => db.get<{ n: number | null }>("SELECT MAX(score) AS n FROM practice_sessions WHERE user_id=? AND kind='unlimited' AND lang=? AND finished_at IS NOT NULL", user.id, lang)?.n ?? null;
    return { packs, unlimited: { en: unl('en'), he: unl('he') } };
  });

  route('POST', '/api/practice', 'user', ({ user, body }): Api.SlugResponse => {
    const kind = body['kind'] === 'pack' ? 'pack' : body['kind'] === 'unlimited' ? 'unlimited' : bad('kind must be unlimited or pack');
    const lang: Api.Lang = body['lang'] === 'he' ? 'he' : 'en';
    const pack = kind === 'pack' ? String(body['pack'] ?? '').trim() : '';
    const size = kind === 'pack' ? Math.min(PACK_SIZE, k.practicePool(lang, pack).length) : 0;
    if (kind === 'pack' && size < MIN_PACK) bad('That pack has no prompts right now.', 404);
    const key = `p-${token(10)}`;
    const first = pick({ key, user_id: user.id, kind, pack, lang }) ?? bad('There are no practice prompts right now.', 404);
    db.run('INSERT INTO practice_sessions(key,user_id,kind,pack,lang,size,next_prompt_id,created_at) VALUES(?,?,?,?,?,?,?,?)', key, user.id, kind, pack, lang, size, first.id, k.now());
    return { slug: key };
  });

  route('POST', `/api/practice/${KEY}/start`, 'user', ({ user, m }) => state(settle(sessionFor(m[1] ?? '', user.id))));
  route('GET', `/api/practice/${KEY}`, 'user', ({ user, m }) => state(settle(sessionFor(m[1] ?? '', user.id))));

  route('POST', `/api/practice/${KEY}/next`, 'user', ({ user, m }) => {
    let s = settle(sessionFor(m[1] ?? '', user.id));
    if (!s.finished_at && !s.round_started_at && s.next_prompt_id) {
      db.run('UPDATE practice_sessions SET round_prompt_id=next_prompt_id, next_prompt_id=NULL, round_started_at=? WHERE key=?', k.now(), s.key);
      s = sessionFor(s.key, user.id);
    }
    return state(s);
  });

  route('POST', `/api/practice/${KEY}/skip`, 'user', ({ user, m }) => {
    let s = settle(sessionFor(m[1] ?? '', user.id));
    if (s.round_started_at && !s.finished_at) s = finishRound(s, { outcome: 'skipped' });
    return state(s);
  });

  route('POST', `/api/practice/${KEY}/guess`, 'user', ({ user, m, body }): Api.GuessResponse => {
    const s = settle(sessionFor(m[1] ?? '', user.id));
    if (s.finished_at) return { result: 'finished', state: state(s) };
    if (!s.round_started_at || !s.round_prompt_id) return { result: 'expired', state: state(s) };
    const raw = String(body['text'] ?? '').trim().slice(0, 100);
    if (!raw || !normalize(raw)) bad('Type an answer');
    const { answers, index } = k.promptAnswers(s.round_prompt_id);
    const hit = matchAnswer(index, raw, { typos: k.settings().typoTolerance });
    if (hit?.fuzzy && body['confirm'] !== true) return { result: 'confirm', raw, answer: answers[hit.index]?.answer ?? raw };
    const a = hit ? answers[hit.index] : undefined;
    if (!hit || !a) return { result: 'rejected', raw };
    const tier = TIERS.find(x => x.id === a.tier) ?? bad('Answer has no tier', 500);
    const same = k.count('SELECT COUNT(*) AS n FROM practice_rounds WHERE prompt_id=? AND answer_text=? AND session<>?', s.round_prompt_id, a.answer, s.key);
    const after = finishRound(s, { outcome: 'answered', answer: a.answer, tier: a.tier, points: tier.points, fuzzy: hit.fuzzy });
    return { result: 'accepted', answer: a.answer, tier: tier.id, points: tier.points, fuzzy: hit.fuzzy, same, state: state(after) };
  });
}
