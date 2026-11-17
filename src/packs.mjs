// Question-pack formats: JSON, plain text and CSV. Parse to one shape, write back out.
//
// Shape: { title, prompts: [{ text, category, answers: [{ answer, tier, aliases: [] }] }] }
//
// Text format (easiest to write by hand):
//   T: My pack title            (optional)
//   C: Food & Drink             (category for the prompts that follow)
//   Q: Name a fruit that is red
//   1 Strawberry
//   4 Lingonberry | lingon      (tier 1-5, then the answer, then optional aliases after |)
//   # lines starting with # are comments
//
// CSV format: header row  prompt,category,answer,tier,aliases   (aliases separated by |)

function cleanAnswer(a, where) {
  const answer = String(a.answer ?? a.a ?? '').trim();
  const tier = Number(a.tier ?? a.t);
  const aliasesRaw = a.aliases ?? a.alias ?? [];
  const aliases = (Array.isArray(aliasesRaw) ? aliasesRaw : String(aliasesRaw).split('|'))
    .map(s => String(s).trim()).filter(Boolean);
  if (!answer) throw new Error(`${where}: empty answer`);
  if (!(Number.isInteger(tier) && tier >= 1 && tier <= 5)) throw new Error(`${where}: "${answer}" needs a tier from 1 to 5`);
  return { answer, tier, aliases };
}

function cleanPrompt(p, where) {
  const text = String(p.text ?? p.prompt ?? '').trim();
  if (!text) throw new Error(`${where}: prompt without text`);
  const answers = (p.answers || []).map((a, i) => cleanAnswer(a, `${where} answer ${i + 1}`));
  if (!answers.length) throw new Error(`${where} "${text}": no answers`);
  return { text, category: String(p.category ?? '').trim() || 'General', answers };
}

export function parseJson(text) {
  const data = JSON.parse(text);
  const prompts = Array.isArray(data) ? data : data.prompts;
  if (!Array.isArray(prompts)) throw new Error('JSON must be an array of prompts or { "prompts": [...] }');
  return { title: Array.isArray(data) ? '' : String(data.title || ''), prompts: prompts.map((p, i) => cleanPrompt(p, `prompt ${i + 1}`)) };
}

export function parseText(text) {
  const prompts = [];
  let title = '', category = 'General', current = null;
  text.split(/\r?\n/).forEach((raw, n) => {
    const line = raw.trim();
    const where = `line ${n + 1}`;
    if (!line || line.startsWith('#')) return;
    let m;
    if ((m = line.match(/^T\s*:\s*(.*)$/i))) { title = m[1].trim(); return; }
    if ((m = line.match(/^C\s*:\s*(.*)$/i))) { category = m[1].trim() || 'General'; if (current && !current.answers.length) current.category = category; return; }
    if ((m = line.match(/^Q\s*:\s*(.*)$/i))) { current = { text: m[1].trim(), category, answers: [] }; prompts.push(current); return; }
    if ((m = line.match(/^([1-5])\s+(.+)$/))) {
      if (!current) throw new Error(`${where}: answer before any "Q:" line`);
      const [answer, ...aliases] = m[2].split('|').map(s => s.trim());
      current.answers.push({ answer, tier: Number(m[1]), aliases: aliases.filter(Boolean) });
      return;
    }
    throw new Error(`${where}: not understood: "${line}". Use "Q: prompt", "C: category" or "<tier 1-5> answer | alias"`);
  });
  return { title, prompts: prompts.map((p, i) => cleanPrompt(p, `prompt ${i + 1}`)) };
}

function csvRows(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => f.trim()));
}

export function parseCsv(text) {
  const rows = csvRows(text.replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('CSV is empty');
  const head = rows[0].map(h => h.trim().toLowerCase());
  const col = name => head.indexOf(name);
  const [ip, ic, ia, it, il] = ['prompt', 'category', 'answer', 'tier', 'aliases'].map(col);
  if (ip < 0 || ia < 0 || it < 0) throw new Error('CSV needs columns: prompt, category, answer, tier, aliases');
  const byPrompt = new Map();
  rows.slice(1).forEach((r, n) => {
    const text = (r[ip] || '').trim();
    if (!text) throw new Error(`CSV row ${n + 2}: empty prompt`);
    if (!byPrompt.has(text)) byPrompt.set(text, { text, category: ic >= 0 ? (r[ic] || '').trim() : '', answers: [] });
    byPrompt.get(text).answers.push({ answer: r[ia], tier: Number(r[it]), aliases: il >= 0 ? r[il] || '' : '' });
  });
  return { title: '', prompts: [...byPrompt.values()].map((p, i) => cleanPrompt(p, `prompt ${i + 1}`)) };
}

/** Parse by file name, or by sniffing the content when no usable extension. */
export function parsePack(text, name = '') {
  const ext = name.toLowerCase().split('.').pop();
  const trimmed = text.trim();
  if (ext === 'json' || (ext !== 'csv' && ext !== 'txt' && /^[[{]/.test(trimmed))) return parseJson(trimmed);
  if (ext === 'csv' || (ext !== 'txt' && /^prompt\s*,/i.test(trimmed))) return parseCsv(text);
  return parseText(text);
}

const csvField = v => /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

export function toCsv(prompts) {
  const lines = ['prompt,category,answer,tier,aliases'];
  for (const p of prompts) for (const a of p.answers)
    lines.push([p.text, p.category, a.answer, String(a.tier), (a.aliases || []).join('|')].map(csvField).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function toText(prompts, title = '') {
  const out = [];
  if (title) out.push(`T: ${title}`, '');
  let cat = null;
  for (const p of prompts) {
    if (p.category !== cat) { out.push(`C: ${p.category}`); cat = p.category; }
    out.push(`Q: ${p.text}`);
    for (const a of [...p.answers].sort((x, y) => x.tier - y.tier || x.answer.localeCompare(y.answer)))
      out.push(`${a.tier} ${[a.answer, ...(a.aliases || [])].join(' | ')}`);
    out.push('');
  }
  return out.join('\n');
}
