// What a theme provides. The engine (../engine.ts) owns timing and flight progress; a theme's World draws everything.
// Distances inside the engine and themes are in POINTS (the score unit); each theme says how to show them.
import type { ThemeId } from '../../../../shared/themes.ts';
import type { Look } from '../../../../shared/wardrobe.ts';
import type { AnyKey } from '../../i18n/index.tsx';
import type { Bmp } from '../pixel/bmp.ts';

export type Mode = 'idle' | 'charge' | 'fly' | 'landed' | 'miss';

export interface FrameState {
  /** ms since the stage started. */
  t: number;
  dt: number;
  /** Current distance in points (fractional while flying). */
  dist: number;
  mode: Mode;
  /** ms since the current mode began. */
  modeT: number;
  /** The flight in progress or just finished. k = eased progress 0..1. */
  flight: { from: number; to: number; k: number; tier: number } | null;
  /** Fraction of the round's clock left (1 → 0), or null when no clock runs. */
  clock: number | null;
  /** ms since the last rejected answer. */
  sinceReject: number;
  missKind: 'timeout' | 'pass' | null;
  /** Companions travelling with the hero (one per One of a Kind answer); they join one at a time. */
  companions: number;
  /** ms since the newest companion joined. */
  sinceJoin: number;
  /** ms since the player last tapped the hero. */
  sincePoke: number;
}

export interface World {
  setLook(look: Look): void;
  render(f: Bmp, s: FrameState): void;
  /** Screen shake to apply this frame, in art pixels. */
  shake: number;
  launched?(s: FrameState): void;
  landed?(s: FrameState): void;
  missed?(s: FrameState): void;
  celebrate?(s: FrameState): void;
  /** Where the hero was drawn last frame, in art pixels (for taps). */
  hero?(): { x: number; y: number; r: number } | null;
}

export interface Zone { id: string; from: number; key: AnyKey }
export interface Landmark { at: number; key: AnyKey }

export interface ThemeModule {
  id: ThemeId;
  name: AnyKey;
  /** Display units per point, and the i18n key that formats them ("{n} km"). */
  unitPerPoint: number;
  unitKey: AnyKey;
  /** Zones by distance (points), ascending. */
  zones: readonly Zone[];
  /** Captions shown as the hero passes them. */
  landmarks: readonly Landmark[];
  /** CSS custom properties for the UI around the scene. */
  css: Readonly<Record<string, string>>;
  /** i18n keys for theme-specific copy. */
  copy: { pitch: AnyKey; how: AnyKey; launch: AnyKey; wardrobeNote: AnyKey; party: AnyKey; partyTagline: AnyKey };
  createWorld(look: Look): World;
  /** A 16x16 portrait for leaderboards and menus. */
  drawAvatar(b: Bmp, look: Look): void;
  /** The hero in a little scene, for the wardrobe (any size; animates with t). */
  drawPreview(b: Bmp, look: Look, t: number): void;
  /** How long a flight of `delta` points takes. */
  flightMs(delta: number): number;
}
