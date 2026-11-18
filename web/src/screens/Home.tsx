// Title screen: today's launch number, the rarity ladder with an example, and the big Launch button.
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { TIERS } from '../../../shared/tiers.ts';
import { useDistance, useStage, useZoneName } from '../app/stage-context.tsx';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { useNow } from '../lib/clock.ts';
import { fmtNumber, untilParts } from '../lib/format.ts';
import { useToday } from '../lib/queries.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import './home.css';

export function Home() {
  const { t, locale } = useI18n();
  const dist = useDistance();
  const today = useToday();
  const scene = useStage();
  const zoneName = useZoneName();
  const navigate = useNavigate();
  const now = useNow(15_000);
  const data = today.data;

  // Put the hero where today's flights left it.
  useEffect(() => {
    const s = scene.get();
    if (!s || !data) return;
    s.setClock(null);
    if (!s.busy) s.setPosition(data.score ?? 0);
    s.setCompanions(data.uniques);
  }, [scene, data]);

  const go = (): void => void navigate('/play');
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter' && data?.available && data.status !== 'done' && !(e.target instanceof HTMLInputElement)) go();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (today.isPending) return <Loading />;
  if (today.isError) return <ErrorNote error={today.error} onRetry={() => void today.refetch()} />;
  const d = today.data;
  const skew = d.serverNow - today.dataUpdatedAt;
  const left = untilParts(d.endsAt - (now + skew));
  const place = zoneName(d.score ?? 0);

  return (
    <div className="home">
      <section className="home-card px-window px-window--paper" aria-labelledby="home-title">
        <div className="home-head">
          <h1 id="home-title" className="home-title">
            {d.dayNumber ? t('home.daily', { n: d.dayNumber }) : t('nav.daily')}
          </h1>
          <StreakBadge current={d.streak.current} playedToday={d.streak.playedToday} />
        </div>

        {!d.available ? (
          <p className="home-lead">{t('home.noPuzzle')}</p>
        ) : d.status === 'done' ? (
          <div className="home-done">
            <p className="home-big">{t('play.youFlew', { d: dist(d.score ?? 0) })}</p>
            <p className="home-lead">{t('home.reached', { place })}</p>
          </div>
        ) : (
          <>
            <p className="home-lead">{t('home.howTitle')}</p>
            <p className="home-pitch">{t(scene.theme.copy.pitch)}</p>
            <p className="home-example">{t('home.howExample')}</p>
            <ol className="ladder">
              {TIERS.map(tier => (
                <li key={tier.id} className="ladder-row" data-tier={tier.id}>
                  <span className="ladder-word">{t(`home.ex.${tier.id}` as AnyKey)}</span>
                  <span className="px-tier" data-tier={tier.id}>
                    {t(`tier.${tier.id}` as AnyKey)}
                  </span>
                  <span className="ladder-bar" aria-hidden="true">
                    {Array.from({ length: tier.id * 2 }, (_, i) => (
                      <i key={i} />
                    ))}
                  </span>
                  <span className="ladder-m num">{dist(tier.points)}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        <div className="home-actions">
          {d.available && d.status !== 'done' ? (
            <button type="button" className="px-btn px-btn--big home-cta" onClick={go}>
              {d.status === 'playing' ? t('home.continue') : t('home.launch')}
              <span className="px-key">{t('common.enter')}</span>
            </button>
          ) : null}
          {d.status === 'done' ? (
            <>
              <Link to="/leaderboard" className="px-btn px-btn--big home-cta">
                <PixelIcon name="trophy" />
                {t('nav.leaderboard')}
              </Link>
              <p className="home-note">{t('results.tomorrow')}</p>
            </>
          ) : null}
        </div>

        <dl className="home-facts">
          <div>
            <dt>{t('home.launched')}</dt>
            <dd className="num">{fmtNumber(locale, d.players)}</dd>
          </div>
          <div>
            <dt>{t('home.next')}</dt>
            <dd className="num">{t('common.hoursMinutes', { h: left.h, m: left.m })}</dd>
          </div>
        </dl>
        <nav className="home-modes" aria-label={t('nav.menu')}>
          <Link to="/practice" className="home-mode"><PixelIcon name="bolt" size={24} /><span>{t('practice.unlimited')}</span></Link>
          <Link to="/practice" className="home-mode"><PixelIcon name="calendar" size={24} /><span>{t('practice.packs')}</span></Link>
          <Link to="/party" className="home-mode"><PixelIcon name="meteor" size={24} /><span>{t(scene.theme.copy.party)}</span></Link>
          <Link to="/friends" className="home-mode"><PixelIcon name="users" size={24} /><span>{t('nav.friends')}</span></Link>
        </nav>
        {d.status === 'done' || !d.available ? (
          <p className="home-hint">
            <Link to="/archive">{t('home.archiveHint')}</Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}

function StreakBadge({ current, playedToday }: { current: number; playedToday: boolean }) {
  const { t } = useI18n();
  return (
    <div className={`streak${playedToday ? ' streak--lit' : ''}`} title={playedToday ? t('home.streak') : t('home.streakKeep')}>
      <PixelIcon name="flame" size={24} />
      <span className="num">{current}</span>
      <span className="sr-only">{t('home.streak')}</span>
    </div>
  );
}
