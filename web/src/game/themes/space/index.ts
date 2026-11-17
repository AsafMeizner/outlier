// Space theme: rocket launches. 1 point = 1,000 km. The world lives in ./world.ts, the hero in ./rocket.ts.
import { colorOf, type Look } from '../../../../../shared/wardrobe.ts';
import { bayer, rgb, rng } from '../../pixel/bmp.ts';
import type { ThemeModule } from '../types.ts';
import { HEX, P } from './palette.ts';
import { buildRocket, faceSprite, flame, ROCKET_H, ROCKET_W } from './rocket.ts';
import { createSpaceWorld } from './world.ts';

export const space: ThemeModule = {
  id: 'space',
  name: 'space.name',
  unitPerPoint: 1000,
  unitKey: 'space.unit',
  zones: [
    { id: 'pad', from: 0, key: 'space.zone.pad' },
    { id: 'sky', from: 4, key: 'space.zone.sky' },
    { id: 'orbit', from: 20, key: 'space.zone.orbit' },
    { id: 'moon', from: 60, key: 'space.zone.moon' },
    { id: 'mars', from: 120, key: 'space.zone.mars' },
    { id: 'belt', from: 200, key: 'space.zone.belt' },
    { id: 'jupiter', from: 280, key: 'space.zone.jupiter' },
    { id: 'saturn', from: 360, key: 'space.zone.saturn' },
    { id: 'neptune', from: 440, key: 'space.zone.neptune' },
    { id: 'deep', from: 520, key: 'space.zone.deep' },
  ],
  landmarks: [
    { at: 5, key: 'space.lm.clouds' },
    { at: 15, key: 'space.lm.edge' },
    { at: 30, key: 'space.lm.station' },
    { at: 90, key: 'space.lm.moon' },
    { at: 160, key: 'space.lm.mars' },
    { at: 240, key: 'space.lm.belt' },
    { at: 320, key: 'space.lm.jupiter' },
    { at: 400, key: 'space.lm.saturn' },
    { at: 470, key: 'space.lm.neptune' },
    { at: 560, key: 'space.lm.blackhole' },
  ],
  copy: { pitch: 'space.pitch', how: 'space.how', launch: 'space.launch', wardrobeNote: 'space.wardrobeNote' },
  css: {
    '--bg': HEX.black,
    '--panel': HEX.navy,
    '--panel-hi': HEX.navyM,
    '--panel-lo': HEX.night,
    '--panel-2': HEX.night,
    '--border': HEX.cyan,
    '--shadow': HEX.black,
    '--ink': HEX.ink,
    '--text': HEX.white,
    '--text-2': HEX.ice,
    '--text-3': HEX.gray,
    '--accent': HEX.pink,
    '--accent-hi': HEX.pinkL,
    '--accent-lo': HEX.purple,
    '--accent-text': '#ffffff',
    '--alt': HEX.navyM,
    '--alt-hi': '#4a5ab8',
    '--alt-lo': HEX.night,
    '--alt-text': HEX.white,
    '--input': HEX.black,
    '--input-text': HEX.cyan,
    '--caption': HEX.cyan,
    '--caption-text': HEX.black,
    '--highlight': HEX.sun,
    '--highlight-text': HEX.ink,
    '--good': HEX.green,
    '--bad': HEX.red,
  },
  createWorld: createSpaceWorld,
  flightMs: delta => 1100 + Math.min(3800, delta * 24),

  drawAvatar(b, look) {
    b.clear();
    const hull = rgb(colorOf('space', 'hull', look['hull'], '#f2efe6'));
    b.circle(8, 8, 7, P.ink); b.circle(8, 8, 6, hull);
    b.circle(8, 8, 5, P.grayL); b.circle(8, 8, 4, P.navy);
    const face = faceSprite(look['pilot']);
    for (let j = 0; j < face.h; j++) for (let i = 0; i < face.w; i++) {
      const c = face.d[j * face.w + i] ?? 0;
      if (!c) continue;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) { const x = 3 + i * 2 + dx - 1, y = 3 + j * 2 + dy - 1; if (b.get(x, y) === P.navy) b.set(x, y, c); }
    }
    b.set(5, 5, P.white);
  },

  drawPreview(b, look, t) {
    b.clear();
    b.bands(0, 0, b.w, b.h, [P.black, P.night, P.violet, P.purpleD], 0.5);
    const r = rng(4);
    for (let i = 0; i < 30; i++) { const x = Math.floor(r() * b.w), y = Math.floor(r() * b.h * 0.8), tw = r() * 6; b.set(x, y, Math.sin(t / 400 + tw) > -0.3 ? P.white : P.gray); }
    const gy = b.h - 6;
    b.rect(0, gy, b.w, 6, P.grayD); b.rect(0, gy, b.w, 1, P.ink); b.dither(0, gy + 2, b.w, 4, P.ink, 0.3);
    const rocket = buildRocket(look as Look);
    const x = Math.round(b.w / 2 - ROCKET_W / 2), hover = Math.round(Math.sin(t / 500) * 1.5);
    const y = gy - ROCKET_H - 8 + hover;
    flame(b, Math.round(b.w / 2), y + ROCKET_H - 1, 0, 1, 7 + Math.round(Math.sin(t / 40) * 1.5), 3, look['trail'], t);
    b.blit(rocket, x, y);
    // a soft glow on the ground under the flame
    b.dither(Math.round(b.w / 2) - 8, gy, 17, 2, P.orange, 0.35 + 0.1 * bayer(t >> 6, 0));
  },
};
