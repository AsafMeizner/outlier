import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useUser } from '../../app/guards.tsx';
import { useI18n } from '../../i18n/index.tsx';
import { api } from '../../lib/api.ts';
import { useToast } from '../../ui/Toast.tsx';
import { AuthCard, Field, useAuthSubmit } from './AuthCard.tsx';

export function Password() {
  const { t } = useI18n();
  const { user } = useUser();
  const navigate = useNavigate();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const { error, busy, onSubmit } = useAuthSubmit(
    () => api.post('/api/password', { current, next }),
    async () => {
      toast(t('auth.passwordSaved'), 'good');
      await navigate('/');
    },
  );
  return (
    <AuthCard title={user.mustChange ? t('auth.choosePassword') : t('auth.changePassword')}>
      {user.mustChange ? <p>{t('auth.tempNote')}</p> : null}
      <form onSubmit={onSubmit}>
        <Field label={user.mustChange ? t('auth.temp') : t('auth.current')}>
          <input className="input" type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required autoFocus />
        </Field>
        <Field label={t('auth.newPassword')}>
          <input className="input" type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
        </Field>
        <p className="error" role="alert">{error}</p>
        <button type="submit" className="px-btn px-btn--big px-btn--block" disabled={busy}>
          {t('auth.savePassword')}
        </button>
      </form>
    </AuthCard>
  );
}
