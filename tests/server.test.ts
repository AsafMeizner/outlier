import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.ts';
import { createApp, type App } from '../server/app.ts';
import { buildIndex, matchAnswer } from '../server/match.ts';
import { parseText, parseCsv, toCsv, toText, type PackPrompt } from '../server/packs.ts';
import { gameDate, weekStartOf, addDays } from '../server/time.ts';
import type { ApiResponse } from '../server/http.ts';
import type * as Api from '../shared/api.ts';

type LbDay = Extract<Api.LeaderboardResponse, { period: 'day' }>;
type LbTeams = Extract<Api.LeaderboardResponse, { period: 'teams' }>;

/** Test assertions read arbitrary JSON responses; typing every shape here adds nothing. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

/** Assert a value is present and narrow its type. */
function must<T>(v: T | null | undefined, what = 'value'): T {
  assert.ok(v !== null && v !== undefined, `expected ${what}`);
  return v;
}

const PACK = `T: Test pack
C: Food
Q: Name a red fruit
1 Strawberry
2 Cherry
3 Raspberry
4 Pomegranate
5 Lingonberry | lingon
C: Places
Q: Name a Nordic country
1 Sweden
2 Norway
3 Finland
4 Denmark
5 Iceland
C: Colours
Q: Name a colour of the rainbow
1 Red
2 Blue
3 Green
4 Orange
5 Indigo
C: Space
Q: Name a planet
1 Mars
2 Jupiter
3 Saturn
4 Neptune
5 Mercury
C: Tools
Q: Name a hand tool
1 Hammer
2 Screwdriver
3 Wrench | spanner
4 Chisel
5 Awl`;

interface Harness {
  app: App;
  call: (who: string, method: string, path: string, body?: unknown) => Promise<ApiResponse>;
  ok: <T = Json>(who: string, method: string, path: string, body?: unknown) => Promise<T>;
  tick: (ms: number) => void;
}

function setup({ start = Date.UTC(2026, 10, 17, 9, 0, 0) } = {}): Harness {
  let clock = start;
  const db = openDb(':memory:');
  const app = createApp({ db, now: () => clock, random: () => 0.42 });
  app.saveSettings({ timeZone: 'UTC', promptsPerDay: 3, roundSeconds: 30 });
  app.importPack(PACK, 'test.txt');
  const jars = new Map<string, string>();
  async function call(who: string, method: string, path: string, body?: unknown): Promise<ApiResponse> {
    const [p = '', q = ''] = path.split('?');
    const headers: Record<string, string> = { 'x-outlier': '1' };
    const jar = jars.get(who);
    if (jar) headers['cookie'] = jar;
    const res = await app.handle({ method, path: p, query: new URLSearchParams(q), headers, body, ip: '127.0.0.1' });
    const set = res.headers?.['Set-Cookie'];
    if (set) jars.set(who, set.split(';')[0] ?? '');
    return res;
  }
  const ok = async <T = Json>(who: string, method: string, path: string, body?: unknown): Promise<T> => {
    const r = await call(who, method, path, body);
    assert.equal(r.status, 200, `${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
    return (r.body ?? r.file) as T;
  };
  return { app, call, ok, tick: ms => { clock += ms; } };
}

async function withAdmin(t: Harness): Promise<Harness> {
  const token = t.app.ensureSetupToken();
  await t.ok('admin', 'POST', '/api/setup', { token, username: 'boss', displayName: 'The Boss', password: 'adminpass1' });
  return t;
}
async function addPlayer(t: Harness, name: string): Promise<void> {
  await t.ok(name, 'POST', '/api/register', { username: name, displayName: name.toUpperCase(), password: 'password1', team: name < 'm' ? 'Red' : 'Blue' });
}
/** Play all rounds of a date, answering with the given guesses (null = let it time out). */
async function playDay(t: Harness, who: string, date: string, answers: ReadonlyArray<string | null>): Promise<Json> {
  let s: Json = await t.ok(who, 'POST', `/api/play/${date}/start`);
  for (const a of answers) {
    await t.ok(who, 'POST', `/api/play/${date}/next`);
    if (a === null) { t.tick(32_000); s = await t.ok(who, 'GET', `/api/play/${date}`); continue; }
    const r: Json = await t.ok(who, 'POST', `/api/play/${date}/guess`, { text: a });
    s = r.result === 'rejected' ? await t.ok(who, 'POST', `/api/play/${date}/skip`) : r.state;
  }
  return s;
}

test('matching handles plurals, accents, articles, aliases and typos', () => {
  const ix = buildIndex([{ answer: 'Strawberry', tier: 1 }, { answer: 'Açaí berry', tier: 5 }, { answer: 'Lingonberry', tier: 4, aliases: ['lingon'] }]);
  assert.equal(matchAnswer(ix, 'strawberries')?.index, 0);
  assert.equal(matchAnswer(ix, 'The STRAWBERRY')?.index, 0);
  assert.equal(matchAnswer(ix, 'acai-berry')?.index, 1);
  assert.equal(matchAnswer(ix, 'lingon')?.index, 2);
  assert.deepEqual(matchAnswer(ix, 'strawbery'), { index: 0, fuzzy: true });
  assert.equal(matchAnswer(ix, 'strawbery', { typos: false }), null);
  assert.equal(matchAnswer(ix, 'berry'), null);
  const langs = buildIndex([{ answer: 'C', tier: 2 }, { answer: 'C plus plus', tier: 1, aliases: ['CPP'] }, { answer: 'C sharp', tier: 1 }, { answer: 'F sharp', tier: 4 }]);
  assert.equal(matchAnswer(langs, 'C++')?.index, 1, 'C++ is not C');
  assert.equal(matchAnswer(langs, 'c#')?.index, 2);
  assert.equal(matchAnswer(langs, 'F#')?.index, 3);
  assert.equal(matchAnswer(langs, 'c')?.index, 0);
});

test('pack formats round-trip', () => {
  const p = parseText(PACK).prompts;
  assert.equal(p.length, 5);
  assert.deepEqual(parseCsv(toCsv(p)).prompts, p);
  const sortAns = (ps: PackPrompt[]): PackPrompt[] => ps.map(x => ({ ...x, answers: [...x.answers].sort((a, b) => a.answer.localeCompare(b.answer)) }));
  assert.deepEqual(sortAns(parseText(toText(p)).prompts), sortAns(p));
  assert.throws(() => parseText('Q: x\n7 nope'), /not understood/);
});

test('time helpers', () => {
  assert.equal(gameDate(Date.UTC(2026, 10, 17, 23, 30), 'Asia/Jerusalem'), '2026-11-18');
  assert.equal(gameDate(Date.UTC(2026, 10, 17, 1, 0), 'UTC', 3), '2026-11-16');
  assert.equal(weekStartOf('2026-11-19', 0), '2026-11-15');
  assert.equal(weekStartOf('2026-11-19', 1), '2026-11-16');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('first-time setup, registration and access control', async () => {
  const t = setup();
  let me = await t.ok<Api.MeResponse>('anon', 'GET', '/api/me');
  assert.equal(me.needsSetup, true);
  const reg = await t.call('x', 'POST', '/api/register', { username: 'early', password: 'password1' });
  assert.equal(reg.status, 403, 'nobody can register before an admin exists');
  const wrong = await t.call('admin', 'POST', '/api/setup', { token: 'nope', username: 'boss', password: 'adminpass1' });
  assert.equal(wrong.status, 403);
  await withAdmin(t);
  me = await t.ok<Api.MeResponse>('admin', 'GET', '/api/me');
  assert.equal(must(me.user).role, 'admin');
  assert.equal(me.needsSetup, false);
  assert.equal((await t.call('admin2', 'POST', '/api/setup', { token: 'x', username: 'x2', password: 'adminpass1' })).status, 403);

  await addPlayer(t, 'alice');
  assert.equal((await t.call('alice', 'GET', '/api/admin/users')).status, 403, 'players are not admins');
  assert.equal((await t.call('nobody', 'GET', '/api/today')).status, 401);
  // custom header required on writes
  const noHeader = await t.app.handle({ method: 'POST', path: '/api/logout', headers: {}, body: {}, query: new URLSearchParams(), ip: '' });
  assert.equal(noHeader.status, 403);
  // login rate limit
  for (let i = 0; i < 8; i++) assert.equal((await t.call('bad', 'POST', '/api/login', { username: 'alice', password: 'wrongwrong' })).status, 401);
  assert.equal((await t.call('bad', 'POST', '/api/login', { username: 'alice', password: 'password1' })).status, 429);
  // registration modes
  await t.ok('admin', 'PUT', '/api/admin/settings', { registration: 'code', inviteCode: 'secret' });
  assert.equal((await t.call('bob', 'POST', '/api/register', { username: 'bob', password: 'password1', inviteCode: 'x' })).status, 403);
  await t.ok('bob', 'POST', '/api/register', { username: 'bob', password: 'password1', inviteCode: 'secret' });
  await t.ok('admin', 'PUT', '/api/admin/settings', { registration: 'closed' });
  assert.equal((await t.call('carl', 'POST', '/api/register', { username: 'carl', password: 'password1' })).status, 403);
});

test('admin-created users must change their temporary password; disabled users are locked out', async () => {
  const t = await withAdmin(setup());
  const { created } = await t.ok<Api.CreateUsersResponse>('admin', 'POST', '/api/admin/users', { bulk: 'dana, Dana D, Ops\neli, Eli E\n!!bad' });
  assert.equal(created.length, 2);
  await t.ok('dana', 'POST', '/api/login', { username: 'dana', password: must(created[0]).password });
  assert.equal((await t.call('dana', 'GET', '/api/today')).status, 428);
  await t.ok('dana', 'POST', '/api/password', { current: must(created[0]).password, next: 'newpassword' });
  await t.ok<Api.TodayResponse>('dana', 'GET', '/api/today');
  const users = (await t.ok<Api.AdminUsersResponse>('admin', 'GET', '/api/admin/users')).users;
  const dana = must(users.find(u => u.username === 'dana'), 'dana');
  assert.equal(dana.team, 'Ops');
  await t.ok('admin', 'PUT', `/api/admin/users/${dana.id}`, { disabled: true });
  assert.equal((await t.call('dana', 'GET', '/api/today')).status, 401);
  const boss = must(users.find(u => u.username === 'boss'), 'boss');
  assert.equal((await t.call('admin', 'PUT', `/api/admin/users/${boss.id}`, { role: 'player' })).status, 400, 'last admin cannot be demoted');
});

test('a full day: timing, rejection, scoring, reveal, leaderboard', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice');
  await addPlayer(t, 'zoe');
  const today = await t.ok<Api.TodayResponse>('alice', 'GET', '/api/today');
  assert.equal(today.available, true);
  assert.equal(today.promptCount, 3);
  assert.equal(new Set(today.categories).size, 3, 'auto-schedule spreads categories');
  const d = today.date;

  let s = await t.ok<Api.RunState>('alice', 'POST', `/api/play/${d}/start`);
  assert.equal(s.current, null, 'the clock does not start until the player asks for the round');
  assert.equal((await t.call('alice', 'GET', `/api/reveal/${d}`)).status, 403, 'no peeking before finishing');
  s = await t.ok<Api.RunState>('alice', 'POST', `/api/play/${d}/next`);
  assert.ok(must(s.current).text);
  const prompt0 = must(s.current).text;
  // a nonsense answer is rejected, the round continues
  let r = await t.ok('alice', 'POST', `/api/play/${d}/guess`, { text: 'qwertyuiop' });
  assert.equal(r.result, 'rejected');
  // calling next again mid-round does not restart the clock
  t.tick(5000);
  const again = await t.ok<Api.RunState>('alice', 'POST', `/api/play/${d}/next`);
  assert.equal(must(again.current).startedAt, must(s.current).startedAt);
  // answer with the tier-5 answer of whatever prompt this is
  const answerFor: Record<string, string> = { 'Name a red fruit': 'lingon', 'Name a Nordic country': 'Iceland', 'Name a colour of the rainbow': 'indigo', 'Name a planet': 'mercury', 'Name a hand tool': 'awl' };
  r = await t.ok('alice', 'POST', `/api/play/${d}/guess`, { text: answerFor[prompt0] });
  assert.equal(r.result, 'accepted');
  assert.equal(r.tier, 5);
  assert.equal(r.points, 100);
  // round 2: time out (past deadline + grace)
  await t.ok<Api.RunState>('alice', 'POST', `/api/play/${d}/next`);
  t.tick(31_600);
  r = await t.ok('alice', 'POST', `/api/play/${d}/guess`, { text: 'anything' });
  assert.equal(r.result, 'expired');
  assert.equal(r.state.rounds[1].outcome, 'timeout');
  assert.equal(r.state.rounds[1].example, null, 'no example answer while the day is still running');
  // a guess just inside the grace window still counts
  s = await t.ok<Api.RunState>('alice', 'POST', `/api/play/${d}/next`);
  const p2 = must(s.current).text;
  t.tick(30_900);
  r = await t.ok('alice', 'POST', `/api/play/${d}/guess`, { text: answerFor[p2] });
  assert.equal(r.result, 'accepted');
  assert.equal(r.state.finished, true);
  assert.equal(r.state.score, 200);

  assert.equal((await t.call('alice', 'GET', `/api/reveal/${d}`)).status, 403, 'answers stay hidden until the day is over, even after finishing');

  // zoe plays: same first answer, then skips
  await t.ok<Api.RunState>('zoe', 'POST', `/api/play/${d}/start`);
  await t.ok<Api.RunState>('zoe', 'POST', `/api/play/${d}/next`);
  r = await t.ok('zoe', 'POST', `/api/play/${d}/guess`, { text: answerFor[prompt0] });
  assert.equal(r.same, 1, 'one colleague gave the same answer');
  await t.ok<Api.RunState>('zoe', 'POST', `/api/play/${d}/next`);
  await t.ok<Api.RunState>('zoe', 'POST', `/api/play/${d}/skip`);
  await t.ok<Api.RunState>('zoe', 'POST', `/api/play/${d}/next`);
  await t.ok<Api.RunState>('zoe', 'POST', `/api/play/${d}/skip`);

  const lb = await t.ok<LbDay>('alice', 'GET', '/api/leaderboard?period=day');
  assert.deepEqual(lb.rows.map(x => [x.name, x.score]), [['ALICE', 200], ['ZOE', 100]]);
  const teams = await t.ok<LbTeams>('alice', 'GET', '/api/leaderboard?period=teams');
  assert.equal(teams.rows.length, 2);
  // a second start does not create a second run
  const st = await t.ok<Api.RunState>('alice', 'POST', `/api/play/${d}/start`);
  assert.equal(st.finished, true);
  // the next day the answers are public, and missed rounds show an example
  t.tick(86400_000);
  const rev = await t.ok<Api.RevealResponse>('alice', 'GET', `/api/reveal/${d}`);
  assert.equal(rev.prompts.length, 3);
  assert.equal(must(must(rev.prompts[0]).mine).points, 100);
  assert.ok(must(rev.prompts[0]).answers.length >= 5);
  const later = await t.ok<Api.RunState>('alice', 'GET', `/api/play/${d}`);
  assert.ok(must(later.rounds[1]).example, 'example answer once the day is over');
});

test('a typo-corrected answer needs a second Enter (confirm) before it counts', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice');
  const bank = (await t.ok<Api.AdminPromptsResponse>('admin', 'GET', '/api/admin/prompts')).prompts;
  const d = (await t.ok<Api.AdminOverview>('admin', 'GET', '/api/admin/overview')).today;
  await t.ok('admin', 'PUT', `/api/admin/schedule/${d}`, { promptIds: [must(bank.find(p => p.text === 'Name a Nordic country')).id] });
  await t.ok<Api.RunState>('alice', 'POST', `/api/play/${d}/start`);
  await t.ok<Api.RunState>('alice', 'POST', `/api/play/${d}/next`);
  const ask = await t.ok<Api.GuessResponse>('alice', 'POST', `/api/play/${d}/guess`, { text: 'Icelamd' });
  assert.equal(ask.result, 'confirm');
  assert.equal(ask.result === 'confirm' && ask.answer, 'Iceland');
  const mid = await t.ok<Api.RunState>('alice', 'GET', `/api/play/${d}`);
  assert.equal(mid.rounds.length, 0, 'nothing is recorded before the player confirms');
  const ok = await t.ok<Api.GuessResponse>('alice', 'POST', `/api/play/${d}/guess`, { text: 'Icelamd', confirm: true });
  assert.equal(ok.result, 'accepted');
  assert.equal(ok.result === 'accepted' && ok.fuzzy, true);
  // exact matches never ask
  assert.equal((await t.ok<Api.GuessResponse>('alice', 'POST', `/api/play/${d}/guess`, { text: 'Sweden' })).result, 'finished');
});

test('streaks, archive play and day rollover', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice');
  const day1 = (await t.ok<Api.TodayResponse>('alice', 'GET', '/api/today')).date;
  await playDay(t, 'alice', day1, ['strawberry', 'sweden', 'red']);
  t.tick(86400_000);
  const day2 = (await t.ok<Api.TodayResponse>('alice', 'GET', '/api/today')).date;
  assert.notEqual(day1, day2);
  let today = await t.ok<Api.TodayResponse>('alice', 'GET', '/api/today');
  assert.equal(today.streak.current, 1, 'streak survives until today is over');
  await playDay(t, 'alice', day2, [null, null, null]);
  today = await t.ok<Api.TodayResponse>('alice', 'GET', '/api/today');
  assert.equal(today.streak.current, 2);
  t.tick(86400_000 * 2); // a day is missed (someone else creates it)
  await addPlayer(t, 'zoe');
  const day3 = (await t.ok<Api.TodayResponse>('zoe', 'GET', '/api/today')).date;
  t.tick(86400_000);
  const day4 = (await t.ok<Api.TodayResponse>('alice', 'GET', '/api/today')).date;
  today = await t.ok<Api.TodayResponse>('alice', 'GET', '/api/today');
  assert.equal(today.streak.current, 0);
  assert.equal(today.streak.best, 2);
  // archive: day3 can be played later, but does not count
  const arch = await t.ok<Api.ArchiveResponse>('alice', 'GET', '/api/archive');
  assert.deepEqual(arch.days.map(x => x.date), [day4, day3, day2, day1]);
  const s = await t.ok<Api.RunState>('alice', 'POST', `/api/play/${day3}/start`);
  assert.equal(s.mode, 'archive');
  await playDay(t, 'alice', day3, ['strawberry', 'sweden', 'red']);
  today = await t.ok<Api.TodayResponse>('alice', 'GET', '/api/today');
  assert.equal(today.streak.current, 0, 'archive play does not repair a streak');
  const lb = await t.ok<LbDay>('alice', 'GET', `/api/leaderboard?period=day&date=${day3}`);
  assert.equal(lb.rows.length, 0, 'archive play is not on the daily leaderboard');
  // past days can be revealed without playing
  await t.ok<Api.RevealResponse>('zoe', 'GET', `/api/reveal/${day1}`);
  // future days are locked
  assert.equal((await t.call('alice', 'POST', `/api/play/${addDays(day4, 1)}/start`)).status, 403);
  const stats = await t.ok<Api.StatsResponse>('alice', 'GET', '/api/stats');
  assert.equal(stats.games, 2);
  assert.equal(stats.streak.best, 2);
  assert.equal(stats.bestScore, Math.max(...stats.history.filter(h => h.mode === 'live').map(h => h.score)));
  assert.equal(stats.history.length, 3);
});

test('admin: schedule, questions, misses and retro-award, backup', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice');
  const { prompts } = await t.ok<Api.AdminPromptsResponse>('admin', 'GET', '/api/admin/prompts');
  assert.equal(prompts.length, 5);
  const fruit = must(prompts.find(p => p.text === 'Name a red fruit'), 'fruit');
  const nordic = must(prompts.find(p => p.text === 'Name a Nordic country'), 'nordic');
  const today = (await t.ok<Api.AdminOverview>('admin', 'GET', '/api/admin/overview')).today;
  await t.ok('admin', 'PUT', `/api/admin/schedule/${today}`, { promptIds: [fruit.id, nordic.id] });
  // alice misses "red currant" (not in the list) and times out
  await t.ok<Api.RunState>('alice', 'POST', `/api/play/${today}/start`);
  await t.ok<Api.RunState>('alice', 'POST', `/api/play/${today}/next`);
  assert.equal((await t.ok('alice', 'POST', `/api/play/${today}/guess`, { text: 'Red currants' })).result, 'rejected');
  t.tick(40_000);
  await t.ok<Api.RunState>('alice', 'GET', `/api/play/${today}`);
  // the schedule is now locked
  assert.equal((await t.call('admin', 'PUT', `/api/admin/schedule/${today}`, { promptIds: [nordic.id] })).status, 409);
  // admin reviews misses and accepts it as tier 4
  const { misses } = await t.ok<Api.AdminMissesResponse>('admin', 'GET', '/api/admin/misses');
  assert.equal(misses.length, 1);
  assert.equal(must(misses[0]).raw, 'Red currants');
  const acc = await t.ok<Api.SavePromptResponse>('admin', 'POST', '/api/admin/misses/accept', { promptId: fruit.id, text: 'Redcurrant', tier: 4 });
  assert.equal(acc.awarded, 1, "alice's earlier guess is now awarded");
  const state = await t.ok<Api.RunState>('alice', 'GET', `/api/play/${today}`);
  assert.equal(state.score, 75);
  assert.equal(must(state.rounds[0]).outcome, 'awarded');
  assert.equal((await t.ok<Api.AdminMissesResponse>('admin', 'GET', '/api/admin/misses')).misses.length, 0);
  // editing: collisions are rejected
  const full = await t.ok<Api.PromptFull>('admin', 'GET', `/api/admin/prompts/${fruit.id}`);
  const dup = await t.call('admin', 'PUT', `/api/admin/prompts/${fruit.id}`, { ...full, answers: [...full.answers, { answer: 'cherries', tier: 2 }] });
  assert.equal(dup.status, 400);
  // autofill skips inactive weekdays and existing days
  await t.ok('admin', 'PUT', '/api/admin/settings', { activeWeekdays: [0, 1, 2, 3, 4] });
  const { created } = await t.ok<Api.AutofillResponse>('admin', 'POST', '/api/admin/schedule/autofill', { days: 7 });
  assert.equal(created.length, 4, `created ${created}`); // 7 days minus today (exists) minus Fri+Sat
  // import with update merges answers
  const upd = await t.ok<Api.ImportResult>('admin', 'POST', '/api/admin/import', { name: 'x.txt', content: 'Q: Name a red fruit\n5 Goji berry\nQ: Name a brand new prompt here\n1 Yes', mode: 'update' });
  assert.deepEqual([upd.added, upd.updated, upd.errors.length], [1, 1, 0]);
  const exp = await t.call('admin', 'GET', '/api/admin/export?format=csv');
  assert.match(String(must(exp.file).data), /Goji berry/);
  const bk = await t.call('admin', 'GET', '/api/admin/backup');
  const backup = must(bk.file).data;
  assert.ok(Buffer.isBuffer(backup));
  assert.equal(backup.subarray(0, 15).toString(), 'SQLite format 3');
});

test('wardrobe: free items equip, locked items refuse, unlocks follow play; looks are per theme', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice');
  let w = await t.ok<Api.WardrobeResponse>('alice', 'GET', '/api/wardrobe');
  assert.equal(w.theme, 'space');
  assert.deepEqual(w.slots, ['hull', 'stripe', 'nose', 'fins', 'window', 'pilot', 'trail']);
  const item = (slot: string, id: string) => must(must(w.catalog[slot]).find(i => i.id === id));
  assert.equal(item('nose', 'dome').unlocked, true);
  assert.equal(item('trail', 'pink').unlocked, false);
  await t.ok<Api.LookResponse>('alice', 'POST', '/api/wardrobe', { look: { nose: 'dome', hull: 'mint', pilot: 'astro2' } });
  assert.equal((await t.call('alice', 'POST', '/api/wardrobe', { look: { trail: 'pink' } })).status, 400, 'pink trail needs an Outlier answer');
  assert.equal((await t.call('alice', 'POST', '/api/wardrobe', { look: { nose: 'nonsense' } })).status, 400);
  const me = await t.ok<Api.MeResponse>('alice', 'GET', '/api/me');
  assert.equal(must(me.user).look['nose'], 'dome');
  assert.equal(must(me.user).look['hull'], 'mint');
  assert.equal(me.settings.theme, 'space');
  // an Outlier answer unlocks the pink trail
  const bank = (await t.ok<Api.AdminPromptsResponse>('admin', 'GET', '/api/admin/prompts')).prompts;
  const d = (await t.ok<Api.AdminOverview>('admin', 'GET', '/api/admin/overview')).today;
  await t.ok('admin', 'PUT', `/api/admin/schedule/${d}`, { promptIds: ['Name a red fruit', 'Name a Nordic country'].map(x => must(bank.find(p => p.text === x)).id) });
  await playDay(t, 'alice', d, ['lingon', 'iceland']);
  w = await t.ok<Api.WardrobeResponse>('alice', 'GET', '/api/wardrobe');
  assert.ok(w.stats.outliers >= 1, `outliers ${w.stats.outliers}`);
  assert.ok(w.stats.points > 0, 'points count toward unlocks');
  assert.equal(item('trail', 'pink').unlocked, true);
  await t.ok<Api.LookResponse>('alice', 'POST', '/api/wardrobe', { look: { trail: 'pink' } });
  const lb = await t.ok<LbDay>('alice', 'GET', '/api/leaderboard?period=day');
  assert.equal(must(lb.rows[0]).look['trail'], 'pink', 'leaderboard rows carry looks');
  // the theme is an admin setting, limited to known themes
  assert.equal((await t.call('admin', 'PUT', '/api/admin/settings', { theme: 'jungle' })).status, 400);
  const st = await t.ok<Api.SettingsResponse>('admin', 'PUT', '/api/admin/settings', { theme: 'space' });
  assert.equal(st.settings.theme, 'space');
});

test('user-made games: create, share, play, leaderboard, edit rules, copy, delete', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice'); await addPlayer(t, 'zoe');
  const game = { title: 'Team quiz', prompts: [
    { text: 'Name a red fruit', category: 'Food', answers: [{ answer: 'Apple', tier: 1 }, { answer: 'Cherry', tier: 3 }, { answer: 'Rambutan', tier: 5 }] },
    { text: 'Name a planet', category: 'Space', answers: [{ answer: 'Mars', tier: 1 }, { answer: 'Neptune', tier: 4 }, { answer: 'Mercury', tier: 5 }] },
  ] };
  assert.equal((await t.call('alice', 'POST', '/api/games', { ...game, prompts: [{ text: 'Too few answers here', answers: [{ answer: 'x', tier: 1 }] }] })).status, 400);
  const { slug } = await t.ok<Api.SlugResponse>('alice', 'POST', '/api/games', game);
  assert.match(slug, /^[a-z0-9]{8}$/);
  // same prompt text as the bank is fine for a user game, and it never enters the bank
  const bank = (await t.ok<Api.AdminPromptsResponse>('admin', 'GET', '/api/admin/prompts')).prompts;
  assert.equal(bank.filter(p => p.text === 'Name a red fruit').length, 1);
  // zoe opens the shared link and plays
  let info = await t.ok<Api.GameInfo>('zoe', 'GET', `/api/games/${slug}`);
  assert.equal(info.title, 'Team quiz'); assert.equal(info.content, null, 'players do not see the answers');
  assert.equal((await t.call('zoe', 'GET', `/api/reveal/g-${slug}`)).status, 403);
  const s = await playDay(t, 'zoe', `g-${slug}`, ['rambutan', 'mars']);
  assert.equal(s.finished, true); assert.equal(s.mode, 'custom'); assert.equal(s.score, 110); assert.equal(s.game.title, 'Team quiz');
  await t.ok<Api.RevealResponse>('zoe', 'GET', `/api/reveal/g-${slug}`);
  info = await t.ok<Api.GameInfo>('alice', 'GET', `/api/games/${slug}`);
  assert.equal(info.plays, 1); assert.equal(must(info.leaderboard[0]).score, 110); assert.equal(info.editable, false);
  // custom games stay out of the daily leaderboard, stats and archive
  assert.equal((await t.ok<Exclude<Api.LeaderboardResponse, { period: 'day' | 'streak' | 'teams' }>>('zoe', 'GET', '/api/leaderboard?period=all')).rows.length, 0);
  assert.equal((await t.ok<Api.StatsResponse>('zoe', 'GET', '/api/stats')).games, 0);
  assert.ok(!(await t.ok<Api.ArchiveResponse>('zoe', 'GET', '/api/archive')).days.some(d => d.date.startsWith('g-')));
  // after someone played: prompts are locked, answers can still be added and re-score
  const changed = structuredClone(must(info.content)); must(changed[0]).text = 'Name a red vegetable';
  assert.equal((await t.call('alice', 'PUT', `/api/games/${slug}`, { title: 'x', prompts: changed })).status, 409);
  const more = structuredClone(must(info.content)); must(more[1]).answers.push({ id: 0, answer: 'Pluto', tier: 5, aliases: [] });
  await t.ok('alice', 'PUT', `/api/games/${slug}`, { title: 'Team quiz 2', prompts: more });
  assert.equal((await t.call('zoe', 'PUT', `/api/games/${slug}`, { title: 'hack', prompts: more })).status, 403);
  // copies and deletion
  const copy = await t.ok<Api.SlugResponse>('zoe', 'POST', `/api/games/${slug}/copy`);
  assert.equal((await t.ok<Api.GameInfo>('zoe', 'GET', `/api/games/${copy.slug}`)).isOwner, true);
  const lists = await t.ok<Api.GamesListResponse>('zoe', 'GET', '/api/games');
  assert.equal(lists.mine.length, 1); assert.equal(lists.played.length, 1);
  await t.ok('alice', 'DELETE', `/api/games/${slug}`);
  assert.equal((await t.call('zoe', 'GET', `/api/games/${slug}`)).status, 404);
});

test('history backfill creates past days only on an empty calendar', async () => {
  const t = await withAdmin(setup());
  assert.equal(t.app.backfillHistory(10), 10);
  assert.equal(t.app.backfillHistory(10), 0, 'only once');
  await addPlayer(t, 'alice');
  const a = await t.ok<Api.ArchiveResponse>('alice', 'GET', '/api/archive');
  assert.equal(a.days.length, 11, '10 past days plus today');
  assert.equal(must(a.days[0]).dayNumber, 11);
  const past = must(a.days[5]).date;
  const s = await t.ok<Api.RunState>('alice', 'POST', `/api/play/${past}/start`);
  assert.equal(s.mode, 'archive');
});

const ANIMALS = `C: Animals
Q: Name a big cat
1 Lion
2 Tiger
3 Leopard
4 Jaguar
5 Ocelot
Q: Name a farm animal
1 Cow
2 Pig
3 Sheep
4 Goat
5 Llama
Q: Name a bird of prey
1 Eagle
2 Hawk
3 Falcon
4 Osprey
5 Kestrel`;
const answerOf: Record<string, string> = {
  'Name a red fruit': 'cherry', 'Name a Nordic country': 'norway', 'Name a colour of the rainbow': 'blue', 'Name a planet': 'saturn', 'Name a hand tool': 'chisel',
  'Name a big cat': 'ocelot', 'Name a farm animal': 'llama', 'Name a bird of prey': 'kestrel',
};

test('practice: unlimited and packs never use scheduled prompts, never count, and track bests', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice');
  t.app.importPack(ANIMALS, 'animals.txt');
  const bank = (await t.ok<Api.AdminPromptsResponse>('admin', 'GET', '/api/admin/prompts')).prompts;
  const d = (await t.ok<Api.AdminOverview>('admin', 'GET', '/api/admin/overview')).today;
  const scheduled = ['Name a red fruit', 'Name a Nordic country'];
  await t.ok('admin', 'PUT', `/api/admin/schedule/${d}`, { promptIds: scheduled.map(x => must(bank.find(p => p.text === x)).id) });

  const home = await t.ok<Api.PracticeHome>('alice', 'GET', '/api/practice');
  assert.deepEqual(home.packs.map(p => [p.category, p.prompts]), [['Animals', 3]], 'only categories with 3+ unscheduled prompts are packs');

  // unlimited: runs until three rounds without distance (or the pool runs out)
  const { slug } = await t.ok<Api.SlugResponse>('alice', 'POST', '/api/practice', { kind: 'unlimited', lang: 'en' });
  let s = await t.ok<Api.RunState>('alice', 'POST', `/api/practice/${slug}/start`);
  assert.equal(s.mode, 'practice');
  assert.ok(s.upNext);
  const seen: string[] = [];
  s = await t.ok<Api.RunState>('alice', 'POST', `/api/practice/${slug}/next`);
  seen.push(must(s.current).text);
  const r = await t.ok<Api.GuessResponse>('alice', 'POST', `/api/practice/${slug}/guess`, { text: answerOf[must(s.current).text] });
  assert.equal(r.result, 'accepted');
  for (let i = 0; i < 3; i++) {
    s = await t.ok<Api.RunState>('alice', 'POST', `/api/practice/${slug}/next`);
    seen.push(must(s.current).text);
    s = await t.ok<Api.RunState>('alice', 'POST', `/api/practice/${slug}/skip`);
  }
  assert.equal(s.finished, true, 'three misses end unlimited mode');
  assert.equal(must(s.practice).strikes, 3);
  assert.ok(must(s.rounds[1]).example, 'practice rounds may show an example answer right away');
  for (const x of scheduled) assert.ok(!seen.includes(x), `scheduled prompt "${x}" must not appear in practice`);
  assert.equal(new Set(seen).size, seen.length, 'no repeats within a run');
  const lb = await t.ok<LbDay>('alice', 'GET', '/api/leaderboard?period=day');
  assert.equal(lb.rows.length, 0, 'practice is not on the leaderboard');

  // a pack: its size is the number of prompts, the best is remembered
  const p1 = await t.ok<Api.SlugResponse>('alice', 'POST', '/api/practice', { kind: 'pack', pack: 'Animals', lang: 'en' });
  s = await t.ok<Api.RunState>('alice', 'POST', `/api/practice/${p1.slug}/start`);
  assert.equal(s.total, 3);
  for (let i = 0; i < 3; i++) {
    s = await t.ok<Api.RunState>('alice', 'POST', `/api/practice/${p1.slug}/next`);
    assert.equal(must(s.current).category, 'Animals');
    const g = await t.ok<Api.GuessResponse>('alice', 'POST', `/api/practice/${p1.slug}/guess`, { text: answerOf[must(s.current).text] });
    if (g.result !== 'accepted') assert.fail(`expected accepted, got ${g.result}`);
    s = g.state;
  }
  assert.equal(s.finished, true);
  assert.equal(s.score, 300);
  assert.equal(must(s.practice).newBest, true);
  const after = await t.ok<Api.PracticeHome>('alice', 'GET', '/api/practice');
  assert.equal(must(after.packs[0]).best, 300);
  assert.equal((await t.call('alice', 'POST', '/api/practice', { kind: 'pack', pack: 'Nope', lang: 'en' })).status, 404);
  assert.equal((await t.call('zoe', 'GET', `/api/practice/${slug}`)).status, 401);
});

test('friends: follow by username, today and week scores, head-to-head, search', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice'); await addPlayer(t, 'zoe');
  assert.equal((await t.call('alice', 'POST', '/api/friends', { username: 'alice' })).status, 400, 'you cannot follow yourself');
  assert.equal((await t.call('alice', 'POST', '/api/friends', { username: 'nobody' })).status, 404);
  let f = await t.ok<Api.FriendsResponse>('alice', 'POST', '/api/friends', { username: 'ZOE' });
  assert.deepEqual(f.friends.map(x => [x.username, x.today]), [['zoe', null]]);
  const bank = (await t.ok<Api.AdminPromptsResponse>('admin', 'GET', '/api/admin/prompts')).prompts;
  const d = (await t.ok<Api.AdminOverview>('admin', 'GET', '/api/admin/overview')).today;
  await t.ok('admin', 'PUT', `/api/admin/schedule/${d}`, { promptIds: ['Name a red fruit', 'Name a Nordic country', 'Name a colour of the rainbow'].map(x => must(bank.find(p => p.text === x)).id) });
  await playDay(t, 'zoe', d, ['strawberry', 'sweden', 'red']);
  await playDay(t, 'alice', d, ['lingon', 'iceland', 'indigo']);
  f = await t.ok<Api.FriendsResponse>('alice', 'GET', '/api/friends');
  assert.equal(must(f.friends[0]).today, 30);
  assert.equal(must(f.friends[0]).followsYou, false);
  const c = await t.ok<Api.CompareResponse>('alice', 'GET', `/api/friends/${must(f.friends[0]).userId}/compare`);
  assert.deepEqual([c.wins, c.losses, c.ties], [1, 0, 0]);
  assert.equal(c.me.total, 300);
  assert.equal(c.them.total, 30);
  const found = await t.ok<Api.UserSearchRow[]>('alice', 'GET', '/api/users/search?q=zo');
  assert.deepEqual(found.map(x => [x.username, x.isFriend]), [['zoe', true]]);
  f = await t.ok<Api.FriendsResponse>('alice', 'DELETE', `/api/friends/${must(f.friends[0]).userId}`);
  assert.equal(f.friends.length, 0);
});

const PARTY_PACK = `C: Party
Q: Name a country in Europe
1 France
1 Germany
1 Italy
1 Spain
2 Portugal
2 Greece
2 Poland
3 Austria
3 Belgium
3 Hungary
4 Slovenia
4 Estonia
5 Liechtenstein
5 Andorra
Q: Name a fruit
1 Apple
1 Banana
1 Orange
2 Mango
2 Pear
2 Grape
3 Kiwi
3 Plum
4 Lychee
4 Guava
5 Rambutan
5 Durian`;

test('party: rooms, turns, used answers, popping fuses, extra lives, a winner', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice'); await addPlayer(t, 'zoe');
  t.app.importPack(PARTY_PACK, 'party.txt');
  let s = await t.ok<Api.PartyState>('alice', 'POST', '/api/party', { lang: 'en' });
  const code = s.code;
  assert.match(code, /^[A-Z]{4}$/);
  assert.equal((await t.call('alice', 'POST', `/api/party/${code}/start`)).status, 409, 'needs two players');
  s = await t.ok<Api.PartyState>('zoe', 'POST', `/api/party/${code}/join`);
  assert.equal(s.players.length, 2);
  assert.ok((await t.ok<Api.PartyListResponse>('zoe', 'GET', '/api/party')).rooms.some(r => r.code === code));
  assert.equal((await t.call('zoe', 'POST', `/api/party/${code}/start`)).status, 403, 'only the host starts');
  s = await t.ok<Api.PartyState>('alice', 'POST', `/api/party/${code}/start`);
  assert.equal(s.status, 'playing');
  const ids = Object.fromEntries(s.players.map(p => [p.username, p.userId]));
  const whose = (st: Api.PartyState): string => must(st.players.find(p => p.userId === st.turnUserId)).username;
  const first = whose(s), second = first === 'alice' ? 'zoe' : 'alice';
  const answers = must(s.prompt).text === 'Name a fruit' ? ['durian', 'apple', 'rambutan'] : ['liechtenstein', 'france', 'andorra'];
  assert.equal((await t.call(second, 'POST', `/api/party/${code}/answer`, { text: answers[1] })).status, 409, 'not your turn');
  // a tier-5 answer fills the meter: an extra life
  let a = await t.ok<Api.PartyAnswerResponse>(first, 'POST', `/api/party/${code}/answer`, { text: answers[0] });
  if (a.result !== 'accepted') assert.fail(`expected accepted, got ${a.result}`);
  assert.equal(must(a.state.players.find(p => p.username === first)).lives, 4);
  assert.equal(whose(a.state), second);
  assert.equal(a.state.fuseMs, 14_000, 'the fuse gets shorter each pass');
  // the same answer can't be used twice; a wrong one is rejected
  assert.equal((await t.ok<Api.PartyAnswerResponse>(second, 'POST', `/api/party/${code}/answer`, { text: answers[0] })).result, 'used');
  assert.equal((await t.ok<Api.PartyAnswerResponse>(second, 'POST', `/api/party/${code}/answer`, { text: 'qwerty' })).result, 'rejected');
  a = await t.ok<Api.PartyAnswerResponse>(second, 'POST', `/api/party/${code}/answer`, { text: answers[1] });
  assert.equal(a.result, 'accepted');
  // the fuse runs out on the first player: a life lost, a new prompt
  t.tick(14_000);
  s = await t.ok<Api.PartyState>('zoe', 'GET', `/api/party/${code}`);
  assert.equal(must(s.players.find(p => p.username === first)).lives, 3);
  assert.equal(s.used.length, 0, 'a new prompt starts after a pop');
  assert.ok(s.log.some(l => l.kind === 'pop' && l.userId === ids[first]));
  // keep letting the fuse run out until someone wins
  for (let i = 0; i < 12 && s.status === 'playing'; i++) { t.tick(15_000); s = await t.ok<Api.PartyState>('zoe', 'GET', `/api/party/${code}`); }
  assert.equal(s.status, 'over');
  assert.ok(s.winner === ids['alice'] || s.winner === ids['zoe']);
  assert.equal(s.players.filter(p => !p.out).length, 1);
  await t.ok('zoe', 'POST', `/api/party/${code}/leave`);
  await t.ok('alice', 'POST', `/api/party/${code}/leave`);
  assert.equal((await t.call('alice', 'GET', `/api/party/${code}`)).status, 404, 'an empty room is gone');
});
