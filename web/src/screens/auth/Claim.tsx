// Save a guest's progress: pick a username and password; scores, streak and wardrobe stay.
import { useState, type ChangeEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useI18n } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { useUser } from '../../app/guards.tsx';
import { useToast } from '../../ui/Toast.tsx';
import { AuthCard, Field, useAuthSubmit } from './AuthCard.tsx';

const USERNAME = '[A-Za-z0-9._\\-]{2,32}';

export function Claim() {
  const { t } = useI18n();
  const { user } = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const [f, setF] = useState({ username: '', displayName: user.displayName, password: '' });
  const set = (k: keyof typeof f) => (e: ChangeEvent<HTMLInputElement>) => setF(v => ({ ...v, [k]: e.target.value }));
  const { error, busy, onSubmit } = useAuthSubmit(() => api.post('/api/claim', f), async () => {
    toast(t('guest.saved'), 'good');
    await navigate('/stats');
  });
  if (!user.guest) return <Navigate to="/stats" replace />;
  return (
    <AuthCard title={t('guest.saveTitle')}>
      <p className="auth-tagline">{t('guest.saveNote')}</p>
      <form onSubmit={onSubmit}>
        <Field label={t('auth.username')} hint={t('auth.usernameRule')}>
          <input className="input" value={f.username} onChange={set('username')} autoComplete="username" autoCapitalize="none" pattern={USERNAME} required autoFocus />
        </Field>
        <Field label={t('auth.displayName')}>
          <input className="input" value={f.displayName} onChange={set('displayName')} maxLength={40} required />
        </Field>
        <Field label={t('auth.passwordNew')}>
          <input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={8} required />
        </Field>
        <p className="error" role="alert">{error}</p>
        <button type="submit" className="px-btn px-btn--big px-btn--block" disabled={busy}>
          {t('guest.save')}
        </button>
      </form>
    </AuthCard>
  );
}
