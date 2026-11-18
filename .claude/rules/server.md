---
paths:
  - "server/**"
  - "shared/**"
  - "tests/**"
---

# Server and API

- New endpoint: add its request/response types to `shared/api.ts` first, then register it with `pub()` or
  `route(method, pattern, 'user' | 'admin', fn)` in `server/app.ts` (or a feature module that gets a `Kit`).
  Patterns are regex strings anchored for you; capture groups arrive in `m`.
- Validate untrusted JSON with the helpers in `server/http.ts` (`str`, `int`, `optStr`, ...). Never trust `body` types.
- Errors: `bad('Plain English sentence.', status)`. Add the exact string to `heServerMessages` in
  `web/src/i18n/he.ts`; `web/src/i18n/i18n.test.ts` fails otherwise. Keep messages free of interpolated values.
- Schema: append a new SQL string to `MIGRATIONS` in `server/db.ts`. Never edit or reorder existing entries; real
  databases have already run them. Test a table rebuild on a copy of a real database.
- Time: use the app's `now()` and `today()`, never `Date.now()` directly, so tests can move the clock.
- Randomness that matters for fairness or secrecy (tokens, codes): `node:crypto`, not `Math.random()`.
- Secrecy rules: a day's answers and examples are hidden until the day is over (`run.date < today()`), friend games
  reveal after you finish, and nothing about a prompt (text, category) is sent before it opens.
- Daily prompts must be brand new (`used = 0 AND practised = 0`); practice/party pools use past-day prompts only.
- Tests: `tests/server.test.ts` drives `handle()` with a fake clock (`t.tick(ms)`). Add a test for every new rule.
  Run `npm run test:server`.
