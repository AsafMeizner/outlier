// SQLite storage via Node's built-in node:sqlite. One file: <data dir>/outlier.db
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MIGRATIONS = [
  // v1
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    team TEXT NOT NULL DEFAULT '',
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
    disabled INTEGER NOT NULL DEFAULT 0,
    must_change INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    last_seen INTEGER
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE prompts (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    pack TEXT NOT NULL DEFAULT '',
    retired INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX prompts_text ON prompts(text COLLATE NOCASE);
  CREATE TABLE answers (
    id INTEGER PRIMARY KEY,
    prompt_id INTEGER NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    tier INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 5),
    aliases TEXT NOT NULL DEFAULT '[]'
  );
  CREATE INDEX answers_prompt ON answers(prompt_id);
  CREATE TABLE days (
    date TEXT PRIMARY KEY,
    auto INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE day_prompts (
    date TEXT NOT NULL REFERENCES days(date) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL REFERENCES prompts(id),
    PRIMARY KEY (date, position)
  );
  CREATE INDEX day_prompts_prompt ON day_prompts(prompt_id);
  CREATE TABLE runs (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL REFERENCES days(date) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('live','archive')),
    position INTEGER NOT NULL DEFAULT 0,
    round_started_at INTEGER,
    score INTEGER NOT NULL DEFAULT 0,
    total_ms INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    UNIQUE (user_id, date)
  );
  CREATE INDEX runs_date ON runs(date, mode);
  CREATE TABLE rounds (
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL,
    answer_id INTEGER,
    answer_text TEXT,
    raw TEXT,
    tier INTEGER NOT NULL DEFAULT 0,
    points INTEGER NOT NULL DEFAULT 0,
    fuzzy INTEGER NOT NULL DEFAULT 0,
    ms INTEGER NOT NULL DEFAULT 0,
    outcome TEXT NOT NULL CHECK (outcome IN ('answered','timeout','skipped','awarded')),
    ended_at INTEGER NOT NULL,
    PRIMARY KEY (run_id, position)
  );
  CREATE INDEX rounds_prompt ON rounds(prompt_id);
  CREATE TABLE guesses (
    id INTEGER PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL,
    raw TEXT NOT NULL,
    norm TEXT NOT NULL,
    accepted INTEGER NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX guesses_prompt ON guesses(prompt_id, accepted);
  CREATE TABLE dismissed (
    prompt_id INTEGER NOT NULL,
    norm TEXT NOT NULL,
    PRIMARY KEY (prompt_id, norm)
  );
  `,
  // v2: prompt language ('en' or 'he'); filled in from the prompt text by the app on start
  `ALTER TABLE prompts ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';`,
];

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try { db.exec(MIGRATIONS[v]); db.exec(`PRAGMA user_version = ${v + 1}`); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  const cache = new Map();
  const stmt = sql => { let s = cache.get(sql); if (!s) { s = db.prepare(sql); cache.set(sql, s); } return s; };
  let depth = 0;
  return {
    raw: db,
    get: (sql, ...p) => stmt(sql).get(...p),
    all: (sql, ...p) => stmt(sql).all(...p),
    run: (sql, ...p) => stmt(sql).run(...p),
    exec: sql => db.exec(sql),
    /** Run fn in a transaction (nested calls join the outer one). */
    tx(fn) {
      if (depth) return fn();
      depth++;
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
      finally { depth--; }
    },
    close: () => db.close(),
  };
}
