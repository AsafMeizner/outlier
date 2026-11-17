// A pixel window floating over the scene (leaderboard, archive, wardrobe...). Esc or the X closes it.
import { useEffect, useId, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../i18n/index.tsx';
import { sfx } from '../game/sfx.ts';
import { PixelIcon } from './PixelIcon.tsx';
import './window.css';

interface Props {
  title: ReactNode;
  children: ReactNode;
  /** Where the X goes; defaults to home. */
  onClose?: () => void;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'navy' | 'paper';
  /** Extra content on the title bar, before the close button. */
  actions?: ReactNode;
  footer?: ReactNode;
}

export function Window({ title, children, onClose, size = 'md', tone = 'navy', actions, footer }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const id = useId();
  const close = (): void => { sfx.close(); if (onClose) onClose(); else void navigate('/'); };
  useEffect(() => { sfx.open(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="win-layer">
      <div className="win-veil" onClick={close} aria-hidden="true" />
      <section className={`win win--${size} px-window${tone === 'paper' ? ' px-window--paper' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="px-titlebar">
          <h1 id={id}>{title}</h1>
          {actions}
          <button type="button" className="win-close" onClick={close} aria-label={t('common.close')}>
            <PixelIcon name="close" size={24} />
          </button>
        </header>
        <div className="win-body">{children}</div>
        {footer ? <footer className="win-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}
