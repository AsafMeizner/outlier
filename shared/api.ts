// The JSON API contract, shared by the server (what it returns) and the web client (what it expects).
import type { Tier, TierId } from './tiers.ts';
import type { ThemeId } from './themes.ts';
import type { Look, UnlockStats, WardrobeItem } from './wardrobe.ts';

export type Role = 'player' | 'admin';
export type Lang = 'en' | 'he';
export type RunMode = 'live' | 'archive' | 'custom';
export type RoundOutcome = 'answered' | 'timeout' | 'skipped' | 'awarded';
export type Registration = 'open' | 'code' | 'closed';
export type PuzzleLanguage = 'en' | 'he' | 'alternate' | 'any';
/** A daily puzzle date (YYYY-MM-DD) or a user-made game key (g-xxxxxxxx). */
export type DayKey = string;

export interface Settings {
  siteName: string;
  tagline: string;
  promptsPerDay: number;
  roundSeconds: number;
  timeZone: string;
  dayStartHour: number;
  activeWeekdays: number[];
  weekStart: number;
  autoSchedule: boolean;
  registration: Registration;
  inviteCode: string;
  typoTolerance: boolean;
  archivePlay: boolean;
  puzzleLanguage: PuzzleLanguage;
  /** Visual theme for everyone (world art, hero, wardrobe, UI colours). */
  theme: ThemeId;
}
export type PublicSettings = Pick<Settings, 'theme' | 'puzzleLanguage' | 'siteName' | 'tagline' | 'roundSeconds' | 'promptsPerDay' | 'registration' | 'archivePlay' | 'weekStart'> & { tiers: readonly Tier[] };

export interface ErrorResponse { error: string }
export interface OkResponse { ok: true }

// ---------- auth ----------
export interface UserView {
  id: number;
  username: string;
  displayName: string;
  team: string;
  role: Role;
  mustChange: boolean;
  disabled: boolean;
  look: Look;
}
export interface MeResponse { user: UserView | null; settings: PublicSettings; needsSetup: boolean; today: string }
export interface AuthResponse { user: UserView }
export interface LoginRequest { username: string; password: string }
export interface RegisterRequest { username: string; displayName: string; team?: string; password: string; inviteCode?: string }
export interface SetupRequest { token: string; username: string; displayName: string; password: string }
export interface PasswordRequest { current: string; next: string }
export interface ProfileRequest { displayName: string; team: string }

// ---------- daily game ----------
export interface Streak { current: number; best: number; playedToday: boolean }
export interface TodayResponse {
  date: string;
  dayNumber: number | null;
  available: boolean;
  promptCount: number;
  categories: string[];
  roundSeconds: number;
  endsAt: number;
  serverNow: number;
  players: number;
  status: 'new' | 'playing' | 'done';
  score: number | null;
  streak: Streak;
}
export interface GameRef { slug: string; title: string }
export interface RoundSummary {
  position: number;
  answer: string | null;
  tier: number;
  points: number;
  outcome: RoundOutcome;
  fuzzy: boolean;
  text: string;
  category: string;
  /** One accepted answer, shown when the round scored nothing. */
  example: string | null;
}
export interface CurrentRound { position: number; text: string; category: string; lang: Lang; startedAt: number; deadline: number }
export interface UpNext { position: number; category: string; lang: Lang }
export interface RunState {
  date: DayKey;
  dayNumber: number | null;
  mode: RunMode;
  game: GameRef | null;
  total: number;
  position: number;
  score: number;
  finished: boolean;
  roundSeconds: number;
  serverNow: number;
  rounds: RoundSummary[];
  current: CurrentRound | null;
  upNext: UpNext | null;
}
export interface GuessRequest { text: string }
export type GuessResponse =
  | { result: 'rejected'; raw: string }
  | { result: 'accepted'; answer: string; tier: TierId; points: number; fuzzy: boolean; same: number; state: RunState }
  | { result: 'expired' | 'finished'; state: RunState };

export interface RevealAnswer { answer: string; tier: number; count: number }
export interface RevealMine { answer: string | null; raw: string | null; tier: number; points: number; outcome: RoundOutcome; same: number }
export interface RevealPrompt { position: number; text: string; category: string; lang: Lang; missed: number; mine: RevealMine | null; answers: RevealAnswer[] }
export interface RevealResponse { date: DayKey; dayNumber: number | null; players: number; game: GameRef | null; prompts: RevealPrompt[] }

// ---------- leaderboards, archive, stats ----------
export type LeaderboardPeriod = 'day' | 'week' | 'month' | 'all' | 'streak' | 'teams';
export interface PlayerRef { userId: number; username: string; name: string; team: string; look: Look }
export interface DayRow extends PlayerRef { score: number; ms: number; outliers: number }
export interface PeriodRow extends PlayerRef { points: number; games: number; avg: number; best: number; ms: number }
export interface StreakRow extends PlayerRef, Streak {}
export interface TeamRow { team: string; players: number; games: number; points: number; avg: number }
export type LeaderboardResponse =
  | { period: 'day'; date: string; rows: DayRow[] }
  | { period: 'streak'; date: string; rows: StreakRow[] }
  | { period: 'teams'; date: string; from: string; to: string; rows: TeamRow[] }
  | { period: 'week' | 'month' | 'all'; date: string; from: string; to: string; rows: PeriodRow[] };

export interface ArchiveDay { date: string; dayNumber: number; cats: string[]; players: number; top: number | null; mode: RunMode | null; score: number | null; finished: boolean }
export interface ArchiveResponse { today: string; archivePlay: boolean; days: ArchiveDay[] }

export interface HistoryRow { date: string; mode: RunMode; score: number; finished: boolean; rank: number; players: number }
export interface StatsResponse {
  games: number;
  points: number;
  bestScore: number;
  avg: number;
  streak: Streak;
  /** Rounds per tier name, plus `missed`. */
  tiers: Record<string, number>;
  history: HistoryRow[];
}

// ---------- wardrobe ----------
export type CatalogWithUnlocks = Record<string, Array<WardrobeItem & { unlocked: boolean }>>;
export interface WardrobeResponse { theme: ThemeId; slots: string[]; colorSlots: string[]; catalog: CatalogWithUnlocks; stats: UnlockStats; look: Look }
export interface WardrobeSaveRequest { look: Partial<Look> }
export interface LookResponse { look: Look }

// ---------- user-made games ----------
export interface AnswerInput { id?: number | null; answer: string; tier: number; aliases: string[] | string }
export interface PromptInput { text: string; category?: string; answers: AnswerInput[] }
export interface GameInput { title: string; prompts: PromptInput[] }
export interface AnswerFull { id: number; answer: string; tier: number; aliases: string[] }
export interface GameContentPrompt { id: number; text: string; category: string; answers: AnswerFull[] }
export interface GameSummary { slug: string; title: string; ownerName: string; createdAt: number; prompts: number; plays: number; myScore: number | null; finished: boolean }
export interface GamesListResponse { mine: GameSummary[]; played: GameSummary[]; recent: GameSummary[] }
export interface GameLeaderRow extends PlayerRef { score: number; ms: number }
export interface GameInfo {
  slug: string;
  title: string;
  ownerName: string;
  ownerUsername: string;
  isOwner: boolean;
  canEdit: boolean;
  /** No one but the owner has played yet, so prompts can still change. */
  editable: boolean;
  createdAt: number;
  prompts: number;
  categories: string[];
  plays: number;
  myRun: { finished: boolean; score: number } | null;
  leaderboard: GameLeaderRow[];
  content: GameContentPrompt[] | null;
}
export interface SlugResponse { slug: string }
export interface MissRow { promptId: number; prompt: string; norm: string; raw: string; guesses: number; players: number }
export interface MissesResponse { misses: MissRow[] }

// ---------- admin ----------
export interface DayPrompt { position: number; id: number; text: string; category: string; lang: Lang }
export interface AdminOverview {
  today: string;
  users: number;
  activeWeek: number;
  playersToday: number;
  startedToday: number;
  bank: number;
  unused: number;
  daysLeft: number;
  scheduledAhead: number;
  misses: number;
  todayPrompts: DayPrompt[];
  participation: Array<{ date: string; players: number }>;
}
export interface AdminPromptRow { id: number; text: string; category: string; pack: string; lang: Lang; retired: boolean; answers: number; used: number; lastUsed: string | null }
export interface AdminPromptsResponse { prompts: AdminPromptRow[]; categories: Array<{ category: string; n: number }> }
export interface PromptFull { id: number; text: string; category: string; pack: string; lang: Lang; retired: boolean; used: string[]; answers: AnswerFull[] }
export interface SavePromptResponse { id: number; awarded: number }
export interface ImportRequest { name: string; content: string; mode: 'skip' | 'update'; dryRun: boolean }
export interface ImportResult { title: string; total: number; added: number; updated: number; skipped: number; errors: string[] }
export interface ScheduleDay { date: string; auto: boolean; prompts: DayPrompt[]; runs: number }
export interface ScheduleResponse { today: string; from: string; to: string; activeWeekdays: number[]; promptsPerDay: number; days: ScheduleDay[] }
export interface SuggestResponse { lang: Lang | null; prompts: Array<{ id: number; text: string; category: string; lang: Lang; used: number }> }
export interface AutofillResponse { created: string[] }
export interface AdminMissRow extends MissRow { lastAt: number }
export interface AdminMissesResponse { misses: AdminMissRow[] }
export interface AcceptMissRequest { promptId: number; text: string; tier?: number; aliasOf?: number }
export interface AdminUserRow extends UserView { games: number; points: number; lastSeen: number | null; createdAt: number }
export interface AdminUsersResponse { users: AdminUserRow[] }
export interface CreatedUser { username: string; displayName: string; password: string }
export interface CreateUsersResponse { created: CreatedUser[]; errors: string[] }
export interface UserRunRow { date: string; mode: RunMode; score: number; position: number; finished: boolean }
export interface SettingsResponse { settings: Settings }
