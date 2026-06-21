// Engine-level types (architecture §6). The engine contract is
//   reduce(state, action, rng) -> ReduceResult
//   legalActions(state) -> GameAction[]
//   createInitialState(opts, rng) -> GameState

import type { Color, GameEvent, GameState, PlayerId } from '@ps/shared';

export type ReduceResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; reason: string };

export interface SetupOptions {
  playerCount: number;
  variant?: 'standard' | 'two_player_bots';
  /** Colors per seat (defaults to the first `playerCount` of red, green, blue, yellow). */
  colors?: Color[];
  /** Seat ids (defaults to "seat-0" … "seat-(N-1)"). */
  seatIds?: PlayerId[];
  /** Seat kinds (defaults to all 'human'). */
  seatKinds?: Record<PlayerId, 'human' | 'bot'>;
}
