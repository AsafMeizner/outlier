import { h, render, api, toast, go, fmtDate, tierChip, state } from './app.js';
import { t } from './i18n.js';

const TABS = [['', 'Overview'], ['schedule', 'Schedule'], ['questions', 'Questions'], ['import', 'Import & export'], ['misses', 'Turned-away answers'], ['users', 'Users'], ['settings', 'Settings']];
const WD = () => [t('Sun'), t('Mon'), t('Tue'), t('Wed'), t('Thu'), t('Fri'), t('Sat')];
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
const wdOf = d => new Date(d + 'T00:00:00Z').getUTCDay();
const tierOptions = sel => [1, 2, 3, 4, 5].map(n => h('option', { value: String(n), selected: n === sel }, `${n} ${t(`tier${n}`)}`));
const langBadge = l => h('span', { class: 'badge' }, l === 'he' ? 'עב' : 'EN');
const ago = ms => { if (!ms) return t('never'); const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? t('{n} min ago', { n: m }) : m < 1440 ? t('{n} h ago', { n: Math.round(m / 60) }) : t('{n} d ago', { n: Math.round(m / 1440) }); };

function shell(tab, badge, ...content) {
  return render(h('div', { class: 'wide admin' },
    h('nav', { 'aria-label': t('Admin') }, TABS.map(([k, label]) => h('a', { href: '#/admin' + (k ? '/' + k : ''), 'aria-current': k === tab ? 'page' : null }, t(label),
      k === 'misses' && badge ? h('span', { class: 'badge' }, badge) : null))),
    h('div', {}, ...content)));
}
let missCount = 0;

export async function adminView(tab = '', arg) {
  if (state.me.role !== 'admin') return go('/');
  const views = { '': overview, schedule, questions, import: importExport, misses, users, settings };
  await (views[tab] || overview)(arg);
}

// ---------- overview ----------
async function overview() {
  const o = await api('GET', '/admin/overview');
  missCount = o.misses;
  const max = Math.max(1, ...o.participation.map(p => p.players));
  const warnings = [];
  if (o.daysLeft < 10) warnings.push(h('p', {}, h('b', {}, t('The bank has unused prompts for about {n} days.', { n: o.daysLeft })), ' ', t('After that, the least-used prompts repeat.'), ' ',
    h('a', { href: '#/admin/import' }, t('Import more')), ' · ', h('a', { href: '#/admin/questions/new' }, t('Write one'))));
  if (o.misses) warnings.push(h('p', {}, t('{n} turned-away answers are waiting for review.', { n: o.misses }), ' ', h('a', { href: '#/admin/misses' }, t('Review them'))));
  shell('', o.misses,
    h('h1', {}, t('Overview')),
    warnings.length ? h('section', { class: 'card' }, warnings) : null,
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('b', {}, o.playersToday), h('span', {}, t('Finished today ({n} started)', { n: o.startedToday }))),
      h('div', { class: 'tile' }, h('b', {}, o.users), h('span', {}, t('Users ({n} active this week)', { n: o.activeWeek }))),
      h('div', { class: 'tile' }, h('b', {}, o.bank), h('span', {}, t('Prompts in the bank'))),
      h('div', { class: 'tile' }, h('b', {}, o.unused), h('span', {}, t('Never used'))),
      h('div', { class: 'tile' }, h('b', {}, o.scheduledAhead), h('span', {}, t('Days scheduled ahead')))),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', {}, t('Today')), o.todayPrompts.length
        ? h('ol', {}, o.todayPrompts.map(p => h('li', { dir: 'auto' }, p.text, h('small', { class: 'muted' }, ` (${p.category})`))))
        : h('p', { class: 'muted' }, t('Today’s puzzle is created when the first player opens the game, or you can pick it in the schedule.')),
        h('a', { class: 'btn ghost small', href: '#/admin/schedule' }, t('Open schedule'))),
      h('section', { class: 'card' }, h('h2', {}, t('Players per day')), o.participation.length
        ? h('div', {}, h('div', { class: 'barchart', role: 'img', 'aria-label': t('Players per day over the last two weeks') },
          o.participation.map(p => h('div', { style: `height:${(p.players / max * 100).toFixed(0)}%`, title: `${p.date}: ${p.players}` }))),
        h('div', { class: 'spread muted small' }, h('span', {}, fmtDate(o.participation[0].date)), h('span', {}, t('Today'))))
        : h('p', { class: 'muted' }, t('No days played yet.')))));
}

// ---------- schedule ----------
let bankCache = null;
async function bank(force) { if (!bankCache || force) bankCache = await api('GET', '/admin/prompts'); return bankCache; }

async function schedule(selDate) {
  const [s, b] = await Promise.all([api('GET', `/admin/schedule?from=${addDays(state.today, -21)}&to=${addDays(state.today, 63)}`), bank(true)]);
  const byDate = new Map(s.days.map(d => [d.date, d]));
  const ws = state.settings.weekStart;
  const from = addDays(s.today, -7);
  const start = addDays(from, -((wdOf(from) - ws + 7) % 7));
  selDate = selDate || s.today;
  const editor = h('section', { class: 'card' });
  const cells = [];
  for (let i = 0; i < 49; i++) {
    const d = addDays(start, i), day = byDate.get(d), active = s.activeWeekdays.includes(wdOf(d));
    const note = day ? `${t('{n} prompts', { n: day.prompts.length })}${day.runs ? `, ${t('{n} played', { n: day.runs })}` : day.auto ? `, ${t('auto')}` : ''}` : active ? (d >= s.today ? t('auto-picked') : '–') : t('no puzzle');
    cells.push(h('button', {
      type: 'button', class: [d < s.today ? 'past' : '', d === s.today ? 'today' : '', day ? 'has' : '', !active && !day ? 'off' : '', d === selDate ? 'sel' : ''].join(' '),
      onclick: () => go(`/admin/schedule/${d}`), 'aria-label': `${fmtDate(d)}: ${note}`,
    }, h('b', {}, String(Number(d.slice(8)))), d.slice(8) === '01' || i === 0 ? fmtDate(d, { month: 'short' }) : '', h('span', {}, note)));
  }
  const fillDays = h('input', { type: 'number', min: 1, max: 120, value: 14, style: 'width:5rem', 'aria-label': t('Number of days') });
  shell('schedule', missCount,
    h('div', { class: 'spread' }, h('h1', {}, t('Schedule')),
      h('div', { class: 'row' }, t('Pre-fill the next'), fillDays, t('days'),
        h('button', { class: 'btn small', type: 'button', async onclick() {
          const r = await api('POST', '/admin/schedule/autofill', { days: Number(fillDays.value) });
          toast(r.created.length ? t('Scheduled {n} days', { n: r.created.length }) : t('Those days are already scheduled')); schedule(selDate);
        } }, t('Auto-fill')))),
    h('p', { class: 'muted' }, t('Days you leave empty get picked automatically from the least-used prompts when the first player opens the game. Puzzle days and language are set in Settings.')),
    h('section', { class: 'card' }, h('div', { class: 'cal' }, [0, 1, 2, 3, 4, 5, 6].map(i => h('div', { class: 'wd' }, WD()[(i + ws) % 7])), cells)),
    editor);
  dayEditor(editor, selDate, byDate.get(selDate), s, b);
}

function dayEditor(el, date, day, s, b) {
  const title = h('h2', {}, fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  if (day?.runs || date < s.today) {
    el.replaceChildren(title, day ? h('ol', {}, day.prompts.map(p => h('li', { dir: 'auto' }, p.text, h('small', { class: 'muted' }, ` (${p.category})`)))) : h('p', { class: 'muted' }, t('No puzzle on this day.')),
      h('p', { class: 'muted' }, day?.runs ? t('{n} players already played this day, so it is locked.', { n: day.runs }) : t('This day is in the past.')),
      day ? h('a', { href: `#/results/${date}` }, t('See answers')) : null);
    return;
  }
  const byId = new Map(b.prompts.map(p => [p.id, p]));
  let picked = day ? day.prompts.map(p => p.id) : [];
  const list = h('ol', { class: 'ordered' });
  const search = h('input', { type: 'search', placeholder: t('Search prompts'), 'aria-label': t('Search prompts'), dir: 'auto' });
  const cat = h('select', { 'aria-label': t('Category') }, h('option', { value: '' }, t('All categories')), b.categories.map(c => h('option', { value: c.category }, `${c.category} (${c.n})`)));
  const langSel = h('select', { 'aria-label': t('Language') }, h('option', { value: '' }, t('Both languages')), h('option', { value: 'en' }, 'English'), h('option', { value: 'he' }, 'עברית'));
  const unusedOnly = h('input', { type: 'checkbox', checked: true });
  const pick = h('div', { class: 'picklist' });
  const count = h('span', { class: 'muted' });
  const paintList = () => {
    list.replaceChildren(...picked.map((id, i) => h('li', {}, h('span', { dir: 'auto' }, byId.get(id)?.text, h('small', { class: 'muted' }, ` (${byId.get(id)?.category})`)),
      h('button', { type: 'button', 'aria-label': t('Move up'), disabled: i === 0, onclick: () => { [picked[i - 1], picked[i]] = [picked[i], picked[i - 1]]; paintList(); } }, '↑'),
      h('button', { type: 'button', 'aria-label': t('Move down'), disabled: i === picked.length - 1, onclick: () => { [picked[i + 1], picked[i]] = [picked[i], picked[i + 1]]; paintList(); } }, '↓'),
      h('button', { type: 'button', 'aria-label': t('Remove'), onclick: () => { picked.splice(i, 1); paintList(); paintPick(); } }, '✕'))));
    if (!picked.length) list.append(h('li', {}, h('span', { class: 'muted' }, t('No prompts picked. Leave it empty to let the game pick automatically.'))));
    count.textContent = t('{a} of {b} prompts', { a: picked.length, b: s.promptsPerDay });
  };
  const paintPick = () => {
    const q = search.value.trim().toLowerCase();
    const rows = b.prompts.filter(p => !p.retired && p.answers > 0 && (!q || p.text.toLowerCase().includes(q)) && (!cat.value || p.category === cat.value)
      && (!langSel.value || p.lang === langSel.value) && (!unusedOnly.checked || !p.used || picked.includes(p.id)));
    pick.replaceChildren(...rows.slice(0, 300).map(p => h('label', {},
      h('input', { type: 'checkbox', checked: picked.includes(p.id), onchange: e => { if (e.target.checked) { if (picked.length >= 10) { e.target.checked = false; return toast(t('Up to 10 prompts per day'), true); } picked.push(p.id); } else picked = picked.filter(x => x !== p.id); paintList(); } }),
      langBadge(p.lang), h('span', { style: 'flex:1', dir: 'auto' }, p.text), h('small', { class: 'muted' }, `${p.category}, ${t('{n} answers', { n: p.answers })}${p.used ? `, ${t('used {n}×', { n: p.used })}` : ''}`))));
    if (!rows.length) pick.append(h('p', { class: 'muted', style: 'padding:.6rem' }, t('Nothing matches.')));
  };
  search.oninput = paintPick; cat.onchange = paintPick; langSel.onchange = paintPick; unusedOnly.onchange = paintPick;
  el.replaceChildren(title,
    h('div', { class: 'grid2' },
      h('div', {}, h('div', { class: 'spread' }, h('h3', {}, t('Picked')), count), list,
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', async onclick() {
            if (!picked.length) return toast(t('Pick at least one prompt, or use “Clear day”'), true);
            await api('PUT', `/admin/schedule/${date}`, { promptIds: picked }); toast(t('Day saved')); schedule(date);
          } }, t('Save day')),
          h('button', { class: 'btn ghost', type: 'button', async onclick() {
            const need = s.promptsPerDay - picked.length;
            if (need <= 0) return toast(t('The day is full'));
            const r = await api('GET', `/admin/schedule/suggest?n=${need}&date=${date}&lang=${langSel.value}&exclude=${picked.join(',')}`);
            picked.push(...r.prompts.map(p => p.id)); paintList(); paintPick();
          } }, t('Fill with suggestions')),
          day ? h('button', { class: 'btn danger', type: 'button', async onclick() { await api('DELETE', `/admin/schedule/${date}`); toast(t('Day cleared')); schedule(date); } }, t('Clear day')) : null)),
      h('div', {}, h('h3', {}, t('Question bank')), h('div', { class: 'row', style: 'margin-bottom:.6rem' }, search, cat, langSel, h('label', { class: 'check', style: 'margin:0' }, unusedOnly, t('Unused only'))), pick)));
  paintList(); paintPick();
}

// ---------- questions ----------
async function questions(id) {
  if (id) return promptEditor(id === 'new' ? null : Number(id));
  const b = await bank(true);
  const search = h('input', { type: 'search', placeholder: t('Search prompts'), 'aria-label': t('Search prompts'), dir: 'auto' });
  const cat = h('select', { 'aria-label': t('Category') }, h('option', { value: '' }, t('All categories')), b.categories.map(c => h('option', { value: c.category }, `${c.category} (${c.n})`)));
  const langSel = h('select', { 'aria-label': t('Language') }, h('option', { value: '' }, t('Both languages')), h('option', { value: 'en' }, 'English'), h('option', { value: 'he' }, 'עברית'));
  const status = h('select', { 'aria-label': t('Status') }, [['all', 'All'], ['unused', 'Unused'], ['used', 'Used'], ['retired', 'Retired']].map(([v, l]) => h('option', { value: v }, t(l))));
  const body = h('tbody');
  const summary = h('span', { class: 'muted' });
  const paint = () => {
    const q = search.value.trim().toLowerCase(), st = status.value;
    const rows = b.prompts.filter(p => (!q || p.text.toLowerCase().includes(q)) && (!cat.value || p.category === cat.value) && (!langSel.value || p.lang === langSel.value)
      && (st === 'all' ? !p.retired : st === 'unused' ? !p.used && !p.retired : st === 'used' ? p.used && !p.retired : p.retired));
    body.replaceChildren(...rows.map(p => h('tr', {}, h('td', {}, langBadge(p.lang)), h('td', { dir: 'auto' }, h('a', { href: `#/admin/questions/${p.id}` }, p.text)), h('td', { class: 'muted', dir: 'auto' }, p.category),
      h('td', { class: 'n' }, p.answers), h('td', { class: 'n' }, p.used || ''), h('td', { class: 'muted' }, p.lastUsed ? fmtDate(p.lastUsed) : ''),
      h('td', {}, p.retired ? h('span', { class: 'badge' }, t('retired')) : !p.used ? h('span', { class: 'badge ok' }, t('new')) : ''))));
    summary.textContent = t('{n} shown', { n: rows.length });
  };
  search.oninput = paint; cat.onchange = paint; langSel.onchange = paint; status.onchange = paint;
  shell('questions', missCount,
    h('div', { class: 'spread' }, h('h1', {}, t('Questions')), h('a', { class: 'btn', href: '#/admin/questions/new' }, t('New prompt'))),
    h('section', { class: 'card' }, h('div', { class: 'row', style: 'margin-bottom:.8rem' }, search, cat, langSel, status, summary),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, t('Prompt')), h('th', {}, t('Category')), h('th', { class: 'n' }, t('Answers')), h('th', { class: 'n' }, t('Used')), h('th', {}, t('Last used')), h('th', {}, ''))), body))));
  paint();
}

async function promptEditor(id) {
  const [p, b] = await Promise.all([id ? api('GET', `/admin/prompts/${id}`) : { text: '', category: '', answers: [], used: [], retired: false }, bank()]);
  const text = h('input', { value: p.text, maxlength: 200, required: true, id: 'pe-text', dir: 'auto' });
  const cat = h('input', { value: p.category, maxlength: 40, list: 'cats', id: 'pe-cat', dir: 'auto' });
  const rows = h('tbody');
  const addRow = (a = { answer: '', tier: 3, aliases: [] }) => {
    const tr = h('tr', { 'data-id': a.id ? String(a.id) : '' },
      h('td', {}, h('input', { value: a.answer, 'aria-label': t('Answer'), class: 'a', dir: 'auto' })),
      h('td', {}, h('select', { 'aria-label': t('Tier'), class: 't' }, tierOptions(a.tier))),
      h('td', {}, h('input', { value: (a.aliases || []).join(' | '), 'aria-label': t('Other accepted spellings, separated by |'), class: 'l', dir: 'auto', placeholder: a.answer ? '' : t('other spellings, separated by |') })),
      h('td', {}, h('button', { class: 'btn ghost small', type: 'button', 'aria-label': t('Remove answer'), onclick: () => tr.remove() }, '✕')));
    rows.append(tr); return tr;
  };
  [...p.answers].sort((x, y) => x.tier - y.tier || x.answer.localeCompare(y.answer)).forEach(a => addRow(a));
  if (!p.answers.length) for (let i = 0; i < 5; i++) addRow({ answer: '', tier: i + 1, aliases: [] });
  const paste = h('textarea', { placeholder: t('1 Most obvious answer\n3 Less common answer | other spelling\n5 Very rare answer'), 'aria-label': t('Paste answers'), dir: 'auto' });
  const err = h('p', { class: 'error', role: 'alert' });
  const collect = () => ({
    text: text.value, category: cat.value,
    answers: [...rows.children].map(tr => ({ id: tr.dataset.id ? Number(tr.dataset.id) : undefined, answer: tr.querySelector('.a').value.trim(), tier: Number(tr.querySelector('.t').value), aliases: tr.querySelector('.l').value }))
      .filter(a => a.answer),
  });
  const save = async () => {
    err.textContent = '';
    try {
      const r = id ? await api('PUT', `/admin/prompts/${id}`, collect()) : await api('POST', '/admin/prompts', collect());
      bankCache = null;
      toast(r.awarded ? t('Saved. {n} earlier answers now scored.', { n: r.awarded }) : t('Prompt saved'));
      if (!id) go(`/admin/questions/${r.id}`); else promptEditor(id);
    } catch (e) { err.textContent = e.message; }
  };
  shell('questions', missCount,
    h('p', {}, h('a', { href: '#/admin/questions' }, t('All questions'))),
    h('h1', {}, id ? t('Edit prompt') : t('New prompt')),
    h('section', { class: 'card' },
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { for: 'pe-text' }, t('Prompt')), text),
        h('div', { class: 'field' }, h('label', { for: 'pe-cat' }, t('Category')), cat, h('datalist', { id: 'cats' }, b.categories.map(c => h('option', { value: c.category }))))),
      p.used.length ? h('p', { class: 'muted' }, t('Used on {d}. Adding answers re-scores players who typed them.', { d: p.used.map(d => fmtDate(d)).join(', ') })) : null,
      h('h3', {}, t('Answers ({n})', { n: p.answers.length })),
      h('p', { class: 'muted' }, t('Tier 1 is what most people say, tier 5 is valid but rare. Case, accents, niqqud, punctuation, plurals and a leading “the” or ה are ignored automatically.')),
      h('div', { class: 'table-wrap' }, h('table', { class: 'ans-table' }, h('thead', {}, h('tr', {}, h('th', {}, t('Answer')), h('th', {}, t('Tier')), h('th', {}, t('Other accepted spellings')), h('th', {}, ''))), rows)),
      h('div', { class: 'row', style: 'margin:.6rem 0 1.2rem' }, h('button', { class: 'btn ghost small', type: 'button', onclick: () => addRow().querySelector('.a').focus() }, t('Add answer'))),
      h('details', {}, h('summary', {}, t('Paste many answers at once')),
        h('p', { class: 'muted' }, t('One per line: the tier (1-5), a space, the answer, then optional other spellings after |.')), paste,
        h('button', { class: 'btn ghost small', type: 'button', onclick() {
          let n = 0;
          for (const line of paste.value.split(/\r?\n/)) {
            const m = line.trim().match(/^([1-5])\s+(.+)$/); if (!m) continue;
            const [answer, ...aliases] = m[2].split('|').map(x => x.trim());
            addRow({ answer, tier: Number(m[1]), aliases }); n++;
          }
          paste.value = ''; toast(t('Added {n} answers below. Save to keep them.', { n }));
        } }, t('Add to list'))),
      err,
      h('div', { class: 'row', style: 'margin-top:1rem' }, h('button', { class: 'btn', type: 'button', onclick: save }, t('Save prompt')),
        id ? h('button', { class: 'btn ghost', type: 'button', async onclick() { await api('PUT', `/admin/prompts/${id}`, { retired: !p.retired }); bankCache = null; toast(p.retired ? t('Prompt restored') : t('Prompt retired: it won’t be picked again')); promptEditor(id); } }, p.retired ? t('Restore') : t('Retire')) : null,
        id && !p.used.length ? h('button', { class: 'btn danger', type: 'button', async onclick() { if (!confirm(t('Delete this prompt for good?'))) return; await api('DELETE', `/admin/prompts/${id}`); bankCache = null; toast(t('Prompt deleted')); go('/admin/questions'); } }, t('Delete')) : null)));
}

// ---------- import / export ----------
function importExport() {
  const file = h('input', { type: 'file', accept: '.json,.txt,.csv', id: 'im-file' });
  const text = h('textarea', { 'aria-label': t('Or paste'), dir: 'auto', placeholder: 'C: Food & Drink\nQ: Name a citrus fruit\n1 Orange\n2 Lemon\n4 Kumquat\n5 Yuzu | yuzu fruit', style: 'min-height:12rem' });
  const mode = h('select', { id: 'im-mode' }, h('option', { value: 'skip' }, t('Skip prompts that already exist')), h('option', { value: 'update' }, t('Merge new answers into existing prompts')));
  const out = h('div');
  let name = 'pasted.txt';
  file.onchange = async () => { const f = file.files[0]; if (!f) return; name = f.name; text.value = await f.text(); };
  const run = async dryRun => {
    if (!text.value.trim()) return toast(t('Choose a file or paste some questions'), true);
    try {
      const r = await api('POST', '/admin/import', { name, content: text.value, mode: mode.value, dryRun });
      bankCache = null;
      out.replaceChildren(h('div', { class: 'card' }, h('h3', {}, dryRun ? t('Check result') : t('Imported')),
        h('p', {}, t(dryRun ? '{t} prompts read: {a} would be added, {u} would be updated, {s} skipped (already in the bank).' : '{t} prompts read: {a} added, {u} updated, {s} skipped (already in the bank).', { t: r.total, a: r.added, u: r.updated, s: r.skipped })),
        r.errors.length ? h('div', {}, h('p', { class: 'error' }, t('{n} problems:', { n: r.errors.length })), h('ul', {}, r.errors.slice(0, 50).map(e => h('li', { dir: 'auto' }, e)))) : h('p', { class: 'muted' }, t('No problems found.'))));
      if (!dryRun) toast(t('Imported {n} new prompts', { n: r.added }));
    } catch (e) { out.replaceChildren(h('p', { class: 'error' }, e.message)); }
  };
  const dl = (fmt, label) => h('a', { class: 'btn ghost', href: `/api/admin/export?format=${fmt}`, download: true }, label);
  shell('import', missCount, h('h1', {}, t('Import & export')),
    h('section', { class: 'card' }, h('h2', {}, t('Add questions')),
      h('p', {}, t('Upload a .txt, .csv or .json file, or paste text. The simplest format is plain text:')),
      h('pre', { class: 'secret' }, 'C: Food & Drink          ← category\nQ: Name a citrus fruit   ← a new prompt\n1 Orange                 ← tier 1 = most common\n4 Kumquat\n5 Yuzu | yuzu fruit      ← other spellings after |'),
      h('p', { class: 'muted' }, t('Hebrew works the same way; a prompt with Hebrew letters is marked as a Hebrew prompt. CSV columns: prompt, category, answer, tier, aliases (one row per answer; Excel works). Export the bank as CSV to see an example.')),
      h('div', { class: 'field' }, h('label', { for: 'im-file' }, t('File')), file),
      h('div', { class: 'field' }, h('label', {}, t('Or paste')), text),
      h('div', { class: 'field' }, h('label', { for: 'im-mode' }, t('When a prompt already exists')), mode),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => run(true) }, t('Check without importing')), h('button', { class: 'btn', type: 'button', onclick: () => run(false) }, t('Import')))),
    out,
    h('section', { class: 'card' }, h('h2', {}, t('Export the question bank')), h('p', {}, t('Download every active prompt to edit offline or move to another server.')),
      h('div', { class: 'row' }, dl('txt', t('Text')), dl('csv', t('CSV (Excel)')), dl('json', 'JSON'))),
    h('section', { class: 'card' }, h('h2', {}, t('Backup')), h('p', {}, t('A single file with everything: users, scores, questions and settings. To restore, stop the server and replace data/outlier.db with it.')),
      h('a', { class: 'btn ghost', href: '/api/admin/backup', download: true }, t('Download backup'))));
}

// ---------- misses ----------
async function misses() {
  const { misses: list } = await api('GET', '/admin/misses');
  missCount = list.length;
  const body = h('tbody');
  list.forEach(m => {
    const tier = h('select', { 'aria-label': t('Tier') }, tierOptions(4));
    const textIn = h('input', { value: m.raw, 'aria-label': t('Answer as it should appear'), style: 'min-width:10rem', dir: 'auto' });
    const tr = h('tr', {},
      h('td', { dir: 'auto' }, h('a', { href: `#/admin/questions/${m.promptId}` }, m.prompt)),
      h('td', {}, textIn), h('td', { class: 'n' }, m.players), h('td', { class: 'n' }, m.guesses),
      h('td', {}, h('div', { class: 'row', style: 'gap:.4rem;flex-wrap:nowrap' }, tier,
        h('button', { class: 'btn small', type: 'button', async onclick() {
          try { const r = await api('POST', '/admin/misses/accept', { promptId: m.promptId, text: textIn.value, tier: Number(tier.value) }); toast(t('Added. {n} rounds re-scored.', { n: r.awarded })); tr.remove(); missCount--; }
          catch (e) { toast(e.message, true); }
        } }, t('Accept')),
        h('button', { class: 'btn ghost small', type: 'button', async onclick() {
          const p = await api('GET', `/admin/prompts/${m.promptId}`);
          const sel = h('select', { 'aria-label': t('Same as') }, p.answers.map(a => h('option', { value: String(a.id) }, a.answer)));
          const cell = this.closest('td');
          cell.replaceChildren(h('div', { class: 'row', style: 'gap:.4rem;flex-wrap:nowrap' }, t('Same as'), sel, h('button', { class: 'btn small', type: 'button', async onclick() {
            try { const r = await api('POST', '/admin/misses/accept', { promptId: m.promptId, text: textIn.value, aliasOf: Number(sel.value) }); toast(t('Spelling added. {n} rounds re-scored.', { n: r.awarded })); tr.remove(); }
            catch (e) { toast(e.message, true); }
          } }, t('Save'))));
        } }, t('Spelling of…')),
        h('button', { class: 'btn ghost small', type: 'button', async onclick() { await api('POST', '/admin/misses/dismiss', { promptId: m.promptId, norm: m.norm }); tr.remove(); missCount--; } }, t('Reject')))));
    body.append(tr);
  });
  shell('misses', missCount, h('h1', {}, t('Turned-away answers')),
    h('p', {}, t('Answers players typed that were not on the list. Accept the valid ones with a tier, or mark them as another spelling of an existing answer. Players who typed them get the distance retroactively.')),
    h('section', { class: 'card' }, list.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t('Prompt')), h('th', {}, t('Typed answer')), h('th', { class: 'n' }, t('Players')), h('th', { class: 'n' }, t('Times')), h('th', {}, ''))), body))
      : h('p', { class: 'muted' }, t('Nothing to review.'))));
}

// ---------- users ----------
async function users() {
  const { users: list } = await api('GET', '/admin/users');
  const out = h('div');
  const showCreated = (r, title) => out.replaceChildren(h('section', { class: 'card' }, h('h3', {}, title),
    h('p', {}, t('Give each person their temporary password. They choose their own the first time they sign in. These passwords are shown only once.')),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t('Username')), h('th', {}, t('Name')), h('th', {}, t('Temporary password')))),
      h('tbody', {}, r.created.map(c => h('tr', {}, h('td', {}, c.username), h('td', { dir: 'auto' }, c.displayName), h('td', {}, h('span', { class: 'secret' }, c.password)))))),
    r.errors?.length ? h('ul', { class: 'error' }, r.errors.map(e => h('li', {}, e))) : null));
  const single = h('form', { async onsubmit(e) {
    e.preventDefault();
    try { const r = await api('POST', '/admin/users', Object.fromEntries(new FormData(single))); showCreated(r, t('Account created')); single.reset(); refresh(); }
    catch (x) { toast(x.message, true); }
  } },
  h('div', { class: 'grid2' },
    h('div', { class: 'field' }, h('label', { for: 'nu-u' }, t('Username')), h('input', { id: 'nu-u', name: 'username', required: true, pattern: '[A-Za-z0-9._\\-]{2,32}' })),
    h('div', { class: 'field' }, h('label', { for: 'nu-n' }, t('Name')), h('input', { id: 'nu-n', name: 'displayName', maxlength: 40, dir: 'auto' })),
    h('div', { class: 'field' }, h('label', { for: 'nu-t' }, t('Team')), h('input', { id: 'nu-t', name: 'team', maxlength: 40, dir: 'auto' })),
    h('div', { class: 'field' }, h('label', { for: 'nu-r' }, t('Role')), h('select', { id: 'nu-r', name: 'role' }, h('option', { value: 'player' }, t('Player')), h('option', { value: 'admin' }, t('Admin'))))),
  h('button', { class: 'btn', type: 'submit' }, t('Create account')));
  const bulk = h('textarea', { placeholder: 'dana.levi, Dana Levi, Marketing\nyossi, יוסי כהן, R&D', 'aria-label': t('One person per line'), dir: 'auto' });
  const body = h('tbody');
  const refresh = async () => { const { users: fresh } = await api('GET', '/admin/users'); body.replaceChildren(...fresh.map(userRow)); };
  const userRow = u => {
    const tr = h('tr', {},
      h('td', {}, h('b', { dir: 'auto' }, u.displayName), h('br'), h('small', { class: 'muted' }, u.username)),
      h('td', { dir: 'auto' }, u.team), h('td', {}, u.role === 'admin' ? h('span', { class: 'badge hot' }, t('admin')) : t('player'), u.disabled ? h('span', { class: 'badge' }, t('disabled')) : '', u.mustChange ? h('span', { class: 'badge' }, t('temp password')) : ''),
      h('td', { class: 'n' }, u.games), h('td', { class: 'n' }, u.points * 10), h('td', { class: 'muted' }, ago(u.lastSeen)),
      h('td', {}, h('button', { class: 'btn ghost small', type: 'button', onclick: () => editUser(u, tr) }, t('Manage'))));
    return tr;
  };
  const editUser = (u, tr) => {
    const dn = h('input', { value: u.displayName, 'aria-label': t('Name'), dir: 'auto' }), tm = h('input', { value: u.team, 'aria-label': t('Team'), dir: 'auto' });
    const role = h('select', { 'aria-label': t('Role') }, h('option', { value: 'player', selected: u.role === 'player' }, t('Player')), h('option', { value: 'admin', selected: u.role === 'admin' }, t('Admin')));
    const runsBox = h('div');
    const act = (label, fn, cls = 'btn ghost small') => h('button', { class: cls, type: 'button', async onclick() { try { await fn(); } catch (e) { toast(e.message, true); } } }, label);
    const panel = h('td', { colspan: '7' }, h('div', { class: 'card', style: 'margin:.4rem 0' },
      h('div', { class: 'row' }, dn, tm, role, act(t('Save'), async () => { await api('PUT', `/admin/users/${u.id}`, { displayName: dn.value, team: tm.value, role: role.value }); toast(t('User saved')); refresh(); }, 'btn small')),
      h('div', { class: 'row', style: 'margin-top:.8rem' },
        act(t('Reset password'), async () => { const r = await api('POST', `/admin/users/${u.id}/reset`); showCreated({ created: [{ username: u.username, displayName: u.displayName, password: r.password }] }, t('Password reset')); refresh(); }),
        act(u.disabled ? t('Enable account') : t('Disable account'), async () => { await api('PUT', `/admin/users/${u.id}`, { disabled: !u.disabled }); refresh(); }),
        act(t('Played days'), async () => {
          const { runs } = await api('GET', `/admin/users/${u.id}/runs`);
          runsBox.replaceChildren(runs.length ? h('table', {}, h('tbody', {}, runs.map(r => h('tr', {}, h('td', {}, fmtDate(r.date)), h('td', {}, t(r.mode)), h('td', { class: 'n' }, r.finished ? r.score * 10 : t('round {n}', { n: r.position + 1 })),
            h('td', {}, act(t('Let them replay'), async () => { if (!confirm(t('Delete {u}’s game on {d}? They can then play it again.', { u: u.displayName, d: r.date }))) return; await api('DELETE', `/admin/users/${u.id}/runs/${r.date}`); toast(t('Game deleted')); }))))))
            : h('p', { class: 'muted' }, t('No games yet.')));
        }),
        act(t('Delete user'), async () => { if (!confirm(t('Delete {u} and all their scores?', { u: u.displayName }))) return; await api('DELETE', `/admin/users/${u.id}`); toast(t('User deleted')); refresh(); }, 'btn danger small')),
      runsBox));
    tr.after(h('tr', {}, panel));
  };
  body.replaceChildren(...list.map(userRow));
  shell('users', missCount, h('h1', {}, t('Users')),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', {}, t('Add one person')), single),
      h('section', { class: 'card' }, h('h2', {}, t('Add many people')), h('p', { class: 'muted' }, t('One per line: username, name, team. Separate with commas or tabs (paste from Excel).')), bulk,
        h('button', { class: 'btn', type: 'button', style: 'margin-top:.8rem', async onclick() {
          const r = await api('POST', '/admin/users', { bulk: bulk.value }); showCreated(r, t('{n} accounts created', { n: r.created.length })); bulk.value = ''; refresh();
        } }, t('Create accounts')))),
    out,
    h('section', { class: 'card' }, h('h2', {}, t('Everyone ({n})', { n: list.length })), h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, t('Name')), h('th', {}, t('Team')), h('th', {}, t('Role')), h('th', { class: 'n' }, t('Days')), h('th', { class: 'n' }, t('Metres')), h('th', {}, t('Last seen')), h('th', {}, ''))), body))));
}

// ---------- settings ----------
async function settings() {
  const { settings: s } = await api('GET', '/admin/settings');
  const err = h('p', { class: 'error', role: 'alert' });
  const field = (id, label, input, hint) => h('div', { class: 'field' }, h('label', { for: id }, label, hint ? h('span', { class: 'muted' }, ` ${hint}`) : ''), input);
  const inp = (id, value, attrs = {}) => h('input', { id, value: String(value), dir: 'auto', ...attrs });
  const zones = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return []; } })();
  const el = {
    siteName: inp('s-name', s.siteName, { maxlength: 40 }), tagline: inp('s-tag', s.tagline, { maxlength: 120 }),
    promptsPerDay: inp('s-ppd', s.promptsPerDay, { type: 'number', min: 1, max: 10 }), roundSeconds: inp('s-sec', s.roundSeconds, { type: 'number', min: 10, max: 120 }),
    puzzleLanguage: h('select', { id: 's-pl' }, [['alternate', 'Alternate English and Hebrew days'], ['en', 'English only'], ['he', 'Hebrew only'], ['any', 'Mix both']].map(([v, l]) => h('option', { value: v, selected: v === s.puzzleLanguage }, t(l)))),
    timeZone: inp('s-tz', s.timeZone, { list: 'tzs' }), dayStartHour: inp('s-hour', s.dayStartHour, { type: 'number', min: 0, max: 23 }),
    weekStart: h('select', { id: 's-ws' }, WD().map((d, i) => h('option', { value: String(i), selected: i === s.weekStart }, d))),
    registration: h('select', { id: 's-reg' }, [['open', 'Anyone on the network can sign up'], ['code', 'Sign-up needs an invite code'], ['closed', 'Only admins create accounts']].map(([v, l]) => h('option', { value: v, selected: v === s.registration }, t(l)))),
    inviteCode: inp('s-code', s.inviteCode, { maxlength: 60 }),
    autoSchedule: h('input', { type: 'checkbox', checked: s.autoSchedule }), typoTolerance: h('input', { type: 'checkbox', checked: s.typoTolerance }), archivePlay: h('input', { type: 'checkbox', checked: s.archivePlay }),
  };
  const days = WD().map((d, i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', value: String(i), checked: s.activeWeekdays.includes(i) }), d));
  const save = async () => {
    err.textContent = '';
    try {
      const patch = {
        siteName: el.siteName.value, tagline: el.tagline.value, promptsPerDay: Number(el.promptsPerDay.value), roundSeconds: Number(el.roundSeconds.value),
        puzzleLanguage: el.puzzleLanguage.value, timeZone: el.timeZone.value, dayStartHour: Number(el.dayStartHour.value), weekStart: Number(el.weekStart.value),
        registration: el.registration.value, inviteCode: el.inviteCode.value, autoSchedule: el.autoSchedule.checked, typoTolerance: el.typoTolerance.checked, archivePlay: el.archivePlay.checked,
        activeWeekdays: days.map(l => l.querySelector('input')).filter(c => c.checked).map(c => Number(c.value)),
      };
      await api('PUT', '/admin/settings', patch);
      const me = await api('GET', '/me'); state.settings = me.settings; state.today = me.today;
      toast(t('Settings saved'));
    } catch (e) { err.textContent = e.message; }
  };
  shell('settings', missCount, h('h1', {}, t('Settings')),
    h('section', { class: 'card' }, h('h2', {}, t('The game')),
      h('div', { class: 'grid2' }, field('s-name', t('Game name'), el.siteName), field('s-tag', t('Tagline'), el.tagline),
        field('s-ppd', t('Prompts per day'), el.promptsPerDay, t('(new days only)')), field('s-sec', t('Seconds per prompt'), el.roundSeconds),
        field('s-pl', t('Puzzle language'), el.puzzleLanguage, t('(for automatically picked days)'))),
      h('label', { class: 'check' }, el.typoTolerance, t('Forgive small spelling mistakes')),
      h('label', { class: 'check' }, el.archivePlay, t('Let players play past days from the archive (not counted)'))),
    h('section', { class: 'card' }, h('h2', {}, t('Calendar')),
      h('div', { class: 'grid2' }, field('s-tz', t('Time zone'), el.timeZone), field('s-hour', t('New puzzle starts at hour'), el.dayStartHour, t('(0 = midnight)')), field('s-ws', t('Weeks start on'), el.weekStart, t('(weekly leaderboard)'))),
      h('datalist', { id: 'tzs' }, zones.map(z => h('option', { value: z }))),
      h('label', {}, t('Puzzle days')), h('div', { class: 'row', style: 'margin-bottom:1rem' }, days),
      h('label', { class: 'check' }, el.autoSchedule, t('Pick prompts automatically when a puzzle day has none scheduled'))),
    h('section', { class: 'card' }, h('h2', {}, t('Accounts')),
      h('div', { class: 'grid2' }, field('s-reg', t('Who can sign up'), el.registration), field('s-code', t('Invite code'), el.inviteCode, t('(when sign-up needs a code)')))),
    err, h('button', { class: 'btn big', type: 'button', onclick: save }, t('Save settings')));
}
