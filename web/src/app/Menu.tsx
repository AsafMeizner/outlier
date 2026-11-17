// The menu: big pixel tiles over the scene, one per destination.
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { UserView } from '../../../shared/api.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { api } from '../lib/api.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { PixelIcon, type IconName } from '../ui/PixelIcon.tsx';

interface Tile { to: string; icon: IconName; label: AnyKey; tone?: 'sun' | 'cta' }

const TILES: Tile[] = [
  { to: '/', icon: 'play', label: 'nav.daily', tone: 'cta' },
  { to: '/archive', icon: 'calendar', label: 'nav.archive' },
  { to: '/leaderboard', icon: 'trophy', label: 'nav.leaderboard' },
  { to: '/stats', icon: 'chart', label: 'nav.stats' },
  { to: '/wardrobe', icon: 'shirt', label: 'nav.wardrobe' },
  { to: '/games', icon: 'users', label: 'nav.games' },
  { to: '/games/new', icon: 'plus', label: 'nav.makeGame', tone: 'sun' },
  { to: '/how', icon: 'help', label: 'nav.how' },
];

export function Menu({ user, onClose }: { user: UserView; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const signOut = async (): Promise<void> => {
    await api.post('/api/logout');
    qc.clear();
    await navigate('/login');
  };

  return (
    <div className="menu-layer">
      <div className="win-veil" onClick={onClose} aria-hidden="true" />
      <nav className="menu" aria-label={t('nav.menu')}>
        <div className="menu-who">
          <Avatar look={user.look} size={48} />
          <div>
            <strong>{user.displayName}</strong>
            <span className="faint">{t('stats.signedInAs', { u: user.username })}</span>
          </div>
        </div>
        <ul className="menu-tiles">
          {TILES.map((tile, i) => (
            <li key={tile.to} style={{ animationDelay: `${i * 30}ms` }}>
              <Link to={tile.to} className={`menu-tile${tile.tone ? ` menu-tile--${tile.tone}` : ''}`}>
                <PixelIcon name={tile.icon} size={36} />
                <span>{t(tile.label)}</span>
              </Link>
            </li>
          ))}
          {user.role === 'admin' ? (
            <li style={{ animationDelay: `${TILES.length * 30}ms` }}>
              <Link to="/admin" className="menu-tile menu-tile--navy">
                <PixelIcon name="gear" size={36} />
                <span>{t('nav.admin')}</span>
              </Link>
            </li>
          ) : null}
        </ul>
        <button type="button" className="px-btn px-btn--navy px-btn--small menu-signout" onClick={() => void signOut()}>
          {t('nav.signOut')}
        </button>
      </nav>
    </div>
  );
}
