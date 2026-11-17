// Sound effects synthesised with Web Audio: no audio files, works offline.

const MUTE_KEY = 'outlier.muted';

class Sfx {
  muted: boolean;
  private ctx: AudioContext | null = null;

  constructor() {
    this.muted = typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1';
  }

  setMuted(m: boolean): void {
    this.muted = m;
    localStorage.setItem(MUTE_KEY, m ? '1' : '0');
  }

  private ac(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) { try { this.ctx = new AudioContext(); } catch { return null; } }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

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
    node.connect(g); g.connect(ac.destination);
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

  /** One step of the tier reveal meter, rising in pitch. */
  step(i: number): void { const f = 330 * Math.pow(1.26, i); this.tone('square', f, f, 0.07, 0.09); }
  /** The reveal meter locking on a tier. */
  lock(tier: number): void { [0, 4, 7, 12].slice(0, Math.max(2, tier - 1)).forEach((n, i) => { const f = 523 * Math.pow(2, n / 12); this.tone('square', f, f, 0.12, 0.08, i * 0.06); }); }
  whoosh(dur = 0.8): void { this.filtered('bandpass', 300, 2600, dur, 0.5, 2); }
  crash(): void { this.filtered('highpass', 2500, 6000, 0.5, 0.4); for (let i = 0; i < 6; i++) this.tone('sine', 2200 + Math.random() * 3000, 1800 + Math.random() * 2000, 0.25, 0.05, i * 0.04); }
  thud(): void { this.tone('sine', 140, 40, 0.3, 0.55); this.filtered('lowpass', 600, 120, 0.25, 0.35); }
  splash(): void { this.filtered('lowpass', 2500, 300, 0.8, 0.45); this.tone('sine', 600, 200, 0.2, 0.07, 0.05); }
  boing(): void { this.tone('sine', 180, 520, 0.25, 0.25); this.tone('sine', 520, 260, 0.3, 0.12, 0.2); }
  fanfare(tier: number): void {
    const notes = [523, 659, 784, 1047, 1319, 1568].slice(0, tier + 1);
    notes.forEach((f, i) => this.tone('square', f, f, 0.13, 0.07, i * 0.075));
    if (tier >= 5) [1047, 1319, 1568, 2093].forEach(f => this.tone('triangle', f, f, 0.9, 0.06, notes.length * 0.075 + 0.05));
  }
  buzz(): void { this.tone('square', 160, 120, 0.22, 0.11); this.tone('square', 107, 90, 0.22, 0.07); }
  tick(): void { this.tone('square', 1500, 1500, 0.025, 0.04); }
  sad(): void { [392, 370, 349].forEach((f, i) => this.tone('sawtooth', f, f * 0.98, 0.28, 0.06, i * 0.3)); this.tone('sawtooth', 330, 300, 0.6, 0.06, 0.9); }
  pop(): void { this.tone('square', 500, 900, 0.06, 0.08); }
  ring(): void { for (let i = 0; i < 8; i++) this.tone('square', 1800, 1800, 0.04, 0.04, i * 0.07); }
}

export const sfx = new Sfx();
