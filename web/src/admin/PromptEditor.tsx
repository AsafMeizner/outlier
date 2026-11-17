// Edit one prompt: text, category, and its answers with tiers and other accepted spellings.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { PromptFull, SavePromptResponse } from '../../../shared/api.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { parseAnswerLines } from '../lib/answers.ts';
import { fmtDate } from '../lib/format.ts';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Card, PageTitle, TIER_IDS, useAction, usePrompt, usePrompts } from './common.tsx';

interface Row { key: number; id: number | null; answer: string; tier: number; aliases: string }
let nextKey = 1;

export function PromptEditor() {
  const { id } = useParams();
  const promptId = id ? Number(id) : null;
  const q = usePrompt(promptId);
  if (promptId !== null && q.isPending) return <Loading />;
  if (promptId !== null && q.isError) return <ErrorNote error={q.error} />;
  return <Editor key={promptId ?? 'new'} prompt={q.data ?? null} />;
}

function Editor({ prompt }: { prompt: PromptFull | null }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const act = useAction();
  const cats = usePrompts().data?.categories ?? [];
  const [text, setText] = useState(prompt?.text ?? '');
  const [category, setCategory] = useState(prompt?.category ?? '');
  const [rows, setRows] = useState<Row[]>(() => prompt?.answers.map(a => ({ key: nextKey++, id: a.id, answer: a.answer, tier: a.tier, aliases: a.aliases.join(' | ') })) ?? []);
  const [paste, setPaste] = useState('');
  const [pasteMsg, setPasteMsg] = useState('');

  const update = (key: number, patch: Partial<Row>): void => setRows(list => list.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const addPasted = (): void => {
    const parsed = parseAnswerLines(paste);
    setRows(list => [...list, ...parsed.answers.map(a => ({ key: nextKey++, id: null, answer: a.answer, tier: a.tier, aliases: Array.isArray(a.aliases) ? a.aliases.join(' | ') : a.aliases }))]);
    setPasteMsg(parsed.bad.length ? t('games.badLine', { n: parsed.bad[0] ?? 0, p: 1 }) : t('admin.q.pasted', { n: parsed.answers.length }));
    if (!parsed.bad.length) setPaste('');
  };
  const body = () => ({
    text: text.trim(), category: category.trim(),
    answers: rows.filter(r => r.answer.trim()).map(r => ({ id: r.id, answer: r.answer.trim(), tier: r.tier, aliases: r.aliases.split('|').map(s => s.trim()).filter(Boolean) })),
  });
  const save = async (): Promise<void> => {
    let savedId = prompt?.id ?? null;
    const ok = await act(
      () => (prompt ? api.put<SavePromptResponse>(`/api/admin/prompts/${prompt.id}`, body()) : api.post<SavePromptResponse>('/api/admin/prompts', body())),
      r => { savedId = r.id; return r.awarded ? t('admin.q.savedAwarded', { n: r.awarded }) : t('admin.q.saved'); },
    );
    if (ok && !prompt && savedId) await navigate(`/admin/questions/${savedId}`, { replace: true });
  };

  return (
    <>
      <PageTitle k={prompt ? 'admin.q.edit' : 'admin.q.new'}>
        <Link to="/admin/questions" className="px-btn px-btn--small px-btn--navy">{t('admin.q.all')}</Link>
      </PageTitle>
      <Card>
        {prompt?.used.length ? <p className="faint">{t('admin.q.usedOn', { d: prompt.used.map(d => fmtDate(locale, d)).join(', ') })}</p> : null}
        <label className="field">
          <span>{t('admin.q.prompt')}</span>
          <input className="input" value={text} onChange={e => setText(e.target.value)} maxLength={140} dir="auto" required />
        </label>
        <label className="field">
          <span>{t('admin.q.category')}</span>
          <input className="input" value={category} onChange={e => setCategory(e.target.value)} list="adm-cats" maxLength={40} dir="auto" />
          <datalist id="adm-cats">{cats.map(c => <option key={c.category} value={c.category} />)}</datalist>
        </label>
        {prompt ? <p className="adm-meta faint"><span>{t('admin.q.pack')}: {prompt.pack || '—'}</span><span>{t(prompt.lang === 'he' ? 'admin.lang.he' : 'admin.lang.en')}</span></p> : null}
      </Card>

      <Card title={t('admin.q.answersCount', { n: rows.length })}>
        <p className="faint">{t('admin.q.tierHelp')}</p>
        <div className="adm-scroll">
          <table className="table adm-answers">
            <thead><tr><th>{t('admin.q.answer')}</th><th>{t('admin.q.tier')}</th><th>{t('admin.q.aliases')}</th><th /></tr></thead>
            <tbody>
              {[...rows].sort((a, b) => a.tier - b.tier).map(r => (
                <tr key={r.key} data-tier={r.tier}>
                  <td><input className="input" value={r.answer} onChange={e => update(r.key, { answer: e.target.value })} dir="auto" aria-label={t('admin.q.answer')} /></td>
                  <td>
                    <select className="select select--tier" value={r.tier} onChange={e => update(r.key, { tier: Number(e.target.value) })} aria-label={t('admin.q.tier')}>
                      {TIER_IDS.map(n => <option key={n} value={n}>{n} {t(`tier.${n}` as AnyKey)}</option>)}
                    </select>
                  </td>
                  <td><input className="input" value={r.aliases} onChange={e => update(r.key, { aliases: e.target.value })} dir="auto" aria-label={t('admin.q.aliases')} /></td>
                  <td><button type="button" className="adm-mini" onClick={() => setRows(l => l.filter(x => x.key !== r.key))} aria-label={t('admin.q.removeAnswer')}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => setRows(l => [...l, { key: nextKey++, id: null, answer: '', tier: 3, aliases: '' }])}>{t('admin.q.addAnswer')}</button>
        <details className="adm-paste">
          <summary>{t('admin.q.paste')}</summary>
          <p className="faint">{t('admin.q.pasteHelp')}</p>
          <textarea className="textarea" value={paste} onChange={e => setPaste(e.target.value)} placeholder={t('admin.q.pastePlaceholder')} rows={6} dir="auto" />
          <div className="row">
            <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={addPasted} disabled={!paste.trim()}>{t('admin.q.addToList')}</button>
            <span className="faint" role="status">{pasteMsg}</span>
          </div>
        </details>
      </Card>

      <div className="row adm-actions">
        <button type="button" className="px-btn" onClick={() => void save()} disabled={!text.trim() || !rows.some(r => r.answer.trim())}>{t('admin.q.save')}</button>
        {prompt ? (
          <>
            <button type="button" className="px-btn px-btn--navy" onClick={() => void act(() => api.put(`/api/admin/prompts/${prompt.id}`, { retired: !prompt.retired }), () => t(prompt.retired ? 'admin.q.restoredToast' : 'admin.q.retiredToast'))}>
              {t(prompt.retired ? 'admin.q.restore' : 'admin.q.retire')}
            </button>
            <button type="button" className="px-btn px-btn--danger" onClick={() => { if (window.confirm(t('admin.q.deleteAsk'))) void act(() => api.del(`/api/admin/prompts/${prompt.id}`), () => t('admin.q.deleted')).then(ok => { if (ok) void navigate('/admin/questions'); }); }}>
              {t('common.delete')}
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}
