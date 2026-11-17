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
