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
  return (
    <AuthCard title={settings?.siteName ?? 'Outlier'}>
      {settings?.tagline ? <p className="auth-tagline">{settings.tagline}</p> : null}
      <form onSubmit={onSubmit}>
        <Field label={t('auth.username')}>
          <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required autoFocus />
        </Field>
        <Field label={t('auth.password')}>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        <p className="error" role="alert">{error}</p>
        <button type="submit" className="px-btn px-btn--big px-btn--block" disabled={busy}>
          {t('auth.signIn')}
          <span className="px-key">{t('common.enter')}</span>
        </button>
      </form>
      <p className="auth-alt">{settings?.registration === 'closed' ? t('auth.askAdmin') : <Link to="/register">{t('auth.create')}</Link>}</p>
    </AuthCard>
  );
}
