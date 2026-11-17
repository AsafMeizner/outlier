// The stage every player screen sits on: the full-screen scene, the corner HUD and the menu.
import { useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { defaultLook } from '../../../shared/wardrobe.ts';
import { useI18n } from '../i18n/index.tsx';
import { useMe } from '../lib/queries.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { ErrorNote, Loading } from '../ui/Status.tsx';
import { Menu } from './Menu.tsx';
import { StageProvider, useStage } from './stage-context.tsx';
import { DEFAULT_THEME } from '../../../shared/themes.ts';
import './shell.css';

const GUEST_LOOK = defaultLook(DEFAULT_THEME, 'guest');

export function Shell() {
  const me = useMe();
  const { dir } = useI18n();
  const look = me.data?.user?.look ?? GUEST_LOOK;
  return (
    <StageProvider themeId={me.data?.settings.theme} look={look} rtl={dir === 'rtl'}>
      <Frame>
        {me.isPending ? <Loading /> : me.isError ? <ErrorNote error={me.error} onRetry={() => void me.refetch()} /> : <Outlet />}
      </Frame>
    </StageProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { attach, muted, setMuted } = useStage();
  const { t, lang, setLang } = useI18n();
  const me = useMe();
  const user = me.data?.user ?? null;
  const location = useLocation();
  const playing = location.pathname.startsWith('/play');
  // The menu belongs to the page it was opened on, so navigating anywhere closes it.
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const menuOpen = menuAt === location.pathname;
  const setMenuOpen = (open: boolean): void => setMenuAt(open ? location.pathname : null);

  return (
    <div className="stage">
      <canvas ref={attach} className="stage-scene" aria-hidden="true" />
      <header className="hud">
        <Link to="/" className="hud-brand" aria-label={t('nav.home')}>
          <span className="hud-logo" aria-hidden="true">
            <PixelIcon name="chair" size={24} />
          </span>
          <span className="hud-word">{me.data?.settings.siteName ?? 'Outlier'}</span>
        </Link>
        <nav className="hud-tools" aria-label={t('nav.menu')}>
          <button type="button" className="px-iconbtn" onClick={() => setMuted(!muted)} aria-label={muted ? t('nav.soundOff') : t('nav.soundOn')} title={t('nav.sound')}>
            <PixelIcon name={muted ? 'mute' : 'sound'} />
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
            <button type="button" className="px-iconbtn px-iconbtn--sun" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label={t('nav.menu')}>
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
