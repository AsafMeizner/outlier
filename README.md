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
`OUTLIER_TLS_CERT`, `OUTLIER_TLS_KEY`. Behind a reverse proxy: `OUTLIER_TRUST_PROXY` (`private`, or addresses/CIDRs of the
proxies allowed to set `X-Forwarded-For`) and `OUTLIER_SECURE_COOKIES=1` when the proxy terminates HTTPS.

### Docker

```sh
docker build -t outlier .
docker run -p 8080:8080 -v outlier-data:/data -e TZ=Asia/Jerusalem outlier
```

The setup link is printed in the container log. A new daily puzzle starts at midnight in the server's time zone;
containers run on UTC unless you set `TZ`. Admins can also pick the time zone and the hour the day starts in Admin → Settings.

### Kubernetes

A Helm chart is in `deploy/helm/outlier` (one pod, SQLite on a persistent volume, optional Ingress, works offline):

```sh
helm install outlier deploy/helm/outlier -n outlier --create-namespace --set image.repository=<registry>/outlier
```

See [its README](deploy/helm/outlier/README.md) for loading the image into an offline cluster and all settings.

## Develop

```sh
npm run dev:server   # API on :8080, restarts on change
npm run dev          # Vite dev server with the API proxied
npm run check        # typecheck, lint, server + web tests, question-bank validation, build
npm run e2e          # browser smoke tests (after a build; first run: npx playwright install chromium)
```

Layout: `server/` (Node HTTP server, SQLite via `node:sqlite`), `shared/` (API contract and game rules used by both
sides), `web/` (React + Vite app with a pixel-art canvas engine), `bank/packs/` (question packs), `tests/` (server
tests), `e2e/` (browser tests), `tools/` (pack validator, prompt list, offline bundle). How it all fits together:
[docs/architecture.md](docs/architecture.md). CI runs `npm run check` and the browser tests on every push.

### Working with AI coding agents

[CLAUDE.md](CLAUDE.md) (also linked from [AGENTS.md](AGENTS.md)) is the guide for agents: commands, architecture, and the
rules that are easy to break. `.claude/rules/` holds conventions that load when an agent touches the server, the web
app, the question bank or TypeScript files, and `.claude/skills/write-question-pack` walks through writing a new pack.

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

`C:` sets the category, `Q:` starts a prompt, and each answer line is a tier from 1 (most common) to 6 (One of a Kind,
at most one per prompt), the answer, then other accepted spellings after `|`. `npm run validate-bank` checks the packs
in `bank/packs/`. Each file in `bank/packs/` is added to the database once, on the next start, so new packs shipped in
an update reach existing servers.

### Offline package

`npm run bundle` builds `release/outlier-offline-<date>.zip` for networks with no internet: the source with git history,
the built app, `node_modules` (with the Linux builds of the native packages), Node.js for Windows and Linux, start
scripts and instructions. Pass `--docker <image.tar.gz>` to include a saved Docker image. It needs the files listed at
the top of `tools/build-bundle.ts` in `vendor-dl/`.
