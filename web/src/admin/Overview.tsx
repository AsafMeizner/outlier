import { Link } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { fmtDate, fmtNumber } from '../lib/format.ts';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Card, PageTitle, useOverview } from './common.tsx';

export function Overview() {
  const { t, locale } = useI18n();
  const q = useOverview();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />;
  const o = q.data;
  const peak = Math.max(1, ...o.participation.map(p => p.players));
  return (
    <>
      <PageTitle k="admin.nav.overview" />
      <dl className="adm-tiles">
        <Tile label={t('admin.ov.finishedToday', { n: o.startedToday })} value={fmtNumber(locale, o.playersToday)} />
        <Tile label={t('admin.ov.users', { n: o.activeWeek })} value={fmtNumber(locale, o.users)} />
        <Tile label={t('admin.ov.bank')} value={fmtNumber(locale, o.bank)} />
        <Tile label={t('admin.ov.unused')} value={fmtNumber(locale, o.unused)} />
        <Tile label={t('admin.ov.ahead')} value={fmtNumber(locale, o.scheduledAhead)} />
      </dl>

      <Card>
        <p>{t('admin.ov.daysLeft', { n: o.daysLeft })} {t('admin.ov.repeat')}</p>
        <div className="row">
          <Link to="/admin/import" className="px-btn px-btn--small">{t('admin.ov.importMore')}</Link>
          <Link to="/admin/questions/new" className="px-btn px-btn--small px-btn--navy">{t('admin.ov.writeOne')}</Link>
        </div>
        {o.misses > 0 ? (
          <p className="adm-alert">
            {t('admin.ov.misses', { n: o.misses })} <Link to="/admin/misses">{t('admin.ov.review')}</Link>
          </p>
        ) : null}
      </Card>

      <div className="adm-grid2">
        <Card title={`${t('admin.ov.today')}: ${fmtDate(locale, o.today)}`} actions={<Link to="/admin/schedule" className="px-btn px-btn--small px-btn--navy">{t('admin.ov.openSchedule')}</Link>}>
          {o.todayPrompts.length ? (
            <ol className="adm-list">
              {o.todayPrompts.map(p => (
                <li key={p.id}>
                  <Link to={`/admin/questions/${p.id}`} dir="auto">{p.text}</Link> <span className="faint">{p.category}</span>
                </li>
              ))}
            </ol>
          ) : <p className="faint">{t('admin.ov.todayEmpty')}</p>}
        </Card>
        <Card title={t('admin.ov.participation')}>
          {o.participation.length ? (
            <ol className="adm-bars">
              {o.participation.map(p => (
                <li key={p.date} title={`${fmtDate(locale, p.date)}: ${p.players}`}>
                  <span className="adm-bar"><i style={{ height: `${(p.players / peak) * 100}%` }} /></span>
                  <span className="adm-bar-n num">{p.players}</span>
                  <span className="adm-bar-d">{fmtDate(locale, p.date, { day: 'numeric' })}</span>
                </li>
              ))}
            </ol>
          ) : <p className="faint">{t('admin.ov.noDays')}</p>}
        </Card>
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="adm-tile px-box">
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}
