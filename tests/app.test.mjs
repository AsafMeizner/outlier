import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
import { buildIndex, matchAnswer } from '../src/match.mjs';
import { parseText, parseCsv, toCsv, toText } from '../src/packs.mjs';
import { gameDate, weekStartOf, addDays } from '../src/time.mjs';

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

function setup({ start = Date.UTC(2026, 10, 17, 9, 0, 0) } = {}) {
  let clock = start;
  const db = openDb(':memory:');
  const app = createApp({ db, now: () => clock, random: () => 0.42 });
  app.saveSettings({ timeZone: 'UTC', promptsPerDay: 3, roundSeconds: 30 });
  app.importPack(PACK, 'test.txt');
  const jars = new Map();
  async function call(who, method, path, body) {
    const [p, q = ''] = path.split('?');
    const headers = { 'x-outlier': '1' };
    if (jars.get(who)) headers.cookie = jars.get(who);
    const res = await app.handle({ method, path: p, query: new URLSearchParams(q), headers, body, ip: '127.0.0.1' });
    const set = res.headers?.['Set-Cookie'];
    if (set) jars.set(who, set.split(';')[0]);
    return res;
  }
  const ok = async (...a) => { const r = await call(...a); assert.equal(r.status, 200, `${a[1]} ${a[2]} -> ${r.status} ${JSON.stringify(r.body)}`); return r.body ?? r.file; };
  return { app, db, call, ok, tick: ms => { clock += ms; }, setClock: ms => { clock = ms; }, now: () => clock };
}

async function withAdmin(t) {
  const token = t.app.ensureSetupToken();
  await t.ok('admin', 'POST', '/api/setup', { token, username: 'boss', displayName: 'The Boss', password: 'adminpass1' });
  return t;
}
async function addPlayer(t, name) {
  await t.ok(name, 'POST', '/api/register', { username: name, displayName: name.toUpperCase(), password: 'password1', team: name < 'm' ? 'Red' : 'Blue' });
}
/** Play all rounds of a date, answering with the given guesses (null = let it time out). */
async function playDay(t, who, date, answers) {
  let s = await t.ok(who, 'POST', `/api/play/${date}/start`);
  for (const a of answers) {
    s = await t.ok(who, 'POST', `/api/play/${date}/next`);
    if (a === null) { t.tick(32_000); s = await t.ok(who, 'GET', `/api/play/${date}`); continue; }
    const r = await t.ok(who, 'POST', `/api/play/${date}/guess`, { text: a });
    s = r.result === 'rejected' ? await t.ok(who, 'POST', `/api/play/${date}/skip`) : r.state;
  }
  return s;
}

test('matching handles plurals, accents, articles, aliases and typos', () => {
  const ix = buildIndex([{ answer: 'Strawberry', tier: 1 }, { answer: 'Açaí berry', tier: 5 }, { answer: 'Lingonberry', tier: 4, aliases: ['lingon'] }]);
  assert.equal(matchAnswer(ix, 'strawberries').index, 0);
  assert.equal(matchAnswer(ix, 'The STRAWBERRY').index, 0);
  assert.equal(matchAnswer(ix, 'acai-berry').index, 1);
  assert.equal(matchAnswer(ix, 'lingon').index, 2);
  assert.deepEqual(matchAnswer(ix, 'strawbery'), { index: 0, fuzzy: true });
  assert.equal(matchAnswer(ix, 'strawbery', { typos: false }), null);
  assert.equal(matchAnswer(ix, 'berry'), null);
});

test('pack formats round-trip', () => {
  const p = parseText(PACK).prompts;
  assert.equal(p.length, 5);
  assert.deepEqual(parseCsv(toCsv(p)).prompts, p);
  const sortAns = ps => ps.map(x => ({ ...x, answers: [...x.answers].sort((a, b) => a.answer.localeCompare(b.answer)) }));
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
  let me = await t.ok('anon', 'GET', '/api/me');
  assert.equal(me.needsSetup, true);
  const reg = await t.call('x', 'POST', '/api/register', { username: 'early', password: 'password1' });
  assert.equal(reg.status, 403, 'nobody can register before an admin exists');
  const wrong = await t.call('admin', 'POST', '/api/setup', { token: 'nope', username: 'boss', password: 'adminpass1' });
  assert.equal(wrong.status, 403);
  await withAdmin(t);
  me = await t.ok('admin', 'GET', '/api/me');
  assert.equal(me.user.role, 'admin');
  assert.equal(me.needsSetup, false);
  assert.equal((await t.call('admin2', 'POST', '/api/setup', { token: 'x', username: 'x2', password: 'adminpass1' })).status, 403);

  await addPlayer(t, 'alice');
  assert.equal((await t.call('alice', 'GET', '/api/admin/users')).status, 403, 'players are not admins');
  assert.equal((await t.call('nobody', 'GET', '/api/today')).status, 401);
  // custom header required on writes
  const noHeader = await t.app.handle({ method: 'POST', path: '/api/logout', headers: {}, body: {} });
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
  const { created } = await t.ok('admin', 'POST', '/api/admin/users', { bulk: 'dana, Dana D, Ops\neli, Eli E\n!!bad' });
  assert.equal(created.length, 2);
  await t.ok('dana', 'POST', '/api/login', { username: 'dana', password: created[0].password });
  assert.equal((await t.call('dana', 'GET', '/api/today')).status, 428);
  await t.ok('dana', 'POST', '/api/password', { current: created[0].password, next: 'newpassword' });
  await t.ok('dana', 'GET', '/api/today');
  const users = (await t.ok('admin', 'GET', '/api/admin/users')).users;
  const dana = users.find(u => u.username === 'dana');
  assert.equal(dana.team, 'Ops');
  await t.ok('admin', 'PUT', `/api/admin/users/${dana.id}`, { disabled: true });
  assert.equal((await t.call('dana', 'GET', '/api/today')).status, 401);
  const boss = users.find(u => u.username === 'boss');
  assert.equal((await t.call('admin', 'PUT', `/api/admin/users/${boss.id}`, { role: 'player' })).status, 400, 'last admin cannot be demoted');
});

test('a full day: timing, rejection, scoring, reveal, leaderboard', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice');
  await addPlayer(t, 'zoe');
  const today = await t.ok('alice', 'GET', '/api/today');
  assert.equal(today.available, true);
  assert.equal(today.promptCount, 3);
  assert.equal(new Set(today.categories).size, 3, 'auto-schedule spreads categories');
  const d = today.date;

  let s = await t.ok('alice', 'POST', `/api/play/${d}/start`);
  assert.equal(s.current, null, 'the clock does not start until the player asks for the round');
  assert.equal((await t.call('alice', 'GET', `/api/reveal/${d}`)).status, 403, 'no peeking before finishing');
  s = await t.ok('alice', 'POST', `/api/play/${d}/next`);
  assert.ok(s.current.text);
  const prompt0 = s.current.text;
  // a nonsense answer is rejected, the round continues
  let r = await t.ok('alice', 'POST', `/api/play/${d}/guess`, { text: 'qwertyuiop' });
  assert.equal(r.result, 'rejected');
  // calling next again mid-round does not restart the clock
  t.tick(5000);
  const again = await t.ok('alice', 'POST', `/api/play/${d}/next`);
  assert.equal(again.current.startedAt, s.current.startedAt);
  // answer with the tier-5 answer of whatever prompt this is
  const answerFor = { 'Name a red fruit': 'lingon', 'Name a Nordic country': 'Iceland', 'Name a colour of the rainbow': 'indigo', 'Name a planet': 'mercury', 'Name a hand tool': 'awl' };
  r = await t.ok('alice', 'POST', `/api/play/${d}/guess`, { text: answerFor[prompt0] });
  assert.equal(r.result, 'accepted');
  assert.equal(r.tier, 5);
  assert.equal(r.points, 100);
  // round 2: time out (past deadline + grace)
  s = await t.ok('alice', 'POST', `/api/play/${d}/next`);
  t.tick(31_600);
  r = await t.ok('alice', 'POST', `/api/play/${d}/guess`, { text: 'anything' });
  assert.equal(r.result, 'expired');
  assert.equal(r.state.rounds[1].outcome, 'timeout');
  // a guess just inside the grace window still counts
  s = await t.ok('alice', 'POST', `/api/play/${d}/next`);
  const p2 = s.current.text;
  t.tick(30_900);
  r = await t.ok('alice', 'POST', `/api/play/${d}/guess`, { text: answerFor[p2] });
  assert.equal(r.result, 'accepted');
  assert.equal(r.state.finished, true);
  assert.equal(r.state.score, 200);

  const rev = await t.ok('alice', 'GET', `/api/reveal/${d}`);
  assert.equal(rev.prompts.length, 3);
  assert.equal(rev.prompts[0].mine.points, 100);
  assert.ok(rev.prompts[0].answers.length >= 5);

  // zoe plays: same first answer, then skips
  await t.ok('zoe', 'POST', `/api/play/${d}/start`);
  await t.ok('zoe', 'POST', `/api/play/${d}/next`);
  r = await t.ok('zoe', 'POST', `/api/play/${d}/guess`, { text: answerFor[prompt0] });
  assert.equal(r.same, 1, 'one colleague gave the same answer');
  await t.ok('zoe', 'POST', `/api/play/${d}/next`);
  await t.ok('zoe', 'POST', `/api/play/${d}/skip`);
  await t.ok('zoe', 'POST', `/api/play/${d}/next`);
  await t.ok('zoe', 'POST', `/api/play/${d}/skip`);

  const lb = await t.ok('alice', 'GET', '/api/leaderboard?period=day');
  assert.deepEqual(lb.rows.map(x => [x.name, x.score]), [['ALICE', 200], ['ZOE', 100]]);
  const teams = await t.ok('alice', 'GET', '/api/leaderboard?period=teams');
  assert.equal(teams.rows.length, 2);
  // a second start does not create a second run
  const st = await t.ok('alice', 'POST', `/api/play/${d}/start`);
  assert.equal(st.finished, true);
});

test('streaks, archive play and day rollover', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice');
  const day1 = (await t.ok('alice', 'GET', '/api/today')).date;
  await playDay(t, 'alice', day1, ['strawberry', 'sweden', 'red']);
  t.tick(86400_000);
  const day2 = (await t.ok('alice', 'GET', '/api/today')).date;
  assert.notEqual(day1, day2);
  let today = await t.ok('alice', 'GET', '/api/today');
  assert.equal(today.streak.current, 1, 'streak survives until today is over');
  await playDay(t, 'alice', day2, [null, null, null]);
  today = await t.ok('alice', 'GET', '/api/today');
  assert.equal(today.streak.current, 2);
  t.tick(86400_000 * 2); // a day is missed (someone else creates it)
  await addPlayer(t, 'zoe');
  const day3 = (await t.ok('zoe', 'GET', '/api/today')).date;
  t.tick(86400_000);
  const day4 = (await t.ok('alice', 'GET', '/api/today')).date;
  today = await t.ok('alice', 'GET', '/api/today');
  assert.equal(today.streak.current, 0);
  assert.equal(today.streak.best, 2);
  // archive: day3 can be played later, but does not count
  const arch = await t.ok('alice', 'GET', '/api/archive');
  assert.deepEqual(arch.days.map(x => x.date), [day4, day3, day2, day1]);
  const s = await t.ok('alice', 'POST', `/api/play/${day3}/start`);
  assert.equal(s.mode, 'archive');
  await playDay(t, 'alice', day3, ['strawberry', 'sweden', 'red']);
  today = await t.ok('alice', 'GET', '/api/today');
  assert.equal(today.streak.current, 0, 'archive play does not repair a streak');
  const lb = await t.ok('alice', 'GET', `/api/leaderboard?period=day&date=${day3}`);
  assert.equal(lb.rows.length, 0, 'archive play is not on the daily leaderboard');
  // past days can be revealed without playing
  await t.ok('zoe', 'GET', `/api/reveal/${day1}`);
  // future days are locked
  assert.equal((await t.call('alice', 'POST', `/api/play/${addDays(day4, 1)}/start`)).status, 403);
  const stats = await t.ok('alice', 'GET', '/api/stats');
  assert.equal(stats.games, 2);
  assert.equal(stats.streak.best, 2);
  assert.equal(stats.bestScore, Math.max(...stats.history.filter(h => h.mode === 'live').map(h => h.score)));
  assert.equal(stats.history.length, 3);
});

test('admin: schedule, questions, misses and retro-award, backup', async () => {
  const t = await withAdmin(setup());
  await addPlayer(t, 'alice');
  const { prompts } = await t.ok('admin', 'GET', '/api/admin/prompts');
  assert.equal(prompts.length, 5);
  const fruit = prompts.find(p => p.text === 'Name a red fruit');
  const nordic = prompts.find(p => p.text === 'Name a Nordic country');
  const today = (await t.ok('admin', 'GET', '/api/admin/overview')).today;
  await t.ok('admin', 'PUT', `/api/admin/schedule/${today}`, { promptIds: [fruit.id, nordic.id] });
  // alice misses "red currant" (not in the list) and times out
  await t.ok('alice', 'POST', `/api/play/${today}/start`);
  await t.ok('alice', 'POST', `/api/play/${today}/next`);
  assert.equal((await t.ok('alice', 'POST', `/api/play/${today}/guess`, { text: 'Red currants' })).result, 'rejected');
  t.tick(40_000);
  await t.ok('alice', 'GET', `/api/play/${today}`);
  // the schedule is now locked
  assert.equal((await t.call('admin', 'PUT', `/api/admin/schedule/${today}`, { promptIds: [nordic.id] })).status, 409);
  // admin reviews misses and accepts it as tier 4
  const { misses } = await t.ok('admin', 'GET', '/api/admin/misses');
  assert.equal(misses.length, 1);
  assert.equal(misses[0].raw, 'Red currants');
  const acc = await t.ok('admin', 'POST', '/api/admin/misses/accept', { promptId: fruit.id, text: 'Redcurrant', tier: 4 });
  assert.equal(acc.awarded, 1, "alice's earlier guess is now awarded");
  const state = await t.ok('alice', 'GET', `/api/play/${today}`);
  assert.equal(state.score, 75);
  assert.equal(state.rounds[0].outcome, 'awarded');
  assert.equal((await t.ok('admin', 'GET', '/api/admin/misses')).misses.length, 0);
  // editing: collisions are rejected
  const full = await t.ok('admin', 'GET', `/api/admin/prompts/${fruit.id}`);
  const dup = await t.call('admin', 'PUT', `/api/admin/prompts/${fruit.id}`, { ...full, answers: [...full.answers, { answer: 'cherries', tier: 2 }] });
  assert.equal(dup.status, 400);
  // autofill skips inactive weekdays and existing days
  await t.ok('admin', 'PUT', '/api/admin/settings', { activeWeekdays: [0, 1, 2, 3, 4] });
  const { created } = await t.ok('admin', 'POST', '/api/admin/schedule/autofill', { days: 7 });
  assert.equal(created.length, 4, `created ${created}`); // 7 days minus today (exists) minus Fri+Sat
  // import with update merges answers
  const upd = await t.ok('admin', 'POST', '/api/admin/import', { name: 'x.txt', content: 'Q: Name a red fruit\n5 Goji berry\nQ: Name a brand new prompt here\n1 Yes', mode: 'update' });
  assert.deepEqual([upd.added, upd.updated, upd.errors.length], [1, 1, 0]);
  const exp = await t.call('admin', 'GET', '/api/admin/export?format=csv');
  assert.match(exp.file.data, /Goji berry/);
  const bk = await t.call('admin', 'GET', '/api/admin/backup');
  assert.equal(bk.file.data.subarray(0, 15).toString(), 'SQLite format 3');
});
