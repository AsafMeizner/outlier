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
  /** A saucer arrives: a wobbly theremin swoop and three beeps. */
  alien(): void {
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), depth = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(1150, t + 0.7); o.frequency.exponentialRampToValueAtTime(700, t + 1);
    lfo.frequency.value = 11; depth.gain.value = 60; lfo.connect(depth); depth.connect(o.frequency);
    this.env(ac, o, t, 0.05, 0.12, 1); o.start(t); lfo.start(t); o.stop(t + 1.1); lfo.stop(t + 1.1);
    [1320, 990, 1480].forEach((f, i) => this.tone('square', f, f, 0.05, 0.05, 1.05 + i * 0.09));
  }
  /** Tapping the rocket. */
  boop(): void { this.tone('sine', 260, 620, 0.12, 0.18); this.tone('square', 900, 1300, 0.04, 0.03, 0.08); }
  /** A new personal best. */
  record(): void { this.notes([72, 76, 79, 84, 79, 84, 88], 0.09, 0.16, 'square', 0.07); }
}
export const sfx = new Sfx();

// ---------------------------------------------------------------- music
// A small chiptune soundtrack, sequenced live: 4 sections x 8 bars in A minor.
//   menus ('calm'):  A (melody) and D (breakdown) alternate; soft hats, pads, echoing arpeggio
//   a round running: B (build) and C (chorus) alternate; full drums, driving octave bass, chorus lead
//   flight:          whatever is playing, ducked under the launch sounds
// Sections change at their boundaries, so the music never jumps mid-phrase.
export type Mood = 'calm' | 'round' | 'flight';

const BPM = 112;
const STEP = 60 / BPM / 4; // one sixteenth
const BAR = 16;
const SECTION_BARS = 8;
type Section = 'A' | 'B' | 'C' | 'D';
type Chord = [root: number, quality: 'm' | 'M'];
const CHORDS: Record<Section, Chord[]> = {
  A: [[57, 'm'], [53, 'M'], [60, 'M'], [55, 'M'], [57, 'm'], [53, 'M'], [55, 'M'], [52, 'M']],
  B: [[50, 'm'], [57, 'm'], [53, 'M'], [55, 'M'], [50, 'm'], [57, 'm'], [52, 'M'], [52, 'M']],
  C: [[53, 'M'], [55, 'M'], [57, 'm'], [57, 'm'], [53, 'M'], [55, 'M'], [60, 'M'], [52, 'M']],
  D: [[57, 'm'], [52, 'm'], [53, 'M'], [60, 'M'], [50, 'm'], [57, 'm'], [53, 'M'], [55, 'M']],
};
/** [bar, step, midi, length in steps] */
type Note = [number, number, number, number];
const MELODY_A: Note[] = [
  [0, 0, 76, 4], [0, 4, 72, 2], [0, 6, 74, 2], [0, 8, 76, 4], [0, 12, 69, 4],
  [1, 0, 77, 3], [1, 3, 76, 1], [1, 4, 74, 2], [1, 6, 72, 2], [1, 8, 69, 8],
  [2, 0, 79, 4], [2, 4, 76, 2], [2, 6, 72, 2], [2, 8, 74, 4], [2, 12, 76, 4],
  [3, 0, 74, 6], [3, 6, 71, 2], [3, 8, 67, 8],
  [4, 0, 76, 2], [4, 2, 76, 2], [4, 4, 81, 4], [4, 8, 79, 2], [4, 10, 76, 2], [4, 12, 72, 4],
  [5, 0, 77, 4], [5, 4, 81, 4], [5, 8, 79, 2], [5, 10, 77, 2], [5, 12, 76, 4],
  [6, 0, 74, 3], [6, 3, 76, 1], [6, 4, 77, 2], [6, 6, 79, 2], [6, 8, 71, 4], [6, 12, 74, 4],
  [7, 0, 76, 8], [7, 8, 68, 4], [7, 12, 71, 4],
];
const MELODY_C: Note[] = [
  [0, 0, 81, 2], [0, 2, 81, 2], [0, 4, 79, 2], [0, 6, 77, 2], [0, 8, 76, 4], [0, 12, 72, 4],
  [1, 0, 71, 2], [1, 2, 74, 2], [1, 4, 79, 4], [1, 8, 77, 2], [1, 10, 76, 2], [1, 12, 74, 4],
  [2, 0, 72, 2], [2, 2, 76, 2], [2, 4, 81, 6], [2, 10, 79, 2], [2, 12, 76, 4],
  [3, 0, 81, 8], [3, 8, 83, 4], [3, 12, 84, 4],
  [4, 0, 84, 4], [4, 4, 81, 4], [4, 8, 77, 4], [4, 12, 81, 4],
  [5, 0, 83, 4], [5, 4, 79, 4], [5, 8, 74, 4], [5, 12, 79, 4],
  [6, 0, 76, 2], [6, 2, 79, 2], [6, 4, 84, 6], [6, 10, 83, 2], [6, 12, 79, 4],
  [7, 0, 80, 8], [7, 8, 76, 4], [7, 12, 71, 4],
];
/** Echo of the A melody, an octave down and twice as slow, for the breakdown. */
const MELODY_D: Note[] = MELODY_A.filter(([bar]) => bar < 4).map(([bar, step, midi, len]) => [bar * 2 + Math.floor(step / 8), (step * 2) % BAR, midi - 12, len * 2]);
const LEVEL: Record<Mood, number> = { calm: 0.5, round: 0.45, flight: 0.18 };

class Music {
  muted: boolean;
  mood: Mood = 'calm';
  private timer: number | null = null;
  private next = 0;
  private step = 0;
  private section: Section = 'A';
  private master: GainNode | null = null;
  private echo: GainNode | null = null;
  private pulse: Record<'p12' | 'p25' | 'p50', PeriodicWave> | null = null;
  private noiseBuf: AudioBuffer | null = null;

  constructor() { this.muted = store?.getItem(MUSIC_KEY) === '0'; }

  setMuted(m: boolean): void {
    this.muted = m;
    store?.setItem(MUSIC_KEY, m ? '0' : '1');
    if (m) this.stop(); else this.start();
  }
  setMood(m: Mood): void {
    this.mood = m;
    const ac = audio.get();
    if (ac && this.master && this.timer !== null) this.master.gain.setTargetAtTime(LEVEL[m], ac.currentTime, 0.5);
  }
  start(): void {
    if (this.muted || this.timer !== null || typeof window === 'undefined') return;
    const ac = audio.get(), bus = audio.musicBus;
    if (!ac || !bus) return;
    this.build(ac, bus);
    bus.gain.cancelScheduledValues(ac.currentTime);
    bus.gain.setTargetAtTime(0.32, ac.currentTime, 0.8);
    this.master?.gain.setTargetAtTime(LEVEL[this.mood], ac.currentTime, 0.5);
    this.next = ac.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  stop(): void {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    const ac = audio.get(), bus = audio.musicBus;
    if (ac && bus) bus.gain.setTargetAtTime(0, ac.currentTime, 0.2);
  }

  /** The mixing graph: voices -> master -> compressor -> bus, plus an echo send. */
  private build(ac: AudioContext, bus: GainNode): void {
    if (this.master) return;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.2;
    comp.connect(bus);
    this.master = ac.createGain();
    this.master.gain.value = 0;
    this.master.connect(comp);
    // echo: a dotted-eighth delay with feedback, darkened a little each repeat
    const delay = ac.createDelay(1), fb = ac.createGain(), tone = ac.createBiquadFilter(), wet = ac.createGain();
    delay.delayTime.value = STEP * 3; fb.gain.value = 0.38; tone.type = 'lowpass'; tone.frequency.value = 2600; wet.gain.value = 0.32;
    this.echo = ac.createGain();
    this.echo.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay); tone.connect(wet); wet.connect(this.master);
    // pulse waves (12.5%, 25%, 50% duty), the classic chip timbres
    const wave = (duty: number): PeriodicWave => {
      const n = 48, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) { re[k] = Math.sin(2 * Math.PI * k * duty) / (k * Math.PI); im[k] = (1 - Math.cos(2 * Math.PI * k * duty)) / (k * Math.PI); }
      return ac.createPeriodicWave(re, im);
    };
    this.pulse = { p12: wave(0.125), p25: wave(0.25), p50: wave(0.5) };
    this.noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  private schedule(): void {
    const ac = audio.get();
    if (!ac) return;
    // after the tab was hidden (timers throttled) skip ahead instead of playing a burst
    if (this.next < ac.currentTime - 0.2) this.next = ac.currentTime + 0.05;
    while (this.next < ac.currentTime + 0.15) {
      this.play(this.step, this.next);
      this.next += STEP;
      this.step++;
      if (this.step >= SECTION_BARS * BAR) { this.step = 0; this.section = this.nextSection(); }
    }
  }
  private nextSection(): Section {
    const busy = this.mood !== 'calm';
    if (busy) return this.section === 'C' ? 'B' : this.section === 'B' ? 'C' : 'B';
    return this.section === 'A' ? 'D' : 'A';
  }

  // ---------- voices ----------
  private hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);
  private env(g: GainNode, t: number, a: number, peak: number, sustain: number, len: number, rel: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t + a + 0.08);
    g.gain.setValueAtTime(Math.max(0.0001, peak * sustain), t + Math.max(a + 0.08, len));
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + rel);
  }
  private lead(midi: number, t: number, len: number, peak: number): void {
    const ac = audio.get();
    if (!ac || !this.master || !this.pulse || !this.echo) return;
    const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), depth = ac.createGain();
    o.setPeriodicWave(this.pulse.p25); o.frequency.value = this.hz(midi);
    // vibrato fades in on held notes
    lfo.frequency.value = 5.6; depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(this.hz(midi) * 0.006, t + Math.min(0.3, len));
    lfo.connect(depth); depth.connect(o.frequency);
    this.env(g, t, 0.012, peak, 0.7, len, 0.09);
    o.connect(g); g.connect(this.master); g.connect(this.echo);
    o.start(t); lfo.start(t); o.stop(t + len + 0.15); lfo.stop(t + len + 0.15);
  }
  private arp(midi: number, t: number, peak: number): void {
    const ac = audio.get();
    if (!ac || !this.master || !this.pulse || !this.echo) return;
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
    o.setPeriodicWave(this.pulse.p12); o.frequency.value = this.hz(midi);
    f.type = 'lowpass'; f.frequency.value = 3200;
    this.env(g, t, 0.005, peak, 0.3, STEP * 0.7, 0.05);
    o.connect(f); f.connect(g); g.connect(this.master); g.connect(this.echo);
    o.start(t); o.stop(t + STEP + 0.1);
  }
  private bass(midi: number, t: number, len: number, peak: number): void {
    const ac = audio.get();
    if (!ac || !this.master || !this.pulse) return;
    const o = ac.createOscillator(), sq = ac.createOscillator(), g = ac.createGain(), gs = ac.createGain();
    o.type = 'triangle'; o.frequency.value = this.hz(midi);
    sq.setPeriodicWave(this.pulse.p50); sq.frequency.value = this.hz(midi); gs.gain.value = 0.18;
    this.env(g, t, 0.006, peak, 0.8, len, 0.04);
    o.connect(g); sq.connect(gs); gs.connect(g); g.connect(this.master);
    o.start(t); sq.start(t); o.stop(t + len + 0.1); sq.stop(t + len + 0.1);
  }
  private pad(chord: number[], t: number, len: number, peak: number): void {
    const ac = audio.get();
    if (!ac || !this.master) return;
    const f = ac.createBiquadFilter(), g = ac.createGain();
    f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.35); g.gain.setValueAtTime(peak, t + len - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.4);
    f.connect(g); g.connect(this.master);
    for (const n of chord) for (const cents of [-7, 7]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.hz(n); o.detune.value = cents;
      o.connect(f); o.start(t); o.stop(t + len + 0.5);
    }
  }
  private drum(kind: 'kick' | 'snare' | 'hat' | 'open' | 'crash', t: number, vel = 1): void {
    const ac = audio.get();
    if (!ac || !this.master || !this.noiseBuf) return;
    const g = ac.createGain();
    g.connect(this.master);
    if (kind === 'kick') {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
      g.gain.setValueAtTime(0.95 * vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g); o.start(t); o.stop(t + 0.25);
      return;
    }
    const len = { snare: 0.16, hat: 0.035, open: 0.16, crash: 1.2 }[kind];
    const n = ac.createBufferSource(), f = ac.createBiquadFilter();
    n.buffer = this.noiseBuf;
    f.type = kind === 'snare' ? 'bandpass' : 'highpass';
    f.frequency.value = kind === 'snare' ? 1900 : kind === 'crash' ? 5000 : 8000;
    const peak = { snare: 0.55, hat: 0.16, open: 0.14, crash: 0.22 }[kind] * vel;
    g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(f); f.connect(g); n.start(t, Math.random() * 0.5); n.stop(t + len);
    if (kind === 'snare') {
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
      og.gain.setValueAtTime(0.35 * vel, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.12);
    }
  }

  // ---------- the arrangement ----------
  private play(step: number, t: number): void {
    const bar = Math.floor(step / BAR), s = step % BAR, sec = this.section;
    const [root, quality] = CHORDS[sec][bar] ?? [57, 'm'];
    const chord = [root, root + (quality === 'm' ? 3 : 4), root + 7];
    const busy = this.mood !== 'calm';
    const fillBar = bar === SECTION_BARS - 1;

    // pads: every bar in the calm sections, every other bar under the busy ones
    if (s === 0 && (sec === 'A' || sec === 'D' || bar % 2 === 0)) this.pad(chord, t, STEP * BAR * (sec === 'A' || sec === 'D' ? 1 : 2), sec === 'D' ? 0.05 : 0.035);

    // arpeggio: eighths when calm, sixteenths when busy, up and down through the chord
    const arpEvery = busy ? 1 : 2;
    if (s % arpEvery === 0 && sec !== 'D') {
      const shape = [0, 1, 2, 3, 2, 1][(s / arpEvery) % 6] ?? 0;
      const n = shape === 3 ? root + 12 : (chord[shape] ?? root);
      this.arp(n + 12, t, busy ? 0.05 : 0.04);
    } else if (sec === 'D' && s % 4 === 0) this.arp((chord[(s / 4) % 3] ?? root) + 12, t, 0.035);

    // bass: long roots when calm; a driving octave bounce when busy
    if (busy) { if (s % 2 === 0) this.bass(root - 12 + (s % 4 === 2 ? 12 : 0), t, STEP * 1.6, 0.42); }
    else if (s === 0 || s === 10) this.bass(root - 12, t, STEP * (s === 0 ? 9 : 5), 0.36);

    // lead melody
    const melody = sec === 'A' ? MELODY_A : sec === 'C' ? MELODY_C : sec === 'D' ? MELODY_D : null;
    if (melody) for (const [mb, ms, midi, len] of melody) if (mb === bar && ms === s) this.lead(midi, t, STEP * len, sec === 'D' ? 0.05 : 0.075);
    // B builds tension: long held notes climbing the chord tones
    if (sec === 'B' && s === 0) this.lead((chord[bar % 3] ?? root) + 12, t, STEP * 12, 0.045);

    // drums
    if (busy && sec !== 'D') {
      if (s === 0 && bar === 0) this.drum('crash', t);
      if (s === 0 || s === 8 || (s === 10 && bar % 2 === 1)) this.drum('kick', t);
      if (s === 4 || s === 12) this.drum('snare', t);
      if (fillBar && s >= 12) this.drum('snare', t, 0.5 + (s - 12) * 0.15);
      if (s % 2 === 1) this.drum('hat', t, 0.8);
      if (s === 14 && sec === 'C') this.drum('open', t);
    } else if (sec === 'A') {
      if (s === 4 || s === 12) this.drum('hat', t, 0.7);
      if (s === 0 && bar % 2 === 0) this.drum('kick', t, 0.45);
    }
  }
}
export const music = new Music();
