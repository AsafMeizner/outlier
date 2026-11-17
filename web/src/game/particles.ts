import { INK, poly } from './draw.ts';

export type ParticleType = 'dust' | 'shard' | 'paper' | 'square' | 'confetti' | 'drop' | 'bubble' | 'spark' | 'ring';

export interface Particle {
  type: ParticleType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravity, px/s². */
  g: number;
  life: number;
  age: number;
  rot: number;
  vr: number;
  size: number;
  color?: string;
}
export type ParticleInit = Partial<Particle> & Pick<Particle, 'type' | 'x' | 'y'>;

const MAX = 500;

export class Particles {
  private list: Particle[] = [];

  add(p: ParticleInit): void {
    this.list.push({ vx: 0, vy: 0, g: 0, life: 1000, age: 0, rot: 0, vr: 0, size: 8, ...p });
    if (this.list.length > MAX) this.list.shift();
  }

  burst(n: number, make: (i: number) => ParticleInit): void { for (let i = 0; i < n; i++) this.add(make(i)); }

  step(dt: number): void {
    for (const p of this.list) { p.age += dt; p.vy += p.g * dt / 1000; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.rot += p.vr * dt / 1000; }
    this.list = this.list.filter(p => p.age < p.life);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const k = 1 - p.age / p.life, s = p.size;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, k * 1.6);
      switch (p.type) {
        case 'dust': { const d = s * (1.6 - k); ctx.fillStyle = p.color ?? '#e9dcc3'; ctx.fillRect(-d / 2, -d / 2, d, d); break; }
        case 'shard': poly(ctx, [[0, -s], [s * 0.7, s], [-s * 0.6, s * 0.4]], 'rgba(191,232,255,.9)', 1.5); break;
        case 'paper': ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.fillRect(-9, -12, 18, 24); ctx.strokeRect(-9, -12, 18, 24); break;
        case 'square': ctx.fillStyle = p.color ?? '#fff'; ctx.fillRect(-s / 2, -s / 2, s, s); break;
        case 'confetti': ctx.fillStyle = p.color ?? '#fff'; ctx.fillRect(-s / 2, -s / 4, s, s / 2); break;
        case 'drop': ctx.fillStyle = p.color ?? '#4fc3f7'; ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); break;
        case 'bubble': ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke(); break;
        case 'spark': ctx.fillStyle = p.color ?? '#ffd166'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? s * 0.45 : s; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); break;
        case 'ring': ctx.globalAlpha = k; ctx.strokeStyle = p.color ?? '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, s * (1.4 - k), 0, Math.PI * 2); ctx.stroke(); break;
      }
      ctx.restore();
    }
  }
}
