// The visual themes the game can wear. The server stores which one is active (admin setting `theme`) and keeps each
// player's look per theme; the web app renders the world, hero, wardrobe and UI colours from the theme's module.
// Adding a theme: add its id here, its wardrobe in wardrobe.ts, and its folder in web/src/game/themes/.

export const THEME_IDS = ['space'] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = 'space';

export const isThemeId = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);
