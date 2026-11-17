# HANDOFF — Outlier (air-gapped office rare-answer trivia)

Started 2026-11-17. User asked for an air-gapped zip of "OpenKrillion" with a new puzzle bank, easy question
add/select, users, admin panel, leaderboard, streaks, archives.

## Decisions (already made, don't re-litigate)
- NOT extending OpenKrillion (deliberate recreation of krillion.io). ORIGINAL game in the same genre: "Outlier".
  No krillion / Wazari assets, names, prompts or look.
- 2026-11-17 user feedback: "I want cool UI like krillion or the Hebrew version Wazari, the UI animations/art is
  super important". User picked (AskUserQuestion):
  - THEME: **office-chair launch** — an office worker on a rolling chair is launched out of the office; rarer
    answer = bigger launch (office -> parking lot -> city -> hills/sea -> sky/orbit). Distance shown in metres
    (display = points x 10). Code-drawn canvas art, parallax, particles, WebAudio synth sounds, screen shake.
  - LANGUAGE: **both, switchable** — UI in English + Hebrew (RTL), per-user toggle. Prompts carry a `lang`;
    setting `puzzleLanguage` = en | he | alternate. Add a Hebrew starter pack alongside the English one.
- Zero npm dependencies: Node 24 + built-in `node:sqlite`. Portable Node win-x64 + linux-x64 in the zip
  (`vendor-dl/`, v24.22.3, checksums verified). Only the bare node binary is shipped.
- Default 6 prompts/day, 30 s each. Server-authoritative timing. First-run admin via /setup token printed in console.

## State
- DONE + tested (8/8 node tests): server (`src/app.mjs`, `db.mjs`, `server.mjs`, `auth.mjs`, `time.mjs`), matching
  (`match.mjs`, incl. C++/C#), pack formats (`packs.mjs`), validator (`tools/validate-bank.mjs`).
- DONE: first UI (graph-paper/scatter-plot look) in `public/` — being REPLACED by the office-chair launch skin.
  Admin panel UI (`public/admin.js`) stays, gets i18n.
- English bank: 5 of 6 packs done (food-home, geo-travel, science-nature, sports-hobbies, work-tech-history;
  pop-culture writer still running). 150+ prompts, 11k+ answers, validator clean.
- Gotcha: when writing files, `\uXXXX` escapes got turned into literal characters. Check with grep after writing.
- UI walkthrough script: `%TEMP%\outlier-pw\walk.js` (Playwright 1.49.1 in that folder, blocks non-local requests).

## Next steps
1. Hebrew support in match.mjs (letters, final forms, niqqud, matres lectionis skeleton) + prompts.lang migration.
2. Launch Hebrew pack writers (bank/packs/he-*.json).
3. i18n + RTL UI; launch-scene engine (`public/scene.js`); new play/home/results screens.
4. Re-run walkthrough, air-gap test (WSL `unshare -rn`), build zip (`tools/build-zip.py`).

## 2026-11-17 afternoon: user feedback round 2 (UI "looks really bad")
User asked: full-screen UI like krillion/wazari with on-screen effects and the question drawn on the screen; character
customisation unlocked by points; any user can create their own questions/games and share a link; a month of history.
- DECLINED: importing krillion.io's real past puzzles (their content). INSTEAD: first start backfills ~30 past days
  from our own bank so the archive is playable immediately.
- Studied both games by playing them (frames in %TEMP%\outlier-pw\ref\play, contact sheets sheet-*.png). Generic
  conventions adopted (own art only): full-viewport scene, corner icon buttons + top HUD (distance box, progress
  segments coloured by tier, day/score), prompt panel centred over the scene, bottom answer bar (countdown dial +
  input + action button with ENTER keycap), tier REVEAL that climbs rank by rank before stopping (suspense),
  big live distance counter during flight, result window sliding up from the bottom with NEXT, landmark captions
  along the route, CUMULATIVE journey (each launch continues from the last landing; total decides how far you get).
- New world by cumulative metres (1 point = 10 m): office 0-60, parking 60-400, city 400-1600, park 1600-2600,
  beach 2600-3200, sea 3200-4800, sky/clouds 4800-5800, Moon 5800+. Pixel-art rendering (low-res canvas upscaled).
- Fonts: Rubik (body), Rubik Pixels (HUD/titles, has Hebrew).

## 2026-11-17 evening: user asked "use react, typescript etc, build it proper"
- Repo is now strict TypeScript. Layout: `server/` (Node 24 runs .ts natively, zero runtime deps), `shared/` (api.ts =
  API contract, tiers.ts, wardrobe.ts), `web/` (Vite 8 + React 19 + React Router 8 + TanStack Query, CSS modules),
  `tests/` (node:test, typed with shared API types), `tools/validate-bank.ts`, `e2e/` (Playwright 1.49.1, pinned to the
  cached chromium-1148).
- TypeScript pinned to ~6.0 (typescript-eslint does not support TS 7 yet). Use `vendor-dl/win/node-v24.22.3-win-x64`
  npm/node (system npm 11.0 hit an arborist bug).
- DONE: server port (tsc clean, 11/11 tests), 10 packs / 300 prompts valid. Committed 68c2dab.
- Writers: pop-culture + he-culture were stopped by the user (don't relaunch). he-mix-b may still be running.
- NEXT: web app (React): full-screen game shell with persistent Scene (web/src/game/*), HUD, menu overlay, play flow
  (tier reveal meter -> launch -> live distance counter -> result window -> NEXT), results, leaderboard, archive, stats,
  wardrobe, user games (list/editor/share page), admin (normal page layout), i18n en/he typed (he: Record<Key,string>).
  Then vitest + Playwright e2e, build-bundle tool, air-gap test, zip.
- RR8: RouterProvider from 'react-router/dom'; createBrowserRouter from 'react-router'.

## 2026-11-17 night: art direction reset -> SPACE theme, theme system
- User verdict on the React UI: "looks bad ... nothing like the other games, they are way more pixel arty" and "looks bad
  quality, not intentionally bad quality". Root cause: vector art drawn small and upscaled (anti-aliased smear).
- Built `art-lab/` (index.html + art.js): TRUE pixel art = integer pixel writes into a 320x180-ish Bmp (Uint32Array),
  fixed palette, 1px ink outlines, Bayer dithering, bitmap 5x7 font, CSS integer upscale. Three directions: office /
  space rocket / deep-sea dive. USER PICKED SPACE ("space one is best, build that") and asked for an architecture where
  the theme can be changed later or several themes coexist.
- Fonts now: Pixelify Sans (Latin) + GNU Unifont Hebrew subset, both OFL, in web/public/fonts. Rubik Pixels removed.
- Checkpoint commit d88ce14 (React player app, office vector engine, art-lab). Admin UI still a stub.

### Theme architecture (in progress)
- `shared/themes.ts`: THEME_IDS (['space'] for now), DEFAULT_THEME. Admin setting `theme` (server Settings + PublicSettings).
- `shared/wardrobe.ts`: per-theme wardrobes `WARDROBES[theme] = { slots, catalog }`; unlock rules (meters/games/
  outliers/streak) unchanged. User look stored as JSON map `{ [themeId]: Look }` (legacy flat looks are ignored).
  Space slots: hull, stripe, nose, fins, window, pilot, trail.
- `web/src/game/pixel/*`: engine-agnostic pixel toolkit (Bmp, palette, dither, sprites, rotate, outline).
- `web/src/game/engine.ts`: generic Stage (canvas sizing at integer scale, loop, flight timing/easing, landmark events);
  delegates all drawing to the active theme's World. Publishes its pixel scale so CSS `--u` = 1 art pixel.
- `web/src/game/themes/<id>/`: world renderer, hero sprite builder (from look), avatar + wardrobe preview, zones +
  landmarks (in points), distance unit per point, UI palette as CSS variables, theme-specific copy keys.
- Space: 1 point = 1,000 km. Zones by cumulative day points: pad/atmosphere 0-20, orbit 20-60, Moon 60-120,
  Mars 120-200, asteroid belt 200-280, Jupiter 280-360, Saturn 360-440, Neptune 440-500, deep space 500+.
- Old office vector engine (draw.ts, props.ts, scene.ts, world.ts) gets deleted once space is wired in.

### Repo + deployment (2026-11-17, user: "make a new public repo ... deploy it on coolify")
- GitHub: https://github.com/AsafMeizner/outlier (public, branch `main`). Push = deploy (Coolify GitHub App source
  `coolify-nebula-meizner`). Keep `main` buildable: stash WIP or use a branch.
- Coolify (nebula): app `outlier`, uuid **1slyowvczuq2gsndzhvpsk6u**, project "Homelab apps", env production, server localhost,
  build pack Dockerfile, port 8080, persistent volume `…-outlier-data` -> /data. URLs: http://outlier.apps.lan (LAN) and
  https://outlier.meizner.live (Cloudflare tunnel). API token on nebula `~/.config/coolify/api-token` (never print);
  deploy: POST /api/v1/deploy {"uuid": ...} from nebula (localhost:8010). Setup link = container log `/setup/<code>`.

### 2026-11-18: space theme + admin UI shipped
- de6c6cb: space theme (web/src/game/{engine.ts,pixel/,themes/}), stage-context (theme CSS vars + --u = art pixel),
  per-theme wardrobe, i18n space.* / item.* / color.* keys. Office vector engine deleted.
- Admin UI (web/src/admin/*): overview, schedule calendar + day editor, question bank + prompt editor, import/export/
  backup, turned-away answers, users (bulk create, reset, roles, replay), settings incl. theme picker.
- Verified locally with Playwright walkthroughs (%TEMP%\outlier-shots\shoot.mjs player flow, admin.mjs admin pages):
  no console errors, no external requests.
- NEXT ideas: more themes (deep dive from art-lab C), vitest unit tests for pixel/answers/format, Playwright e2e in repo,
  offline zip bundle tool (tools/build-bundle.ts) for the air-gapped install.
