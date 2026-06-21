// The GameAction catalog. Mirrors docs/state-model-and-protocol.md §6 exactly.

import type { AmoebaId, CellId, Color, Direction, GeneId, PlayerId } from './ids.js';

export type GameAction =
  // setup
  | { type: 'place_starting_amoeba'; amoebaId: AmoebaId; cellId: CellId }

  // phase 1 — movement
  // `carry` (TENTACLE) is the engine encoding of the cube-carrying sub-choice the
  // protocol (§5) leaves to the engine; absent/empty for amoebas without TENTACLE.
  | { type: 'drift'; amoebaId: AmoebaId; carry?: Partial<Record<Color, number>> }
  | { type: 'stay'; amoebaId: AmoebaId }
  | { type: 'move'; amoebaId: AmoebaId; carry?: Partial<Record<Color, number>> }
  | { type: 'set_move_direction'; amoebaId: AmoebaId; direction: Direction }

  // phase 1 — feeding
  | { type: 'feed'; amoebaId: AmoebaId; eat: Partial<Record<Color, number>> }

  // phase 2
  | { type: 'balance_defect'; giveUp: GeneId[]; payBp: number }

  // phase 3
  | { type: 'buy_gene'; gene: GeneId; upgradeFrom?: GeneId }
  | { type: 'pass_buying' }

  // phase 4
  | { type: 'divide'; newAmoebaId: AmoebaId; cellId: CellId }
  | { type: 'pass_division' }

  // full-ruleset — combat & reactive
  | { type: 'struggle_attack'; attackerId: AmoebaId; targetSeat: PlayerId; targetAmoebaId: AmoebaId }
  | { type: 'respond_defense' }
  | { type: 'respond_escape'; direction?: Direction }
  | { type: 'respond_none' }
  | { type: 'aggression_attack'; attackerId: AmoebaId; targetSeat: PlayerId; targetAmoebaId: AmoebaId }
  | { type: 'aggression_pass' };

export type GameActionType = GameAction['type'];
