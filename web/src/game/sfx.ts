// Sound effects and background music, synthesised with Web Audio: no audio files, works offline.
// One AudioContext with two buses (effects, music), each with its own on/off switch saved in localStorage.
// Browsers only allow audio after a user gesture, so call `audio.unlock()` from a click or key handler.

const SFX_KEY = 'outlier.muted';
const MUSIC_KEY = 'outlier.music';
const store = typeof localStorage !== 'undefined' ? localStorage : null;

class AudioHub {
  private ctx: AudioContext | null = null;
  sfxBus: GainNode | null = null;
  musicBus: GainNode | null = null;

  /** The context, created on first use. Returns null if Web Audio is unavailable. */
  get(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0;
        this.musicBus.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }
  /** Call from a user gesture: creates/resumes the context and starts the music if it's on. */
  unlock(): void {
    if (!this.get()) return;
    music.start();
  }
}
export const audio = new AudioHub();

// ---------------------------------------------------------------- effects
class Sfx {
  muted: boolean;
  constructor() { this.muted = store?.getItem(SFX_KEY) === '1'; }
  setMuted(m: boolean): void { this.muted = m; store?.setItem(SFX_KEY, m ? '1' : '0'); }

  private ac(): AudioContext | null { return this.muted ? null : audio.get(); }

  private noise(ac: AudioContext, dur: number): AudioBufferSourceNode {
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = b; return s;
  }
  private env(ac: AudioContext, node: AudioNode, t0: number, attack: number, peak: number, decay: number): void {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    node.connect(g); g.connect(audio.sfxBus ?? ac.destination);
  }
  private tone(type: OscillatorType, f0: number, f1: number, dur: number, peak = 0.2, delay = 0): void {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(ac, o, t, 0.008, peak, dur); o.start(t); o.stop(t + dur + 0.05);
  }
  private filtered(type: BiquadFilterType, f0: number, f1: number, dur: number, peak: number, q = 1, delay = 0): void {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime + delay, n = this.noise(ac, dur + 0.1), f = ac.createBiquadFilter();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    n.connect(f); this.env(ac, f, t, 0.02, peak, dur); n.start(t); n.stop(t + dur + 0.1);
  }
  private notes(midi: number[], gap: number, len: number, type: OscillatorType = 'square', peak = 0.07): void {
    midi.forEach((m, i) => { const f = 440 * Math.pow(2, (m - 69) / 12); this.tone(type, f, f, len, peak, i * gap); });
  }

  // interface
  click(): void { this.tone('square', 880, 660, 0.04, 0.05); }
  type(): void { this.tone('square', 1200 + Math.random() * 300, 1100, 0.015, 0.018); }
  open(): void { this.notes([72, 79], 0.05, 0.07, 'square', 0.05); }
  close(): void { this.notes([79, 72], 0.05, 0.06, 'square', 0.04); }
  equip(): void { this.notes([76, 83], 0.04, 0.06, 'triangle', 0.12); }
  /** A question: two notes, the second higher ("hm?"). */
  hmm(): void { this.notes([67, 74], 0.11, 0.12, 'triangle', 0.13); }

  // the game
  tick(): void { this.tone('square', 1500, 1500, 0.025, 0.04); }
  /** One step of the tier reveal meter, rising in pitch. */
  step(i: number): void { const f = 330 * Math.pow(1.26, i); this.tone('square', f, f, 0.07, 0.09); }
  pop(): void { this.tone('square', 500, 900, 0.06, 0.08); }
  /** Engine spooling up while the tier reveal plays. */
  ignition(): void { this.filtered('lowpass', 120, 900, 1.6, 0.35, 3); this.tone('sawtooth', 55, 110, 1.6, 0.05); }
  whoosh(dur = 0.8): void { this.filtered('bandpass', 300, 2600, dur, 0.5, 2); this.filtered('lowpass', 200, 60, dur, 0.3, 1); }
  thud(): void { this.tone('sine', 140, 40, 0.3, 0.45); this.filtered('lowpass', 600, 120, 0.25, 0.3); }
  chime(): void { this.notes([84, 88, 91], 0.06, 0.18, 'triangle', 0.1); }
  fanfare(tier: number): void {
    const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, tier + 1);
    notes.forEach((f, i) => this.tone('square', f, f, 0.13, 0.07, i * 0.075));
    if (tier >= 5) [1047, 1319, 1568, 2093].forEach(f => this.tone('triangle', f, f, 0.9, 0.06, notes.length * 0.075 + 0.05));
    if (tier >= 6) window.setTimeout(() => this.unlock(), 700);
  }
  buzz(): void { this.tone('square', 160, 120, 0.22, 0.11); this.tone('square', 107, 90, 0.22, 0.07); }
  sad(): void { [392, 370, 349].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.28, 0.06, i * 0.3)); this.tone('sawtooth', 330, 300, 0.6, 0.06, 0.9); }
  ring(): void { for (let i = 0; i < 8; i++) this.tone('square', 1800, 1800, 0.04, 0.04, i * 0.07); }
  /** End of the day: a little victory tune. */
  dayDone(): void {
    this.notes([72, 76, 79, 84, 79, 84, 88], 0.11, 0.14, 'square', 0.07);
    this.notes([48, 55, 60], 0.33, 0.3, 'triangle', 0.15);
  }
  /** New wardrobe items. */
  unlock(): void { this.notes([79, 83, 86, 91, 95], 0.06, 0.12, 'triangle', 0.12); }
}
export const sfx = new Sfx();

// ---------------------------------------------------------------- music
export type Mood = 'calm' | 'round' | 'flight';

const BPM = 104;
const STEP = 60 / BPM / 4; // a sixteenth note
const BARS = 8;
/** Chords per bar (root as MIDI, minor or major): Am F C G | Am F G E. */
const CHORDS: Array<[number, 'm' | 'M']> = [[57, 'm'], [53, 'M'], [60, 'M'], [55, 'M'], [57, 'm'], [53, 'M'], [55, 'M'], [52, 'M']];
/** Lead melody over the 8 bars: [bar, step, midi, length in steps]. */
const MELODY: Array<[number, number, number, number]> = [
  [0, 0, 76, 3], [0, 4, 74, 2], [0, 6, 72, 2], [0, 8, 69, 6],
  [1, 0, 72, 3], [1, 4, 74, 2], [1, 6, 76, 2], [1, 8, 77, 6],
  [2, 0, 79, 4], [2, 6, 76, 2], [2, 8, 72, 4], [2, 12, 74, 4],
  [3, 0, 71, 6], [3, 8, 74, 4], [3, 12, 79, 4],
  [4, 0, 76, 3], [4, 4, 74, 2], [4, 6, 72, 2], [4, 8, 69, 6],
  [5, 0, 72, 3], [5, 4, 77, 2], [5, 6, 76, 2], [5, 8, 72, 6],
  [6, 0, 71, 4], [6, 4, 74, 4], [6, 8, 79, 6],
  [7, 0, 80, 6], [7, 8, 76, 4], [7, 12, 71, 4],
];
const LEVEL: Record<Mood, number> = { calm: 0.16, round: 0.13, flight: 0.06 };

class Music {
  muted: boolean;
  mood: Mood = 'calm';
  private timer: number | null = null;
  private step = 0;
  private next = 0;

  constructor() { this.muted = store?.getItem(MUSIC_KEY) === '0'; }

  setMuted(m: boolean): void {
    this.muted = m;
    store?.setItem(MUSIC_KEY, m ? '0' : '1');
    if (m) this.stop(); else this.start();
  }
  setMood(m: Mood): void {
    this.mood = m;
    const ac = audio.get(), bus = audio.musicBus;
    if (ac && bus && this.timer !== null) bus.gain.setTargetAtTime(LEVEL[m], ac.currentTime, 0.4);
  }
  start(): void {
    if (this.muted || this.timer !== null || typeof window === 'undefined') return;
    const ac = audio.get(), bus = audio.musicBus;
    if (!ac || !bus) return;
    bus.gain.cancelScheduledValues(ac.currentTime);
    bus.gain.setTargetAtTime(LEVEL[this.mood], ac.currentTime, 0.8);
    this.next = ac.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  stop(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    const ac = audio.get(), bus = audio.musicBus;
    if (ac && bus) bus.gain.setTargetAtTime(0, ac.currentTime, 0.2);
  }

  private schedule(): void {
    const ac = audio.get();
    if (!ac) return;
    // after the tab was hidden (timers throttled) skip ahead instead of playing a burst
    if (this.next < ac.currentTime - 0.2) this.next = ac.currentTime + 0.05;
    while (this.next < ac.currentTime + 0.12) {
      this.play(this.step, this.next);
      this.next += STEP;
      this.step = (this.step + 1) % (BARS * 16);
    }
  }

  private voice(type: OscillatorType, midi: number, t: number, len: number, peak: number, cutoff = 0): void {
    const ac = audio.get(), bus = audio.musicBus;
    if (!ac || !bus) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    if (cutoff) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; o.connect(f); f.connect(g); } else o.connect(g);
    g.connect(bus);
    o.start(t); o.stop(t + len + 0.05);
  }
  private drum(kind: 'kick' | 'snare' | 'hat', t: number): void {
    const ac = audio.get(), bus = audio.musicBus;
    if (!ac || !bus) return;
    const g = ac.createGain();
    g.connect(bus);
    if (kind === 'kick') {
      const o = ac.createOscillator(); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g); o.start(t); o.stop(t + 0.2);
      return;
    }
    const len = kind === 'hat' ? 0.04 : 0.12;
    const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const n = ac.createBufferSource(), f = ac.createBiquadFilter();
    n.buffer = b; f.type = 'highpass'; f.frequency.value = kind === 'hat' ? 7000 : 1500;
    g.gain.setValueAtTime(kind === 'hat' ? 0.18 : 0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(f); f.connect(g); n.start(t); n.stop(t + len);
  }

  private play(step: number, t: number): void {
    const bar = Math.floor(step / 16), s = step % 16;
    const [root, quality] = CHORDS[bar] ?? [57, 'm'];
    const chord = [root, root + (quality === 'm' ? 3 : 4), root + 7];
    const busy = this.mood === 'round';
    // arpeggio: up through the chord and its octave
    const arp = [0, 1, 2, 3, 2, 1, 0, 1][s % 8] ?? 0;
    const note = arp === 3 ? (chord[0] ?? root) + 12 : (chord[arp] ?? root);
    this.voice('square', note + 12, t, STEP * 0.9, busy ? 0.05 : 0.035, 2400);
    // bass
    if (s === 0 || s === 8 || (busy && (s === 6 || s === 14))) this.voice('triangle', root - 12, t, STEP * (busy ? 1.8 : 3.5), 0.32);
    // soft pad at the top of each bar
    if (s === 0 && !busy) for (const n of chord) this.voice('sine', n, t, STEP * 15, 0.05);
    // melody in calm mode
    if (!busy) for (const [mb, ms, midi, len] of MELODY) if (mb === bar && ms === s) this.voice('square', midi, t, STEP * len, 0.045, 1800);
    // drums when a round is running
    if (busy) {
      if (s === 0 || s === 8 || s === 10) this.drum('kick', t);
      if (s === 4 || s === 12) this.drum('snare', t);
      if (s % 2 === 1) this.drum('hat', t);
    } else if (s === 4 || s === 12) this.drum('hat', t);
  }
}
export const music = new Music();
