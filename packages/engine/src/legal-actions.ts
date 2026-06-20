// legalActions(state): the concrete, fully-specified actions the current seat may take
// right now (protocol §6). Built alongside each decision kind, never deferred. The client
// renders affordances from this; bots pick from it. Grows one kind per milestone.

import type { GameAction, GameState } from '@ps/shared';
import { legalPlacementActions } from './setup.js';
import { legalAmoebaActions, legalMoveDirections } from './phases/phase1.js';
import { legalFeedActions } from './phases/feeding.js';
import { legalBalanceDefect } from './phases/phase2.js';

export function legalActions(state: GameState): GameAction[] {
  const decision = state.currentDecision;
  if (!decision || state.phase === 'game_over') return [];
  switch (decision.kind) {
    case 'place_starting_amoeba':
      return legalPlacementActions(state, decision.seat);
    case 'amoeba_action':
      return legalAmoebaActions(state, decision.seat);
    case 'choose_move_direction':
      return legalMoveDirections(state);
    case 'amoeba_feed':
      return legalFeedActions(state, decision.seat);
    case 'balance_gene_defect':
      return legalBalanceDefect(state, decision.seat);
    default:
      return [];
  }
}
