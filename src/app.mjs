// Application logic and JSON API. Transport-agnostic: handle({method, path, query, headers, body, ip}) -> response.
import { TIERS, buildIndex, matchAnswer, normalize, keysFor } from './match.mjs';
import { parsePack, toCsv, toText } from './packs.mjs';
import { hashPassword, verifyPassword, newToken, tokenHash, tempPassword, validUsername, validPassword } from './auth.mjs';
import { gameDate, addDays, weekday, isDate, weekStartOf, monthStartOf, dateEndsAt, serverTimeZone, validTimeZone } from './time.mjs';
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg, status = 400) => { throw new HttpError(status, msg); };

const GRACE_MS = 1500;
const SESSION_DAYS = 30;
const MAX_GUESSES_PER_ROUND = 40;
export const COOKIE = 'outlier_session';

export const DEFAULT_SETTINGS = {
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
};

const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const str = (v, max, name) => {
  if (typeof v !== 'string') bad(`${name} is required`);
  const s = v.trim();
  if (s.length > max) bad(`${name} is too long (max ${max})`);
  return s;
};

export function createApp({ db, now = () => Date.now(), random = Math.random, secure = false, log = () => {} }) {
  // ---------- settings ----------
  let settingsCache = null;
  function settings() {
    if (!settingsCache) {
      const s = { ...DEFAULT_SETTINGS };
      for (const { key, value } of db.all('SELECT key, value FROM settings')) if (key in s) s[key] = JSON.parse(value);
      settingsCache = s;
    }
    return settingsCache;
  }
  function saveSettings(patch) {
    const s = settings(), out = {};
    const num = (k, lo, hi) => { const v = Number(patch[k]); if (!Number.isInteger(v) || v < lo || v > hi) bad(`${k} must be a whole number from ${lo} to ${hi}`); out[k] = v; };
    for (const k of Object.keys(patch)) {
      if (!(k in DEFAULT_SETTINGS)) bad(`Unknown setting ${k}`);
      switch (k) {
        case 'siteName': out[k] = str(patch[k], 40, 'Site name') || 'Outlier'; break;
        case 'tagline': out[k] = str(patch[k], 120, 'Tagline'); break;
        case 'inviteCode': out[k] = str(patch[k], 60, 'Invite code'); break;
        case 'promptsPerDay': num(k, 1, 10); break;
        case 'roundSeconds': num(k, 10, 120); break;
        case 'dayStartHour': num(k, 0, 23); break;
        case 'weekStart': num(k, 0, 6); break;
        case 'timeZone': if (!validTimeZone(patch[k])) bad('Unknown time zone'); out[k] = patch[k]; break;
        case 'registration': if (!['open', 'code', 'closed'].includes(patch[k])) bad('registration must be open, code or closed'); out[k] = patch[k]; break;
        case 'activeWeekdays': {
          const v = patch[k];
          if (!Array.isArray(v) || !v.length || v.some(d => !Number.isInteger(d) || d < 0 || d > 6)) bad('Pick at least one weekday');
          out[k] = [...new Set(v)].sort(); break;
        }
        default: out[k] = !!patch[k];
      }
    }
    if ((out.registration ?? s.registration) === 'code' && !(out.inviteCode ?? s.inviteCode)) bad('Set an invite code to use invite-code registration');
    db.tx(() => { for (const [k, v] of Object.entries(out)) db.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v)); });
    settingsCache = null;
    return settings();
  }
  const today = () => { const s = settings(); return gameDate(now(), s.timeZone, s.dayStartHour); };
  const publicSettings = () => {
    const s = settings();
    return { siteName: s.siteName, tagline: s.tagline, roundSeconds: s.roundSeconds, promptsPerDay: s.promptsPerDay, registration: s.registration, archivePlay: s.archivePlay, weekStart: s.weekStart, tiers: TIERS.slice(1) };
  };

  // ---------- setup token ----------
  let setupToken = null;
  const hasAdmin = () => !!db.get("SELECT 1 AS x FROM users WHERE role='admin' AND disabled=0");
  function ensureSetupToken() { if (!hasAdmin() && !setupToken) setupToken = randomBytes(12).toString('base64url'); return hasAdmin() ? null : setupToken; }

  // ---------- answers index cache ----------
  const indexCache = new Map();
  function promptAnswers(promptId) {
    let c = indexCache.get(promptId);
    if (!c) {
      const answers = db.all('SELECT id, answer, tier, aliases FROM answers WHERE prompt_id=? ORDER BY id', promptId)
        .map(a => ({ ...a, aliases: JSON.parse(a.aliases) }));
      c = { answers, index: buildIndex(answers) };
      indexCache.set(promptId, c);
    }
    return c;
  }

  // ---------- users & sessions ----------
  const loginFailures = new Map();
  function userView(u) {
    return u && { id: u.id, username: u.username, displayName: u.display_name, team: u.team, role: u.role, mustChange: !!u.must_change, disabled: !!u.disabled };
  }
  function createSession(userId) {
    const token = newToken(), t = now();
    db.run('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)', tokenHash(token), userId, t, t + SESSION_DAYS * 86400_000);
    db.run('DELETE FROM sessions WHERE expires_at < ?', t);
    return token;
  }
  const cookie = (token, maxAge) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  function sessionUser(req) {
    const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]{20,})`));
    if (!m) return null;
    const t = now();
    const row = db.get('SELECT u.*, s.expires_at, s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?', tokenHash(m[1]));
    if (!row || row.expires_at < t || row.disabled) return null;
    if (!row.last_seen || t - row.last_seen > 60_000) {
      db.run('UPDATE users SET last_seen=? WHERE id=?', t, row.id);
      db.run('UPDATE sessions SET expires_at=? WHERE token_hash=?', t + SESSION_DAYS * 86400_000, row.token_hash);
    }
    return row;
  }
  function createUser({ username, displayName, team = '', password, role = 'player', mustChange = false }) {
    if (!validUsername(username)) bad('Username: 2-32 letters, numbers, dot, dash or underscore');
    if (!validPassword(password)) bad('Password must be at least 8 characters');
    const dn = str(displayName || username, 40, 'Display name') || username;
    const tm = str(team || '', 40, 'Team');
    if (db.get('SELECT 1 AS x FROM users WHERE username=?', username)) bad('That username is taken', 409);
    const r = db.run('INSERT INTO users(username,display_name,team,pass_hash,role,must_change,created_at) VALUES(?,?,?,?,?,?,?)',
      username, dn, tm, hashPassword(password), role, mustChange ? 1 : 0, now());
    return db.get('SELECT * FROM users WHERE id=?', r.lastInsertRowid);
  }

  // ---------- schedule ----------
  function dayRow(date) { return db.get('SELECT * FROM days WHERE date=?', date); }
  function dayPrompts(date) {
    return db.all('SELECT dp.position, p.id, p.text, p.category FROM day_prompts dp JOIN prompts p ON p.id=dp.prompt_id WHERE dp.date=? ORDER BY dp.position', date);
  }
  /** Pick n prompts: least-used first, random within ties, different categories where possible. */
  function pickPrompts(n, exclude = []) {
    const ex = new Set(exclude);
    const pool = db.all(`SELECT p.id, p.text, p.category, COUNT(dp.prompt_id) AS used
      FROM prompts p LEFT JOIN day_prompts dp ON dp.prompt_id=p.id
      WHERE p.retired=0 AND EXISTS (SELECT 1 FROM answers a WHERE a.prompt_id=p.id)
      GROUP BY p.id`).filter(p => !ex.has(p.id));
    shuffle(pool, random).sort((a, b) => a.used - b.used);
    const picked = [], cats = new Set();
    for (const p of pool) { if (picked.length >= n) break; if (!cats.has(p.category)) { picked.push(p); cats.add(p.category); } }
    for (const p of pool) { if (picked.length >= n) break; if (!picked.includes(p)) picked.push(p); }
    return picked;
  }
  function setDay(date, promptIds, auto = false) {
    db.tx(() => {
      db.run('DELETE FROM day_prompts WHERE date=?', date);
      db.run('INSERT INTO days(date,auto,created_at) VALUES(?,?,?) ON CONFLICT(date) DO UPDATE SET auto=excluded.auto', date, auto ? 1 : 0, now());
      promptIds.forEach((id, i) => db.run('INSERT INTO day_prompts(date,position,prompt_id) VALUES(?,?,?)', date, i, id));
    });
  }
  function autoCreate(date) {
    const picked = pickPrompts(settings().promptsPerDay);
    if (!picked.length) return false;
    setDay(date, picked.map(p => p.id), true);
    log(`Scheduled ${date} automatically: ${picked.map(p => p.id).join(', ')}`);
    return true;
  }
  /** The prompts for a date, creating today's puzzle on demand. */
  function ensureDay(date) {
    if (!dayRow(date)) {
      const s = settings();
      if (date !== today() || !s.autoSchedule || !s.activeWeekdays.includes(weekday(date))) return null;
      db.tx(() => { if (!dayRow(date)) autoCreate(date); });
    }
    const prompts = dayPrompts(date);
    return prompts.length ? prompts : null;
  }
  const dayNumber = date => db.get('SELECT COUNT(*) AS n FROM days WHERE date<=?', date).n;

  // ---------- runs ----------
  const getRun = (userId, date) => db.get('SELECT * FROM runs WHERE user_id=? AND date=?', userId, date);
  function finishRound(run, prompts, fields) {
    const t = now();
    const ms = Math.max(0, Math.min(t - run.round_started_at, settings().roundSeconds * 1000));
    db.tx(() => {
      db.run(`INSERT INTO rounds(run_id,position,prompt_id,answer_id,answer_text,raw,tier,points,fuzzy,ms,outcome,ended_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        run.id, run.position, prompts[run.position].id, fields.answerId ?? null, fields.answerText ?? null, fields.raw ?? null,
        fields.tier ?? 0, fields.points ?? 0, fields.fuzzy ? 1 : 0, fields.outcome === 'answered' ? ms : settings().roundSeconds * 1000, fields.outcome, t);
      const nextPos = run.position + 1;
      db.run('UPDATE runs SET position=?, round_started_at=NULL, score=score+?, total_ms=total_ms+?, finished_at=? WHERE id=?',
        nextPos, fields.points ?? 0, fields.outcome === 'answered' ? ms : settings().roundSeconds * 1000, nextPos >= prompts.length ? t : null, run.id);
    });
    return db.get('SELECT * FROM runs WHERE id=?', run.id);
  }
  function settle(run, prompts) {
    if (run.round_started_at && !run.finished_at && now() > run.round_started_at + settings().roundSeconds * 1000 + GRACE_MS)
      return finishRound(run, prompts, { outcome: 'timeout' });
    return run;
  }
  function runState(run, prompts) {
    const s = settings();
    const rounds = db.all('SELECT position, answer_text AS answer, tier, points, outcome, fuzzy FROM rounds WHERE run_id=? ORDER BY position', run.id);
    const state = {
      date: run.date, dayNumber: dayNumber(run.date), mode: run.mode, total: prompts.length, position: run.position,
      score: run.score, finished: !!run.finished_at, roundSeconds: s.roundSeconds, serverNow: now(), rounds, current: null,
    };
    if (run.round_started_at && !run.finished_at) {
      const p = prompts[run.position];
      state.current = { position: run.position, text: p.text, category: p.category, startedAt: run.round_started_at, deadline: run.round_started_at + s.roundSeconds * 1000 };
    } else if (!run.finished_at) {
      state.upNext = { position: run.position, category: prompts[run.position].category };
    }
    return state;
  }
  function loadRun(user, date, { create = false } = {}) {
    if (!isDate(date)) bad('Bad date');
    const t = today();
    if (date > t) bad('That day has not started yet', 403);
    const prompts = ensureDay(date);
    if (!prompts) bad(date === t ? 'There is no puzzle today.' : 'No puzzle was played on that day.', 404);
    let run = getRun(user.id, date);
    if (!run) {
      if (!create) bad('Not started', 404);
      if (date < t && !settings().archivePlay) bad('Archive play is turned off', 403);
      db.run('INSERT OR IGNORE INTO runs(user_id,date,mode,started_at) VALUES(?,?,?,?)', user.id, date, date === t ? 'live' : 'archive', now());
      run = getRun(user.id, date);
    }
    return { run: settle(run, prompts), prompts };
  }

  // ---------- reveal / popularity ----------
  function reveal(date, user) {
    const prompts = dayPrompts(date);
    if (!prompts.length) bad('No puzzle on that day', 404);
    const players = db.get('SELECT COUNT(*) AS n FROM runs WHERE date=? AND finished_at IS NOT NULL', date).n;
    const mine = user ? getRun(user.id, date) : null;
    const myRounds = mine ? db.all('SELECT * FROM rounds WHERE run_id=?', mine.id) : [];
    return {
      date, dayNumber: dayNumber(date), players,
      prompts: prompts.map(p => {
        const counts = new Map(db.all(`SELECT r.answer_id AS id, COUNT(*) AS n FROM rounds r JOIN runs u ON u.id=r.run_id
          WHERE u.date=? AND r.position=? AND r.answer_id IS NOT NULL GROUP BY r.answer_id`, date, p.position).map(r => [r.id, r.n]));
        const missed = db.get(`SELECT COUNT(*) AS n FROM rounds r JOIN runs u ON u.id=r.run_id WHERE u.date=? AND r.position=? AND r.points=0`, date, p.position).n;
        const mr = myRounds.find(r => r.position === p.position);
        const { answers } = promptAnswers(p.id);
        return {
          position: p.position, text: p.text, category: p.category, missed,
          mine: mr ? { answer: mr.answer_text, raw: mr.raw, tier: mr.tier, points: mr.points, outcome: mr.outcome, same: mr.answer_id ? (counts.get(mr.answer_id) || 1) - 1 : 0 } : null,
          answers: answers.map(a => ({ answer: a.answer, tier: a.tier, count: counts.get(a.id) || 0 }))
            .sort((x, y) => y.count - x.count || x.tier - y.tier || x.answer.localeCompare(y.answer)),
        };
      }),
    };
  }

  // ---------- retro-award: zero-point rounds whose rejected guess now matches ----------
  function retroAward(promptId) {
    const { answers, index } = promptAnswers(promptId);
    const typos = settings().typoTolerance;
    let awarded = 0;
    const rows = db.all('SELECT r.run_id, r.position FROM rounds r WHERE r.prompt_id=? AND r.points=0', promptId);
    db.tx(() => {
      for (const r of rows) {
        const guesses = db.all('SELECT raw FROM guesses WHERE run_id=? AND position=? AND accepted=0 ORDER BY at', r.run_id, r.position);
        for (const g of guesses) {
          const m = matchAnswer(index, g.raw, { typos });
          if (!m) continue;
          const a = answers[m.index], pts = TIERS[a.tier].points;
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
  function streaks(userIds) {
    const t = today();
    const scheduled = db.all('SELECT date FROM days WHERE date<=? ORDER BY date', t).map(r => r.date);
    const done = new Map();
    for (const r of db.all("SELECT user_id, date FROM runs WHERE mode='live' AND finished_at IS NOT NULL")) {
      if (!done.has(r.user_id)) done.set(r.user_id, new Set());
      done.get(r.user_id).add(r.date);
    }
    const out = new Map();
    for (const id of userIds) {
      const set = done.get(id) || new Set();
      let best = 0, run = 0;
      for (const d of scheduled) { if (set.has(d)) { run++; best = Math.max(best, run); } else if (d !== t) run = 0; }
      let current = 0;
      for (let i = scheduled.length - 1; i >= 0; i--) {
        const d = scheduled[i];
        if (set.has(d)) current++;
        else if (d === t) continue;
        else break;
      }
      out.set(id, { current, best, playedToday: set.has(t) });
    }
    return out;
  }

  // ---------- leaderboards ----------
  function periodRange(period, date) {
    const s = settings();
    if (period === 'week') return [weekStartOf(date, s.weekStart), date];
    if (period === 'month') return [monthStartOf(date), date];
    if (period === 'all') return ['0000-01-01', date];
    return [date, date];
  }
  function leaderboard(period, date) {
    const t = today();
    if (!isDate(date) || date > t) date = t;
    if (period === 'streak') {
      const users = db.all('SELECT id, display_name, team FROM users WHERE disabled=0');
      const st = streaks(users.map(u => u.id));
      return { period, date, rows: users.map(u => ({ userId: u.id, name: u.display_name, team: u.team, ...st.get(u.id) }))
        .filter(r => r.current > 0 || r.best > 0).sort((a, b) => b.current - a.current || b.best - a.best || a.name.localeCompare(b.name)) };
    }
    if (period === 'day') {
      const rows = db.all(`SELECT u.id AS userId, u.display_name AS name, u.team, r.score, r.total_ms AS ms,
          (SELECT COUNT(*) FROM rounds x WHERE x.run_id=r.id AND x.tier=5) AS outliers
        FROM runs r JOIN users u ON u.id=r.user_id
        WHERE r.date=? AND r.mode='live' AND r.finished_at IS NOT NULL ORDER BY r.score DESC, r.total_ms ASC`, date);
      return { period, date, rows };
    }
    if (period === 'teams') {
      const [from, to] = periodRange('week', date);
      const rows = db.all(`SELECT u.team, COUNT(DISTINCT u.id) AS players, COUNT(*) AS games, SUM(r.score) AS points, ROUND(AVG(r.score)) AS avg
        FROM runs r JOIN users u ON u.id=r.user_id
        WHERE r.mode='live' AND r.finished_at IS NOT NULL AND r.date BETWEEN ? AND ? AND u.team<>''
        GROUP BY u.team ORDER BY avg DESC, points DESC`, from, to);
      return { period, date, from, to, rows };
    }
    const [from, to] = periodRange(period, date);
    const rows = db.all(`SELECT u.id AS userId, u.display_name AS name, u.team, SUM(r.score) AS points, COUNT(*) AS games,
        ROUND(AVG(r.score)) AS avg, MAX(r.score) AS best, SUM(r.total_ms) AS ms
      FROM runs r JOIN users u ON u.id=r.user_id
      WHERE r.mode='live' AND r.finished_at IS NOT NULL AND r.date BETWEEN ? AND ?
      GROUP BY u.id ORDER BY points DESC, ms ASC`, from, to);
    return { period, date, from, to, rows };
  }

  // ---------- stats ----------
  function myStats(user) {
    const st = streaks([user.id]).get(user.id);
    const agg = db.get(`SELECT COUNT(*) AS games, COALESCE(SUM(score),0) AS points, COALESCE(MAX(score),0) AS bestScore, COALESCE(ROUND(AVG(score)),0) AS avg
      FROM runs WHERE user_id=? AND mode='live' AND finished_at IS NOT NULL`, user.id);
    const tiers = [0, 0, 0, 0, 0, 0];
    for (const r of db.all(`SELECT x.tier, COUNT(*) AS n FROM rounds x JOIN runs r ON r.id=x.run_id WHERE r.user_id=? AND r.mode='live' GROUP BY x.tier`, user.id)) tiers[r.tier] = r.n;
    const history = db.all(`SELECT r.date, r.mode, r.score, r.finished_at IS NOT NULL AS finished,
        (SELECT COUNT(*)+1 FROM runs o WHERE o.date=r.date AND o.mode='live' AND o.finished_at IS NOT NULL AND (o.score>r.score OR (o.score=r.score AND o.total_ms<r.total_ms))) AS rank,
        (SELECT COUNT(*) FROM runs o WHERE o.date=r.date AND o.mode='live' AND o.finished_at IS NOT NULL) AS players
      FROM runs r WHERE r.user_id=? ORDER BY r.date DESC LIMIT 60`, user.id);
    return { ...agg, streak: st, tiers: { missed: tiers[0], ...Object.fromEntries(TIERS.slice(1).map(t => [t.name, tiers[t.id]])) }, history };
  }

  // ---------- prompts (admin) ----------
  function checkAnswers(answers) {
    const owner = new Map();
    answers.forEach((a, i) => {
      for (const text of [a.answer, ...(a.aliases || [])]) for (const k of keysFor(text)) {
        if (owner.has(k) && owner.get(k) !== i) bad(`"${text}" is the same as "${answers[owner.get(k)].answer}" after ignoring case, accents and punctuation`);
        owner.set(k, i);
      }
    });
  }
  function cleanPromptInput(b) {
    const text = str(b.text, 200, 'Prompt'); if (text.length < 5) bad('Prompt is too short');
    const category = str(b.category || 'General', 40, 'Category') || 'General';
    if (!Array.isArray(b.answers) || !b.answers.length) bad('Add at least one answer');
    if (b.answers.length > 1000) bad('Too many answers');
    const answers = b.answers.map(a => {
      const answer = str(a.answer, 100, 'Answer');
      if (!answer) bad('Empty answer');
      const tier = Number(a.tier);
      if (!(tier >= 1 && tier <= 5 && Number.isInteger(tier))) bad(`"${answer}" needs a tier 1-5`);
      const aliases = (Array.isArray(a.aliases) ? a.aliases : String(a.aliases || '').split('|')).map(x => String(x).trim()).filter(Boolean).slice(0, 20);
      return { id: Number.isInteger(a.id) ? a.id : null, answer, tier, aliases };
    });
    checkAnswers(answers);
    return { text, category, answers };
  }
  function savePrompt(id, input, pack = '') {
    const t = now();
    return db.tx(() => {
      const dupe = db.get('SELECT id FROM prompts WHERE text=? COLLATE NOCASE', input.text);
      if (dupe && dupe.id !== id) bad('A prompt with that text already exists', 409);
      if (id == null) {
        id = Number(db.run('INSERT INTO prompts(text,category,pack,created_at,updated_at) VALUES(?,?,?,?,?)', input.text, input.category, pack, t, t).lastInsertRowid);
      } else {
        if (!db.get('SELECT 1 AS x FROM prompts WHERE id=?', id)) bad('Prompt not found', 404);
        db.run('UPDATE prompts SET text=?, category=?, updated_at=? WHERE id=?', input.text, input.category, t, id);
      }
      const existing = new Set(db.all('SELECT id FROM answers WHERE prompt_id=?', id).map(r => r.id));
      const keep = new Set();
      for (const a of input.answers) {
        if (a.id && existing.has(a.id)) {
          db.run('UPDATE answers SET answer=?, tier=?, aliases=? WHERE id=?', a.answer, a.tier, JSON.stringify(a.aliases), a.id);
          keep.add(a.id);
        } else db.run('INSERT INTO answers(prompt_id,answer,tier,aliases) VALUES(?,?,?,?)', id, a.answer, a.tier, JSON.stringify(a.aliases));
      }
      for (const old of existing) if (!keep.has(old)) db.run('DELETE FROM answers WHERE id=?', old);
      indexCache.delete(id);
      const awarded = retroAward(id);
      return { id, awarded };
    });
  }
  function promptFull(id) {
    const p = db.get('SELECT * FROM prompts WHERE id=?', id);
    if (!p) bad('Prompt not found', 404);
    return { id: p.id, text: p.text, category: p.category, pack: p.pack, retired: !!p.retired,
      used: db.all('SELECT date FROM day_prompts WHERE prompt_id=? ORDER BY date', id).map(r => r.date),
      answers: promptAnswers(id).answers.map(a => ({ id: a.id, answer: a.answer, tier: a.tier, aliases: a.aliases })) };
  }
  function importPack(content, name, { mode = 'skip', dryRun = false, pack = '' } = {}) {
    let parsed;
    try { parsed = parsePack(String(content), name); } catch (e) { bad(`Could not read the file: ${e.message}`); }
    const result = { title: parsed.title, total: parsed.prompts.length, added: 0, updated: 0, skipped: 0, errors: [] };
    const packName = pack || parsed.title || name.replace(/\.[^.]+$/, '');
    const work = () => {
      for (const p of parsed.prompts) {
        try {
          const input = cleanPromptInput(p);
          const ex = db.get('SELECT id FROM prompts WHERE text=? COLLATE NOCASE', input.text);
          if (ex && mode !== 'update') { result.skipped++; continue; }
          if (ex) {
            const cur = promptAnswers(ex.id).answers;
            const byKey = new Map(cur.map(a => [normalize(a.answer), a]));
            const merged = cur.map(a => ({ ...a }));
            for (const a of input.answers) {
              const hit = byKey.get(normalize(a.answer));
              if (hit) { const m = merged.find(x => x.id === hit.id); m.tier = a.tier; m.aliases = [...new Set([...m.aliases, ...a.aliases])]; }
              else merged.push(a);
            }
            checkAnswers(merged);
            if (!dryRun) savePrompt(ex.id, { text: input.text, category: input.category, answers: merged });
            result.updated++;
          } else {
            if (!dryRun) savePrompt(null, input, packName);
            result.added++;
          }
        } catch (e) { result.errors.push(`"${p.text}": ${e.message}`); }
      }
    };
    db.tx(work);
    return result;
  }

  // ---------- routing ----------
  const routes = [];
  const route = (method, pattern, auth, fn) => routes.push({ method, re: new RegExp(`^${pattern}$`), auth, fn });

  // Auth & profile
  route('GET', '/api/me', null, ({ user }) => ({
    user: userView(user), settings: publicSettings(), needsSetup: !hasAdmin(), today: today(),
  }));
  route('POST', '/api/login', null, ({ body, ip }) => {
    const username = String(body.username || '').trim(), key = `${ip}|${username.toLowerCase()}`, t = now();
    const f = loginFailures.get(key);
    if (f && f.count >= 8 && t - f.first < 15 * 60_000) bad('Too many attempts. Wait 15 minutes or ask an admin to reset your password.', 429);
    const u = db.get('SELECT * FROM users WHERE username=?', username);
    if (!u || !verifyPassword(String(body.password || ''), u.pass_hash) || u.disabled) {
      const cur = f && t - f.first < 15 * 60_000 ? f : { count: 0, first: t };
      cur.count++; loginFailures.set(key, cur);
      bad(u?.disabled ? 'This account is disabled.' : 'Wrong username or password.', 401);
    }
    loginFailures.delete(key);
    return { $cookie: cookie(createSession(u.id), SESSION_DAYS * 86400), user: userView(u) };
  });
  route('POST', '/api/logout', null, ({ req }) => {
    const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`));
    if (m) db.run('DELETE FROM sessions WHERE token_hash=?', tokenHash(m[1]));
    return { $cookie: cookie('', 0), ok: true };
  });
  route('POST', '/api/register', null, ({ body }) => {
    const s = settings();
    if (s.registration === 'closed') bad('Sign-up is closed. Ask an admin for an account.', 403);
    if (s.registration === 'code' && String(body.inviteCode || '').trim() !== s.inviteCode) bad('Wrong invite code.', 403);
    if (!hasAdmin()) bad('Finish the first-time setup first.', 403);
    const u = createUser({ username: String(body.username || '').trim(), displayName: body.displayName, team: body.team, password: body.password });
    return { $cookie: cookie(createSession(u.id), SESSION_DAYS * 86400), user: userView(u) };
  });
  route('POST', '/api/setup', null, ({ body }) => {
    if (hasAdmin()) bad('Setup is already done.', 403);
    if (!setupToken || String(body.token || '') !== setupToken) bad('Wrong setup code. It is printed in the server window.', 403);
    const u = createUser({ username: String(body.username || '').trim(), displayName: body.displayName, team: body.team, password: body.password, role: 'admin' });
    setupToken = null;
    return { $cookie: cookie(createSession(u.id), SESSION_DAYS * 86400), user: userView(u) };
  });
  route('POST', '/api/password', 'user', ({ user, body }) => {
    if (!verifyPassword(String(body.current || ''), user.pass_hash)) bad('Current password is wrong.', 403);
    if (!validPassword(body.next)) bad('New password must be at least 8 characters');
    db.run('UPDATE users SET pass_hash=?, must_change=0 WHERE id=?', hashPassword(body.next), user.id);
    db.run('DELETE FROM sessions WHERE user_id=?', user.id);
    return { $cookie: cookie(createSession(user.id), SESSION_DAYS * 86400), ok: true };
  });
  route('POST', '/api/profile', 'user', ({ user, body }) => {
    const dn = str(body.displayName ?? user.display_name, 40, 'Display name'); if (!dn) bad('Display name is required');
    db.run('UPDATE users SET display_name=?, team=? WHERE id=?', dn, str(body.team ?? user.team, 40, 'Team'), user.id);
    return { user: userView(db.get('SELECT * FROM users WHERE id=?', user.id)) };
  });

  // Game
  route('GET', '/api/today', 'user', ({ user }) => {
    const s = settings(), t = today(), prompts = ensureDay(t);
    const run = prompts ? getRun(user.id, t) : null;
    const settled = run ? settle(run, prompts) : null;
    const st = streaks([user.id]).get(user.id);
    return {
      date: t, dayNumber: prompts ? dayNumber(t) : null, available: !!prompts, promptCount: prompts?.length || 0,
      categories: prompts ? prompts.map(p => p.category) : [], roundSeconds: s.roundSeconds,
      endsAt: dateEndsAt(t, s.timeZone, s.dayStartHour), serverNow: now(),
      players: db.get("SELECT COUNT(*) AS n FROM runs WHERE date=? AND mode='live' AND finished_at IS NOT NULL", t).n,
      status: !settled ? 'new' : settled.finished_at ? 'done' : 'playing',
      score: settled?.score ?? null, streak: st,
    };
  });
  route('POST', '/api/play/(\\d{4}-\\d{2}-\\d{2})/start', 'user', ({ user, m }) => { const { run, prompts } = loadRun(user, m[1], { create: true }); return runState(run, prompts); });
  route('GET', '/api/play/(\\d{4}-\\d{2}-\\d{2})', 'user', ({ user, m }) => { const { run, prompts } = loadRun(user, m[1]); return runState(run, prompts); });
  route('POST', '/api/play/(\\d{4}-\\d{2}-\\d{2})/next', 'user', ({ user, m }) => {
    let { run, prompts } = loadRun(user, m[1]);
    if (!run.finished_at && !run.round_started_at) {
      db.run('UPDATE runs SET round_started_at=? WHERE id=? AND round_started_at IS NULL', now(), run.id);
      run = db.get('SELECT * FROM runs WHERE id=?', run.id);
    }
    return runState(run, prompts);
  });
  route('POST', '/api/play/(\\d{4}-\\d{2}-\\d{2})/guess', 'user', ({ user, m, body }) => {
    const { run, prompts } = loadRun(user, m[1]);
    if (run.finished_at) return { result: 'finished', state: runState(run, prompts) };
    if (!run.round_started_at) return { result: 'expired', state: runState(run, prompts) };
    const raw = String(body.text ?? '').trim().slice(0, 100);
    if (!raw || !normalize(raw)) bad('Type an answer');
    const prompt = prompts[run.position];
    const count = db.get('SELECT COUNT(*) AS n FROM guesses WHERE run_id=? AND position=?', run.id, run.position).n;
    if (count >= MAX_GUESSES_PER_ROUND) bad('That is a lot of guesses for one round.', 429);
    const { answers, index } = promptAnswers(prompt.id);
    const hit = matchAnswer(index, raw, { typos: settings().typoTolerance });
    db.run('INSERT INTO guesses(run_id,position,prompt_id,raw,norm,accepted,at) VALUES(?,?,?,?,?,?,?)', run.id, run.position, prompt.id, raw, normalize(raw), hit ? 1 : 0, now());
    if (!hit) return { result: 'rejected', raw };
    const a = answers[hit.index], points = TIERS[a.tier].points;
    const after = finishRound(run, prompts, { outcome: 'answered', answerId: a.id, answerText: a.answer, raw, tier: a.tier, points, fuzzy: hit.fuzzy });
    const same = db.get(`SELECT COUNT(*) AS n FROM rounds r JOIN runs u ON u.id=r.run_id WHERE u.date=? AND r.position=? AND r.answer_id=? AND r.run_id<>?`, run.date, run.position, a.id, run.id).n;
    return { result: 'accepted', answer: a.answer, tier: a.tier, points, fuzzy: hit.fuzzy, same, state: runState(after, prompts) };
  });
  route('POST', '/api/play/(\\d{4}-\\d{2}-\\d{2})/skip', 'user', ({ user, m }) => {
    let { run, prompts } = loadRun(user, m[1]);
    if (run.round_started_at && !run.finished_at) run = finishRound(run, prompts, { outcome: 'skipped' });
    return runState(run, prompts);
  });
  route('GET', '/api/reveal/(\\d{4}-\\d{2}-\\d{2})', 'user', ({ user, m }) => {
    const date = m[1], run = getRun(user.id, date);
    if (!(date < today() || run?.finished_at)) bad('Answers are revealed when you finish or when the day is over.', 403);
    return reveal(date, user);
  });
  route('GET', '/api/archive', 'user', ({ user }) => {
    const t = today();
    ensureDay(t);
    const rows = db.all(`SELECT d.date,
        (SELECT COUNT(*) FROM days x WHERE x.date<=d.date) AS dayNumber,
        (SELECT GROUP_CONCAT(p.category, '|') FROM day_prompts dp JOIN prompts p ON p.id=dp.prompt_id WHERE dp.date=d.date) AS cats,
        (SELECT COUNT(*) FROM runs r WHERE r.date=d.date AND r.mode='live' AND r.finished_at IS NOT NULL) AS players,
        (SELECT MAX(score) FROM runs r WHERE r.date=d.date AND r.mode='live' AND r.finished_at IS NOT NULL) AS top,
        m.mode, m.score, m.finished_at IS NOT NULL AS finished
      FROM days d LEFT JOIN runs m ON m.date=d.date AND m.user_id=?
      WHERE d.date<=? ORDER BY d.date DESC`, user.id, t);
    return { today: t, archivePlay: settings().archivePlay, days: rows.map(r => ({ ...r, cats: [...new Set((r.cats || '').split('|').filter(Boolean))], finished: !!r.finished })) };
  });
  route('GET', '/api/leaderboard', 'user', ({ query }) => leaderboard(query.get('period') || 'day', query.get('date') || today()));
  route('GET', '/api/stats', 'user', ({ user }) => myStats(user));

  // ---------- admin ----------
  route('GET', '/api/admin/overview', 'admin', () => {
    const t = today(), s = settings();
    const bank = db.get('SELECT COUNT(*) AS n FROM prompts WHERE retired=0').n;
    const unused = db.get('SELECT COUNT(*) AS n FROM prompts p WHERE retired=0 AND NOT EXISTS (SELECT 1 FROM day_prompts dp WHERE dp.prompt_id=p.id)').n;
    return {
      today: t, users: db.get('SELECT COUNT(*) AS n FROM users').n,
      activeWeek: db.get('SELECT COUNT(*) AS n FROM users WHERE last_seen>?', now() - 7 * 86400_000).n,
      playersToday: db.get("SELECT COUNT(*) AS n FROM runs WHERE date=? AND mode='live' AND finished_at IS NOT NULL", t).n,
      startedToday: db.get("SELECT COUNT(*) AS n FROM runs WHERE date=? AND mode='live'", t).n,
      bank, unused, daysLeft: Math.floor(unused / s.promptsPerDay),
      scheduledAhead: db.get('SELECT COUNT(*) AS n FROM days WHERE date>?', t).n,
      misses: listMisses().length,
      todayPrompts: dayPrompts(t),
      participation: db.all(`SELECT d.date, (SELECT COUNT(*) FROM runs r WHERE r.date=d.date AND r.mode='live' AND r.finished_at IS NOT NULL) AS players
        FROM days d WHERE d.date<=? ORDER BY d.date DESC LIMIT 14`, t).reverse(),
    };
  });
  route('GET', '/api/admin/prompts', 'admin', () => ({
    prompts: db.all(`SELECT p.id, p.text, p.category, p.pack, p.retired,
        (SELECT COUNT(*) FROM answers a WHERE a.prompt_id=p.id) AS answers,
        (SELECT COUNT(*) FROM day_prompts dp WHERE dp.prompt_id=p.id) AS used,
        (SELECT MAX(date) FROM day_prompts dp WHERE dp.prompt_id=p.id) AS lastUsed
      FROM prompts p ORDER BY p.id DESC`).map(p => ({ ...p, retired: !!p.retired })),
    categories: db.all('SELECT category, COUNT(*) AS n FROM prompts GROUP BY category ORDER BY category'),
  }));
  route('GET', '/api/admin/prompts/(\\d+)', 'admin', ({ m }) => promptFull(Number(m[1])));
  route('POST', '/api/admin/prompts', 'admin', ({ body }) => savePrompt(null, cleanPromptInput(body), 'custom'));
  route('PUT', '/api/admin/prompts/(\\d+)', 'admin', ({ m, body }) => {
    const id = Number(m[1]);
    if (typeof body.retired === 'boolean' && !body.answers) {
      db.run('UPDATE prompts SET retired=?, updated_at=? WHERE id=?', body.retired ? 1 : 0, now(), id);
      return { id };
    }
    return savePrompt(id, cleanPromptInput(body));
  });
  route('DELETE', '/api/admin/prompts/(\\d+)', 'admin', ({ m }) => {
    const id = Number(m[1]);
    if (db.get('SELECT 1 AS x FROM day_prompts WHERE prompt_id=?', id)) {
      db.run('UPDATE prompts SET retired=1 WHERE id=?', id);
      return { id, retired: true };
    }
    db.run('DELETE FROM prompts WHERE id=?', id); indexCache.delete(id);
    return { id, deleted: true };
  });
  route('POST', '/api/admin/import', 'admin', ({ body }) =>
    importPack(body.content, String(body.name || 'upload.txt'), { mode: body.mode === 'update' ? 'update' : 'skip', dryRun: !!body.dryRun }));
  route('GET', '/api/admin/export', 'admin', ({ query }) => {
    const ids = db.all(`SELECT id FROM prompts ${query.get('all') === '1' ? '' : 'WHERE retired=0'} ORDER BY category, id`).map(r => r.id);
    const prompts = ids.map(id => { const p = promptFull(id); return { text: p.text, category: p.category, answers: p.answers.map(({ answer, tier, aliases }) => ({ answer, tier, ...(aliases.length ? { aliases } : {}) })) }; });
    const fmt = query.get('format') || 'json', stamp = today();
    if (fmt === 'csv') return { $file: { name: `outlier-bank-${stamp}.csv`, type: 'text/csv; charset=utf-8', data: '﻿' + toCsv(prompts) } };
    if (fmt === 'txt') return { $file: { name: `outlier-bank-${stamp}.txt`, type: 'text/plain; charset=utf-8', data: toText(prompts, `${settings().siteName} bank ${stamp}`) } };
    return { $file: { name: `outlier-bank-${stamp}.json`, type: 'application/json', data: JSON.stringify({ title: `${settings().siteName} bank ${stamp}`, prompts }, null, 1) } };
  });

  route('GET', '/api/admin/schedule', 'admin', ({ query }) => {
    const t = today();
    const from = isDate(query.get('from')) ? query.get('from') : addDays(t, -14);
    const to = isDate(query.get('to')) ? query.get('to') : addDays(t, 42);
    const days = db.all('SELECT date, auto FROM days WHERE date BETWEEN ? AND ? ORDER BY date', from, to).map(d => ({
      ...d, auto: !!d.auto, prompts: dayPrompts(d.date),
      runs: db.get('SELECT COUNT(*) AS n FROM runs WHERE date=?', d.date).n,
    }));
    return { today: t, from, to, activeWeekdays: settings().activeWeekdays, promptsPerDay: settings().promptsPerDay, days };
  });
  route('GET', '/api/admin/schedule/suggest', 'admin', ({ query }) => {
    const exclude = (query.get('exclude') || '').split(',').map(Number).filter(Boolean);
    return { prompts: pickPrompts(Number(query.get('n')) || settings().promptsPerDay, exclude) };
  });
  route('PUT', '/api/admin/schedule/(\\d{4}-\\d{2}-\\d{2})', 'admin', ({ m, body }) => {
    const date = m[1];
    if (!isDate(date)) bad('Bad date');
    if (date < today()) bad('You can only schedule today or later.');
    const runs = db.get('SELECT COUNT(*) AS n FROM runs WHERE date=?', date).n;
    if (runs) bad(`${runs} player(s) already started this day, so it can't be changed.`, 409);
    const ids = body.promptIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 10) bad('Pick 1 to 10 prompts');
    if (new Set(ids).size !== ids.length) bad('The same prompt is picked twice');
    for (const id of ids) if (!db.get('SELECT 1 AS x FROM prompts WHERE id=? AND EXISTS (SELECT 1 FROM answers a WHERE a.prompt_id=prompts.id)', id)) bad(`Prompt ${id} not found or has no answers`);
    setDay(date, ids, false);
    return { date, prompts: dayPrompts(date) };
  });
  route('DELETE', '/api/admin/schedule/(\\d{4}-\\d{2}-\\d{2})', 'admin', ({ m }) => {
    const date = m[1];
    const runs = db.get('SELECT COUNT(*) AS n FROM runs WHERE date=?', date).n;
    if (runs) bad(`${runs} player(s) already played this day, so it can't be removed.`, 409);
    if (date < today()) bad('Past days without players have nothing to remove.');
    db.run('DELETE FROM days WHERE date=?', date);
    return { date, removed: true };
  });
  route('POST', '/api/admin/schedule/autofill', 'admin', ({ body }) => {
    const s = settings(), t = today();
    let date = isDate(body.from) && body.from >= t ? body.from : t;
    const count = Math.min(Math.max(Number(body.days) || 14, 1), 120);
    const created = [];
    db.tx(() => {
      for (let i = 0; i < count; i++, date = addDays(date, 1)) {
        if (!s.activeWeekdays.includes(weekday(date)) || dayRow(date)) continue;
        if (autoCreate(date)) created.push(date);
      }
    });
    return { created };
  });

  function listMisses() {
    const rows = db.all(`SELECT g.prompt_id AS promptId, p.text AS prompt, g.norm, MIN(g.raw) AS raw, COUNT(*) AS guesses, COUNT(DISTINCT r.user_id) AS players, MAX(g.at) AS lastAt
      FROM guesses g JOIN runs r ON r.id=g.run_id JOIN prompts p ON p.id=g.prompt_id
      WHERE g.accepted=0 AND NOT EXISTS (SELECT 1 FROM dismissed d WHERE d.prompt_id=g.prompt_id AND d.norm=g.norm)
      GROUP BY g.prompt_id, g.norm ORDER BY players DESC, guesses DESC, lastAt DESC LIMIT 500`);
    return rows.filter(r => !matchAnswer(promptAnswers(r.promptId).index, r.raw, { typos: false }));
  }
  route('GET', '/api/admin/misses', 'admin', () => ({ misses: listMisses() }));
  route('POST', '/api/admin/misses/accept', 'admin', ({ body }) => {
    const p = promptFull(Number(body.promptId));
    const text = str(body.text, 100, 'Answer'); if (!text) bad('Answer is required');
    const answers = p.answers.map(a => ({ ...a }));
    if (body.aliasOf) {
      const target = answers.find(a => a.id === Number(body.aliasOf)); if (!target) bad('Answer not found', 404);
      target.aliases = [...target.aliases, text];
    } else answers.push({ answer: text, tier: Number(body.tier), aliases: [] });
    return savePrompt(p.id, cleanPromptInput({ text: p.text, category: p.category, answers }));
  });
  route('POST', '/api/admin/misses/dismiss', 'admin', ({ body }) => {
    db.run('INSERT OR IGNORE INTO dismissed(prompt_id,norm) VALUES(?,?)', Number(body.promptId), String(body.norm || ''));
    return { ok: true };
  });

  route('GET', '/api/admin/users', 'admin', () => ({
    users: db.all(`SELECT u.*, (SELECT COUNT(*) FROM runs r WHERE r.user_id=u.id AND r.mode='live' AND r.finished_at IS NOT NULL) AS games,
      (SELECT COALESCE(SUM(score),0) FROM runs r WHERE r.user_id=u.id AND r.mode='live') AS points
      FROM users u ORDER BY u.display_name COLLATE NOCASE`).map(u => ({ ...userView(u), games: u.games, points: u.points, lastSeen: u.last_seen, createdAt: u.created_at })),
  }));
  route('POST', '/api/admin/users', 'admin', ({ body }) => {
    const lines = typeof body.bulk === 'string' ? body.bulk.split(/\r?\n/).map(l => l.trim()).filter(Boolean) : null;
    const make = ({ username, displayName, team, role }) => {
      const password = tempPassword();
      const u = createUser({ username, displayName, team, role: role === 'admin' ? 'admin' : 'player', password, mustChange: true });
      return { username: u.username, displayName: u.display_name, password };
    };
    if (lines) {
      const created = [], errors = [];
      db.tx(() => {
        for (const l of lines.slice(0, 500)) {
          const [username, displayName, team] = l.split(/[,\t;]/).map(s => s.trim());
          try { created.push(make({ username, displayName, team })); } catch (e) { errors.push(`${username}: ${e.message}`); }
        }
      });
      return { created, errors };
    }
    return { created: [make(body)], errors: [] };
  });
  function lastAdminGuard(id, becomesNonAdmin) {
    const u = db.get('SELECT * FROM users WHERE id=?', id);
    if (!u) bad('User not found', 404);
    if (becomesNonAdmin && u.role === 'admin' && db.get("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND disabled=0").n <= 1) bad('Keep at least one active admin.');
    return u;
  }
  route('PUT', '/api/admin/users/(\\d+)', 'admin', ({ m, body, user }) => {
    const id = Number(m[1]);
    const demote = (body.role && body.role !== 'admin') || body.disabled === true;
    const u = lastAdminGuard(id, demote);
    if (id === user.id && demote) bad("You can't demote or disable yourself.");
    const role = body.role === 'admin' || body.role === 'player' ? body.role : u.role;
    const dn = body.displayName !== undefined ? str(body.displayName, 40, 'Display name') || u.display_name : u.display_name;
    const team = body.team !== undefined ? str(body.team, 40, 'Team') : u.team;
    const disabled = body.disabled !== undefined ? (body.disabled ? 1 : 0) : u.disabled;
    db.run('UPDATE users SET role=?, display_name=?, team=?, disabled=? WHERE id=?', role, dn, team, disabled, id);
    if (disabled) db.run('DELETE FROM sessions WHERE user_id=?', id);
    return { user: userView(db.get('SELECT * FROM users WHERE id=?', id)) };
  });
  route('POST', '/api/admin/users/(\\d+)/reset', 'admin', ({ m }) => {
    const id = Number(m[1]); lastAdminGuard(id, false);
    const password = tempPassword();
    db.run('UPDATE users SET pass_hash=?, must_change=1 WHERE id=?', hashPassword(password), id);
    db.run('DELETE FROM sessions WHERE user_id=?', id);
    return { password };
  });
  route('DELETE', '/api/admin/users/(\\d+)', 'admin', ({ m, user }) => {
    const id = Number(m[1]);
    if (id === user.id) bad("You can't delete yourself.");
    lastAdminGuard(id, true);
    db.run('DELETE FROM users WHERE id=?', id);
    return { deleted: true };
  });
  route('GET', '/api/admin/users/(\\d+)/runs', 'admin', ({ m }) => ({
    runs: db.all('SELECT date, mode, score, position, finished_at IS NOT NULL AS finished FROM runs WHERE user_id=? ORDER BY date DESC LIMIT 100', Number(m[1])),
  }));
  route('DELETE', '/api/admin/users/(\\d+)/runs/(\\d{4}-\\d{2}-\\d{2})', 'admin', ({ m }) => {
    db.run('DELETE FROM runs WHERE user_id=? AND date=?', Number(m[1]), m[2]);
    return { deleted: true };
  });
  route('GET', '/api/admin/settings', 'admin', () => ({ settings: settings() }));
  route('PUT', '/api/admin/settings', 'admin', ({ body }) => ({ settings: saveSettings(body || {}) }));
  route('GET', '/api/admin/backup', 'admin', () => {
    const dir = mkdtempSync(join(tmpdir(), 'outlier-'));
    const file = join(dir, 'backup.db');
    try {
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      return { $file: { name: `outlier-backup-${today()}.db`, type: 'application/octet-stream', data: readFileSync(file) } };
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  async function handle(req) {
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
      if (r.auth === 'admin' && user.role !== 'admin') bad('Admins only.', 403);
      if (r.auth && user.must_change && !['/api/password', '/api/me', '/api/logout'].includes(req.path)) bad('Please choose a new password first.', 428);
      const out = await r.fn({ req, user, body: req.body || {}, query: req.query || new URLSearchParams(), m: req.path.match(r.re), ip: req.ip || '' });
      if (out?.$file) return { status: 200, file: out.$file };
      const headers = {};
      if (out?.$cookie) { headers['Set-Cookie'] = out.$cookie; delete out.$cookie; }
      return { status: 200, headers, body: out };
    } catch (e) {
      if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
      log(`ERROR ${method} ${req.path}: ${e.stack || e}`);
      return { status: 500, body: { error: 'Something went wrong on the server.' } };
    }
  }

  return { handle, settings, saveSettings, today, ensureSetupToken, importPack, createUser, ensureDay, retroAward, db };
}
