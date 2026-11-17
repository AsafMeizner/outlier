// Your numbers: totals, the rarity profile of your answers, history, and your profile settings.
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthResponse, StatsResponse } from '../../../shared/api.ts';
import { TIERS } from '../../../shared/tiers.ts';
import { useUser } from '../app/guards.tsx';
import { useDistance } from '../app/stage-context.tsx';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { fmtDate, fmtNumber } from '../lib/format.ts';
import { keys, useStats } from '../lib/queries.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { useToast } from '../ui/Toast.tsx';
import { Window } from '../ui/Window.tsx';
import './screens.css';

export function Stats() {
  const { t } = useI18n();
  const q = useStats();
  return (
    <Window title={t('nav.stats')} size="lg">
      {q.isPending ? <Loading /> : q.isError ? <ErrorNote error={q.error} /> : <StatsBody s={q.data} />}
      <hr className="px-rule" />
      <Profile />
    </Window>
  );
}

function StatsBody({ s }: { s: StatsResponse }) {
  const { t, locale } = useI18n();
  const dist = useDistance();
  const rounds = TIERS.reduce((n, x) => n + (s.tiers[x.name] ?? 0), 0) + (s.tiers['missed'] ?? 0);
  const peak = Math.max(1, ...TIERS.map(x => s.tiers[x.name] ?? 0));
  return (
    <>
      <dl className="tiles">
        <Tile label={t('stats.days')} value={fmtNumber(locale, s.games)} />
        <Tile label={t('stats.total')} value={dist(s.points)} />
        <Tile label={t('stats.average')} value={dist(Math.round(s.avg))} />
        <Tile label={t('stats.best')} value={dist(s.bestScore)} />
        <Tile label={t('stats.streak')} value={fmtNumber(locale, s.streak.current)} hot={s.streak.playedToday} />
        <Tile label={t('stats.bestStreak')} value={fmtNumber(locale, s.streak.best)} />
      </dl>

      <h2 className="section-title">{t('stats.rarity')}</h2>
      {rounds === 0 ? <p className="empty">{t('stats.empty')}</p> : (
        <>
          <ol className="rarity">
            {TIERS.map(x => {
              const n = s.tiers[x.name] ?? 0;
              return (
                <li key={x.id} data-tier={x.id}>
                  <span className="rarity-col" aria-hidden="true"><i style={{ height: `${(n / peak) * 100}%` }} /></span>
                  <span className="rarity-n num">{n}</span>
                  <span className="px-tier" data-tier={x.id}>{t(`tier.${x.id}` as AnyKey)}</span>
                </li>
              );
            })}
          </ol>
          <p className="faint">{t('stats.missed', { n: s.tiers['missed'] ?? 0 })}</p>
        </>
      )}

      {s.history.length ? (
        <>
          <h2 className="section-title">{t('stats.history')}</h2>
          <table className="table">
            <tbody>
              {s.history.map(h => (
                <tr key={h.date + h.mode}>
                  <td>{fmtDate(locale, h.date)}</td>
                  <td className="faint">{h.mode === 'live' ? '' : t(h.mode === 'archive' ? 'common.archive' : 'common.custom')}</td>
                  <td className="n">{h.finished ? (h.mode === 'live' ? t('stats.rank', { a: h.rank, b: h.players }) : '') : t('stats.unfinished')}</td>
                  <td className="n strong">{dist(h.score)}</td>
                  <td className="n"><Link to={`/results/${h.date}`}>{t('archive.results')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  );
}

function Tile({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div className={`tile px-box${hot ? ' is-hot' : ''}`}>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

function Profile() {
  const { t, server } = useI18n();
  const { user } = useUser();
  const qc = useQueryClient();
  const toast = useToast();
  const [displayName, setName] = useState(user.displayName);
  const [team, setTeam] = useState(user.team);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post<AuthResponse>('/api/profile', { displayName, team });
      qc.setQueryData(keys.me, (m: unknown) => (m && typeof m === 'object' ? { ...m, user: r.user } : m));
      void qc.invalidateQueries({ queryKey: ['leaderboard'] });
      toast(t('stats.profileSaved'), 'good');
    } catch (err) {
      setError(err instanceof Error ? server(err.message) : t('common.error'));
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="profile-title">
      <h2 id="profile-title" className="section-title">{t('stats.profile')}</h2>
      <div className="profile">
        <Link to="/wardrobe" className="profile-avatar" aria-label={t('nav.wardrobe')}>
          <Avatar look={user.look} size={80} />
        </Link>
        <form className="profile-form" onSubmit={e => void save(e)}>
          <p className="faint">{t('stats.signedInAs', { u: user.username })}</p>
          <label className="field">
            <span>{t('stats.name')}</span>
            <input className="input" value={displayName} onChange={e => setName(e.target.value)} maxLength={40} required />
          </label>
          <label className="field">
            <span>{t('stats.teamField')}</span>
            <input className="input" value={team} onChange={e => setTeam(e.target.value)} maxLength={40} />
          </label>
          <p className="error" role="alert">{error}</p>
          <div className="row">
            <button type="submit" className="px-btn px-btn--small" disabled={busy}>{t('stats.saveProfile')}</button>
            <Link to="/password" className="px-btn px-btn--small px-btn--navy">{t('stats.password')}</Link>
          </div>
        </form>
      </div>
    </section>
  );
}
