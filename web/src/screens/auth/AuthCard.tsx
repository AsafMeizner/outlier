// Shared frame and form plumbing for the sign-in, sign-up, setup and password screens.
import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../i18n/index.tsx';
import { keys } from '../../lib/queries.ts';
import '../screens.css';

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-card px-window px-window--paper" aria-labelledby="auth-title">
        <h1 id="auth-title" className="auth-title">
          {title}
        </h1>
        {children}
      </section>
    </div>
  );
}

/** Runs a submit handler with busy and error state; server messages are translated. Refreshes "me" on success. */
export function useAuthSubmit<T>(run: () => Promise<T>, after?: (r: T) => void | Promise<void>) {
  const { t, server } = useI18n();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await run();
      await qc.invalidateQueries({ queryKey: keys.me });
      await after?.(r);
    } catch (err) {
      setError(err instanceof Error ? server(err.message) : t('common.error'));
    }
    setBusy(false);
  };
  return { error, busy, onSubmit: (e: FormEvent) => void onSubmit(e) };
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small className="faint field-hint">{hint}</small> : null}
    </label>
  );
}
