// Turned-away answers: valid answers players typed that weren't on the list. Accepting one re-scores those players.
import { useState } from 'react';
import { Link } from 'react-router';
import type { AdminMissRow, SavePromptResponse } from '../../../shared/api.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Card, PageTitle, TIER_IDS, useAction, useAgo, useMisses, usePrompt } from './common.tsx';

export function Misses() {
  const { t } = useI18n();
  const q = useMisses();
  return (
    <>
      <PageTitle k="admin.m.title" />
      <Card>
        <p className="faint">{t('admin.m.note')}</p>
        {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : q.data.misses.length ? (
          <ul className="adm-misses">
            {q.data.misses.map(m => <MissRow key={`${m.promptId}:${m.norm}`} m={m} />)}
          </ul>
        ) : <p className="empty">{t('admin.m.none')}</p>}
      </Card>
    </>
  );
}

function MissRow({ m }: { m: AdminMissRow }) {
  const { t } = useI18n();
  const ago = useAgo();
  const act = useAction();
  const [text, setText] = useState(m.raw);
  const [tier, setTier] = useState(3);
  const [aliasMode, setAliasMode] = useState(false);
  const [aliasOf, setAliasOf] = useState<number | ''>('');
  const full = usePrompt(aliasMode ? m.promptId : null);

  return (
    <li className="adm-miss px-box">
      <div className="adm-miss-head">
        <Link to={`/admin/questions/${m.promptId}`} dir="auto">{m.prompt}</Link>
        <span className="adm-meta faint"><span>{t('admin.m.times')}: {m.guesses}</span><span>{t('admin.m.players')}: {m.players}</span><span>{ago(m.lastAt)}</span></span>
      </div>
      <div className="row adm-miss-actions">
        <label className="adm-inline">
          <span className="sr-only">{t('admin.m.asAnswer')}</span>
          <input className="input" value={text} onChange={e => setText(e.target.value)} dir="auto" title={t('admin.m.asAnswer')} />
        </label>
        {!aliasMode ? (
          <>
            <select className="select select--tier" value={tier} onChange={e => setTier(Number(e.target.value))} aria-label={t('admin.q.tier')}>
              {TIER_IDS.map(n => <option key={n} value={n}>{n} {t(`tier.${n}` as AnyKey)}</option>)}
            </select>
            <button type="button" className="px-btn px-btn--small" onClick={() => void act(() => api.post<SavePromptResponse>('/api/admin/misses/accept', { promptId: m.promptId, text, tier }), r => t('admin.m.added', { n: r.awarded }))}>
              {t('admin.m.accept')}
            </button>
            <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => setAliasMode(true)}>{t('admin.m.spellingOf')}</button>
          </>
        ) : (
          <>
            <select className="select" value={aliasOf} onChange={e => setAliasOf(e.target.value ? Number(e.target.value) : '')} aria-label={t('admin.m.sameAs')}>
              <option value="">{t('admin.m.sameAs')}…</option>
              {full.data?.answers.map(a => <option key={a.id} value={a.id}>{a.answer}</option>)}
            </select>
            <button type="button" className="px-btn px-btn--small" disabled={!aliasOf} onClick={() => void act(() => api.post<SavePromptResponse>('/api/admin/misses/accept', { promptId: m.promptId, text, aliasOf }), r => t('admin.m.spellingAdded', { n: r.awarded }))}>
              {t('common.save')}
            </button>
          </>
        )}
        <button type="button" className="px-btn px-btn--small px-btn--danger" onClick={() => void act(() => api.post('/api/admin/misses/dismiss', { promptId: m.promptId, norm: m.norm }), () => t('admin.m.rejected'))}>
          {t('admin.m.reject')}
        </button>
      </div>
    </li>
  );
}
