// Shared bits for the admin pages: query hooks, a theme-aware distance formatter, relative times, small UI pieces.
import { useCallback, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type * as Api from '../../../shared/api.ts';
import { themeFor } from '../game/themes/index.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { api, qs } from '../lib/api.ts';
import { fmtNumber } from '../lib/format.ts';
import { useMe } from '../lib/queries.ts';
import { useToast } from '../ui/Toast.tsx';

export const adminKeys = {
  overview: ['admin', 'overview'] as const,
  prompts: ['admin', 'prompts'] as const,
  prompt: (id: number) => ['admin', 'prompt', id] as const,
  schedule: (from: string, to: string) => ['admin', 'schedule', from, to] as const,
  misses: ['admin', 'misses'] as const,
  users: ['admin', 'users'] as const,
  userRuns: (id: number) => ['admin', 'user', id, 'runs'] as const,
  settings: ['admin', 'settings'] as const,
};

export const useOverview = () => useQuery({ queryKey: adminKeys.overview, queryFn: () => api.get<Api.AdminOverview>('/api/admin/overview') });
export const usePrompts = () => useQuery({ queryKey: adminKeys.prompts, queryFn: () => api.get<Api.AdminPromptsResponse>('/api/admin/prompts') });
export const usePrompt = (id: number | null) =>
  useQuery({ queryKey: adminKeys.prompt(id ?? 0), queryFn: () => api.get<Api.PromptFull>(`/api/admin/prompts/${id ?? 0}`), enabled: id !== null });
export const useSchedule = (from: string, to: string) =>
  useQuery({ queryKey: adminKeys.schedule(from, to), queryFn: () => api.get<Api.ScheduleResponse>(`/api/admin/schedule${qs({ from, to })}`) });
export const useMisses = () => useQuery({ queryKey: adminKeys.misses, queryFn: () => api.get<Api.AdminMissesResponse>('/api/admin/misses') });
export const useUsers = () => useQuery({ queryKey: adminKeys.users, queryFn: () => api.get<Api.AdminUsersResponse>('/api/admin/users') });
export const useUserRuns = (id: number) =>
  useQuery({ queryKey: adminKeys.userRuns(id), queryFn: () => api.get<{ runs: Api.UserRunRow[] }>(`/api/admin/users/${id}/runs`) });
export const useSettings = () => useQuery({ queryKey: adminKeys.settings, queryFn: () => api.get<Api.SettingsResponse>('/api/admin/settings') });

/** Invalidate everything admin-side (cheap: these are small queries). */
export function useRefreshAdmin(): () => void {
  const qc = useQueryClient();
  return useCallback(() => void qc.invalidateQueries({ queryKey: ['admin'] }), [qc]);
}

/** Points in the active theme's unit ("75,000 km"); the admin pages live outside the game stage. */
export function useAdminDistance(): (points: number) => string {
  const theme = themeFor(useMe().data?.settings.theme);
  const { t, locale } = useI18n();
  return useCallback((p: number) => t(theme.unitKey, { n: fmtNumber(locale, p * theme.unitPerPoint) }), [theme, t, locale]);
}

/** "5 min ago" style times. */
export function useAgo(): (ms: number | null) => string {
  const { t } = useI18n();
  return useCallback((ms: number | null) => {
    if (!ms) return t('admin.never');
    const mins = Math.max(1, Math.round((Date.now() - ms) / 60_000));
    if (mins < 60) return t('admin.minAgo', { n: mins });
    if (mins < 60 * 48) return t('admin.hAgo', { n: Math.round(mins / 60) });
    return t('admin.dAgo', { n: Math.round(mins / 1440) });
  }, [t]);
}

/** Run an admin action: shows the server's error as a toast; returns whether it worked. */
export function useAction(): <T>(fn: () => Promise<T>, done?: (r: T) => string | void) => Promise<boolean> {
  const { t, server } = useI18n();
  const toast = useToast();
  const refresh = useRefreshAdmin();
  return useCallback(async <T,>(fn: () => Promise<T>, done?: (r: T) => string | void): Promise<boolean> => {
    try {
      const r = await fn();
      const msg = done?.(r);
      if (msg) toast(msg, 'good');
      refresh();
      return true;
    } catch (e) {
      toast(e instanceof Error ? server(e.message) : t('common.error'), 'bad');
      return false;
    }
  }, [t, server, toast, refresh]);
}

export function Card({ title, children, actions, className }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`adm-card px-window${className ? ` ${className}` : ''}`}>
      {title || actions ? (
        <header className="adm-card-head">
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </header>
      ) : null}
      <div className="adm-card-body">{children}</div>
    </section>
  );
}

export function PageTitle({ k, children }: { k: AnyKey; children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="adm-title">
      <h1>{t(k)}</h1>
      {children}
    </div>
  );
}

export const TIER_IDS = [1, 2, 3, 4, 5, 6] as const;
