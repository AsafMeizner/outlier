// One Stage for the whole app: the canvas stays mounted while screens change on top of it.
// The active theme (an admin setting) decides the world, the hero, the distance unit and the UI colours.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ThemeId } from '../../../shared/themes.ts';
import type { Look } from '../../../shared/wardrobe.ts';
import { Stage } from '../game/engine.ts';
import { sfx } from '../game/sfx.ts';
import { themeFor } from '../game/themes/index.ts';
import type { ThemeModule } from '../game/themes/types.ts';
import { useI18n, type AnyKey } from '../i18n/index.tsx';
import { fmtNumber } from '../lib/format.ts';

/** Fast-changing flight data, read with useSyncExternalStore so only the HUD re-renders at frame rate. */
interface Flight { dist: number; landmark: AnyKey | null; landmarkAt: number }
function createFlightStore() {
  let state: Flight = { dist: 0, landmark: null, landmarkAt: 0 };
  const subs = new Set<() => void>();
  return {
    get: (): Flight => state,
    set(patch: Partial<Flight>): void { state = { ...state, ...patch }; subs.forEach(f => f()); },
    subscribe(f: () => void): () => void { subs.add(f); return () => subs.delete(f); },
  };
}

interface StageApi {
  /** The live stage, or null before the canvas mounts. */
  get(): Stage | null;
  attach(canvas: HTMLCanvasElement | null): void;
  theme: ThemeModule;
  muted: boolean;
  setMuted(m: boolean): void;
  flight: ReturnType<typeof createFlightStore>;
}

const Ctx = createContext<StageApi | null>(null);

export function StageProvider({ themeId, look, rtl, children }: { themeId: ThemeId | undefined; look: Look; rtl: boolean; children: ReactNode }) {
  const theme = themeFor(themeId);
  const stageRef = useRef<Stage | null>(null);
  const [muted, setMutedState] = useState(sfx.muted);
  const flight = useMemo(() => createFlightStore(), []);
  // Read by attach() when the canvas mounts; kept current by the effects below.
  const init = useRef({ theme, look, rtl });

  const attach = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      stageRef.current?.destroy();
      stageRef.current = null;
      if (!canvas) return;
      const { theme: th, look: lk, rtl: r } = init.current;
      stageRef.current = new Stage(canvas, {
        theme: th, look: lk, rtl: r, sound: !sfx.muted,
        onDistance: d => flight.set({ dist: d }),
        onLandmark: key => {
          const at = performance.now();
          flight.set({ landmark: key, landmarkAt: at });
          // captions stay up for a moment, unless a newer one replaced them
          window.setTimeout(() => { if (flight.get().landmarkAt === at) flight.set({ landmark: null }); }, 1800);
        },
        onScale: px => document.documentElement.style.setProperty('--u', `${px}px`),
      });
    },
    [flight],
  );

  useEffect(() => {
    init.current = { ...init.current, theme, look };
    stageRef.current?.setTheme(theme, look);
  }, [theme]); // eslint-disable-line react-hooks/exhaustive-deps -- a theme switch rebuilds the world with the current look
  useEffect(() => {
    init.current = { ...init.current, look };
    stageRef.current?.setLook(look);
  }, [look]);
  useEffect(() => {
    init.current = { ...init.current, rtl };
    if (stageRef.current) stageRef.current.rtl = rtl;
  }, [rtl]);

  // Theme colours for the UI.
  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(theme.css)) root.style.setProperty(k, v);
    root.dataset['theme'] = theme.id;
  }, [theme]);

  const setMuted = useCallback((m: boolean) => {
    sfx.setMuted(m);
    setMutedState(m);
    if (stageRef.current) stageRef.current.sound = !m;
  }, []);

  const value = useMemo<StageApi>(() => ({ get: () => stageRef.current, attach, theme, muted, setMuted, flight }), [attach, theme, muted, setMuted, flight]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStage(): StageApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStage must be used inside StageProvider');
  return v;
}

export function useFlight(): Flight {
  const { flight } = useStage();
  return useSyncExternalStore(flight.subscribe, flight.get);
}

/** Points as the active theme shows them, e.g. 75 → "75,000 km". */
export function useDistance(): (points: number) => string {
  const { theme } = useStage();
  const { t, locale } = useI18n();
  return useCallback((points: number) => t(theme.unitKey, { n: fmtNumber(locale, points * theme.unitPerPoint) }), [theme, t, locale]);
}

/** The theme's name for where a distance is ("low orbit", "Mars"). */
export function useZoneName(): (points: number) => string {
  const { theme } = useStage();
  const { t } = useI18n();
  return useCallback((points: number) => {
    let key = theme.zones[0]?.key;
    for (const z of theme.zones) if (points >= z.from) key = z.key;
    return key ? t(key) : '';
  }, [theme, t]);
}
