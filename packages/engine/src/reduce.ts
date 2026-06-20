// The engine entry point: reduce(state, action, rng) -> ReduceResult (architecture §6).
// Pure: clones the input, applies the action that resolves the current decision, then
// auto-advances through deterministic steps until the next required decision. The
// dispatch grows one decision kind per milestone.

import type { GameAction, GameEvent, GameState } from '@ps/shared';
import type { Rng } from './rng.js';
import type { ReduceResult } from './types.js';
import { cloneState } from './state-helpers.js';
import { applyPlaceStartingAmoeba } from './setup.js';
import { applyAmoebaAction, applySetMoveDirection } from './phases/phase1.js';
import { applyFeed } from './phases/feeding.js';
import { applyBalanceDefect } from './phases/phase2.js';

function applyAction(
  state: GameState,
  action: GameAction,
  rng: Rng,
  events: GameEvent[],
): string | null {
  const decision = state.currentDecision!;
  switch (decision.kind) {
    case 'place_starting_amoeba':
      if (action.type !== 'place_starting_amoeba') {
        return `expected place_starting_amoeba, got ${action.type}`;
      }
      return applyPlaceStartingAmoeba(state, action, events);

    case 'amoeba_action':
      if (action.type !== 'drift' && action.type !== 'stay' && action.type !== 'move') {
        return `expected drift/stay/move, got ${action.type}`;
      }
      return applyAmoebaAction(state, action, rng, events);

    case 'choose_move_direction':
      if (action.type !== 'set_move_direction') {
        return `expected set_move_direction, got ${action.type}`;
      }
      return applySetMoveDirection(state, action, rng, events);

    case 'amoeba_feed':
      if (action.type !== 'feed') return `expected feed, got ${action.type}`;
      return applyFeed(state, action, events);

    case 'balance_gene_defect':
      if (action.type !== 'balance_defect') return `expected balance_defect, got ${action.type}`;
      return applyBalanceDefect(state, action, events);

    // Later decision kinds (buy_genes, …) land in M6+.
    default:
      return `decision kind '${decision.kind}' is not yet implemented`;
  }
}

export function reduce(state: GameState, action: GameAction, rng: Rng): ReduceResult {
  if (state.phase === 'game_over' || !state.currentDecision) {
    return { ok: false, reason: 'no decision is pending' };
  }
  const next = cloneState(state);
  const events: GameEvent[] = [];
  const err = applyAction(next, action, rng, events);
  if (err) return { ok: false, reason: err };
  return { ok: true, state: next, events };
}
