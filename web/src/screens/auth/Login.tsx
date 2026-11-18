import { useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '../../lib/queries.ts';
import { useI18n } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { AuthCard, Field, useAuthSubmit } from './AuthCard.tsx';

export function Login() {
  const { t } = useI18n();
  const settings = useMe().data?.settings;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { error, busy, onSubmit } = useAuthSubmit(() => api.post('/api/login', { username, password }));
  // "Play now": the server makes a guest player and signs it in; GuestOnly then moves on to ?next=.
  const guest = useAuthSubmit(() => api.post('/api/guest'));
  const guestPlay = settings?.guestPlay ?? false;
  return (
    <AuthCard title={settings?.siteName ?? 'Outlier'}>
      {settings?.tagline ? <p className="auth-tagline">{settings.tagline}</p> : null}
      {guestPlay ? (
        <form className="auth-guest" onSubmit={guest.onSubmit}>
          <button type="submit" className="px-btn px-btn--big px-btn--block" disabled={guest.busy} autoFocus>
            {t('auth.playNow')}
          </button>
          <p className="faint">{t('auth.playNowNote')}</p>
          <p className="error" role="alert">{guest.error}</p>
          <p className="auth-or">{t('auth.orSignIn')}</p>
        </form>
      ) : null}
      <form onSubmit={onSubmit}>
        <Field label={t('auth.username')}>
          <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required autoFocus={!guestPlay} />
        </Field>
        <Field label={t('auth.password')}>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <p className="error" role="alert">{error}</p>
        <button type="submit" className={`px-btn px-btn--block ${guestPlay ? 'px-btn--navy' : 'px-btn--big'}`} disabled={busy}>
          {t('auth.signIn')}
          <span className="px-key">{t('common.enter')}</span>
        </button>
      </form>
      <p className="auth-alt">{settings?.registration === 'closed' ? t('auth.askAdmin') : <Link to="/register">{t('auth.create')}</Link>}</p>
    </AuthCard>
  );
}
