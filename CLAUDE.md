# Outlier

Daily trivia for an office or a group of friends: each prompt ("Name a fruit") has a ranked list of accepted answers,
and the rarer your answer, the further your rocket flies. English and Hebrew (RTL). Built to run with no internet.

## Stack

- Node 24 runs the TypeScript server directly (type stripping, no build step); storage is `node:sqlite`.
- No runtime npm dependencies on the server. The web app is React 19 + React Router + TanStack Query, built by Vite.
- The game scene is a hand-written pixel-art engine on one canvas (no game framework).

## Commands

```sh
npm run typecheck      # tsc for both targets (tsconfig.server.json and tsconfig.web.json)
npm run lint
npm test               # server tests (node --test) + web tests (vitest)
npm run validate-bank  # checks every question pack in bank/packs
npm run build          # web app -> dist/web (the server serves it)
npm run e2e            # browser smoke tests; needs a build and `npx playwright install chromium`
npm run check          # all of the above except e2e
npm start              # http://localhost:8080; prints a first-time setup link
```

## Architecture

Browser → `server/server.ts` (HTTP, static files, CSP, CLI) → `server/app.ts` `handle()` → routes registered with
`pub()` / `route()` in `app.ts` and in feature modules (`practice.ts`, `friends.ts`, `party.ts`, given a `Kit`) →
SQLite. `shared/` holds the API contract (`api.ts`) and game rules used by both sides. The web app talks only to `/api`.
Details: `docs/architecture.md`.

## Key paths

| What | Where |
|---|---|
| API contract (both sides) | `shared/api.ts` |
| Routes, game rules, settings | `server/app.ts` |
| Schema + migrations | `server/db.ts` (`MIGRATIONS`, applied by `PRAGMA user_version`) |
| Answer matching (typos, Hebrew) | `server/match.ts` |
| Screens | `web/src/screens/`, admin in `web/src/admin/` |
| Pixel engine + space theme | `web/src/game/engine.ts`, `web/src/game/themes/space/` |
| Strings (EN/HE) | `web/src/i18n/{en,he,admin-en,admin-he}.ts` |
| Question packs | `bank/packs/*.json` |

## Rules that are easy to break

- **No network at runtime.** No CDNs, fonts, analytics or API calls to other hosts. The CSP is `'self'` only; inline
  styles only through React `style` props.
- **Daily prompts are always brand new**: never used on another day and never practised. Practice, packs and party only
  use past-day prompts. Answers and examples stay hidden until the day is over.
- **Every user-facing string** goes in `en.ts` and `he.ts` (types enforce matching keys). Server errors are English
  strings passed to `bad()`; add each new one to `heServerMessages` in `he.ts` (a test enforces it).
- **Migrations are append-only**: add a new string to `MIGRATIONS`, never edit an old one.
- **Tiers 1-6**: tier 6 "One of a Kind" is at most one answer per prompt (validator, importer and admin enforce it).
- TypeScript must be erasable (`erasableSyntaxOnly`): no enums, namespaces or constructor parameter properties;
  import local files with the `.ts` extension.

## Watch out for

- Two tsconfig targets: a change in `shared/` must typecheck for both (`npm run typecheck`).
- `bank/packs/*` files are imported once each on server start (tracked in the `starterPacks` setting). Renaming a
  shipped file re-imports it; prompts with the same text are skipped.
- The day boundary uses the server's time zone setting (`timeZone`, `dayStartHour`); containers default to UTC.
- `HANDOFF.md` is the running log of past work and decisions; read it before large changes.

## See also

- `docs/architecture.md`: data model, game rules, API map, theme system
- `.claude/rules/`: conventions loaded when you touch the server, web, bank or TypeScript files
- `.claude/skills/write-question-pack/`: how to write and validate a new question pack
