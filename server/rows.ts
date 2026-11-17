// Row shapes as stored in SQLite. Booleans are 0/1 integers; JSON columns are text.
import type { Lang, Role, RoundOutcome, RunMode } from '../shared/api.ts';

export interface Count { n: number }

export interface UserRow {
  id: number;
  username: string;
  display_name: string;
  team: string;
  pass_hash: string;
  role: Role;
  disabled: number;
  must_change: number;
  created_at: number;
  last_seen: number | null;
  look: string;
}
export interface SessionUserRow extends UserRow { expires_at: number; token_hash: string }

export interface PromptRow {
  id: number;
  text: string;
  category: string;
  pack: string;
  retired: number;
  created_at: number;
  updated_at: number;
  lang: Lang;
  owner_id: number | null;
}

export interface AnswerRow { id: number; answer: string; tier: number; aliases: string }
/** An answer with its aliases parsed. */
export interface Answer { id: number; answer: string; tier: number; aliases: string[] }

export interface DayRow { date: string; auto: number; created_at: number }

export interface RunRow {
  id: number;
  user_id: number;
  date: string;
  mode: RunMode;
  position: number;
  round_started_at: number | null;
  score: number;
  total_ms: number;
  started_at: number;
  finished_at: number | null;
}

export interface RoundRow {
  run_id: number;
  position: number;
  prompt_id: number;
  answer_id: number | null;
  answer_text: string | null;
  raw: string | null;
  tier: number;
  points: number;
  fuzzy: number;
  ms: number;
  outcome: RoundOutcome;
  ended_at: number;
}

export interface GameRow { id: number; slug: string; owner_id: number; title: string; created_at: number; updated_at: number }
