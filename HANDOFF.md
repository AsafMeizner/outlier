# HANDOFF — Outlier (air-gapped office rare-answer trivia)

Started 2026-11-17. User asked for an air-gapped zip of "OpenKrillion" with a new puzzle bank, easy question
add/select, users, admin panel, leaderboard, streaks, archives.

## Decisions (already made, don't re-litigate)
- NOT extending OpenKrillion (it is a deliberate recreation of krillion.io). Building an ORIGINAL game in the same
  genre: "Outlier". Own name, tiers (Mainstream 10 / Familiar 25 / Uncommon 50 / Rare 75 / Outlier 100), own
  scatter-plot "crowd" look. No krillion assets/names/prompts.
- Zero npm dependencies: plain Node 24 + built-in `node:sqlite`. Portable Node for win-x64 and linux-x64 bundled
  in the zip (`vendor-dl/` holds the verified downloads, v24.22.3).
- Default 6 prompts/day, 30 s each (admin-configurable). Server-authoritative timing.
- First-run admin: server prints a one-time /setup token URL to the console.

## Layout
- `src/match.mjs` normalise/match (plurals, accents, aliases, typo tolerance) — DONE, smoke-tested
- `src/packs.mjs` JSON / TXT / CSV pack parse+export — DONE, smoke-tested
- `tools/validate-bank.mjs` pack validator — DONE
- `bank/packs/*.json` 6 packs x 30 prompts written by subagents (food-home, geo-travel, science-nature,
  pop-culture, sports-hobbies, work-tech-history)
- `src/server.mjs`, `src/db.mjs`, `src/game.mjs`, `src/auth.mjs` — server (TODO)
- `public/` vanilla SPA, no external requests (TODO)
- `tools/build-zip.mjs` bundle builder (TODO)

## Next step
Write the server + DB schema, then UI, then tests, then air-gap test (WSL `unshare -rn` + Playwright blocking
non-localhost requests), then zip.
