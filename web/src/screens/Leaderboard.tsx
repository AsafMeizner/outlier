// Leaderboards: today, this week, this month, all time, streaks and teams. The top three stand on a podium.
import { useState } from 'react';
import type { LeaderboardPeriod, LeaderboardResponse, PlayerRef } from '../../../shared/api.ts';
import { useUser } from '../app/guards.tsx';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { fmtDate, fmtDistance, fmtNumber, fmtSeconds } from '../lib/format.ts';
import { useLeaderboard } from '../lib/queries.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Window } from '../ui/Window.tsx';
import './screens.css';

const PERIODS: LeaderboardPeriod[] = ['day', 'week', 'month', 'all', 'streak', 'teams'];
const LABEL: Record<LeaderboardPeriod, AnyKey> = { day: 'lb.day', week: 'lb.week', month: 'lb.month', all: 'lb.all', streak: 'lb.streak', teams: 'lb.teams' };

export function Leaderboard() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<LeaderboardPeriod>('day');
  const q = useLeaderboard(period);
  return (
    <Window title={t('nav.leaderboard')} size="md">
      <div className="tabs" role="tablist" aria-label={t('nav.leaderboard')}>
        {PERIODS.map(p => (
          <button key={p} type="button" role="tab" aria-selected={p === period} className="tab" onClick={() => setPeriod(p)}>
            {t(LABEL[p])}
          </button>
        ))}
      </div>
      <div role="tabpanel">{q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} onRetry={() => void q.refetch()} /> : <Board data={q.data} />}</div>
    </Window>
  );
}

function Board({ data }: { data: LeaderboardResponse }) {
  const { t, locale } = useI18n();
  const { user } = useUser();
  const unit = t('common.metres');
  const range = 'from' in data ? <p className="faint lb-range">{t('common.range', { a: fmtDate(locale, data.from), b: fmtDate(locale, data.to) })}</p> : null;

  if (!data.rows.length) return <><p className="empty">{data.period === 'teams' ? t('lb.noTeams') : t('lb.empty')}</p>{range}</>;

  switch (data.period) {
    case 'teams':
      return (
        <>
          {range}
          <table className="table">
            <thead><tr><th>#</th><th>{t('lb.team')}</th><th className="n">{t('lb.players')}</th><th className="n">{t('lb.games')}</th><th className="n">{t('lb.perGame')}</th><th className="n">{t('lb.distance')}</th></tr></thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.team}><td className="rank">{i + 1}</td><td>{r.team}</td><td className="n">{r.players}</td><td className="n">{r.games}</td><td className="n">{fmtDistance(locale, Math.round(r.avg), unit)}</td><td className="n">{fmtDistance(locale, r.points, unit)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      );
    case 'streak':
      return (
        <>
          <Podium rows={data.rows} value={r => t('lb.days') + ' ' + r.current} />
          <p className="faint">{t('lb.streakNote')}</p>
          <table className="table">
            <thead><tr><th>#</th><th>{t('lb.player')}</th><th className="n">{t('lb.current')}</th><th className="n">{t('lb.bestStreak')}</th></tr></thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.userId} className={r.userId === user.id ? 'me' : undefined}>
                  <td className="rank">{i + 1}</td><td><Who p={r} /></td>
                  <td className="n">{r.current}{r.playedToday ? null : <span className="faint"> ({t('lb.notToday')})</span>}</td><td className="n">{r.best}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    case 'day':
      return (
        <>
          <Podium rows={data.rows} value={r => fmtDistance(locale, r.score, unit)} />
          <table className="table">
            <thead><tr><th>#</th><th>{t('lb.player')}</th><th className="n">{t('lb.moon')}</th><th className="n">{t('lb.time')}</th><th className="n">{t('lb.distance')}</th></tr></thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.userId} className={r.userId === user.id ? 'me' : undefined}>
                  <td className="rank">{i + 1}</td><td><Who p={r} /></td><td className="n">{r.outliers || ''}</td>
                  <td className="n">{t('common.seconds', { n: fmtSeconds(r.ms) })}</td><td className="n strong">{fmtDistance(locale, r.score, unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    default:
      return (
        <>
          {range}
          <Podium rows={data.rows} value={r => fmtDistance(locale, r.points, unit)} />
          <table className="table">
            <thead><tr><th>#</th><th>{t('lb.player')}</th><th className="n">{t('lb.days')}</th><th className="n">{t('lb.average')}</th><th className="n">{t('lb.best')}</th><th className="n">{t('lb.distance')}</th></tr></thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={r.userId} className={r.userId === user.id ? 'me' : undefined}>
                  <td className="rank">{i + 1}</td><td><Who p={r} /></td><td className="n">{fmtNumber(locale, r.games)}</td>
                  <td className="n">{fmtDistance(locale, Math.round(r.avg), unit)}</td><td className="n">{fmtDistance(locale, r.best, unit)}</td><td className="n strong">{fmtDistance(locale, r.points, unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
  }
}

export function Who({ p }: { p: PlayerRef }) {
  return (
    <span className="who">
      <Avatar look={p.look} size={28} />
      <span>
        {p.name}
        {p.team ? <span className="faint who-team"> {p.team}</span> : null}
      </span>
    </span>
  );
}

function Podium<R extends PlayerRef>({ rows, value }: { rows: R[]; value: (r: R) => string }) {
  const top = rows.slice(0, 3);
  if (top.length < 2) return null;
  // Second, first, third, so the winner stands in the middle.
  const order = [top[1], top[0], top[2]].filter((r): r is R => !!r);
  return (
    <ol className="podium">
      {order.map(r => {
        const place = top.indexOf(r) + 1;
        return (
          <li key={r.userId} className={`podium-step podium-step--${place}`}>
            <Avatar look={r.look} size={place === 1 ? 72 : 56} />
            <span className="podium-name">{r.name}</span>
            <span className="podium-value num">{value(r)}</span>
            <span className="podium-block" aria-label={`#${place}`}>
              {place}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
