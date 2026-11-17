import { useState, type ChangeEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { useI18n } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/queries.ts';
import { AuthCard, Field, useAuthSubmit } from './AuthCard.tsx';

/** Same rule as the server: 2-32 letters, digits, dot, dash or underscore. */
const USERNAME = '[A-Za-z0-9._\\-]{2,32}';

export function Register() {
  const { t } = useI18n();
  const settings = useMe().data?.settings;
  const [f, setF] = useState({ username: '', displayName: '', team: '', password: '', inviteCode: '' });
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF(v => ({ ...v, [k]: e.target.value }));
  const { error, busy, onSubmit } = useAuthSubmit(() => api.post('/api/register', f));
  if (settings?.registration === 'closed') return <Navigate to="/login" replace />;
  return (
    <AuthCard title={t('auth.join', { name: settings?.siteName ?? 'Outlier' })}>
      <form onSubmit={onSubmit}>
        <Field label={t('auth.username')} hint={t('auth.usernameRule')}>
          <input className="input" value={f.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" pattern={USERNAME} required autoFocus />
        </Field>
        <Field label={t('auth.displayName')}>
          <input className="input" value={f.displayName} onChange={set('displayName')} maxLength={40} required />
        </Field>
        <Field label={t('auth.team')}>
          <input className="input" value={f.team} onChange={set('team')} maxLength={40} />
        </Field>
        <Field label={t('auth.passwordNew')}>
          <input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} required />
        </Field>
        {settings?.registration === 'code' ? (
          <Field label={t('auth.invite')}>
            <input className="input" value={f.inviteCode} onChange={set('inviteCode')} required />
          </Field>
        ) : null}
        <p className="error" role="alert">{error}</p>
        <button type="submit" className="px-btn px-btn--big px-btn--block" disabled={busy}>
          {t('auth.createAccount')}
        </button>
      </form>
      <p className="auth-alt">
        <Link to="/login">{t('auth.haveAccount')}</Link>
      </p>
    </AuthCard>
  );
}
