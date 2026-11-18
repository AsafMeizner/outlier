---
paths:
  - "web/**"
---

# Web app

- **No external resources.** Fonts, images and sounds are bundled or synthesised; the CSP blocks everything else.
  No inline `<style>` or `style="..."` strings: use CSS files, or React `style={{ }}` objects (set through the CSSOM).
- **Strings**: add every new key to `i18n/en.ts` and `i18n/he.ts` (admin pages: `admin-en.ts` / `admin-he.ts`).
  Hebrew is RTL: use logical CSS (`margin-inline-start`, `inset-inline-end`), not left/right, and `dir="auto"` on
  user or prompt text.
- Writing Hebrew from a shell: heredocs mangle it. Write files with an editor/Write tool, then run them.
- **Data** goes through TanStack Query hooks in `lib/queries.ts` and `lib/api.ts` (`api.get/post/put/del`); after a
  mutation, invalidate the affected `keys.*`.
- **Lint is strict** (react-hooks v7): no `setState` directly in an effect body, no reading refs during render,
  stable deps. Fix the pattern rather than disabling the rule.
- **The scene**: screens never draw on the canvas. They call the stage through `useStage().get()`
  (`setPosition`, `launch`, `charge`, `miss`, `setCompanions`, `celebrate`, ...).
- **Pixel art** (`game/`): draw with integer coordinates into `Bmp` using palette colours from the theme; no
  anti-aliasing, no fractional scaling. `--u` in CSS is one art pixel; size UI in multiples of it.
- Sounds: add a method to `Sfx` in `game/sfx.ts` (Web Audio synthesis); respect the mute settings.
- Respect `prefers-reduced-motion` for any new looping animation.
- Check a UI change in a real browser (`npm run build && npm start`, or `npm run dev` + `npm run dev:server`),
  in English and Hebrew, on a narrow and a wide window.
