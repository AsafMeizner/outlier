// Rarity tiers. Points are what the server stores; the game shows them as launch distance (1 point = 10 m).

export type TierId = 1 | 2 | 3 | 4 | 5;

export interface Tier {
  id: TierId;
  name: string;
  points: number;
}

export const TIERS: readonly Tier[] = [
  { id: 1, name: 'Mainstream', points: 10 },
  { id: 2, name: 'Familiar', points: 25 },
  { id: 3, name: 'Uncommon', points: 50 },
  { id: 4, name: 'Rare', points: 75 },
  { id: 5, name: 'Outlier', points: 100 },
];

export const METERS_PER_POINT = 10;

export function tierById(id: number): Tier | undefined {
  return TIERS.find(t => t.id === id);
}

export function pointsFor(id: number): number {
  return tierById(id)?.points ?? 0;
}

export function isTierId(n: unknown): n is TierId {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5;
}
