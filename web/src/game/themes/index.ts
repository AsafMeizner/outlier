// Theme registry. To add a theme: add its id to shared/themes.ts, its wardrobe to shared/wardrobe.ts,
// a module folder next to ./space, and an entry here. The admin picks the active theme in Settings.
import type { ThemeId } from '../../../../shared/themes.ts';
import { space } from './space/index.ts';
import type { ThemeModule } from './types.ts';

export const THEMES: Record<ThemeId, ThemeModule> = { space };

export const themeFor = (id: ThemeId | undefined): ThemeModule => (id && THEMES[id]) || space;
