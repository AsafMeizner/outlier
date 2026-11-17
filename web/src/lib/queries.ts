// TanStack Query hooks for the player API. Query keys live in one place so mutations can invalidate precisely.
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type * as Api from '../../../shared/api.ts';
import { api, qs } from './api.ts';

export const keys = {
  me: ['me'] as const,
  today: ['today'] as const,
  run: (key: string) => ['run', key] as const,
  reveal: (key: string) => ['reveal', key] as const,
  archive: ['archive'] as const,
  leaderboard: (period: Api.LeaderboardPeriod, date?: string) => ['leaderboard', period, date ?? ''] as const,
  stats: ['stats'] as const,
  wardrobe: ['wardrobe'] as const,
  games: ['games'] as const,
  game: (slug: string) => ['game', slug] as const,
  gameMisses: (slug: string) => ['game', slug, 'misses'] as const,
};

type Opts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api.get<Api.MeResponse>('/api/me'), staleTime: 60_000 });

export const useToday = (opts: Opts<Api.TodayResponse> = {}) =>
  useQuery({ queryKey: keys.today, queryFn: () => api.get<Api.TodayResponse>('/api/today'), ...opts });

export const useRun = (key: string, opts: Opts<Api.RunState> = {}) =>
  useQuery({ queryKey: keys.run(key), queryFn: () => api.get<Api.RunState>(`/api/play/${key}`), retry: false, ...opts });

export const useReveal = (key: string) =>
  useQuery({ queryKey: keys.reveal(key), queryFn: () => api.get<Api.RevealResponse>(`/api/reveal/${key}`), retry: false });

export const useArchive = () => useQuery({ queryKey: keys.archive, queryFn: () => api.get<Api.ArchiveResponse>('/api/archive') });

export const useLeaderboard = (period: Api.LeaderboardPeriod, date?: string) =>
  useQuery({ queryKey: keys.leaderboard(period, date), queryFn: () => api.get<Api.LeaderboardResponse>(`/api/leaderboard${qs({ period, date })}`) });

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: () => api.get<Api.StatsResponse>('/api/stats') });

export const useWardrobe = () => useQuery({ queryKey: keys.wardrobe, queryFn: () => api.get<Api.WardrobeResponse>('/api/wardrobe') });

export const useGames = () => useQuery({ queryKey: keys.games, queryFn: () => api.get<Api.GamesListResponse>('/api/games') });

export const useGame = (slug: string, enabled = true) =>
  useQuery({ queryKey: keys.game(slug), queryFn: () => api.get<Api.GameInfo>(`/api/games/${slug}`), retry: false, enabled: enabled && !!slug });

export const useGameMisses = (slug: string, enabled: boolean) =>
  useQuery({ queryKey: keys.gameMisses(slug), queryFn: () => api.get<Api.MissesResponse>(`/api/games/${slug}/misses`), enabled });
