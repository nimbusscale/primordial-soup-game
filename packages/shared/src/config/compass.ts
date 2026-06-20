// The Compass: die-roll → direction mapping (spec §3, with the implementer note).
// 1=W, 2=N, 3=E, 4=S, 5=stay, 6=free choice.

import type { Direction } from '../ids.js';

export type CompassResult =
  | { kind: 'direction'; direction: Direction }
  | { kind: 'stay' }
  | { kind: 'free_choice' };

export const COMPASS: Readonly<Record<number, CompassResult>> = {
  1: { kind: 'direction', direction: 'W' },
  2: { kind: 'direction', direction: 'N' },
  3: { kind: 'direction', direction: 'E' },
  4: { kind: 'direction', direction: 'S' },
  5: { kind: 'stay' },
  6: { kind: 'free_choice' },
};

export function compassResult(roll: number): CompassResult {
  const r = COMPASS[roll];
  if (!r) throw new Error(`invalid die roll: ${roll}`);
  return r;
}
