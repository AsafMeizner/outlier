# Outlier

A daily word game for an office: each prompt ("Name a fruit") has a list of accepted answers ranked from most common to
rarest. The rarer your answer, the further you fly. Players get leaderboards, streaks, an archive of past days, a
wardrobe of unlockable cosmetics, and can make their own games to share by link. English and Hebrew (RTL) UI.

Built to run without internet access: no external requests at runtime, fonts and sounds are bundled or synthesised.

## Run it

Needs Node 24.

```sh
npm ci
npm run build     # builds the web app into dist/web
npm start         # serves on http://localhost:8080
```

On first start the server imports the question bank from `bank/packs/`, fills about 30 past days of archive, and prints
a one-time setup link (`/setup/<code>`) for creating the admin account.

Settings: `config.json`, or the environment variables `OUTLIER_PORT`, `OUTLIER_HOST`, `OUTLIER_DATA` (data folder),
`OUTLIER_TLS_CERT`, `OUTLIER_TLS_KEY`.

### Docker

```sh
docker build -t outlier .
docker run -p 8080:8080 -v outlier-data:/data outlier
```

The setup link is printed in the container log.

## Develop

```sh
npm run dev:server   # API on :8080, restarts on change
npm run dev          # Vite dev server with the API proxied
npm run typecheck && npm run lint && npm run test:server
```

Layout: `server/` (Node HTTP server, SQLite via `node:sqlite`), `shared/` (API contract and game rules used by both
sides), `web/` (React + Vite app), `bank/packs/` (question packs), `tests/` (server tests), `tools/` (pack validator).

### Questions

Add question packs from the command line (`.txt`, `.csv` or `.json`):

```sh
node server/server.ts import my-pack.txt
```

The plain-text format:

```
C: Food & Drink
Q: Name a fruit that is red
1 Strawberry
4 Lingonberry | lingon
```

`C:` sets the category, `Q:` starts a prompt, and each answer line is a tier from 1 (most common) to 5 (rarest), the
answer, then other accepted spellings after `|`. `npm run validate-bank` checks the packs in `bank/packs/`.
