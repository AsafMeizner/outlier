// Friends' games: games you made, games you played and new ones from colleagues.
import { Link } from 'react-router';
import type { GameSummary } from '../../../../shared/api.ts';
import { useI18n } from '../../i18n/index.tsx';
import { fmtDate, fmtDistance } from '../../lib/format.ts';
import { useGames } from '../../lib/queries.ts';
import { PixelIcon } from '../../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../../ui/Status.tsx';
import { Window } from '../../ui/Window.tsx';
import '../screens.css';

export function Games() {
  const { t } = useI18n();
  const q = useGames();
  return (
    <Window
      title={t('games.title')}
      size="lg"
      actions={
        <Link to="/games/new" className="px-btn px-btn--small">
          <PixelIcon name="plus" size={12} />
          {t('games.make')}
        </Link>
      }
    >
      <p className="muted">{t('games.note')}</p>
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : (
        <>
          <Section title={t('games.mine')} games={q.data.mine} mine />
          <Section title={t('games.played')} games={q.data.played} />
          <Section title={t('games.recent')} games={q.data.recent} />
        </>
      )}
    </Window>
  );
}

function Section({ title, games, mine }: { title: string; games: GameSummary[]; mine?: boolean }) {
  const { t } = useI18n();
  return (
    <section className="games-section">
      <h2 className="section-title">{title}</h2>
      {games.length ? (
        <ul className="game-cards">
          {games.map(g => <GameCard key={g.slug} g={g} mine={mine} />)}
        </ul>
      ) : (
        <p className="empty">
          {t('games.none')} {mine ? <Link to="/games/new">{t('games.make')}</Link> : null}
        </p>
      )}
    </section>
  );
}

function GameCard({ g, mine }: { g: GameSummary; mine?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <li className="game-card px-box">
      <Link to={`/g/${g.slug}`} className="game-card-title" dir="auto">{g.title}</Link>
      <span className="meta faint">
        <span>{mine ? fmtDate(locale, new Date(g.createdAt).toISOString().slice(0, 10)) : t('games.by', { name: g.ownerName })}</span>
        <span>{t('games.prompts', { n: g.prompts })}</span>
        <span>{t('games.plays', { n: g.plays })}</span>
      </span>
      <div className="row">
        {g.myScore !== null && g.finished ? (
          <>
            <span className="px-chip px-chip--sun num">{fmtDistance(locale, g.myScore, t('common.metres'))}</span>
            <Link to={`/results/g-${g.slug}`} className="px-btn px-btn--small px-btn--navy">{t('games.again')}</Link>
          </>
        ) : (
          <Link to={`/play/g-${g.slug}`} className="px-btn px-btn--small">{t('games.play')}</Link>
        )}
      </div>
    </li>
  );
}
