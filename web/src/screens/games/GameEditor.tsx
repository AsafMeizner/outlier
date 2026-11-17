// Make or edit a friend game: a title and up to ten prompts, each with its answers in the one-line format.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { AnswerFull, GameInfo, SlugResponse } from '../../../../shared/api.ts';
import { useI18n } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { formatAnswerLines, parseAnswerLines } from '../../lib/answers.ts';
import { keys, useGame } from '../../lib/queries.ts';
import { ErrorNote, Loading } from '../../ui/Status.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { Window } from '../../ui/Window.tsx';
import '../screens.css';

const MAX_PROMPTS = 10;

interface Draft { key: number; text: string; category: string; answers: string; existing: AnswerFull[] }
let nextKey = 1;
const blank = (): Draft => ({ key: nextKey++, text: '', category: '', answers: '', existing: [] });

export function GameEditor() {
  const { slug } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const q = useGame(slug ?? '');
  const title = slug ? t('games.editorEdit') : t('games.editorNew');
  const close = (): void => void navigate(slug ? `/g/${slug}` : '/games');
  if (!slug) return <Window title={title} size="md" onClose={close}><Editor game={null} /></Window>;
  return (
    <Window title={title} size="md" onClose={close}>
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : !q.data.canEdit || !q.data.content ? <p className="empty">{t('common.notFound')}</p> : <Editor game={q.data} />}
    </Window>
  );
}

function Editor({ game }: { game: GameInfo | null }) {
  const { t, server } = useI18n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState(game?.title ?? '');
  const [prompts, setPrompts] = useState<Draft[]>(() =>
    game?.content?.map(p => ({ key: nextKey++, text: p.text, category: p.category, answers: formatAnswerLines(p.answers), existing: p.answers })) ?? [blank()],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = !!game && !game.editable;

  const update = (key: number, patch: Partial<Draft>): void => setPrompts(list => list.map(p => (p.key === key ? { ...p, ...patch } : p)));

  const save = async (): Promise<void> => {
    setError('');
    const out = [];
    for (const [i, p] of prompts.entries()) {
      const parsed = parseAnswerLines(p.answers, p.existing);
      if (parsed.bad.length) { setError(t('games.badLine', { n: parsed.bad[0] ?? 0, p: i + 1 })); return; }
      out.push({ text: p.text.trim(), category: p.category.trim(), answers: parsed.answers });
    }
    setBusy(true);
    try {
      const body = { title: title.trim(), prompts: out };
      const r = game ? await api.put<SlugResponse>(`/api/games/${game.slug}`, body) : await api.post<SlugResponse>('/api/games', body);
      void qc.invalidateQueries({ queryKey: keys.games });
      void qc.invalidateQueries({ queryKey: keys.game(r.slug) });
      toast(t('games.saved'), 'good');
      await navigate(`/g/${r.slug}`);
    } catch (e) {
      setError(e instanceof Error ? server(e.message) : t('common.error'));
    }
    setBusy(false);
  };

  return (
    <form className="editor" onSubmit={e => { e.preventDefault(); void save(); }}>
      <label className="field">
        <span>{t('games.titleField')}</span>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)} maxLength={60} required dir="auto" />
      </label>
      {locked ? <p className="note">{t('games.lockedPrompts')}</p> : null}
      <p className="faint">{t('games.answersHelp')}</p>
      <ol className="editor-prompts">
        {prompts.map((p, i) => (
          <li key={p.key} className="editor-prompt px-box">
            <div className="editor-row">
              <label className="field editor-text">
                <span>{t('games.promptField', { n: i + 1 })}</span>
                <input className="input" value={p.text} onChange={e => update(p.key, { text: e.target.value })} placeholder={t('games.promptPlaceholder')} maxLength={140} required readOnly={locked} dir="auto" />
              </label>
              <label className="field editor-cat">
                <span>{t('games.categoryField')}</span>
                <input className="input" value={p.category} onChange={e => update(p.key, { category: e.target.value })} maxLength={40} readOnly={locked} dir="auto" />
              </label>
            </div>
            <label className="field">
              <span>{t('games.answersField')}</span>
              <textarea className="textarea" value={p.answers} onChange={e => update(p.key, { answers: e.target.value })} placeholder={t('admin.q.pastePlaceholder')} rows={6} required dir="auto" />
            </label>
            {!locked && prompts.length > 1 ? (
              <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => setPrompts(list => list.filter(x => x.key !== p.key))}>
                {t('games.removePrompt')}
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {!locked && prompts.length < MAX_PROMPTS ? (
        <button type="button" className="px-btn px-btn--navy" onClick={() => setPrompts(list => [...list, blank()])}>{t('games.addPrompt')}</button>
      ) : null}
      <p className="error" role="alert">{error}</p>
      <button type="submit" className="px-btn px-btn--big" disabled={busy}>{t('games.save')}</button>
    </form>
  );
}
