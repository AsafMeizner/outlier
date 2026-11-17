// Every past puzzle day: play the ones you missed (not counted) or look at the answers.
import { Link } from 'react-router';
import type { ArchiveDay } from '../../../shared/api.ts';
import { useDistance } from '../app/stage-context.tsx';
import { useI18n } from '../i18n/index.tsx';
import { fmtDate, fmtNumber } from '../lib/format.ts';
import { useArchive } from '../lib/queries.ts';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Window } from '../ui/Window.tsx';
import './screens.css';

export function Archive() {
  const { t } = useI18n();
  const q = useArchive();
  return (
    <Window title={t('archive.title')} size="lg">
      <p className="muted">{t('archive.note')}</p>
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : (
        <ul className="archive">
          {q.data.days.map(d => <Day key={d.date} d={d} today={q.data.today} archivePlay={q.data.archivePlay} />)}
        </ul>
      )}
    </Window>
  );
}

function Day({ d, today, archivePlay }: { d: ArchiveDay; today: string; archivePlay: boolean }) {
  const { t, locale } = useI18n();
  const dist = useDistance();
  const isToday = d.date === today;
  const canPlay = isToday || (archivePlay && !d.finished);
  const canSee = d.finished || !isToday;
  return (
    <li className={`aday px-box${d.finished ? ' is-done' : ''}`}>
      <div className="aday-num">
        <span className="faint">{t('archive.day')}</span>
        <strong className="num">#{d.dayNumber}</strong>
      </div>
      <div className="aday-main">
        <span className="aday-date">{isToday ? t('archive.today') : fmtDate(locale, d.date)}</span>
        <span className="aday-cats" dir="auto">{d.cats.join(' / ')}</span>
      </div>
      <div className="aday-stats">
        <span>{t('archive.players')}: <b className="num">{fmtNumber(locale, d.players)}</b></span>
        {d.top !== null ? <span>{t('archive.top')}: <b className="num">{dist(d.top)}</b></span> : null}
        {d.score !== null ? (
          <span className="aday-you">
            {t('archive.you')}: <b className="num">{dist(d.score)}</b>
            {d.mode === 'archive' ? <span className="faint"> ({t('common.archive')})</span> : null}
            {!d.finished ? <span className="faint"> ({t('archive.started')})</span> : null}
          </span>
        ) : null}
      </div>
      <div className="aday-actions">
        {canPlay ? (
          <Link to={isToday ? '/play' : `/play/${d.date}`} className="px-btn px-btn--small">
            {d.score !== null && !d.finished ? t('archive.continue') : t('archive.play')}
          </Link>
        ) : null}
        {canSee ? (
          <Link to={`/results/${d.date}`} className="px-btn px-btn--small px-btn--navy">
            {d.finished ? t('archive.results') : t('archive.answers')}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
