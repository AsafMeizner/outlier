// The admin pages: a plain two-column layout in the same pixel style as the game, without the scene.
import { Link, Navigate, NavLink, Route, Routes } from 'react-router';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { useMe } from '../lib/queries.ts';
import { PixelIcon, type IconName } from '../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { ImportExport } from './ImportExport.tsx';
import { Misses } from './Misses.tsx';
import { Overview } from './Overview.tsx';
import { PromptEditor } from './PromptEditor.tsx';
import { Questions } from './Questions.tsx';
import { Schedule } from './Schedule.tsx';
import { SettingsPage } from './Settings.tsx';
import { Users } from './Users.tsx';
import './admin.css';

const NAV: Array<{ to: string; icon: IconName; label: AnyKey; end?: boolean }> = [
  { to: '/admin', icon: 'home', label: 'admin.nav.overview', end: true },
  { to: '/admin/schedule', icon: 'calendar', label: 'admin.nav.schedule' },
  { to: '/admin/questions', icon: 'help', label: 'admin.nav.questions' },
  { to: '/admin/import', icon: 'plus', label: 'admin.nav.import' },
  { to: '/admin/misses', icon: 'check', label: 'admin.nav.misses' },
  { to: '/admin/users', icon: 'users', label: 'admin.nav.users' },
  { to: '/admin/settings', icon: 'gear', label: 'admin.nav.settings' },
];

export function AdminApp() {
  const me = useMe();
  const { t, lang, setLang } = useI18n();
  if (me.isPending) return <div className="adm-loading"><Loading /></div>;
  if (me.isError) return <ErrorNote error={me.error} onRetry={() => void me.refetch()} />;
  const user = me.data.user;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.mustChange) return <Navigate to="/password" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="adm">
      <aside className="adm-side">
        <div className="adm-brand">
          <span className="hud-logo" aria-hidden="true"><PixelIcon name="chair" size={24} /></span>
          <span>{me.data.settings.siteName}</span>
        </div>
        <nav className="adm-nav" aria-label={t('admin.title')}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `adm-nav-link${isActive ? ' is-on' : ''}`}>
              <PixelIcon name={n.icon} size={24} />
              <span>{t(n.label)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="adm-side-foot">
          <button type="button" className="px-btn px-btn--small px-btn--navy" onClick={() => setLang(lang === 'he' ? 'en' : 'he')} lang={lang === 'he' ? 'en' : 'he'}>
            {t('nav.languageName')}
          </button>
          <Link to="/" className="px-btn px-btn--small">{t('admin.backToGame')}</Link>
        </div>
      </aside>
      <main className="adm-main">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="questions" element={<Questions />} />
          <Route path="questions/new" element={<PromptEditor />} />
          <Route path="questions/:id" element={<PromptEditor />} />
          <Route path="import" element={<ImportExport />} />
          <Route path="misses" element={<Misses />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
