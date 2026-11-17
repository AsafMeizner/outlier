import { Plot, TIER_COLORS } from './plot.js';

// ---------- tiny helpers ----------
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v; // CSSOM, allowed by the strict CSP
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : String(kid));
  return el;
}
export const $ = sel => document.querySelector(sel);
export const view = () => $('#view');
export function render(...nodes) { const v = view(); v.replaceChildren(...nodes); return v; }
export function toast(msg, bad = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.className = ''; }, 3200);
}
export const fmtDate = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
export const tierChip = (t, label) => h('span', { class: 'tier', 'data-t': String(t || 0) }, label ?? (t ? state.settings.tiers[t - 1].name : 'Missed'));

export const state = { me: null, settings: null, today: null };

export class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-Outlier': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
  if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/me')) { state.me = null; go('/login'); }
  if (res.status === 428) go('/password');
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}
export const go = path => { if (location.hash !== '#' + path) location.hash = path; else route(); };

function form(fields, submitLabel, onSubmit, extra) {
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { class: 'btn big', type: 'submit' }, submitLabel);
  const f = h('form', {
    async onsubmit(e) {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      try { await onSubmit(Object.fromEntries(new FormData(f))); }
      catch (x) { err.textContent = x.message; }
      finally { btn.disabled = false; }
    },
  }, fields.map(([name, label, type = 'text', attrs = {}]) => h('div', { class: 'field' },
    h('label', { for: 'f-' + name }, label), h('input', { id: 'f-' + name, name, type, ...attrs }))), err, h('div', { class: 'row' }, btn, extra));
  return f;
}

// ---------- header ----------
const LOGO = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(ns, 'svg'); s.setAttribute('viewBox', '0 0 32 32'); s.setAttribute('aria-hidden', 'true');
  for (const [cx, cy, r, f] of [[7, 25, 2, '#8a9bb0'], [11, 23, 2, '#8a9bb0'], [8, 20, 2, '#8a9bb0'], [13, 26, 2, '#8a9bb0'], [24, 8, 3.5, '#e0337a']]) {
    const c = document.createElementNS(ns, 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r); c.setAttribute('fill', f); s.append(c);
  }
  return s;
};
function header(active) {
  const top = $('#top');
  if (!state.me) { top.hidden = true; return; }
  top.hidden = false;
  const link = (path, label) => h('a', { href: '#' + path, 'aria-current': active === path ? 'page' : null }, label);
  top.replaceChildren(
    h('a', { class: 'brand', href: '#/' }, LOGO(), state.settings.siteName),
    h('nav', { 'aria-label': 'Main' }, link('/', 'Today'), link('/leaderboard', 'Leaderboard'), link('/archive', 'Archive'), link('/me', 'My stats'), link('/how', 'How to play'),
      state.me.role === 'admin' ? link('/admin', 'Admin') : null),
    h('div', { class: 'who' }, h('span', {}, state.me.displayName),
      h('button', { type: 'button', async onclick() { await api('POST', '/logout'); state.me = null; go('/login'); } }, 'Sign out')),
  );
  document.title = state.settings.siteName;
}

// ---------- auth screens ----------
function loginView() {
  header();
  const reg = state.settings.registration !== 'closed';
  render(h('div', { class: 'auth' },
    h('h1', {}, state.settings.siteName), h('p', { class: 'muted' }, state.settings.tagline),
    h('div', { class: 'panel' },
      form([['username', 'Username', 'text', { autocomplete: 'username', required: true, autofocus: true }], ['password', 'Password', 'password', { autocomplete: 'current-password', required: true }]],
        'Sign in', async d => { const r = await api('POST', '/login', d); state.me = r.user; go(r.user.mustChange ? '/password' : '/'); }),
      h('p', { class: 'muted', style: 'margin:1rem 0 0' }, reg ? h('a', { href: '#/register' }, 'Create an account') : 'Ask an admin for an account.',
        reg ? '' : ' Forgot your password? An admin can reset it.')),
  ));
}
function registerView() {
  header();
  const fields = [['username', 'Username', 'text', { autocomplete: 'username', required: true, pattern: '[A-Za-z0-9._-]{2,32}', title: '2-32 letters, numbers, dot, dash or underscore' }],
    ['displayName', 'Name shown on the leaderboard', 'text', { maxlength: 40, required: true }],
    ['team', 'Team or department (optional)', 'text', { maxlength: 40 }],
    ['password', 'Password (8+ characters)', 'password', { autocomplete: 'new-password', minlength: 8, required: true }]];
  if (state.settings.registration === 'code') fields.push(['inviteCode', 'Invite code', 'text', { required: true }]);
  render(h('div', { class: 'auth' }, h('h1', {}, 'Join ' + state.settings.siteName),
    h('div', { class: 'panel' }, form(fields, 'Create account', async d => { const r = await api('POST', '/register', d); state.me = r.user; go('/'); }),
      h('p', { class: 'muted', style: 'margin:1rem 0 0' }, h('a', { href: '#/login' }, 'I already have an account')))));
}
function setupView(token) {
  header();
  render(h('div', { class: 'auth' }, h('h1', {}, 'First-time setup'),
    h('p', {}, 'Create the admin account. The setup code is printed in the server window.'),
    h('div', { class: 'panel' }, form([['token', 'Setup code', 'text', { value: token || '', required: true }],
      ['username', 'Admin username', 'text', { required: true, autocomplete: 'username' }], ['displayName', 'Your name', 'text', { required: true }],
      ['password', 'Password (8+ characters)', 'password', { minlength: 8, required: true, autocomplete: 'new-password' }]],
    'Create admin account', async d => { const r = await api('POST', '/setup', d); state.me = r.user; toast('Admin account created'); go('/admin'); }))));
}
function passwordView() {
  header('/me');
  const forced = state.me?.mustChange;
  render(h('div', { class: 'auth' }, h('h1', {}, forced ? 'Choose your password' : 'Change password'),
    forced ? h('p', {}, 'You signed in with a temporary password. Pick your own to continue.') : null,
    h('div', { class: 'panel' }, form([['current', forced ? 'Temporary password' : 'Current password', 'password', { required: true, autocomplete: 'current-password' }],
      ['next', 'New password (8+ characters)', 'password', { minlength: 8, required: true, autocomplete: 'new-password' }]],
    'Save password', async d => { await api('POST', '/password', d); state.me.mustChange = false; toast('Password saved'); go('/'); }))));
}

// ---------- home ----------
async function homeView() {
  header('/');
  const t = await api('GET', '/today');
  const tierNames = state.settings.tiers.map(x => x.name);
  const canvas = h('canvas', { 'aria-label': `Today ${plural(t.players, 'colleague')} finished. Rings show how rare an answer is.`, role: 'img' });
  let action;
  if (!t.available) action = h('p', {}, 'No puzzle today. See you next time.');
  else if (t.status === 'done') action = h('div', { class: 'row', style: 'justify-content:flex-end' },
    h('a', { class: 'btn', href: `#/results/${t.date}` }, 'See your results'), h('a', { class: 'btn ghost', href: '#/leaderboard' }, 'Leaderboard'));
  else action = h('a', { class: 'btn hot big', href: `#/play/${t.date}` }, t.status === 'playing' ? 'Continue playing' : 'Play today');
  const s = t.streak;
  const left = Math.max(0, t.endsAt - t.serverNow), hrs = Math.floor(left / 3600_000), mins = Math.floor(left / 60_000) % 60;
  render(h('div', { class: 'page' },
    h('section', { class: 'hero' }, canvas,
      h('div', { class: 'over' },
        h('p', { class: 'day' }, t.available ? `Day ${t.dayNumber}` : fmtDate(t.date, { weekday: 'long', day: 'numeric', month: 'long' })),
        t.available ? h('p', { class: 'cats' }, `${plural(t.promptCount, 'prompt')}, ${t.roundSeconds} seconds each: ${[...new Set(t.categories)].join(', ')}`) : null,
        action)),
    h('div', { class: 'stats' },
      h('div', {}, h('b', {}, t.status === 'done' ? t.score : '–'), h('span', {}, 'Your score today')),
      h('div', {}, h('b', {}, s.current), h('span', {}, s.current && !s.playedToday && t.available ? 'Day streak (play to keep it)' : 'Day streak')),
      h('div', {}, h('b', {}, s.best), h('span', {}, 'Best streak')),
      h('div', {}, h('b', {}, t.players), h('span', {}, 'Finished today')),
      h('div', {}, h('b', {}, `${hrs}h ${mins}m`), h('span', {}, 'Until the next puzzle'))),
    h('div', { class: 'panel' }, h('h2', {}, 'How it works'),
      h('p', {}, 'Each prompt names a category. Type any answer that fits. The rarer your answer, the more it scores:'),
      h('div', { class: 'row' }, state.settings.tiers.map(x => h('span', {}, tierChip(x.id, `${x.name} ${x.points}`)))),
      h('p', { class: 'muted', style: 'margin-top:1rem' }, 'Answers that are not on the list are turned away, and you can try again while the clock runs. Answers unlock when you finish.'))));
  const plot = new Plot(canvas, { tierNames, crowd: Math.max(18, t.players * 3), seed: t.dayNumber || 3, slots: t.promptCount || 6 });
  if (t.status === 'done') {
    const rev = await api('GET', `/reveal/${t.date}`).catch(() => null);
    if (rev) plot.setPoints(rev.prompts.map((p, i) => ({ tier: p.mine?.tier || 0, i })));
  }
}

// ---------- play ----------
let ticker = null;
async function playView(date) {
  header('/');
  clearInterval(ticker);
  let st = await api('POST', `/play/${date}/start`);
  if (st.finished) return go(`/results/${date}`);
  const tierNames = state.settings.tiers.map(x => x.name);
  const progress = h('div', { class: 'progress', 'aria-hidden': 'true' });
  const card = h('section', { class: 'promptcard', 'aria-live': 'polite' });
  const canvas = h('canvas', { role: 'img', 'aria-label': 'Your answers so far, by rarity' });
  const verdict = h('div', { class: 'verdict' });
  render(h('div', { class: 'play' },
    h('div', { class: 'spread' }, h('h1', { style: 'font-size:var(--step-2)' }, `Day ${st.dayNumber}${st.mode === 'archive' ? ' (archive)' : ''}`), h('span', { class: 'num muted', id: 'score' })),
    progress, card, h('section', { class: 'mini' }, canvas, verdict)));
  const plot = new Plot(canvas, { tierNames, crowd: 26, seed: st.dayNumber, slots: st.total, stretch: true });
  plot.setPoints(st.rounds.map(r => ({ tier: r.tier, i: r.position })));
  let offset = st.serverNow - Date.now();

  const paint = () => {
    progress.replaceChildren(...Array.from({ length: st.total }, (_, i) => {
      const r = st.rounds[i];
      return h('i', { class: r ? 'done' : i === st.position ? 'now' : '', 'data-tier': r ? String(r.tier) : null });
    }));
    $('#score').textContent = `${st.score} points`;
  };
  const showVerdict = (tier, points, lines) => {
    verdict.replaceChildren(
      h('p', { class: 'tiername', style: `color:${TIER_COLORS[tier] || TIER_COLORS[1]}` }, tier ? tierNames[tier - 1] : lines.title),
      h('div', { class: 'spread' }, h('span', {}, lines.text), h('span', { class: 'pts' }, `+${points}`)));
  };

  const waitScreen = () => {
    clearInterval(ticker);
    paint();
    if (st.finished) {
      card.replaceChildren(h('p', { class: 'cat' }, 'All done'), h('p', { class: 'prompt' }, `${st.score} points`),
        h('a', { class: 'btn hot big', href: `#/results/${date}` }, 'See answers and results'));
      return;
    }
    const startBtn = h('button', { class: 'btn hot big', type: 'button', onclick: begin }, st.position === 0 ? 'Start the first prompt' : 'Next prompt');
    card.replaceChildren(
      h('p', { class: 'cat' }, `Prompt ${st.position + 1} of ${st.total}`),
      h('p', { class: 'prompt' }, st.upNext?.category || ''),
      h('p', { class: 'muted' }, `The ${st.roundSeconds}-second clock starts when you press the button.`), startBtn);
    startBtn.focus();
  };

  async function begin() {
    st = await api('POST', `/play/${date}/next`);
    offset = st.serverNow - Date.now();
    if (st.finished || !st.current) return waitScreen();
    roundScreen();
  }

  function roundScreen() {
    paint();
    verdict.replaceChildren();
    const cur = st.current;
    const bar = h('div'), timer = h('div', { class: 'timer' }, bar), secs = h('span', { class: 'secs' });
    const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, maxlength: 100, 'aria-label': 'Your answer', placeholder: 'Type an answer…' });
    const fb = h('p', { class: 'feedback', role: 'status' });
    let busy = false, over = false;
    const submit = h('button', { class: 'btn big', type: 'submit' }, 'Submit');
    const pass = h('button', { class: 'btn ghost', type: 'button', async onclick() { if (over) return; over = true; clearInterval(ticker); st = await api('POST', `/play/${date}/skip`); finishRound(0, 0, { title: 'Passed', text: 'No points this time.' }); } }, 'Pass');
    const f = h('form', {
      class: 'answer',
      async onsubmit(e) {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || busy || over) return;
        busy = true; submit.disabled = true;
        try {
          const r = await api('POST', `/play/${date}/guess`, { text });
          if (r.result === 'rejected') {
            fb.className = 'feedback no'; fb.textContent = `“${text}” isn't on the list. Try another.`;
            input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); input.select();
          } else if (r.result === 'accepted') {
            over = true; clearInterval(ticker); st = r.state;
            const others = r.same === 0 ? 'Nobody else has said this yet.' : `${plural(r.same, 'colleague')} said this too.`;
            finishRound(r.tier, r.points, { text: `${r.fuzzy ? `Close enough to “${r.answer}”. ` : `“${r.answer}”. `}${others}` });
          } else { over = true; clearInterval(ticker); st = r.state; timeUp(); }
        } catch (x) { fb.className = 'feedback no'; fb.textContent = x.message; }
        finally { busy = false; submit.disabled = false; if (!over) input.focus(); }
      },
    }, input, submit);
    card.replaceChildren(h('p', { class: 'cat' }, `${cur.category}, prompt ${cur.position + 1} of ${st.total}`),
      h('p', { class: 'prompt' }, cur.text), timer, h('div', { class: 'spread' }, secs, pass), f, fb);
    input.focus();
    const total = st.roundSeconds * 1000;
    const tick = async () => {
      const left = cur.deadline - (Date.now() + offset);
      bar.style.transform = `scaleX(${Math.max(0, left / total)})`;
      secs.textContent = `${Math.max(0, Math.ceil(left / 1000))}s`;
      timer.classList.toggle('hot', left < 8000);
      if (left <= -1600 && !over) {
        over = true; clearInterval(ticker);
        st = await api('GET', `/play/${date}`);
        timeUp();
      }
    };
    tick(); ticker = setInterval(tick, 100);
  }
  function timeUp() { finishRound(0, 0, { title: "Time's up", text: 'No points this round.' }); }
  function finishRound(tier, points, lines) {
    const pos = st.rounds.length - 1;
    plot.launch(tier, st.rounds[pos]?.position ?? pos);
    showVerdict(tier, points, lines);
    waitScreen();
  }

  if (st.current) roundScreen(); else waitScreen();
}

// ---------- results ----------
async function resultsView(date) {
  header('/archive');
  const r = await api('GET', `/reveal/${date}`);
  const tierNames = state.settings.tiers.map(x => x.name);
  const total = r.prompts.reduce((s, p) => s + (p.mine?.points || 0), 0);
  const played = r.prompts.some(p => p.mine);
  const canvas = h('canvas', { role: 'img', 'aria-label': 'Your answers plotted by rarity' });
  const shareText = `${state.settings.siteName} day ${r.dayNumber}: ${total} points\n` + r.prompts.map(p => (p.mine?.tier ? tierNames[p.mine.tier - 1] : 'Missed')).join(', ');
  const copy = async () => {
    try { await navigator.clipboard.writeText(shareText); }
    catch { const ta = h('textarea', {}, shareText); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast('Result copied');
  };
  render(h('div', { class: 'page' },
    h('div', { class: 'spread' }, h('h1', {}, `Day ${r.dayNumber}`), h('span', { class: 'muted' }, fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))),
    played ? h('section', { class: 'hero' }, canvas, h('div', { class: 'over' }, h('p', { class: 'day num' }, String(total)), h('p', { class: 'cats' }, 'points'),
      h('div', { class: 'row', style: 'justify-content:flex-end' }, h('button', { class: 'btn ghost small', type: 'button', onclick: copy }, 'Copy result'), h('a', { class: 'btn small', href: '#/leaderboard' }, 'Leaderboard')))) : null,
    h('section', { class: 'panel' }, h('p', { class: 'muted' }, `${plural(r.players, 'player')} finished this day. Answers are listed from most to least given.`),
      r.prompts.map(p => {
        const given = p.answers.filter(a => a.count > 0);
        return h('article', { class: 'reveal-item' },
          h('h3', {}, p.text), h('p', { class: 'muted', style: 'margin:0' }, p.category),
          p.mine ? h('p', { style: 'margin:.5rem 0 0' }, p.mine.points ? h('span', {}, 'You said ', h('b', {}, `“${p.mine.answer}”`), ': ', tierChip(p.mine.tier), ` +${p.mine.points}`,
            p.mine.outcome === 'awarded' ? ' (accepted later by an admin)' : '', p.mine.same ? `, with ${plural(p.mine.same, 'colleague')}` : ', and nobody else did')
            : h('span', {}, tierChip(0, p.mine.outcome === 'skipped' ? 'Passed' : 'No answer'))) : null,
          given.length ? h('div', { class: 'chips' }, given.slice(0, 24).map(a => h('span', { class: p.mine?.answer === a.answer ? 'mine' : '' }, a.answer, h('b', {}, a.count)))) : null,
          h('details', {}, h('summary', {}, `All ${p.answers.length} accepted answers`),
            h('div', { class: 'chips' }, [...p.answers].sort((x, y) => y.tier - x.tier || x.answer.localeCompare(y.answer))
              .map(a => h('span', {}, tierChip(a.tier, a.answer))))));
      }))));
  if (played) new Plot(canvas, { tierNames, crowd: Math.max(18, r.players * 3), seed: r.dayNumber, slots: r.prompts.length })
    .setPoints(r.prompts.map((p, i) => ({ tier: p.mine?.tier || 0, i, label: p.mine?.answer || null })));
}

// ---------- leaderboard ----------
const PERIODS = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time'], ['streak', 'Streaks'], ['teams', 'Teams']];
async function leaderboardView(period = 'day', date = '') {
  header('/leaderboard');
  const d = await api('GET', `/leaderboard?period=${period}${date ? `&date=${date}` : ''}`);
  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Period' }, PERIODS.map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === period), onclick: () => go(`/leaderboard/${k}`) }, label)));
  const me = state.me.id;
  let table;
  const rank = (rows, same) => { let r = 0; return rows.map((x, i) => { if (i === 0 || !same(rows[i - 1], x)) r = i + 1; return r; }); };
  if (!d.rows.length) table = h('p', { class: 'muted' }, period === 'teams' ? 'No team scores this week. Players can set a team on their stats page.' : 'Nobody is on the board yet. Be the first.');
  else if (period === 'day') {
    const ranks = rank(d.rows, (a, b) => a.score === b.score && a.ms === b.ms);
    table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', {}, 'Team'), h('th', { class: 'n' }, 'Outliers'), h('th', { class: 'n' }, 'Time'), h('th', { class: 'n' }, 'Points'))),
      h('tbody', {}, d.rows.map((x, i) => h('tr', { class: x.userId === me ? 'me' : '' }, h('td', { class: 'rank' }, ranks[i]), h('td', {}, x.name), h('td', { class: 'muted' }, x.team),
        h('td', { class: 'n' }, x.outliers || ''), h('td', { class: 'n' }, `${Math.round(x.ms / 1000)}s`), h('td', { class: 'n' }, h('b', {}, x.score))))));
  } else if (period === 'streak') {
    const ranks = rank(d.rows, (a, b) => a.current === b.current && a.best === b.best);
    table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', {}, 'Team'), h('th', { class: 'n' }, 'Current streak'), h('th', { class: 'n' }, 'Best streak'))),
      h('tbody', {}, d.rows.map((x, i) => h('tr', { class: x.userId === me ? 'me' : '' }, h('td', { class: 'rank' }, ranks[i]), h('td', {}, x.name), h('td', { class: 'muted' }, x.team),
        h('td', { class: 'n' }, h('b', {}, x.current), x.current && !x.playedToday ? h('small', {}, ' (not yet today)') : ''), h('td', { class: 'n' }, x.best)))));
  } else if (period === 'teams') {
    table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Team'), h('th', { class: 'n' }, 'Players'), h('th', { class: 'n' }, 'Games'), h('th', { class: 'n' }, 'Average per game'))),
      h('tbody', {}, d.rows.map((x, i) => h('tr', { class: x.team === state.me.team ? 'me' : '' }, h('td', { class: 'rank' }, i + 1), h('td', {}, x.team), h('td', { class: 'n' }, x.players), h('td', { class: 'n' }, x.games), h('td', { class: 'n' }, h('b', {}, x.avg))))));
  } else {
    const ranks = rank(d.rows, (a, b) => a.points === b.points && a.ms === b.ms);
    table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Player'), h('th', {}, 'Team'), h('th', { class: 'n' }, 'Days'), h('th', { class: 'n' }, 'Average'), h('th', { class: 'n' }, 'Best'), h('th', { class: 'n' }, 'Points'))),
      h('tbody', {}, d.rows.map((x, i) => h('tr', { class: x.userId === me ? 'me' : '' }, h('td', { class: 'rank' }, ranks[i]), h('td', {}, x.name), h('td', { class: 'muted' }, x.team),
        h('td', { class: 'n' }, x.games), h('td', { class: 'n' }, x.avg), h('td', { class: 'n' }, x.best), h('td', { class: 'n' }, h('b', {}, x.points))))));
  }
  const sub = period === 'day' ? fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })
    : d.from ? `${fmtDate(d.from)} to ${fmtDate(d.to)}` : 'Consecutive puzzle days played on the day';
  const picker = period === 'day' ? h('input', { type: 'date', value: d.date, max: state.today, style: 'width:auto', 'aria-label': 'Day', onchange: e => go(`/leaderboard/day/${e.target.value}`) }) : null;
  render(h('div', { class: 'page' }, h('div', { class: 'spread' }, h('h1', {}, 'Leaderboard'), picker), tabs,
    h('section', { class: 'panel' }, h('p', { class: 'muted' }, sub, period === 'teams' ? '. Teams are ranked by average score per game, so small teams can win too.' : ''), h('div', { class: 'table-wrap' }, table))));
}

// ---------- archive ----------
async function archiveView() {
  header('/archive');
  const a = await api('GET', '/archive');
  render(h('div', { class: 'page' }, h('h1', {}, 'Archive'),
    h('p', { class: 'muted' }, a.archivePlay ? 'Catch up on days you missed. Archive games show your score but do not count for the leaderboard or streaks.' : 'Answers for every past day.'),
    h('section', { class: 'panel' }, a.days.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Day'), h('th', {}, 'Date'), h('th', {}, 'Categories'), h('th', { class: 'n' }, 'Players'), h('th', { class: 'n' }, 'Top'), h('th', { class: 'n' }, 'You'), h('th', {}, ''))),
      h('tbody', {}, a.days.map(d => {
        const isToday = d.date === a.today;
        let act;
        if (d.finished) act = h('a', { href: `#/results/${d.date}` }, 'Results');
        else if (isToday) act = h('a', { class: 'btn small hot', href: `#/play/${d.date}` }, d.mode ? 'Continue' : 'Play');
        else act = h('span', { class: 'row', style: 'gap:.6rem' }, a.archivePlay ? h('a', { class: 'btn small', href: `#/play/${d.date}` }, d.mode ? 'Continue' : 'Play') : null, h('a', { href: `#/results/${d.date}` }, 'Answers'));
        return h('tr', {}, h('td', { class: 'rank' }, d.dayNumber), h('td', {}, fmtDate(d.date), isToday ? h('span', { class: 'badge hot', style: 'margin-left:.4rem' }, 'Today') : ''),
          h('td', { class: 'muted' }, d.cats.join(', ')), h('td', { class: 'n' }, d.players), h('td', { class: 'n' }, d.top ?? '–'),
          h('td', { class: 'n' }, d.mode ? h('span', {}, d.finished ? h('b', {}, d.score) : 'started', d.mode === 'archive' ? h('span', { class: 'badge', style: 'margin-left:.3rem' }, 'archive') : '') : '–'), h('td', {}, act));
      })))) : h('p', { class: 'muted' }, 'No days yet.'))));
}

// ---------- me ----------
async function meView() {
  header('/me');
  const s = await api('GET', '/stats');
  const tiers = state.settings.tiers;
  const tierTotal = tiers.reduce((n, t) => n + (s.tiers[t.name] || 0), 0) + (s.tiers.missed || 0);
  render(h('div', { class: 'page' }, h('h1', {}, state.me.displayName),
    h('div', { class: 'stats' },
      h('div', {}, h('b', {}, s.games), h('span', {}, 'Days played')), h('div', {}, h('b', {}, s.points), h('span', {}, 'Total points')),
      h('div', {}, h('b', {}, s.avg), h('span', {}, 'Average per day')), h('div', {}, h('b', {}, s.bestScore), h('span', {}, 'Best day')),
      h('div', {}, h('b', {}, s.streak.current), h('span', {}, 'Current streak')), h('div', {}, h('b', {}, s.streak.best), h('span', {}, 'Best streak'))),
    h('section', { class: 'panel' }, h('h2', {}, 'Your answers by rarity'),
      tierTotal ? h('div', { class: 'stack' }, [...tiers].reverse().map(t => {
        const n = s.tiers[t.name] || 0;
        return h('div', { class: 'spread' }, tierChip(t.id), h('div', { style: 'flex:1;height:10px;background:var(--paper);border-radius:5px;overflow:hidden' },
          h('div', { style: `height:100%;width:${(n / tierTotal * 100).toFixed(1)}%;background:${TIER_COLORS[t.id]}` })), h('span', { class: 'num', style: 'width:3rem;text-align:right' }, n));
      }), h('p', { class: 'muted' }, `Missed or passed: ${s.tiers.missed || 0}`)) : h('p', { class: 'muted' }, 'Play a day to see your rarity profile.')),
    h('section', { class: 'panel' }, h('h2', {}, 'History'), s.history.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', { class: 'n' }, 'Points'), h('th', { class: 'n' }, 'Rank'), h('th', {}, ''))),
      h('tbody', {}, s.history.map(x => h('tr', {}, h('td', {}, fmtDate(x.date)), h('td', { class: 'n' }, x.finished ? x.score : 'unfinished'),
        h('td', { class: 'n' }, x.mode === 'live' && x.finished ? `${x.rank} of ${x.players}` : h('span', { class: 'badge' }, x.mode)),
        h('td', {}, x.finished ? h('a', { href: `#/results/${x.date}` }, 'Results') : h('a', { href: `#/play/${x.date}` }, 'Continue'))))))) : h('p', { class: 'muted' }, 'Nothing yet.')),
    h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', {}, 'Profile'),
        form([['displayName', 'Name shown on the leaderboard', 'text', { value: state.me.displayName, maxlength: 40, required: true }], ['team', 'Team or department', 'text', { value: state.me.team, maxlength: 40 }]],
          'Save profile', async d => { const r = await api('POST', '/profile', d); state.me = r.user; header('/me'); toast('Profile saved'); })),
      h('section', { class: 'panel' }, h('h2', {}, 'Password'), h('p', {}, 'Signed in as ', h('b', {}, state.me.username), '.'), h('a', { class: 'btn ghost', href: '#/password' }, 'Change password')))));
}

function howView() {
  header('/how');
  const s = state.settings;
  render(h('div', { class: 'page' }, h('h1', {}, 'How to play'), h('section', { class: 'panel stack' },
    h('p', {}, `Every day there is a new set of ${plural(s.promptsPerDay, 'prompt')}. Each one names a category, like “Name a planet”. You get ${s.roundSeconds} seconds per prompt to type one answer that fits.`),
    h('p', {}, 'The twist: obvious answers are worth little. The rarer your answer, the further it lands from the crowd and the more it scores.'),
    h('table', {}, h('tbody', {}, s.tiers.map(t => h('tr', {}, h('td', {}, tierChip(t.id)), h('td', { class: 'muted' }, t.blurb), h('td', { class: 'n' }, h('b', {}, `${t.points} points`)))))),
    h('p', {}, 'If an answer is not on the list you can try another while the clock runs. Spelling slips, plurals, capitals and accents are forgiven. Pass if you are stuck.'),
    h('p', {}, 'The clock only starts when you open a prompt, so you can take a break between prompts. Your answers and everyone else’s are revealed once you finish.'),
    h('p', {}, 'Play every puzzle day to build a streak. Missed a day? Play it from the archive; it won’t count for the leaderboard, but you can still see how you would have done.'),
    h('p', { class: 'muted' }, 'Think a valid answer was turned away? Tell an admin. If they add it, you get the points retroactively.'))));
}

// ---------- router ----------
export async function route() {
  clearInterval(ticker);
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [page, a, b] = parts;
  try {
    if (!state.settings) {
      const me = await api('GET', '/me');
      state.me = me.user; state.settings = me.settings; state.today = me.today; state.needsSetup = me.needsSetup;
    }
    if (page === 'setup') return setupView(a);
    if (!state.me) {
      if (state.needsSetup) return setupView('');
      if (page === 'register') return registerView();
      return loginView();
    }
    if (state.me.mustChange || page === 'password') return passwordView();
    view().replaceChildren(h('p', { class: 'loading' }, 'Loading…'));
    switch (page) {
      case undefined: return await homeView();
      case 'login': case 'register': return go('/');
      case 'play': return await playView(a);
      case 'results': return await resultsView(a);
      case 'leaderboard': return await leaderboardView(a, b);
      case 'archive': return await archiveView();
      case 'me': return await meView();
      case 'how': return howView();
      case 'admin': { header('/admin'); const m = await import('./admin.js'); return await m.adminView(a, b); }
      default: render(h('div', { class: 'page' }, h('h1', {}, 'Page not found'), h('a', { href: '#/' }, 'Back to today')));
    }
  } catch (e) {
    if (e.status === 401 || e.status === 428) return;
    render(h('div', { class: 'page' }, h('div', { class: 'panel' }, h('h2', {}, 'That didn’t work'), h('p', {}, e.message), h('a', { class: 'btn ghost', href: '#/' }, 'Back to today'))));
  }
}
window.addEventListener('hashchange', () => { route(); view().focus({ preventScroll: true }); });
route();
