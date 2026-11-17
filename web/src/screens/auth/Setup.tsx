// First run: create the admin account with the one-time code printed in the server window (or opened from its link).
import { useState, type ChangeEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useI18n } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { useMe } from '../../lib/queries.ts';
import { AuthCard, Field, useAuthSubmit } from './AuthCard.tsx';

const USERNAME = '[A-Za-z0-9._\\-]{2,32}';

export function Setup() {
  const { t } = useI18n();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const me = useMe().data;
  const [f, setF] = useState({ token, username: 'admin', displayName: '', password: '' });
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF(v => ({ ...v, [k]: e.target.value }));
  const { error, busy, onSubmit } = useAuthSubmit(() => api.post('/api/setup', f), () => navigate('/admin'));
  if (me && !me.needsSetup) return <Navigate to="/login" replace />;
  return (
    <AuthCard title={t('auth.setupTitle')}>
      <p>{t('auth.setupNote')}</p>
      <form onSubmit={onSubmit}>
        <Field label={t('auth.setupCode')}>
          <input className="input" value={f.token} onChange={set('token')} autoComplete="off" required autoFocus={!token} />
        </Field>
        <Field label={t('auth.adminUsername')} hint={t('auth.usernameRule')}>
          <input className="input" value={f.username} onChange={set('username')} autoComplete="username" pattern={USERNAME} required />
        </Field>
        <Field label={t('auth.yourName')}>
          <input className="input" value={f.displayName} onChange={set('displayName')} maxLength={40} required autoFocus={!!token} />
        </Field>
        <Field label={t('auth.passwordNew')}>
          <input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} required />
        </Field>
        <p className="error" role="alert">{error}</p>
        <button type="submit" className="px-btn px-btn--big px-btn--block" disabled={busy}>
          {t('auth.createAdmin')}
        </button>
      </form>
    </AuthCard>
  );
}
