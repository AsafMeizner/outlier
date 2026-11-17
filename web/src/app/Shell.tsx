// The stage every player screen sits on: the full-screen scene, the corner HUD and the menu.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { defaultLook } from '../../../shared/wardrobe.ts';
import { useI18n } from '../i18n/index.tsx';
import { useMe } from '../lib/queries.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Menu } from './Menu.tsx';
import { SceneProvider, useScene } from './scene-context.tsx';
import './shell.css';

const GUEST_LOOK = defaultLook('guest');

export function Shell() {
  const me = useMe();
  const { dir } = useI18n();
  const look = me.data?.user?.look ?? GUEST_LOOK;
  return (
    <SceneProvider look={look} rtl={dir === 'rtl'}>
      <Stage>
        {me.isPending ? <Loading /> : me.isError ? <ErrorNote error={me.error} onRetry={() => void me.refetch()} /> : <Outlet />}
      </Stage>
    </SceneProvider>
  );
}

function Stage({ children }: { children: ReactNode }) {
  const scene = useScene();
  const { t, lang, setLang } = useI18n();
  const me = useMe();
  const user = me.data?.user ?? null;
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const playing = location.pathname.startsWith('/play');

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <div className="stage">
      <canvas ref={scene.attach} className="stage-scene" aria-hidden="true" />
      <header className="hud">
        <Link to="/" className="hud-brand" aria-label={t('nav.home')}>
          <span className="hud-logo" aria-hidden="true">
            <PixelIcon name="chair" size={24} />
          </span>
          <span className="hud-word">{me.data?.settings.siteName ?? 'Outlier'}</span>
        </Link>
        <nav className="hud-tools" aria-label={t('nav.menu')}>
          <button type="button" className="px-iconbtn" onClick={() => scene.setMuted(!scene.muted)} aria-label={scene.muted ? t('nav.soundOff') : t('nav.soundOn')} title={t('nav.sound')}>
            <PixelIcon name={scene.muted ? 'mute' : 'sound'} />
          </button>
          <button type="button" className="px-iconbtn hud-lang" onClick={() => setLang(lang === 'he' ? 'en' : 'he')} title={t('nav.language')} lang={lang === 'he' ? 'en' : 'he'}>
            {t('nav.languageName')}
          </button>
          {user && !playing ? (
            <>
              <Link to="/wardrobe" className="px-iconbtn" aria-label={t('nav.wardrobe')} title={t('nav.wardrobe')}>
                <PixelIcon name="shirt" />
              </Link>
              <Link to="/leaderboard" className="px-iconbtn hide-narrow" aria-label={t('nav.leaderboard')} title={t('nav.leaderboard')}>
                <PixelIcon name="trophy" />
              </Link>
            </>
          ) : null}
          {user ? (
            <button type="button" className="px-iconbtn px-iconbtn--sun" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-label={t('nav.menu')}>
              <PixelIcon name={menuOpen ? 'close' : 'menu'} />
            </button>
          ) : null}
        </nav>
      </header>
      <main className="stage-content">{children}</main>
      {menuOpen && user ? <Menu user={user} onClose={() => setMenuOpen(false)} /> : null}
    </div>
  );
}
