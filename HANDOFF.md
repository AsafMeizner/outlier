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

## 2026-11-18: phase "modes" (user: "unlimited mode, themed packs, friends, puffer party")
Shipped first (aaabf0b): answers hidden until the day is over (reveal + example), typo confirm (2nd Enter), music + sfx,
window scrolling, archive category eye toggle.
Plan (original designs, no krillion assets/names):
- Practice: `practice_sessions` + `practice_rounds` (migration v4). Kinds: unlimited (until 3 misses, personal best) and
  pack (10 prompts of one category, best per pack). Pool = bank prompts NOT scheduled today/future; scheduler prefers
  prompts never practised. API mirrors /api/play: /api/practice/:key/{start,next,guess,skip} returning RunState
  (mode 'practice' + `practice` info), so the Play screen is reused with a different API base.
- Friends: `friends` table (follow). /api/friends list+stats, add by username, remove, compare head-to-head; user search.
- Party ("Meteor Party" in the space theme): in-memory rooms, 4-letter codes, long-poll GET /api/party/:code?v=N.
  Turn-based hot potato: name a valid unused answer before your fuse ends; fuse shrinks each pass; timeout = lose a
  life + new prompt; tier points fill a meter, 100 = extra life (max 5); last player standing wins. Typos confirm.
- Web for modes done: /practice (Practice.tsx), /practice/:key (Play kind="practice"), /friends, /party, /party/:code
  (web/src/screens/modes/*). Verified with %TEMP%\outlier-shots\modes.mjs (two browser contexts, live party): no errors.

### 2026-11-18 later
- a976c38: DAILY PROMPTS ARE ALWAYS BRAND NEW (user rule): pickPrompts only takes prompts never used on a day and never
  practised; admin PUT schedule rejects used prompts (409); practice/packs/party pool = past-day prompts only (and not
  re-scheduled today/later). Tests use FILLER(n) prompts for multi-day scenarios.
- 713dcd0: tier 6 "One of a Kind" (150 pts, at most one per prompt; validator/packs/admin enforce). Migration v5 rebuilds
  `answers` (CHECK 1-6, ids kept) and promotes one tier-5 answer per bank prompt; bank JSON updated the same way.
- Music rewritten (sfx.ts Music): 32-bar chiptune in A minor, sections A/D (menus) and B/C (rounds, full drums), pulse
  waves, echo, compressor. Verified non-silent in Chromium via an analyser tap (%TEMP%\outlier-shots\music.mjs).
- Guest play (user: "you dont have to login or create an account"): migration v6 `users.guest`. Sign-in screen shows
  "Play now" (POST /api/guest, 20 new guests per IP per hour) when Settings.guestPlay (default on, admin checkbox).
  Guests get `guest-xxxxxxxx` / "Guest NNNN" and a random password nobody knows. /save (Claim.tsx, POST /api/claim)
  turns the guest into a full account and keeps everything; menu + My stats link to it; sign-out asks first; password
  change is blocked for guests; friend search skips guests; admin Users tags them. Verified with %TEMP%\og-shot.mjs.
- 2026-11-18 morning: 8 new packs (en-screen-music, en-world-past, en-kitchen-daily, en-lab-field, he-kitchen-home-b (28),
  he-israel-culture, he-science-world, he-sport-fun): 238 prompts, ~20k answers, validator 0 errors / 0 warnings on all
  19 files. Answers were written from model knowledge, not checked against sources; admins can fix any via Questions.
  server.ts now imports each bank/packs file ONCE (list in settings key `starterPacks`), so new pack files reach
  existing servers on the next start; old servers without the list count a file as imported if any prompt matches.
- 2026-11-18 noon: day rollover at midnight Israel time: Coolify env TZ=Asia/Jerusalem added (container was UTC, so days
  flipped at 02:00 local). Client: app/DayRollover.tsx sets a timer for /api/today endsAt and refetches every query.
  The intro card no longer shows the category (UpNext = {position, lang}). Mars got ragged polar caps.

## 2026-11-18 afternoon: phase "fun" (user: far space is empty; alien ship companion like a reward; "find all these fun small things")
Plan (original designs; DONE, see below):
1. Endless deep space past the black hole (560): procedural sights every ~70 pts forever (galaxies, ringed alien worlds,
   twin suns, pulsars, comets), nebula colours keep cycling, more zones/landmarks after 560.
2. Alien saucer companion: each One of a Kind (tier 6) in a run adds a saucer that follows the rocket (rest of that run,
   and on Home for the day). Stage.setCompanions(n) -> FrameState.companions -> world draws them.
3. Small fun: shooting stars/comets, pilot blinks, tap-the-rocket boop, real time-of-day sky on the pad,
   "new personal best" celebration.
Shipped: world.ts deepSights() (galaxy, twin suns, ring world, pulsar, comet, jungle world every 80 pts from 640,
forever; drawn ahead of the rocket), nebula colours cycle, zones intergalactic (600) / unknown (1000), landmarks
640-1000. Saucers: Stage.setCompanions(n, announce) -> FrameState.companions; TodayResponse.uniques feeds Home,
Play counts tier-6 rounds; joins only when idle, sfx.alien + toast. Tap the rocket: Stage listens to window
pointerdown (ignores panels/controls), world.hero() hit-test, hop + sparkles + sfx.boop. Pad sky follows the
player's clock (night/dawn/day/dusk, sun or moon, no stars by day). Shooting stars. RunState.record (beat every
other daily score) -> "New personal best!" + sfx.record + Stage.celebrate().

## 2026-11-18 evening: offline zip (user: "zip with full source + all dependencies, air gapped, more questions")
- tools/build-bundle.ts (npm run bundle [-- --docker img.tar.gz]) -> release/outlier-offline-<date>.zip: outlier/ (git
  tracked files + .git + dist/web + node_modules + Linux builds of rolldown/lightningcss from vendor-dl/npm/*.tgz),
  runtime/win-x64 (unpacked Node), runtime/node-...-linux-x64.tar.xz (start-linux.sh unpacks it), docker/ (image +
  compose), README.txt from tools/offline-readme.txt, SHA256SUMS.txt. Tested: extracted on Windows and in WSL Ubuntu,
  both start and serve; WSL `npm rebuild --offline && npm run build && npm run test:server` pass.
- Docker image = the Coolify-built image for the commit (nebula: docker tag <uuid>:<sha> outlier:offline; docker save).
- 8 more packs being written (en-words-culture, en-business-brands, en-travel-places, en-everyday-fun,
  he-words-culture, he-business-brands, he-world-travel, he-everyday-fun).
- Repo/AI readiness (user: "make it more ai ready with claude.md etc and improve the repo"): CLAUDE.md (70 lines),
  AGENTS.md, docs/architecture.md, .claude/{settings.json, rules/{server,web,bank,typescript}.md,
  skills/write-question-pack}, tools/list-prompts.ts, CI (.github/workflows/ci.yml: check + Playwright e2e),
  web tests (vitest: answers, format, i18n incl. server-message coverage, space world smoke), e2e/smoke.spec.ts with a
  throwaway server (e2e/server.ts), `npm run check`, .editorconfig. Found and fixed: 35 server errors had no Hebrew;
  `npm test` failed (no web tests); stale start scripts; README tier range; eslint/docker ignores for release/.
- 8 more packs committed (235 prompts after removing 5 near-duplicates found by a same-language answer-overlap scan):
  en-words-culture (28), en-business-brands (29), en-travel-places, en-everyday-fun, he-words-culture,
  he-business-brands, he-world-travel, he-everyday-fun (28). Bank: 803 prompts (447 EN, 356 HE), 0 errors/warnings.
- Kubernetes: Helm chart deploy/helm/outlier (Deployment replicas 1 + Recreate, PVC with helm keep, Service, optional
  Ingress, read-only root as uid 1000 with /tmp emptyDir, startup/readiness/liveness on /api/me, helm test using the
  app image). Tested for real in a throwaway kind cluster in WSL (lint, install from the offline image tarball, helm
  test, setup code, page 200, data survives restart, PVC kept on uninstall). CI runs helm lint. Bundle has kubernetes/.
- Security follow-up on the chart (automated review): behind an Ingress every request came from the controller's
  address, so login lockout/guest limits collapsed onto one key. server/proxy.ts: OUTLIER_TRUST_PROXY (private | IPs |
  IPv4 CIDRs) -> client from X-Forwarded-For only via trusted peers, read right-to-left; OUTLIER_SECURE_COOKIES=1.
  Chart sets both from ingress.enabled / ingress.tls.enabled (values trustProxy, secureCookies). Verified live.
- Review round 2: clientIp never falls back to a client-written XFF entry (all-trusted -> nearest hop; non-IP stops);
  chart no longer auto-trusts "private" (trustProxy empty by default; NOTES warns), optional networkPolicy (verified
  enforced in kind: helm test allowed, another namespace blocked), helm test pod no longer matches the Service selector.
