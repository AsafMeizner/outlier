// One Scene for the whole app: the canvas stays mounted while screens change on top of it,
// so the character never "reloads" between home, play and results.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Look } from '../../../shared/wardrobe.ts';
import { Scene } from '../game/scene.ts';
import { sfx } from '../game/sfx.ts';
import type { LandmarkKey } from '../game/world.ts';

/** Fast-changing flight data, read with useSyncExternalStore so only the HUD re-renders at frame rate. */
interface Flight { meters: number; landmark: LandmarkKey | null; landmarkAt: number }
function createFlightStore() {
  let state: Flight = { meters: 0, landmark: null, landmarkAt: 0 };
  const subs = new Set<() => void>();
  return {
    get: (): Flight => state,
    set(patch: Partial<Flight>): void { state = { ...state, ...patch }; subs.forEach(f => f()); },
    subscribe(f: () => void): () => void { subs.add(f); return () => subs.delete(f); },
  };
}

interface SceneApi {
  /** The live scene, or null before the canvas mounts. */
  get(): Scene | null;
  attach(canvas: HTMLCanvasElement | null): void;
  muted: boolean;
  setMuted(m: boolean): void;
  flight: ReturnType<typeof createFlightStore>;
}

const Ctx = createContext<SceneApi | null>(null);

export function SceneProvider({ look, rtl, children }: { look: Look; rtl: boolean; children: ReactNode }) {
  const sceneRef = useRef<Scene | null>(null);
  const [muted, setMutedState] = useState(sfx.muted);
  const flight = useMemo(createFlightStore, []);
  // Read by attach() when the canvas mounts; kept current by the effects below.
  const lookRef = useRef(look);
  const rtlRef = useRef(rtl);

  const attach = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      sceneRef.current?.destroy();
      sceneRef.current = null;
      if (!canvas) return;
      sceneRef.current = new Scene(canvas, {
        look: lookRef.current,
        rtl: rtlRef.current,
        sound: !sfx.muted,
        onMeters: m => flight.set({ meters: m }),
        onLandmark: lm => flight.set({ landmark: lm.key, landmarkAt: performance.now() }),
      });
    },
    [flight],
  );

  useEffect(() => {
    lookRef.current = look;
    if (sceneRef.current) sceneRef.current.look = look;
  }, [look]);
  useEffect(() => {
    rtlRef.current = rtl;
    if (sceneRef.current) sceneRef.current.rtl = rtl;
  }, [rtl]);

  const setMuted = useCallback((m: boolean) => {
    sfx.setMuted(m);
    setMutedState(m);
    if (sceneRef.current) sceneRef.current.sound = !m;
  }, []);

  const value = useMemo<SceneApi>(() => ({ get: () => sceneRef.current, attach, muted, setMuted, flight }), [attach, muted, setMuted, flight]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScene(): SceneApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useScene must be used inside SceneProvider');
  return v;
}

export function useFlight(): Flight {
  const { flight } = useScene();
  return useSyncExternalStore(flight.subscribe, flight.get);
}
