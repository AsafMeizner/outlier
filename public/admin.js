import { h, render, api, toast, go, fmtDate, plural, tierChip, state } from './app.js';

const TABS = [['', 'Overview'], ['schedule', 'Schedule'], ['questions', 'Questions'], ['import', 'Import & export'], ['misses', 'Turned-away answers'], ['users', 'Users'], ['settings', 'Settings']];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
const wdOf = d => new Date(d + 'T00:00:00Z').getUTCDay();
const tierOptions = sel => [1, 2, 3, 4, 5].map(t => h('option', { value: String(t), selected: t === sel }, `${t} ${state.settings.tiers[t - 1].name}`));
const ago = ms => { if (!ms) return 'never'; const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

function shell(tab, badge, ...content) {
  return render(h('div', { class: 'wide admin' },
    h('nav', { 'aria-label': 'Admin' }, TABS.map(([k, label]) => h('a', { href: '#/admin' + (k ? '/' + k : ''), 'aria-current': k === tab ? 'page' : null }, label,
      k === 'misses' && badge ? h('span', { class: 'badge hot' }, badge) : null))),
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
  if (o.daysLeft < 10) warnings.push(h('p', {}, h('b', {}, `The bank has unused prompts for about ${plural(o.daysLeft, 'day')}.`), ' After that, the least-used prompts repeat. ', h('a', { href: '#/admin/import' }, 'Import more'), ' or ', h('a', { href: '#/admin/questions/new' }, 'write one'), '.'));
  if (o.misses) warnings.push(h('p', {}, `${plural(o.misses, 'answer')} were turned away and are waiting for review. `, h('a', { href: '#/admin/misses' }, 'Review them'), '.'));
  shell('', o.misses,
    h('h1', {}, 'Overview'),
    warnings.length ? h('section', { class: 'panel' }, warnings) : null,
    h('div', { class: 'stats' },
      h('div', {}, h('b', {}, o.playersToday), h('span', {}, `Finished today (${o.startedToday} started)`)),
      h('div', {}, h('b', {}, o.users), h('span', {}, `Users (${o.activeWeek} active this week)`)),
      h('div', {}, h('b', {}, o.bank), h('span', {}, 'Prompts in the bank')),
      h('div', {}, h('b', {}, o.unused), h('span', {}, 'Never used')),
      h('div', {}, h('b', {}, o.scheduledAhead), h('span', {}, 'Days scheduled ahead'))),
    h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', {}, 'Today'), o.todayPrompts.length
        ? h('ol', {}, o.todayPrompts.map(p => h('li', {}, p.text, h('small', {}, ` (${p.category})`))))
        : h('p', { class: 'muted' }, 'Today’s puzzle is created when the first player opens the game, or you can pick it in the schedule.'),
        h('a', { class: 'btn ghost small', href: '#/admin/schedule' }, 'Open schedule')),
      h('section', { class: 'panel' }, h('h2', {}, 'Players per day'), o.participation.length
        ? h('div', {}, h('div', { class: 'bar', role: 'img', 'aria-label': 'Players per day over the last two weeks' },
          o.participation.map(p => h('div', { style: `height:${(p.players / max * 100).toFixed(0)}%`, title: `${p.date}: ${p.players}` }))),
        h('div', { class: 'spread muted', style: 'font-size:.8rem;margin-top:.3rem' }, h('span', {}, fmtDate(o.participation[0].date)), h('span', {}, 'today')))
        : h('p', { class: 'muted' }, 'No days played yet.'))));
}

// ---------- schedule ----------
let bankCache = null;
async function bank(force) { if (!bankCache || force) bankCache = await api('GET', '/admin/prompts'); return bankCache; }

async function schedule(selDate) {
  const [s, b] = await Promise.all([api('GET', `/admin/schedule?from=${addDays(state.today, -21)}&to=${addDays(state.today, 63)}`), bank(true)]);
  const byDate = new Map(s.days.map(d => [d.date, d]));
  const start = addDays(s.today, -7 - wdOf(addDays(s.today, -7)) + state.settings.weekStart - (wdOf(addDays(s.today, -7)) < state.settings.weekStart ? 7 : 0));
  selDate = selDate || s.today;
  const editor = h('section', { class: 'panel' });
  const cells = [];
  for (let i = 0; i < 49; i++) {
    const d = addDays(start, i), day = byDate.get(d), active = s.activeWeekdays.includes(wdOf(d));
    const note = day ? `${plural(day.prompts.length, 'prompt')}${day.runs ? `, ${day.runs} played` : day.auto ? ', auto' : ''}` : active ? (d >= s.today ? 'auto-picked' : '–') : 'no puzzle day';
    cells.push(h('button', {
      type: 'button', class: [d < s.today ? 'past' : '', d === s.today ? 'today' : '', day ? 'has' : '', !active && !day ? 'off' : '', d === selDate ? 'sel' : ''].join(' '),
      onclick: () => go(`/admin/schedule/${d}`), 'aria-label': `${fmtDate(d)}: ${note}`,
    }, h('b', {}, String(Number(d.slice(8)))), d.slice(8) === '01' || i === 0 ? fmtDate(d, { month: 'short' }) : '', h('span', {}, note)));
  }
  const fillDays = h('input', { type: 'number', min: 1, max: 120, value: 14, style: 'width:5rem', 'aria-label': 'Number of days' });
  shell('schedule', missCount,
    h('div', { class: 'spread' }, h('h1', {}, 'Schedule'),
      h('div', { class: 'row' }, 'Pre-fill the next', fillDays, 'days',
        h('button', { class: 'btn small', type: 'button', async onclick() {
          const r = await api('POST', '/admin/schedule/autofill', { days: Number(fillDays.value) });
          toast(r.created.length ? `Scheduled ${plural(r.created.length, 'day')}` : 'Those days are already scheduled'); schedule(selDate);
        } }, 'Auto-fill'))),
    h('p', { class: 'muted' }, 'Days you leave empty get picked automatically from the least-used prompts when the first player opens the game. Puzzle days are set in Settings.'),
    h('section', { class: 'panel' }, h('div', { class: 'cal' }, [0, 1, 2, 3, 4, 5, 6].map(i => h('div', { class: 'wd' }, WD[(i + state.settings.weekStart) % 7])), cells)),
    editor);
  dayEditor(editor, selDate, byDate.get(selDate), s, b);
}

function dayEditor(el, date, day, s, b) {
  const title = h('h2', {}, fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  if (day?.runs || date < s.today) {
    el.replaceChildren(title, day ? h('ol', {}, day.prompts.map(p => h('li', {}, p.text, h('small', {}, ` (${p.category})`)))) : h('p', { class: 'muted' }, 'No puzzle on this day.'),
      h('p', { class: 'muted' }, day?.runs ? `${plural(day.runs, 'player')} already played this day, so it is locked.` : 'This day is in the past.'),
      day ? h('a', { href: `#/results/${date}` }, 'See answers') : null);
    return;
  }
  const byId = new Map(b.prompts.map(p => [p.id, p]));
  let picked = day ? day.prompts.map(p => p.id) : [];
  const list = h('ol', { class: 'ordered' });
  const search = h('input', { type: 'search', placeholder: 'Search prompts', 'aria-label': 'Search prompts' });
  const cat = h('select', { 'aria-label': 'Category' }, h('option', { value: '' }, 'All categories'), b.categories.map(c => h('option', { value: c.category }, `${c.category} (${c.n})`)));
  const unusedOnly = h('input', { type: 'checkbox', checked: true });
  const pick = h('div', { class: 'picklist' });
  const paintList = () => {
    list.replaceChildren(...picked.map((id, i) => h('li', {}, h('span', {}, byId.get(id)?.text, h('small', { class: 'muted' }, ` (${byId.get(id)?.category})`)),
      h('button', { type: 'button', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { [picked[i - 1], picked[i]] = [picked[i], picked[i - 1]]; paintList(); } }, '↑'),
      h('button', { type: 'button', 'aria-label': 'Move down', disabled: i === picked.length - 1, onclick: () => { [picked[i + 1], picked[i]] = [picked[i], picked[i + 1]]; paintList(); } }, '↓'),
      h('button', { type: 'button', 'aria-label': 'Remove', onclick: () => { picked.splice(i, 1); paintList(); paintPick(); } }, '✕'))));
    if (!picked.length) list.append(h('li', {}, h('span', { class: 'muted' }, 'No prompts picked. Leave it empty to let the game pick automatically.')));
    count.textContent = `${picked.length} of ${s.promptsPerDay} prompts`;
  };
  const paintPick = () => {
    const q = search.value.trim().toLowerCase();
    const rows = b.prompts.filter(p => !p.retired && p.answers > 0 && (!q || p.text.toLowerCase().includes(q)) && (!cat.value || p.category === cat.value) && (!unusedOnly.checked || !p.used || picked.includes(p.id)));
    pick.replaceChildren(...rows.slice(0, 300).map(p => h('label', {},
      h('input', { type: 'checkbox', checked: picked.includes(p.id), onchange: e => { if (e.target.checked) { if (picked.length >= 10) { e.target.checked = false; return toast('Up to 10 prompts per day', true); } picked.push(p.id); } else picked = picked.filter(x => x !== p.id); paintList(); } }),
      h('span', { style: 'flex:1' }, p.text), h('small', { class: 'muted' }, `${p.category}, ${p.answers} answers${p.used ? `, used ${p.used}×` : ''}`))));
    if (!rows.length) pick.append(h('p', { class: 'muted', style: 'padding:.6rem' }, 'Nothing matches.'));
  };
  const count = h('span', { class: 'muted' });
  search.oninput = paintPick; cat.onchange = paintPick; unusedOnly.onchange = paintPick;
  el.replaceChildren(title,
    h('div', { class: 'grid2' },
      h('div', {}, h('div', { class: 'spread' }, h('h3', {}, 'Picked'), count), list,
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', async onclick() {
            if (!picked.length) return toast('Pick at least one prompt, or use “Clear day”', true);
            await api('PUT', `/admin/schedule/${date}`, { promptIds: picked }); toast('Day saved'); schedule(date);
          } }, 'Save day'),
          h('button', { class: 'btn ghost', type: 'button', async onclick() {
            const need = s.promptsPerDay - picked.length;
            if (need <= 0) return toast('The day is full');
            const r = await api('GET', `/admin/schedule/suggest?n=${need}&exclude=${picked.join(',')}`);
            picked.push(...r.prompts.map(p => p.id)); paintList(); paintPick();
          } }, 'Fill with suggestions'),
          day ? h('button', { class: 'btn danger', type: 'button', async onclick() { await api('DELETE', `/admin/schedule/${date}`); toast('Day cleared'); schedule(date); } }, 'Clear day') : null)),
      h('div', {}, h('h3', {}, 'Question bank'), h('div', { class: 'row', style: 'margin-bottom:.6rem' }, search, cat, h('label', { class: 'check', style: 'margin:0' }, unusedOnly, 'Unused only')), pick)));
  paintList(); paintPick();
}

// ---------- questions ----------
async function questions(id) {
  if (id) return promptEditor(id === 'new' ? null : Number(id));
  const b = await bank(true);
  const search = h('input', { type: 'search', placeholder: 'Search prompts', 'aria-label': 'Search prompts' });
  const cat = h('select', { 'aria-label': 'Category' }, h('option', { value: '' }, 'All categories'), b.categories.map(c => h('option', { value: c.category }, `${c.category} (${c.n})`)));
  const status = h('select', { 'aria-label': 'Status' }, ['All', 'Unused', 'Used', 'Retired'].map(x => h('option', { value: x.toLowerCase() }, x)));
  const body = h('tbody');
  const paint = () => {
    const q = search.value.trim().toLowerCase(), st = status.value;
    const rows = b.prompts.filter(p => (!q || p.text.toLowerCase().includes(q)) && (!cat.value || p.category === cat.value)
      && (st === 'all' ? !p.retired : st === 'unused' ? !p.used && !p.retired : st === 'used' ? p.used && !p.retired : p.retired));
    body.replaceChildren(...rows.map(p => h('tr', {}, h('td', {}, h('a', { href: `#/admin/questions/${p.id}` }, p.text)), h('td', { class: 'muted' }, p.category),
      h('td', { class: 'n' }, p.answers), h('td', { class: 'n' }, p.used || ''), h('td', { class: 'muted' }, p.lastUsed ? fmtDate(p.lastUsed) : ''),
      h('td', {}, p.retired ? h('span', { class: 'badge' }, 'retired') : !p.used ? h('span', { class: 'badge ok' }, 'new') : ''))));
    summary.textContent = `${rows.length} shown`;
  };
  const summary = h('span', { class: 'muted' });
  search.oninput = paint; cat.onchange = paint; status.onchange = paint;
  shell('questions', missCount,
    h('div', { class: 'spread' }, h('h1', {}, 'Questions'), h('a', { class: 'btn', href: '#/admin/questions/new' }, 'New prompt')),
    h('section', { class: 'panel' }, h('div', { class: 'row', style: 'margin-bottom:.8rem' }, search, cat, status, summary),
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Prompt'), h('th', {}, 'Category'), h('th', { class: 'n' }, 'Answers'), h('th', { class: 'n' }, 'Used'), h('th', {}, 'Last used'), h('th', {}, ''))), body))));
  paint();
}

async function promptEditor(id) {
  const [p, b] = await Promise.all([id ? api('GET', `/admin/prompts/${id}`) : { text: '', category: '', answers: [], used: [], retired: false }, bank()]);
  const text = h('input', { value: p.text, maxlength: 200, required: true, id: 'pe-text' });
  const cat = h('input', { value: p.category, maxlength: 40, list: 'cats', id: 'pe-cat' });
  const rows = h('tbody');
  const addRow = (a = { answer: '', tier: 3, aliases: [] }) => {
    const tr = h('tr', { 'data-id': a.id ? String(a.id) : '' },
      h('td', {}, h('input', { value: a.answer, 'aria-label': 'Answer', class: 'a' })),
      h('td', {}, h('select', { 'aria-label': 'Tier', class: 't' }, tierOptions(a.tier))),
      h('td', {}, h('input', { value: (a.aliases || []).join(' | '), 'aria-label': 'Other accepted spellings, separated by |', class: 'l', placeholder: a.answer ? '' : 'other spellings, separated by |' })),
      h('td', {}, h('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'Remove answer', onclick: () => tr.remove() }, '✕')));
    rows.append(tr); return tr;
  };
  [...p.answers].sort((x, y) => x.tier - y.tier || x.answer.localeCompare(y.answer)).forEach(a => addRow(a));
  if (!p.answers.length) for (let i = 0; i < 5; i++) addRow({ answer: '', tier: i + 1, aliases: [] });
  const paste = h('textarea', { placeholder: '1 Most obvious answer\n3 Less common answer | other spelling\n5 Very rare answer', 'aria-label': 'Paste answers' });
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
      toast(r.awarded ? `Saved. ${plural(r.awarded, 'earlier answer')} now scored.` : 'Prompt saved');
      if (!id) go(`/admin/questions/${r.id}`); else promptEditor(id);
    } catch (e) { err.textContent = e.message; }
  };
  shell('questions', missCount,
    h('p', {}, h('a', { href: '#/admin/questions' }, 'All questions')),
    h('h1', {}, id ? 'Edit prompt' : 'New prompt'),
    h('section', { class: 'panel' },
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('label', { for: 'pe-text' }, 'Prompt'), text),
        h('div', { class: 'field' }, h('label', { for: 'pe-cat' }, 'Category'), cat, h('datalist', { id: 'cats' }, b.categories.map(c => h('option', { value: c.category }))))),
      p.used.length ? h('p', { class: 'muted' }, `Used on ${p.used.map(d => fmtDate(d)).join(', ')}. Adding answers re-scores players who typed them.`) : null,
      h('h3', {}, `Answers (${p.answers.length})`),
      h('p', { class: 'muted' }, 'Tier 1 is what most people say, tier 5 is valid but rare. Case, accents, punctuation, plurals and a leading “the” are ignored automatically.'),
      h('div', { class: 'table-wrap' }, h('table', { class: 'ans-table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Answer'), h('th', {}, 'Tier'), h('th', {}, 'Other accepted spellings'), h('th', {}, ''))), rows)),
      h('div', { class: 'row', style: 'margin:.6rem 0 1.2rem' }, h('button', { class: 'btn ghost small', type: 'button', onclick: () => addRow().querySelector('.a').focus() }, 'Add answer')),
      h('details', {}, h('summary', {}, 'Paste many answers at once'),
        h('p', { class: 'muted' }, 'One per line: the tier (1-5), a space, the answer, then optional other spellings after |.'), paste,
        h('button', { class: 'btn ghost small', type: 'button', onclick() {
          let n = 0;
          for (const line of paste.value.split(/\r?\n/)) {
            const m = line.trim().match(/^([1-5])\s+(.+)$/); if (!m) continue;
            const [answer, ...aliases] = m[2].split('|').map(x => x.trim());
            addRow({ answer, tier: Number(m[1]), aliases }); n++;
          }
          paste.value = ''; toast(`Added ${plural(n, 'answer')} below. Save to keep them.`);
        } }, 'Add to list')),
      err,
      h('div', { class: 'row', style: 'margin-top:1rem' }, h('button', { class: 'btn', type: 'button', onclick: save }, 'Save prompt'),
        id ? h('button', { class: 'btn ghost', type: 'button', async onclick() { await api('PUT', `/admin/prompts/${id}`, { retired: !p.retired }); bankCache = null; toast(p.retired ? 'Prompt restored' : 'Prompt retired: it won’t be picked again'); promptEditor(id); } }, p.retired ? 'Restore' : 'Retire') : null,
        id && !p.used.length ? h('button', { class: 'btn danger', type: 'button', async onclick() { if (!confirm('Delete this prompt for good?')) return; await api('DELETE', `/admin/prompts/${id}`); bankCache = null; toast('Prompt deleted'); go('/admin/questions'); } }, 'Delete') : null)));
}

// ---------- import / export ----------
function importExport() {
  const file = h('input', { type: 'file', accept: '.json,.txt,.csv', id: 'im-file' });
  const text = h('textarea', { 'aria-label': 'Or paste questions', placeholder: 'C: Food & Drink\nQ: Name a citrus fruit\n1 Orange\n2 Lemon\n4 Kumquat\n5 Yuzu | yuzu fruit', style: 'min-height:12rem' });
  const mode = h('select', { id: 'im-mode' }, h('option', { value: 'skip' }, 'Skip prompts that already exist'), h('option', { value: 'update' }, 'Merge new answers into existing prompts'));
  const out = h('div');
  let name = 'pasted.txt';
  file.onchange = async () => { const f = file.files[0]; if (!f) return; name = f.name; text.value = await f.text(); };
  const run = async dryRun => {
    if (!text.value.trim()) return toast('Choose a file or paste some questions', true);
    try {
      const r = await api('POST', '/admin/import', { name, content: text.value, mode: mode.value, dryRun });
      bankCache = null;
      out.replaceChildren(h('div', { class: 'panel' }, h('h3', {}, dryRun ? 'Check result' : 'Imported'),
        h('p', {}, `${r.total} prompts read: ${r.added} ${dryRun ? 'would be added' : 'added'}, ${r.updated} ${dryRun ? 'would be updated' : 'updated'}, ${r.skipped} skipped (already in the bank).`),
        r.errors.length ? h('div', {}, h('p', { class: 'error' }, `${plural(r.errors.length, 'problem')}:`), h('ul', {}, r.errors.slice(0, 50).map(e => h('li', {}, e)))) : h('p', { class: 'muted' }, 'No problems found.')));
      if (!dryRun) toast(`Imported ${plural(r.added, 'new prompt')}`);
    } catch (e) { out.replaceChildren(h('p', { class: 'error' }, e.message)); }
  };
  const dl = (fmt, label) => h('a', { class: 'btn ghost', href: `/api/admin/export?format=${fmt}`, download: true }, label);
  shell('import', missCount, h('h1', {}, 'Import & export'),
    h('section', { class: 'panel' }, h('h2', {}, 'Add questions'),
      h('p', {}, 'Upload a .txt, .csv or .json file, or paste text. The simplest format is plain text:'),
      h('pre', { class: 'secret', style: 'display:block;white-space:pre;overflow-x:auto;padding:.8rem' }, 'C: Food & Drink           ← category for the prompts below\nQ: Name a citrus fruit    ← a new prompt\n1 Orange                  ← tier 1 = most common\n4 Kumquat\n5 Yuzu | yuzu fruit       ← other spellings after |'),
      h('p', { class: 'muted' }, 'CSV columns: prompt, category, answer, tier, aliases (one row per answer; Excel works). Export the bank as CSV to see an example.'),
      h('div', { class: 'field' }, h('label', { for: 'im-file' }, 'File'), file),
      h('div', { class: 'field' }, h('label', {}, 'Or paste'), text),
      h('div', { class: 'field' }, h('label', { for: 'im-mode' }, 'When a prompt already exists'), mode),
      h('div', { class: 'row' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => run(true) }, 'Check without importing'), h('button', { class: 'btn', type: 'button', onclick: () => run(false) }, 'Import'))),
    out,
    h('section', { class: 'panel' }, h('h2', {}, 'Export the question bank'), h('p', {}, 'Download every active prompt to edit offline or move to another server.'),
      h('div', { class: 'row' }, dl('txt', 'Text'), dl('csv', 'CSV (Excel)'), dl('json', 'JSON'))),
    h('section', { class: 'panel' }, h('h2', {}, 'Backup'), h('p', {}, 'A single file with everything: users, scores, questions and settings. To restore, stop the server and replace data/outlier.db with it.'),
      h('a', { class: 'btn ghost', href: '/api/admin/backup', download: true }, 'Download backup')));
}

// ---------- misses ----------
async function misses() {
  const { misses: list } = await api('GET', '/admin/misses');
  missCount = list.length;
  const body = h('tbody');
  list.forEach(m => {
    const tier = h('select', { 'aria-label': 'Tier' }, tierOptions(4));
    const textIn = h('input', { value: m.raw, 'aria-label': 'Answer as it should appear', style: 'min-width:10rem' });
    const tr = h('tr', {},
      h('td', {}, h('a', { href: `#/admin/questions/${m.promptId}` }, m.prompt)),
      h('td', {}, textIn), h('td', { class: 'n' }, m.players), h('td', { class: 'n' }, m.guesses),
      h('td', {}, h('div', { class: 'row', style: 'gap:.4rem;flex-wrap:nowrap' }, tier,
        h('button', { class: 'btn small', type: 'button', async onclick() {
          try { const r = await api('POST', '/admin/misses/accept', { promptId: m.promptId, text: textIn.value, tier: Number(tier.value) }); toast(`Added. ${plural(r.awarded, 'round')} re-scored.`); tr.remove(); missCount--; }
          catch (e) { toast(e.message, true); }
        } }, 'Accept'),
        h('button', { class: 'btn ghost small', type: 'button', async onclick() {
          const p = await api('GET', `/admin/prompts/${m.promptId}`);
          const sel = h('select', { 'aria-label': 'Same as' }, p.answers.map(a => h('option', { value: String(a.id) }, a.answer)));
          const cell = this.closest('td');
          cell.replaceChildren(h('div', { class: 'row', style: 'gap:.4rem;flex-wrap:nowrap' }, 'Same as', sel, h('button', { class: 'btn small', type: 'button', async onclick() {
            try { const r = await api('POST', '/admin/misses/accept', { promptId: m.promptId, text: textIn.value, aliasOf: Number(sel.value) }); toast(`Spelling added. ${plural(r.awarded, 'round')} re-scored.`); tr.remove(); }
            catch (e) { toast(e.message, true); }
          } }, 'Save')));
        } }, 'Spelling of…'),
        h('button', { class: 'btn ghost small', type: 'button', async onclick() { await api('POST', '/admin/misses/dismiss', { promptId: m.promptId, norm: m.norm }); tr.remove(); missCount--; } }, 'Reject'))));
    body.append(tr);
  });
  shell('misses', missCount, h('h1', {}, 'Turned-away answers'),
    h('p', {}, 'Answers players typed that were not on the list. Accept the valid ones with a tier, or mark them as another spelling of an existing answer. Players who typed them get the points retroactively.'),
    h('section', { class: 'panel' }, list.length ? h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Prompt'), h('th', {}, 'Typed answer'), h('th', { class: 'n' }, 'Players'), h('th', { class: 'n' }, 'Times'), h('th', {}, ''))), body))
      : h('p', { class: 'muted' }, 'Nothing to review.')));
}

// ---------- users ----------
async function users() {
  const { users: list } = await api('GET', '/admin/users');
  const out = h('div');
  const showCreated = (r, title) => out.replaceChildren(h('section', { class: 'panel' }, h('h3', {}, title),
    h('p', {}, 'Give each person their temporary password. They choose their own the first time they sign in. These passwords are shown only once.'),
    h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Username'), h('th', {}, 'Name'), h('th', {}, 'Temporary password'))),
      h('tbody', {}, r.created.map(c => h('tr', {}, h('td', {}, c.username), h('td', {}, c.displayName), h('td', {}, h('span', { class: 'secret' }, c.password)))))),
    r.errors?.length ? h('ul', { class: 'error' }, r.errors.map(e => h('li', {}, e))) : null));
  const single = h('form', { async onsubmit(e) {
    e.preventDefault();
    try { const r = await api('POST', '/admin/users', Object.fromEntries(new FormData(single))); showCreated(r, 'Account created'); single.reset(); refresh(); }
    catch (x) { toast(x.message, true); }
  } },
  h('div', { class: 'grid2' },
    h('div', { class: 'field' }, h('label', { for: 'nu-u' }, 'Username'), h('input', { id: 'nu-u', name: 'username', required: true, pattern: '[A-Za-z0-9._-]{2,32}' })),
    h('div', { class: 'field' }, h('label', { for: 'nu-n' }, 'Name'), h('input', { id: 'nu-n', name: 'displayName', maxlength: 40 })),
    h('div', { class: 'field' }, h('label', { for: 'nu-t' }, 'Team'), h('input', { id: 'nu-t', name: 'team', maxlength: 40 })),
    h('div', { class: 'field' }, h('label', { for: 'nu-r' }, 'Role'), h('select', { id: 'nu-r', name: 'role' }, h('option', { value: 'player' }, 'Player'), h('option', { value: 'admin' }, 'Admin')))),
  h('button', { class: 'btn', type: 'submit' }, 'Create account'));
  const bulk = h('textarea', { placeholder: 'dana.levi, Dana Levi, Marketing\nyossi, Yossi Cohen, R&D', 'aria-label': 'One person per line' });
  const body = h('tbody');
  const refresh = async () => {
    const { users: fresh } = await api('GET', '/admin/users');
    body.replaceChildren(...fresh.map(userRow));
  };
  const userRow = u => {
    const tr = h('tr', {},
      h('td', {}, h('b', {}, u.displayName), h('br'), h('small', { class: 'muted' }, u.username)),
      h('td', {}, u.team), h('td', {}, u.role === 'admin' ? h('span', { class: 'badge hot' }, 'admin') : 'player', u.disabled ? h('span', { class: 'badge', style: 'margin-left:.3rem' }, 'disabled') : '', u.mustChange ? h('span', { class: 'badge', style: 'margin-left:.3rem' }, 'temp password') : ''),
      h('td', { class: 'n' }, u.games), h('td', { class: 'n' }, u.points), h('td', { class: 'muted' }, ago(u.lastSeen)),
      h('td', {}, h('button', { class: 'btn ghost small', type: 'button', onclick: () => editUser(u, tr) }, 'Manage')));
    return tr;
  };
  const editUser = (u, tr) => {
    const dn = h('input', { value: u.displayName, 'aria-label': 'Name' }), tm = h('input', { value: u.team, 'aria-label': 'Team' });
    const role = h('select', { 'aria-label': 'Role' }, h('option', { value: 'player', selected: u.role === 'player' }, 'Player'), h('option', { value: 'admin', selected: u.role === 'admin' }, 'Admin'));
    const runsBox = h('div');
    const act = (label, fn, cls = 'btn ghost small') => h('button', { class: cls, type: 'button', async onclick() { try { await fn(); } catch (e) { toast(e.message, true); } } }, label);
    const panel = h('td', { colspan: '7' }, h('div', { class: 'panel', style: 'margin:.4rem 0' },
      h('div', { class: 'row' }, dn, tm, role, act('Save', async () => { await api('PUT', `/admin/users/${u.id}`, { displayName: dn.value, team: tm.value, role: role.value }); toast('User saved'); refresh(); }, 'btn small')),
      h('div', { class: 'row', style: 'margin-top:.8rem' },
        act('Reset password', async () => { const r = await api('POST', `/admin/users/${u.id}/reset`); showCreated({ created: [{ username: u.username, displayName: u.displayName, password: r.password }] }, 'Password reset'); refresh(); }),
        act(u.disabled ? 'Enable account' : 'Disable account', async () => { await api('PUT', `/admin/users/${u.id}`, { disabled: !u.disabled }); refresh(); }),
        act('Played days', async () => {
          const { runs } = await api('GET', `/admin/users/${u.id}/runs`);
          runsBox.replaceChildren(runs.length ? h('table', {}, h('tbody', {}, runs.map(r => h('tr', {}, h('td', {}, fmtDate(r.date)), h('td', {}, r.mode), h('td', { class: 'n' }, r.finished ? r.score : `round ${r.position + 1}`),
            h('td', {}, act('Let them replay', async () => { if (!confirm(`Delete ${u.displayName}'s game on ${r.date}? They can then play it again.`)) return; await api('DELETE', `/admin/users/${u.id}/runs/${r.date}`); toast('Game deleted'); }))))))
            : h('p', { class: 'muted' }, 'No games yet.'));
        }),
        act('Delete user', async () => { if (!confirm(`Delete ${u.displayName} and all their scores?`)) return; await api('DELETE', `/admin/users/${u.id}`); toast('User deleted'); refresh(); }, 'btn danger small')),
      runsBox));
    tr.after(h('tr', {}, panel));
  };
  body.replaceChildren(...list.map(userRow));
  shell('users', missCount, h('h1', {}, 'Users'),
    h('div', { class: 'grid2' },
      h('section', { class: 'panel' }, h('h2', {}, 'Add one person'), single),
      h('section', { class: 'panel' }, h('h2', {}, 'Add many people'), h('p', { class: 'muted' }, 'One per line: username, name, team. Separate with commas or tabs (paste from Excel).'), bulk,
        h('button', { class: 'btn', type: 'button', style: 'margin-top:.6rem', async onclick() {
          const r = await api('POST', '/admin/users', { bulk: bulk.value }); showCreated(r, `${plural(r.created.length, 'account')} created`); bulk.value = ''; refresh();
        } }, 'Create accounts'))),
    out,
    h('section', { class: 'panel' }, h('h2', {}, `Everyone (${list.length})`), h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Team'), h('th', {}, 'Role'), h('th', { class: 'n' }, 'Days'), h('th', { class: 'n' }, 'Points'), h('th', {}, 'Last seen'), h('th', {}, ''))), body))));
}

// ---------- settings ----------
async function settings() {
  const { settings: s } = await api('GET', '/admin/settings');
  const err = h('p', { class: 'error', role: 'alert' });
  const field = (id, label, input, hint) => h('div', { class: 'field' }, h('label', { for: id }, label, hint ? h('span', { class: 'muted' }, ` ${hint}`) : ''), input);
  const inp = (id, value, attrs = {}) => h('input', { id, value: String(value), ...attrs });
  const zones = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return []; } })();
  const el = {
    siteName: inp('s-name', s.siteName, { maxlength: 40 }), tagline: inp('s-tag', s.tagline, { maxlength: 120 }),
    promptsPerDay: inp('s-ppd', s.promptsPerDay, { type: 'number', min: 1, max: 10 }), roundSeconds: inp('s-sec', s.roundSeconds, { type: 'number', min: 10, max: 120 }),
    timeZone: inp('s-tz', s.timeZone, { list: 'tzs' }), dayStartHour: inp('s-hour', s.dayStartHour, { type: 'number', min: 0, max: 23 }),
    weekStart: h('select', { id: 's-ws' }, WD.map((d, i) => h('option', { value: String(i), selected: i === s.weekStart }, d))),
    registration: h('select', { id: 's-reg' }, [['open', 'Anyone on the network can sign up'], ['code', 'Sign-up needs an invite code'], ['closed', 'Only admins create accounts']].map(([v, l]) => h('option', { value: v, selected: v === s.registration }, l))),
    inviteCode: inp('s-code', s.inviteCode, { maxlength: 60 }),
    autoSchedule: h('input', { type: 'checkbox', checked: s.autoSchedule }), typoTolerance: h('input', { type: 'checkbox', checked: s.typoTolerance }), archivePlay: h('input', { type: 'checkbox', checked: s.archivePlay }),
  };
  const days = WD.map((d, i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', value: String(i), checked: s.activeWeekdays.includes(i) }), d));
  const save = async () => {
    err.textContent = '';
    try {
      const patch = {
        siteName: el.siteName.value, tagline: el.tagline.value, promptsPerDay: Number(el.promptsPerDay.value), roundSeconds: Number(el.roundSeconds.value),
        timeZone: el.timeZone.value, dayStartHour: Number(el.dayStartHour.value), weekStart: Number(el.weekStart.value), registration: el.registration.value,
        inviteCode: el.inviteCode.value, autoSchedule: el.autoSchedule.checked, typoTolerance: el.typoTolerance.checked, archivePlay: el.archivePlay.checked,
        activeWeekdays: days.map(l => l.querySelector('input')).filter(c => c.checked).map(c => Number(c.value)),
      };
      await api('PUT', '/admin/settings', patch);
      const me = await api('GET', '/me'); state.settings = me.settings; state.today = me.today;
      toast('Settings saved');
    } catch (e) { err.textContent = e.message; }
  };
  shell('settings', missCount, h('h1', {}, 'Settings'),
    h('section', { class: 'panel' }, h('h2', {}, 'The game'),
      h('div', { class: 'grid2' }, field('s-name', 'Game name', el.siteName), field('s-tag', 'Tagline', el.tagline),
        field('s-ppd', 'Prompts per day', el.promptsPerDay, '(new days only)'), field('s-sec', 'Seconds per prompt', el.roundSeconds)),
      h('label', { class: 'check' }, el.typoTolerance, 'Forgive small spelling mistakes'),
      h('label', { class: 'check' }, el.archivePlay, 'Let players play past days from the archive (not counted)')),
    h('section', { class: 'panel' }, h('h2', {}, 'Calendar'),
      h('div', { class: 'grid2' }, field('s-tz', 'Time zone', el.timeZone), field('s-hour', 'New puzzle starts at hour', el.dayStartHour, '(0 = midnight)'), field('s-ws', 'Weeks start on', el.weekStart, '(weekly leaderboard)')),
      h('datalist', { id: 'tzs' }, zones.map(z => h('option', { value: z }))),
      h('label', {}, 'Puzzle days'), h('div', { class: 'row', style: 'margin-bottom:1rem' }, days),
      h('label', { class: 'check' }, el.autoSchedule, 'Pick prompts automatically when a puzzle day has none scheduled')),
    h('section', { class: 'panel' }, h('h2', {}, 'Accounts'),
      h('div', { class: 'grid2' }, field('s-reg', 'Who can sign up', el.registration), field('s-code', 'Invite code', el.inviteCode, '(when sign-up needs a code)'))),
    err, h('button', { class: 'btn big', type: 'button', onclick: save }, 'Save settings'));
}
