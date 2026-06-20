// Phase 1 — Movement and Feeding (spec §6 Phase 1, Ascending Order).
// M2 lands only the entry point (begin Phase 1 and issue the first amoeba_action
// decision). Movement resolution arrives in M3 and feeding in M4.

import type { Amoeba, GameEvent, GameState, PlayerId } from '@ps/shared';
import { MOVE_COST_BP } from '@ps/shared';
import { ascendingOrder } from '../turn-order.js';
import { onBoardAmoebas } from '../state-helpers.js';

/** The lowest-id on-board amoeba for a seat, or undefined if none. */
function firstAmoeba(state: GameState, seat: PlayerId): Amoeba | undefined {
  return onBoardAmoebas(state.players[seat]!).sort((a, b) => a.id - b.id)[0];
}

/**
 * Issue an amoeba_action decision for a specific amoeba. Drift direction comes from the
 * current environment card. (Movement-gene cost adjustments land in M3.)
 */
export function issueAmoebaAction(
  state: GameState,
  seat: PlayerId,
  amoeba: Amoeba,
  events: GameEvent[],
): void {
  state.currentDecision = {
    seat,
    kind: 'amoeba_action',
    context: {
      amoebaId: amoeba.id,
      cellId: amoeba.location!,
      driftDirection: state.environment.current.drift,
      moveCostBp: MOVE_COST_BP,
    },
  };
  events.push({ type: 'turn_changed', seat });
}

/**
 * Enter round 1, Phase 1. Sets the phase/round/turnOrder and issues the first
 * amoeba_action for the first actor in ascending order.
 */
export function beginPhase1(state: GameState, events: GameEvent[]): void {
  state.round = 1;
  state.phase = 'phase1_movement_feeding';
  state.turnOrder = ascendingOrder(state);
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });

  for (const seat of state.turnOrder) {
    const amoeba = firstAmoeba(state, seat);
    if (amoeba) {
      issueAmoebaAction(state, seat, amoeba, events);
      return;
    }
  }
  // No on-board amoebas anywhere (not reachable after setup, which places two each).
  state.currentDecision = null;
}
