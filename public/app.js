import { Scene, lookFor, drawAvatar, drawMap, sfx, TIER_COLORS } from './scene.js';
import { t, lang, setLang, dir } from './i18n.js';

// ---------- helpers ----------
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
  const el = $('#toast'); el.textContent = msg; el.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.className = ''; }, 3200);
}
const locale = () => lang() === 'he' ? 'he-IL' : 'en-GB';
export const fmtDate = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(d + 'T12:00:00Z').toLocaleDateString(locale(), { ...opts, timeZone: 'UTC' });
export const num = n => Number(n || 0).toLocaleString(locale());
/** Points are shown as launch distance: 1 point = 10 metres. */
export const dist = points => t('{n} m', { n: num((points || 0) * 10) });
export const tierName = tr => tr ? t(`tier${tr}`) : t('Missed');
export const tierChip = (tr, label) => h('span', { class: 'tier', 'data-t': String(tr || 0) }, label ?? tierName(tr));
export function avatar(seed, size = 34) { const c = h('canvas', { class: 'avatar', 'aria-hidden': 'true' }); drawAvatar(c, seed, size); return c; }

export const state = { me: null, settings: null, today: null };
export class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export async function api(method, path, body) {
  const res = await fetch('/api' + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'X-Outlier': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: t('Server error ({n})', { n: res.status }) }));
  if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/me')) { state.me = null; go('/login'); }
  if (res.status === 428) go('/password');
  if (!res.ok) throw new ApiError(res.status, t(data.error || 'Request failed'));
  return data;
}
export const go = path => { if (location.hash !== '#' + path) location.hash = path; else route(); };

export function form(fields, submitLabel, onSubmit, extra) {
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
    h('label', { for: 'f-' + name }, label), h('input', { id: 'f-' + name, name, type, dir: 'auto', ...attrs }))), err, h('div', { class: 'row' }, btn, extra));
  return f;
}

// ---------- header ----------
function header(active) {
  const top = $('#top');
  document.documentElement.lang = lang(); document.documentElement.dir = dir();
  document.title = state.settings?.siteName || 'Outlier';
  const langBtn = h('button', { class: 'pill', type: 'button', 'aria-label': t('Switch language'), onclick() { setLang(lang() === 'he' ? 'en' : 'he'); route(); } }, lang() === 'he' ? 'EN' : 'עב');
  const soundBtn = h('button', { class: 'pill', type: 'button', 'aria-pressed': String(!sfx.muted), 'aria-label': t('Sound'),
    onclick(e) { sfx.setMuted(!sfx.muted); e.currentTarget.textContent = sfx.muted ? '🔇' : '🔊'; e.currentTarget.setAttribute('aria-pressed', String(!sfx.muted)); if (!sfx.muted) sfx.pop(); } }, sfx.muted ? '🔇' : '🔊');
  top.hidden = false;
  if (!state.me) { top.replaceChildren(h('span', { class: 'brand' }, state.settings?.siteName || 'Outlier'), h('span', { class: 'spacer' }), langBtn); return; }
  const logo = h('canvas', { class: 'logo', 'aria-hidden': 'true' }); drawAvatar(logo, state.me.username, 34);
  const link = (path, label) => h('a', { href: '#' + path, 'aria-current': active === path ? 'page' : null }, label);
  top.replaceChildren(
    h('a', { class: 'brand', href: '#/' }, logo, state.settings.siteName),
    h('nav', { 'aria-label': t('Main') }, link('/', t('Today')), link('/leaderboard', t('Leaderboard')), link('/archive', t('Archive')), link('/me', t('My stats')), link('/how', t('How to play')),
      state.me.role === 'admin' ? link('/admin', t('Admin')) : null),
    h('div', { class: 'who' }, soundBtn, langBtn,
      h('button', { class: 'pill', type: 'button', async onclick() { await api('POST', '/logout'); state.me = null; go('/login'); } }, t('Sign out'))),
  );
}

// ---------- auth ----------
function authShell(title, ...content) {
  header();
  const canvas = h('canvas', { class: 'auth-scene', 'aria-hidden': 'true' });
  render(h('div', { class: 'auth' }, h('div', { class: 'auth-art' }, canvas), h('div', { class: 'card' }, h('h1', {}, title), ...content)));
  new Scene(canvas, { look: lookFor('welcome'), rtl: dir() === 'rtl', sound: false });
}
function loginView() {
  const reg = state.settings.registration !== 'closed';
  authShell(state.settings.siteName, h('p', { class: 'muted' }, t(state.settings.tagline)),
    form([['username', t('Username'), 'text', { autocomplete: 'username', required: true, autofocus: true }], ['password', t('Password'), 'password', { autocomplete: 'current-password', required: true }]],
      t('Sign in'), async d => { const r = await api('POST', '/login', d); state.me = r.user; go(r.user.mustChange ? '/password' : '/'); }),
    h('p', { class: 'muted small' }, reg ? h('a', { href: '#/register' }, t('Create an account')) : t('Ask an admin for an account.')));
}
function registerView() {
  const fields = [['username', t('Username'), 'text', { autocomplete: 'username', required: true, pattern: '[A-Za-z0-9._\\-]{2,32}', title: t('2-32 letters, numbers, dot, dash or underscore') }],
    ['displayName', t('Name shown on the leaderboard'), 'text', { maxlength: 40, required: true }],
    ['team', t('Team or department (optional)'), 'text', { maxlength: 40 }],
    ['password', t('Password (8+ characters)'), 'password', { autocomplete: 'new-password', minlength: 8, required: true }]];
  if (state.settings.registration === 'code') fields.push(['inviteCode', t('Invite code'), 'text', { required: true }]);
  authShell(t('Join {name}', { name: state.settings.siteName }), form(fields, t('Create account'), async d => { const r = await api('POST', '/register', d); state.me = r.user; go('/'); }),
    h('p', { class: 'muted small' }, h('a', { href: '#/login' }, t('I already have an account'))));
}
function setupView(token) {
  authShell(t('First-time setup'), h('p', {}, t('Create the admin account. The setup code is printed in the server window.')),
    form([['token', t('Setup code'), 'text', { value: token || '', required: true }], ['username', t('Admin username'), 'text', { required: true, autocomplete: 'username' }],
      ['displayName', t('Your name'), 'text', { required: true }], ['password', t('Password (8+ characters)'), 'password', { minlength: 8, required: true, autocomplete: 'new-password' }]],
    t('Create admin account'), async d => { const r = await api('POST', '/setup', d); state.me = r.user; toast(t('Admin account created')); go('/admin'); }));
}
function passwordView() {
  const forced = state.me?.mustChange;
  authShell(forced ? t('Choose your password') : t('Change password'), forced ? h('p', {}, t('You signed in with a temporary password. Pick your own to continue.')) : null,
    form([['current', forced ? t('Temporary password') : t('Current password'), 'password', { required: true, autocomplete: 'current-password' }],
      ['next', t('New password (8+ characters)'), 'password', { minlength: 8, required: true, autocomplete: 'new-password' }]],
    t('Save password'), async d => { await api('POST', '/password', d); state.me.mustChange = false; toast(t('Password saved')); go('/'); }));
}

// ---------- home ----------
async function homeView() {
  header('/');
  const [td, lb] = await Promise.all([api('GET', '/today'), api('GET', '/leaderboard?period=day')]);
  const canvas = h('canvas', { class: 'hero-scene', role: 'img', 'aria-label': t('Your desk, ready for launch') });
  let action;
  if (!td.available) action = h('p', { class: 'note' }, t('No puzzle today. See you next time.'));
  else if (td.status === 'done') action = h('div', { class: 'row' }, h('a', { class: 'btn big', href: `#/results/${td.date}` }, t('See your results')), h('a', { class: 'btn ghost', href: '#/leaderboard' }, t('Leaderboard')));
  else action = h('a', { class: 'launch-btn', href: `#/play/${td.date}` }, h('span', {}, td.status === 'playing' ? t('Continue') : t('Launch')));
  const s = td.streak;
  const left = Math.max(0, td.endsAt - td.serverNow), hrs = Math.floor(left / 3600_000), mins = Math.floor(left / 60_000) % 60;
  render(h('div', { class: 'home' },
    h('section', { class: 'hero' }, canvas,
      h('div', { class: 'hero-card' },
        h('p', { class: 'day' }, td.available ? t('Day {n}', { n: td.dayNumber }) : fmtDate(td.date, { weekday: 'long', day: 'numeric', month: 'long' })),
        td.available ? h('p', { class: 'cats' }, t('{n} prompts, {s} seconds each', { n: td.promptCount, s: td.roundSeconds })) : null,
        td.available ? h('div', { class: 'chips' }, [...new Set(td.categories)].map(c => h('span', { dir: 'auto' }, c))) : null,
        action)),
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('b', {}, td.status === 'done' ? dist(td.score) : '—'), h('span', {}, t('Your distance today'))),
      h('div', { class: 'tile hot' }, h('b', {}, `🔥 ${s.current}`), h('span', {}, s.current && !s.playedToday && td.available ? t('Day streak, play to keep it') : t('Day streak'))),
      h('div', { class: 'tile' }, h('b', {}, s.best), h('span', {}, t('Best streak'))),
      h('div', { class: 'tile' }, h('b', {}, td.players), h('span', {}, t('Launched today'))),
      h('div', { class: 'tile' }, h('b', {}, t('{h}h {m}m', { h: hrs, m: mins })), h('span', {}, t('Until the next puzzle')))),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', {}, t('Furthest today')),
        lb.rows.length ? h('ol', { class: 'podium' }, lb.rows.slice(0, 5).map((r, i) => h('li', { class: r.userId === state.me.id ? 'me' : '' },
          h('span', { class: 'rank' }, i + 1), avatar(r.username || r.name), h('span', { class: 'name', dir: 'auto' }, r.name), h('b', {}, dist(r.score)))))
          : h('p', { class: 'muted' }, t('Nobody has launched yet. Be the first.')),
        h('a', { href: '#/leaderboard' }, t('Full leaderboard'))),
      h('section', { class: 'card' }, h('h2', {}, t('How far will you fly?')),
        h('p', {}, t('Each prompt names a category. Type any answer that fits. The rarer your answer, the further your chair flies.')),
        h('ul', { class: 'tierlist' }, [1, 2, 3, 4, 5].map(n => h('li', {}, tierChip(n), h('span', { class: 'muted' }, t(`where${n}`)), h('b', {}, dist(state.settings.tiers[n - 1].points)))))))));
  new Scene(canvas, { look: lookFor(state.me.username), rtl: dir() === 'rtl', sound: false });
}

// ---------- play ----------
let ticker = null;
async function playView(date) {
  header('/');
  clearInterval(ticker);
  let st = await api('POST', `/play/${date}/start`);
  if (st.finished) return go(`/results/${date}`);
  const canvas = h('canvas', { class: 'play-scene', role: 'img', 'aria-label': t('Launch scene') });
  const flags = h('ol', { class: 'flags', 'aria-label': t('Progress') });
  const total = h('b', { class: 'total' });
  const card = h('section', { class: 'card board', 'aria-live': 'polite' });
  const stamp = h('div', { class: 'stamp', 'aria-live': 'polite', hidden: true });
  render(h('div', { class: 'play' },
    h('div', { class: 'playbar' }, h('span', { class: 'dayname' }, t('Day {n}', { n: st.dayNumber }), st.mode === 'archive' ? h('span', { class: 'badge' }, t('archive')) : ''), flags, total),
    h('div', { class: 'stage' }, canvas, stamp), card));
  const scene = new Scene(canvas, { look: lookFor(state.me.username), rtl: dir() === 'rtl', sound: true });
  let offset = st.serverNow - Date.now();

  const paint = () => {
    flags.replaceChildren(...Array.from({ length: st.total }, (_, i) => {
      const r = st.rounds[i];
      return h('li', { class: r ? 'done' : i === st.position ? 'now' : '', 'data-tier': r ? String(r.tier) : null, title: r ? tierName(r.tier) : '' }, String(i + 1));
    }));
    total.textContent = dist(st.score);
  };
  const showStamp = (tier, lines) => {
    stamp.hidden = false;
    stamp.style.setProperty('--c', TIER_COLORS[tier] || '#94a3b8');
    stamp.replaceChildren(h('b', {}, lines.title), lines.dist ? h('span', { class: 'dist' }, lines.dist) : null, h('small', { dir: 'auto' }, lines.text));
    stamp.classList.remove('in'); void stamp.offsetWidth; stamp.classList.add('in');
  };
  const nextButton = () => {
    paint();
    if (st.finished) {
      card.replaceChildren(h('p', { class: 'cat' }, t('All done')), h('p', { class: 'prompt' }, t('You flew {d} today', { d: dist(st.score) })),
        h('a', { class: 'btn big hot', href: `#/results/${date}` }, t('See answers and results')));
      return;
    }
    const b = h('button', { class: 'btn big hot', type: 'button', onclick: begin }, st.position === 0 ? t('Show the first prompt') : t('Next prompt'));
    card.replaceChildren(h('p', { class: 'cat' }, t('Prompt {a} of {b}', { a: st.position + 1, b: st.total })),
      h('p', { class: 'prompt', dir: 'auto' }, st.upNext?.category || ''), h('p', { class: 'muted' }, t('The {s}-second clock starts when you press the button.', { s: st.roundSeconds })), b);
    b.focus();
  };

  async function begin() {
    stamp.hidden = true;
    scene.reset();
    st = await api('POST', `/play/${date}/next`);
    offset = st.serverNow - Date.now();
    if (st.finished || !st.current) return nextButton();
    roundScreen();
  }

  function roundScreen() {
    paint();
    const cur = st.current;
    const input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, maxlength: 100, dir: 'auto', 'aria-label': t('Your answer'), placeholder: t('Type an answer…') });
    const fb = h('p', { class: 'feedback', role: 'status' });
    const secs = h('span', { class: 'secs' });
    let busy = false, over = false;
    const submit = h('button', { class: 'btn big', type: 'submit' }, t('Submit'));
    const pass = h('button', { class: 'btn ghost', type: 'button', async onclick() {
      if (over) return; over = true; clearInterval(ticker); scene.setClock(null);
      st = await api('POST', `/play/${date}/skip`); scene.miss('pass');
      showStamp(0, { title: t('Passed'), text: t('No distance this time.') }); setTimeout(nextButton, 900);
    } }, t('Pass'));
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
            scene.reject();
            fb.className = 'feedback no'; fb.textContent = t('“{a}” isn’t on the list. Try another.', { a: text });
            input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); input.select();
          } else if (r.result === 'accepted') {
            over = true; clearInterval(ticker); scene.setClock(null); st = r.state;
            card.replaceChildren(h('p', { class: 'cat', dir: 'auto' }, cur.category), h('p', { class: 'prompt small', dir: 'auto' }, cur.text),
              h('p', { class: 'launching' }, t('Launching…')));
            const others = r.same === 0 ? t('Nobody else has said this yet.') : t('{n} colleagues said this too.', { n: r.same });
            scene.launch(r.tier, {
              label: r.answer, meters: dist(r.points),
              onLand: () => paint() || showStamp(r.tier, { title: tierName(r.tier), dist: `+${dist(r.points)}`, text: `${r.fuzzy ? t('Close enough to “{a}”.', { a: r.answer }) : `“${r.answer}”.`} ${others}` }),
              onDone: nextButton,
            });
          } else { over = true; clearInterval(ticker); st = r.state; timeUp(); }
        } catch (x) { fb.className = 'feedback no'; fb.textContent = x.message; }
        finally { busy = false; submit.disabled = false; if (!over) input.focus(); }
      },
    }, input, submit);
    card.replaceChildren(h('div', { class: 'spread' }, h('p', { class: 'cat', dir: 'auto' }, cur.category), secs),
      h('p', { class: 'prompt', dir: cur.lang === 'he' ? 'rtl' : 'auto' }, cur.text), f, h('div', { class: 'spread' }, fb, pass));
    input.focus();
    const totalMs = st.roundSeconds * 1000;
    let lastSec = null;
    const tick = async () => {
      const left = cur.deadline - (Date.now() + offset);
      scene.setClock(Math.max(0, left / totalMs));
      const sec = Math.max(0, Math.ceil(left / 1000));
      secs.textContent = t('{n}s', { n: sec }); secs.classList.toggle('hot', left < 8000);
      if (sec !== lastSec && sec <= 5 && sec > 0) sfx.tick(true);
      lastSec = sec;
      if (left <= -1600 && !over) {
        over = true; clearInterval(ticker); scene.setClock(null);
        st = await api('GET', `/play/${date}`);
        timeUp();
      }
    };
    tick(); ticker = setInterval(tick, 100);
  }
  function timeUp() { scene.miss('timeout'); showStamp(0, { title: t("Time's up"), text: t('No distance this round.') }); setTimeout(nextButton, 1200); }

  if (st.current) roundScreen(); else nextButton();
}

// ---------- results ----------
async function resultsView(date) {
  header('/archive');
  const r = await api('GET', `/reveal/${date}`);
  const totalPts = r.prompts.reduce((s, p) => s + (p.mine?.points || 0), 0);
  const played = r.prompts.some(p => p.mine);
  const map = h('canvas', { class: 'map', role: 'img', 'aria-label': t('Where each of your answers landed') });
  const counter = h('b', { class: 'big-dist' }, dist(0));
  const shareText = `${state.settings.siteName}, ${t('Day {n}', { n: r.dayNumber })}: ${dist(totalPts)}\n` + r.prompts.map(p => tierName(p.mine?.points ? p.mine.tier : 0)).join(', ');
  const copy = async () => {
    try { await navigator.clipboard.writeText(shareText); }
    catch { const ta = h('textarea', {}, shareText); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast(t('Result copied'));
  };
  render(h('div', { class: 'page' },
    h('div', { class: 'spread' }, h('h1', {}, t('Day {n}', { n: r.dayNumber })), h('span', { class: 'muted' }, fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))),
    played ? h('section', { class: 'card result-hero' }, h('div', { class: 'spread' }, h('div', {}, h('span', { class: 'muted' }, t('Total distance')), counter),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: copy }, t('Copy result')), h('a', { class: 'btn', href: '#/leaderboard' }, t('Leaderboard')))), map) : null,
    h('section', { class: 'card' }, h('p', { class: 'muted' }, t('{n} players finished this day. Answers are listed from most to least given.', { n: r.players })),
      r.prompts.map((p, i) => {
        const given = p.answers.filter(a => a.count > 0);
        const m = p.mine;
        return h('article', { class: 'reveal-item' },
          h('div', { class: 'spread' }, h('h3', { dir: 'auto' }, h('span', { class: 'qnum' }, i + 1), p.text), m ? tierChip(m.points ? m.tier : 0, m.points ? `${tierName(m.tier)} +${dist(m.points)}` : (m.outcome === 'skipped' ? t('Passed') : t('No answer'))) : null),
          m?.points ? h('p', { class: 'mine', dir: 'auto' }, t('You said “{a}”', { a: m.answer }), m.outcome === 'awarded' ? ` (${t('accepted later by an admin')})` : '',
            '. ', m.same ? t('{n} colleagues said the same.', { n: m.same }) : t('Nobody else did.')) : null,
          given.length ? h('div', { class: 'chips' }, given.slice(0, 24).map(a => h('span', { class: m?.answer === a.answer ? 'mine' : '', dir: 'auto' }, a.answer, h('b', {}, a.count)))) : null,
          h('details', {}, h('summary', {}, t('All {n} accepted answers', { n: p.answers.length })),
            h('div', { class: 'chips' }, [...p.answers].sort((x, y) => y.tier - x.tier || x.answer.localeCompare(y.answer)).map(a => h('span', { dir: 'auto' }, tierChip(a.tier, a.answer))))));
      }))));
  if (played) {
    requestAnimationFrame(() => drawMap(map, r.prompts.map(p => ({ tier: p.mine?.points ? p.mine.tier : 0 })), { rtl: dir() === 'rtl', labels: { office: t('Office'), lot: t('Parking'), city: t('City'), beach: t('Beach'), sea: t('Sea'), space: t('Moon') } }));
    const start = performance.now(), dur = 1200;
    const roll = now => { const k = Math.min(1, (now - start) / dur); counter.textContent = dist(Math.round(totalPts * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(roll); };
    requestAnimationFrame(roll);
  }
}

// ---------- leaderboard ----------
const PERIODS = [['day', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time'], ['streak', 'Streaks'], ['teams', 'Teams']];
async function leaderboardView(period = 'day', date = '') {
  header('/leaderboard');
  const d = await api('GET', `/leaderboard?period=${period}${date ? `&date=${date}` : ''}`);
  const tabs = h('div', { class: 'tabs', role: 'group', 'aria-label': t('Period') }, PERIODS.map(([k, label]) =>
    h('button', { type: 'button', 'aria-pressed': String(k === period), onclick: () => go(`/leaderboard/${k}`) }, t(label))));
  const me = state.me.id;
  const rank = (rows, same) => { let r = 0; return rows.map((x, i) => { if (i === 0 || !same(rows[i - 1], x)) r = i + 1; return r; }); };
  const who = x => h('td', {}, h('span', { class: 'who-cell' }, avatar(x.username || x.name, 30), h('span', { dir: 'auto' }, x.name)));
  const medal = r => h('td', { class: 'rank' }, r <= 3 ? h('span', { class: `medal m${r}` }, r) : r);
  let table;
  if (!d.rows.length) table = h('p', { class: 'muted' }, period === 'teams' ? t('No team scores this week. Players can set a team on their stats page.') : t('Nobody is on the board yet. Be the first.'));
  else if (period === 'day') {
    const ranks = rank(d.rows, (a, b) => a.score === b.score && a.ms === b.ms);
    table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, t('Player')), h('th', {}, t('Team')), h('th', { class: 'n' }, t('Moon landings')), h('th', { class: 'n' }, t('Time')), h('th', { class: 'n' }, t('Distance')))),
      h('tbody', {}, d.rows.map((x, i) => h('tr', { class: x.userId === me ? 'me' : '' }, medal(ranks[i]), who(x), h('td', { class: 'muted', dir: 'auto' }, x.team),
        h('td', { class: 'n' }, x.outliers ? `🌙 ${x.outliers}` : ''), h('td', { class: 'n' }, t('{n}s', { n: Math.round(x.ms / 1000) })), h('td', { class: 'n' }, h('b', {}, dist(x.score)))))));
  } else if (period === 'streak') {
    const ranks = rank(d.rows, (a, b) => a.current === b.current && a.best === b.best);
    table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, t('Player')), h('th', {}, t('Team')), h('th', { class: 'n' }, t('Current streak')), h('th', { class: 'n' }, t('Best streak')))),
      h('tbody', {}, d.rows.map((x, i) => h('tr', { class: x.userId === me ? 'me' : '' }, medal(ranks[i]), who(x), h('td', { class: 'muted', dir: 'auto' }, x.team),
        h('td', { class: 'n' }, h('b', {}, `🔥 ${x.current}`), x.current && !x.playedToday ? h('small', { class: 'muted' }, ` (${t('not yet today')})`) : ''), h('td', { class: 'n' }, x.best)))));
  } else if (period === 'teams') {
    table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, t('Team')), h('th', { class: 'n' }, t('Players')), h('th', { class: 'n' }, t('Games')), h('th', { class: 'n' }, t('Average per game')))),
      h('tbody', {}, d.rows.map((x, i) => h('tr', { class: x.team === state.me.team ? 'me' : '' }, medal(i + 1), h('td', { dir: 'auto' }, x.team), h('td', { class: 'n' }, x.players), h('td', { class: 'n' }, x.games), h('td', { class: 'n' }, h('b', {}, dist(x.avg)))))));
  } else {
    const ranks = rank(d.rows, (a, b) => a.points === b.points && a.ms === b.ms);
    table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, '#'), h('th', {}, t('Player')), h('th', {}, t('Team')), h('th', { class: 'n' }, t('Days')), h('th', { class: 'n' }, t('Average')), h('th', { class: 'n' }, t('Best')), h('th', { class: 'n' }, t('Distance')))),
      h('tbody', {}, d.rows.map((x, i) => h('tr', { class: x.userId === me ? 'me' : '' }, medal(ranks[i]), who(x), h('td', { class: 'muted', dir: 'auto' }, x.team),
        h('td', { class: 'n' }, x.games), h('td', { class: 'n' }, dist(x.avg)), h('td', { class: 'n' }, dist(x.best)), h('td', { class: 'n' }, h('b', {}, dist(x.points)))))));
  }
  const sub = period === 'day' ? fmtDate(d.date, { weekday: 'long', day: 'numeric', month: 'long' })
    : d.from ? t('{a} to {b}', { a: fmtDate(d.from), b: fmtDate(d.to) }) : t('Puzzle days in a row, played on the day');
  const picker = period === 'day' ? h('input', { type: 'date', value: d.date, max: state.today, class: 'date', 'aria-label': t('Day'), onchange: e => go(`/leaderboard/day/${e.target.value}`) }) : null;
  render(h('div', { class: 'page' }, h('div', { class: 'spread' }, h('h1', {}, t('Leaderboard')), picker), tabs,
    h('section', { class: 'card' }, h('p', { class: 'muted' }, sub, period === 'teams' ? `. ${t('Teams are ranked by average per game, so small teams can win too.')}` : ''), h('div', { class: 'table-wrap' }, table))));
}

// ---------- archive ----------
async function archiveView() {
  header('/archive');
  const a = await api('GET', '/archive');
  render(h('div', { class: 'page' }, h('h1', {}, t('Archive')),
    h('p', { class: 'muted' }, a.archivePlay ? t('Catch up on days you missed. Archive games show your distance but do not count for the leaderboard or streaks.') : t('Answers for every past day.')),
    h('section', { class: 'card' }, a.days.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, t('Day')), h('th', {}, t('Date')), h('th', {}, t('Categories')), h('th', { class: 'n' }, t('Players')), h('th', { class: 'n' }, t('Furthest')), h('th', { class: 'n' }, t('You')), h('th', {}, ''))),
      h('tbody', {}, a.days.map(d => {
        const isToday = d.date === a.today;
        let act;
        if (d.finished) act = h('a', { href: `#/results/${d.date}` }, t('Results'));
        else if (isToday) act = h('a', { class: 'btn small hot', href: `#/play/${d.date}` }, d.mode ? t('Continue') : t('Play'));
        else act = h('span', { class: 'row' }, a.archivePlay ? h('a', { class: 'btn small', href: `#/play/${d.date}` }, d.mode ? t('Continue') : t('Play')) : null, h('a', { href: `#/results/${d.date}` }, t('Answers')));
        return h('tr', {}, h('td', { class: 'rank' }, d.dayNumber), h('td', {}, fmtDate(d.date), isToday ? h('span', { class: 'badge hot' }, t('Today')) : ''),
          h('td', { class: 'muted', dir: 'auto' }, d.cats.join(', ')), h('td', { class: 'n' }, d.players), h('td', { class: 'n' }, d.top != null ? dist(d.top) : '—'),
          h('td', { class: 'n' }, d.mode ? h('span', {}, d.finished ? h('b', {}, dist(d.score)) : t('started'), d.mode === 'archive' ? h('span', { class: 'badge' }, t('archive')) : '') : '—'), h('td', {}, act));
      })))) : h('p', { class: 'muted' }, t('No days yet.')))));
}

// ---------- me ----------
async function meView() {
  header('/me');
  const s = await api('GET', '/stats');
  const tiers = state.settings.tiers;
  const tierTotal = tiers.reduce((n, x) => n + (s.tiers[x.name] || 0), 0) + (s.tiers.missed || 0);
  const big = h('canvas', { class: 'me-avatar', 'aria-hidden': 'true' }); drawAvatar(big, state.me.username, 96);
  render(h('div', { class: 'page' }, h('div', { class: 'me-head' }, big, h('div', {}, h('h1', { dir: 'auto' }, state.me.displayName), h('p', { class: 'muted' }, t('Your look is made from your username.')))),
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('b', {}, s.games), h('span', {}, t('Days played'))), h('div', { class: 'tile' }, h('b', {}, dist(s.points)), h('span', {}, t('Total distance'))),
      h('div', { class: 'tile' }, h('b', {}, dist(s.avg)), h('span', {}, t('Average per day'))), h('div', { class: 'tile' }, h('b', {}, dist(s.bestScore)), h('span', {}, t('Best day'))),
      h('div', { class: 'tile hot' }, h('b', {}, `🔥 ${s.streak.current}`), h('span', {}, t('Current streak'))), h('div', { class: 'tile' }, h('b', {}, s.streak.best), h('span', {}, t('Best streak')))),
    h('section', { class: 'card' }, h('h2', {}, t('Where your answers land')),
      tierTotal ? h('div', { class: 'stack' }, [...tiers].reverse().map(x => {
        const n = s.tiers[x.name] || 0;
        return h('div', { class: 'barrow' }, tierChip(x.id), h('div', { class: 'bar' }, h('i', { style: `width:${(n / tierTotal * 100).toFixed(1)}%;background:${TIER_COLORS[x.id]}` })), h('span', { class: 'num' }, n));
      }), h('p', { class: 'muted' }, t('Missed or passed: {n}', { n: s.tiers.missed || 0 }))) : h('p', { class: 'muted' }, t('Play a day to see where your answers land.'))),
    h('section', { class: 'card' }, h('h2', {}, t('History')), s.history.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, t('Date')), h('th', { class: 'n' }, t('Distance')), h('th', { class: 'n' }, t('Rank')), h('th', {}, ''))),
      h('tbody', {}, s.history.map(x => h('tr', {}, h('td', {}, fmtDate(x.date)), h('td', { class: 'n' }, x.finished ? dist(x.score) : t('unfinished')),
        h('td', { class: 'n' }, x.mode === 'live' && x.finished ? t('{a} of {b}', { a: x.rank, b: x.players }) : h('span', { class: 'badge' }, t(x.mode))),
        h('td', {}, x.finished ? h('a', { href: `#/results/${x.date}` }, t('Results')) : h('a', { href: `#/play/${x.date}` }, t('Continue')))))))) : h('p', { class: 'muted' }, t('Nothing yet.'))),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', {}, t('Profile')),
        form([['displayName', t('Name shown on the leaderboard'), 'text', { value: state.me.displayName, maxlength: 40, required: true }], ['team', t('Team or department'), 'text', { value: state.me.team, maxlength: 40 }]],
          t('Save profile'), async d => { const r = await api('POST', '/profile', d); state.me = r.user; header('/me'); toast(t('Profile saved')); })),
      h('section', { class: 'card' }, h('h2', {}, t('Password')), h('p', {}, t('Signed in as {u}.', { u: state.me.username })), h('a', { class: 'btn ghost', href: '#/password' }, t('Change password'))))));
}

function howView() {
  header('/how');
  const s = state.settings;
  render(h('div', { class: 'page' }, h('h1', {}, t('How to play')), h('section', { class: 'card stack' },
    h('p', {}, t('Every day there is a new set of {n} prompts. Each one names a category, like “Name a planet”. You get {s} seconds per prompt to type one answer that fits.', { n: s.promptsPerDay, s: s.roundSeconds })),
    h('p', {}, t('The twist: obvious answers barely move your chair. The rarer your answer, the further you launch out of the office.')),
    h('ul', { class: 'tierlist' }, [1, 2, 3, 4, 5].map(n => h('li', {}, tierChip(n), h('span', { class: 'muted' }, t(`where${n}`)), h('b', {}, dist(s.tiers[n - 1].points))))),
    h('p', {}, t('If an answer is not on the list you can try another while the clock runs. Spelling slips, plurals, capitals and accents are forgiven. Pass if you are stuck.')),
    h('p', {}, t('The clock only starts when you open a prompt, so you can take a break between prompts. Your answers and everyone else’s are revealed once you finish.')),
    h('p', {}, t('Play every puzzle day to build a streak. Missed a day? Play it from the archive; it won’t count for the leaderboard.')),
    h('p', { class: 'muted' }, t('Think a valid answer was turned away? Tell an admin. If they add it, you get the distance retroactively.')))));
}

// ---------- router ----------
export async function route() {
  clearInterval(ticker);
  const [page, a, b] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
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
    view().replaceChildren(h('p', { class: 'loading' }, t('Loading…')));
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
      default: render(h('div', { class: 'page' }, h('h1', {}, t('Page not found')), h('a', { href: '#/' }, t('Back to today'))));
    }
  } catch (e) {
    if (e.status === 401 || e.status === 428) return;
    render(h('div', { class: 'page' }, h('div', { class: 'card' }, h('h2', {}, t('That didn’t work')), h('p', {}, e.message), h('a', { class: 'btn ghost', href: '#/' }, t('Back to today')))));
  }
}
window.addEventListener('hashchange', () => { route(); view().focus({ preventScroll: true }); });
document.documentElement.lang = lang(); document.documentElement.dir = dir();
route();
