# Architecture

How Outlier fits together, for people and AI agents changing it. The short version is in `CLAUDE.md`.

## Runtime

One Node 24 process serves everything: `server/server.ts` reads `config.json` (or `OUTLIER_*` environment variables),
opens `<data>/outlier.db`, imports new question packs, back-fills about 30 past days, and serves `dist/web` plus the
JSON API on one port. It sets a strict same-origin CSP and security headers. The same file is also the command line
(`import`, `reset-password`, `make-admin`, `backup`).

`server/app.ts` is transport-agnostic: `createApp({ db, now, random, ... })` returns `handle(request) -> response`, which
the tests call directly with a fake clock (`tests/server.test.ts`). Routes are registered with `pub()` (no account) and
`route(method, pattern, 'user' | 'admin', fn)`. Feature modules get a `Kit` (database, routing, shared helpers) from
`server/kit.ts`: `practice.ts` (Unlimited and themed packs), `friends.ts` (follows and head-to-head) and `party.ts`
(Meteor Party: in-memory rooms, long-polling).

Errors are thrown with `bad(message, status)`. The message is shown to the player, so it is plain English, and the web
client translates it through `heServerMessages` in `web/src/i18n/he.ts`.

Writes must come from the same origin and carry the `X-Outlier: 1` header. Passwords use scrypt; sessions are random
tokens stored as SHA-256 hashes.

## Data model (SQLite)

| Table | Holds |
|---|---|
| `settings` | key -> JSON value (admin settings, plus `starterPacks`: pack files already imported) |
| `users`, `sessions` | accounts (`role`, `guest`, `look` = wardrobe JSON per theme) and login sessions |
| `prompts`, `answers` | the question bank: prompt text, category, language, pack; answers with tier 1-6 and aliases |
| `days`, `day_prompts` | the calendar: which prompts each daily puzzle uses |
| `runs`, `rounds`, `guesses` | a player's daily (or archive, or user-made game) run, each round, every typed guess |
| `games` | user-made games, shared by link (`g-xxxxxxxx`) |
| `practice_sessions`, `practice_rounds` | Unlimited and themed-pack runs (`p-xxxxxxxxxx`) |
| `friends`, `dismissed` | one-way follows; admin-dismissed missed answers |

Schema changes are new entries at the end of `MIGRATIONS` in `server/db.ts`; the database's `PRAGMA user_version`
records how many have run.

## Game rules

- **Tiers** (`shared/tiers.ts`): 1 Mainstream 10 pts, 2 Familiar 25, 3 Uncommon 50, 4 Rare 75, 5 Outlier 100,
  6 One of a Kind 150 (at most one answer per prompt). The space theme shows 1 point as 1,000 km.
- **Daily puzzle**: `promptsPerDay` prompts (default 6), `roundSeconds` each (default 30), languages alternate by day
  unless set otherwise. Every daily prompt is brand new: never used on another day, never practised.
- **Matching** (`server/match.ts`): case, accents, Hebrew niqqud and final letters, articles and plurals are normalised;
  aliases count; a typo-corrected match returns `confirm` and needs a second Enter.
- **Secrecy**: answers and examples for a day are hidden until that day is over; categories are not sent before a prompt
  opens.
- **Day boundary**: midnight (or `dayStartHour`) in the `timeZone` setting, which defaults to the server's zone.
- **Guests**: "Play now" creates a guest account (only while registration is open); `/api/claim` turns it into a real
  one.

## Web app

`web/src/main.tsx` -> `app/router.tsx`. `app/Shell.tsx` owns the full-screen canvas (the scene), the HUD and the menu;
screens render on top of it. Data comes from TanStack Query hooks in `lib/queries.ts` over `lib/api.ts`.
Admin pages (`web/src/admin/`) are a separate lazy-loaded bundle with a plain layout.

Strings live in `web/src/i18n/`: `en.ts` is the source; `he.ts` is typed against it, so a missing key fails the
typecheck. Admin strings are in `admin-en.ts` / `admin-he.ts`.

## Game engine and themes

`web/src/game/engine.ts` (`Stage`) owns timing: the animation loop, flights between distances, landmarks, companions
and sounds. Each frame it asks the active theme's `World` to draw into a small bitmap (`pixel/bmp.ts`, integer drawing
only), then scales it up by a whole number with smoothing off, so every art pixel is a crisp square.

A theme (`web/src/game/themes/<id>/`, registered in `themes/index.ts` and `shared/themes.ts`) supplies zones,
landmarks, UI colours, copy, the world renderer, the avatar and the wardrobe preview. Its wardrobe catalog and unlock
rules are in `shared/wardrobe.ts`. The only theme today is `space`; its world is in `themes/space/world.ts` (planets,
deep-space sights every 80 points past 640, saucer companions, time-of-day launch pad).

Sound (`game/sfx.ts`) is synthesised with Web Audio: effects plus a chiptune soundtrack. Nothing is loaded from files.

## Tests

- `tests/server.test.ts` (node --test): the API end to end through `handle()`, with a fake clock.
- `web/src/**/*.test.ts` (vitest): answer parsing, formatting, translations, the space world renderer.
- `e2e/*.spec.ts` (Playwright): a guest plays a round, the language switch; against a throwaway server (`e2e/server.ts`).

## Deployment

- Docker: `Dockerfile` (Node 24 slim, data in `/data`). Set `TZ` so the day starts at your midnight.
- Offline: `npm run bundle` builds a zip with Node for Windows and Linux, the source, `node_modules` and start scripts
  (`tools/build-bundle.ts`).
