// One friend-made game: share link, play button, its own leaderboard, and owner tools.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { GameInfo, MissRow, SavePromptResponse, SlugResponse } from '../../../../shared/api.ts';
import { TIERS } from '../../../../shared/tiers.ts';
import { useDistance } from '../../app/stage-context.tsx';
import { useI18n, type AnyKey } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { copyText } from '../../lib/clipboard.ts';
import { fmtSeconds } from '../../lib/format.ts';
import { keys, useGame, useGameMisses } from '../../lib/queries.ts';
import { PixelIcon } from '../../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../../ui/Status.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { Window } from '../../ui/Window.tsx';
import { Who } from '../Leaderboard.tsx';
import '../screens.css';

export function GamePage() {
  const { slug = '' } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const q = useGame(slug);
  return (
    <Window title={q.data?.title ?? t('nav.games')} size="md" onClose={() => void navigate('/games')}>
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : <GameBody g={q.data} />}
    </Window>
  );
}

function GameBody({ g }: { g: GameInfo }) {
  const { t, server } = useI18n();
  const dist = useDistance();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const link = `${window.location.origin}/g/${g.slug}`;

  const share = async (): Promise<void> => {
    const ok = await copyText(link);
    toast(ok ? t('common.copied') : link, ok ? 'good' : 'info');
  };
  const copyGame = async (): Promise<void> => {
    try {
      const r = await api.post<SlugResponse>(`/api/games/${g.slug}/copy`);
      void qc.invalidateQueries({ queryKey: keys.games });
      toast(t('games.copied'), 'good');
      await navigate(`/g/${r.slug}/edit`);
    } catch (e) { toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad'); }
  };
  const remove = async (): Promise<void> => {
    if (!window.confirm(t('games.deleteAsk'))) return;
    try {
      await api.del(`/api/games/${g.slug}`);
      void qc.invalidateQueries({ queryKey: keys.games });
      toast(t('games.deleted'), 'good');
      await navigate('/games');
    } catch (e) { toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad'); }
  };

  return (
    <div className="gamepage">
      <p className="meta faint">
        <span>{t('games.by', { name: g.ownerName })}</span>
        <span>{t('games.prompts', { n: g.prompts })}</span>
        <span>{t('games.plays', { n: g.plays })}</span>
      </p>
      <p className="gamepage-cats" dir="auto">{g.categories.join(' / ')}</p>

      <div className="share px-box">
        <PixelIcon name="link" />
        <input className="input share-url" value={link} readOnly onFocus={e => e.currentTarget.select()} aria-label={t('games.share')} dir="ltr" />
        <button type="button" className="px-btn px-btn--small px-btn--sun" onClick={() => void share()}>{t('common.copyLink')}</button>
      </div>

      <div className="row gamepage-actions">
        {g.myRun?.finished ? (
          <>
            <span className="px-chip px-chip--sun num">{dist(g.myRun.score)}</span>
            <Link to={`/results/g-${g.slug}`} className="px-btn">{t('games.again')}</Link>
          </>
        ) : (
          <Link to={`/play/g-${g.slug}`} className="px-btn px-btn--big">
            {g.myRun ? t('home.continue') : t('games.play')}
          </Link>
        )}
        {g.canEdit ? (
          <>
            <Link to={`/g/${g.slug}/edit`} className="px-btn px-btn--navy px-btn--small">{t('games.edit')}</Link>
            <button type="button" className="px-btn px-btn--danger px-btn--small" onClick={() => void remove()}>{t('common.delete')}</button>
          </>
        ) : null}
        <button type="button" className="px-btn px-btn--navy px-btn--small" onClick={() => void copyGame()}>{t('games.copy')}</button>
      </div>

      <h2 className="section-title">{t('games.board')}</h2>
      {g.leaderboard.length ? (
        <table className="table">
          <tbody>
            {g.leaderboard.map((r, i) => (
              <tr key={r.userId}>
                <td className="rank">{i + 1}</td>
                <td><Who p={r} /></td>
                <td className="n">{t('common.seconds', { n: fmtSeconds(r.ms) })}</td>
                <td className="n strong">{dist(r.score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty">{t('lb.empty')}</p>}

      {g.canEdit ? <OwnerMisses slug={g.slug} /> : null}
    </div>
  );
}

function OwnerMisses({ slug }: { slug: string }) {
  const { t } = useI18n();
  const q = useGameMisses(slug, true);
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorNote error={q.error} />;
  if (!q.data.misses.length) return null;
  return (
    <section>
      <h2 className="section-title">{t('games.misses')}</h2>
      <p className="faint">{t('games.missesNote')}</p>
      <ul className="misses">
        {q.data.misses.map(m => <MissLine key={`${m.promptId}:${m.norm}`} slug={slug} m={m} />)}
      </ul>
    </section>
  );
}

function MissLine({ slug, m }: { slug: string; m: MissRow }) {
  const { t, server } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [tier, setTier] = useState(3);
  const [busy, setBusy] = useState(false);
  const accept = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await api.post<SavePromptResponse>(`/api/games/${slug}/misses/accept`, { promptId: m.promptId, text: m.raw, tier });
      toast(t('admin.m.added', { n: r.awarded }), 'good');
      void qc.invalidateQueries({ queryKey: keys.gameMisses(slug) });
      void qc.invalidateQueries({ queryKey: keys.game(slug) });
    } catch (e) { toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad'); }
    setBusy(false);
  };
  return (
    <li className="miss">
      <span className="faint miss-prompt" dir="auto">{m.prompt}</span>
      <strong dir="auto">{m.raw}</strong>
      <span className="faint num">{m.players}×</span>
      <select className="select select--tier" value={tier} onChange={e => setTier(Number(e.target.value))} aria-label={t('admin.q.tier')}>
        {TIERS.map(x => <option key={x.id} value={x.id}>{x.id} {t(`tier.${x.id}` as AnyKey)}</option>)}
      </select>
      <button type="button" className="px-btn px-btn--small px-btn--sun" onClick={() => void accept()} disabled={busy}>{t('games.accept')}</button>
    </li>
  );
}
