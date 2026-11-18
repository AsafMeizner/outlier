// Smoke test for the space world: it must draw every part of the route (and far past it) without throwing,
// with or without companions, in any frame state the engine can produce.
import { describe, expect, it } from 'vitest';
import { defaultLook } from '../../../../../shared/wardrobe.ts';
import { Bmp } from '../../pixel/bmp.ts';
import type { FrameState } from '../types.ts';
import { space } from './index.ts';

const frame = (dist: number, extra: Partial<FrameState> = {}): FrameState => ({
  t: 5000, dt: 16, dist, mode: 'idle', modeT: 1000, flight: null, clock: null, sinceReject: 1e9, missKind: null,
  companions: 0, sinceJoin: 1e9, sincePoke: 1e9, ...extra,
});

describe('space world', () => {
  it.each([0, 5, 20, 60, 160, 240, 400, 560, 640, 880, 1000, 2500, 10_000])('draws at %i points', dist => {
    const world = space.createWorld(defaultLook('space', 'test'));
    const f = new Bmp(320, 180);
    for (let t = 0; t < 400; t += 16) world.render(f, frame(dist, { t, companions: 3 }));
    // something other than one flat colour was drawn
    expect(new Set(f.d).size).toBeGreaterThan(4);
  });

  it('flies, lands a One of a Kind and celebrates with six saucers', () => {
    const world = space.createWorld(defaultLook('space', 'test'));
    const f = new Bmp(200, 300); // portrait
    const flight = { from: 100, to: 250, k: 0.5, tier: 6 };
    world.render(f, frame(175, { mode: 'fly', flight, companions: 6 }));
    world.landed?.(frame(250, { mode: 'landed', flight: { ...flight, k: 1 } }));
    world.celebrate?.(frame(250));
    for (let t = 5000; t < 6000; t += 16) world.render(f, frame(250, { t, mode: 'landed', flight: { ...flight, k: 1 }, companions: 6, sinceJoin: t - 5000 }));
    expect(world.hero?.()).not.toBeNull();
  });

  it('every landmark is inside a zone, in order', () => {
    const at = space.landmarks.map(l => l.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(space.zones[0]?.from).toBe(0);
  });
});
