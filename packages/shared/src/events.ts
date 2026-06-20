// The GameEvent catalog. Mirrors docs/state-model-and-protocol.md §7 exactly.
// Events explain the delta of a transition; they are never required to reconstruct state.

import type { AmoebaId, CellId, Color, GeneId, Phase, PlayerId } from './ids.js';
import type { EnvCard } from './state.js';

export type GameEvent =
  | { type: 'phase_changed'; phase: Phase; round: number }
  | { type: 'turn_changed'; seat: PlayerId }
  | { type: 'environment_revealed'; card: EnvCard }
  | { type: 'amoeba_placed'; seat: PlayerId; amoebaId: AmoebaId; cellId: CellId }
  | { type: 'drifted'; seat: PlayerId; amoebaId: AmoebaId; from: CellId; to: CellId }
  | { type: 'moved'; seat: PlayerId; amoebaId: AmoebaId; from: CellId; to: CellId; roll: number; bpSpent: number }
  | { type: 'stayed'; seat: PlayerId; amoebaId: AmoebaId; cellId: CellId; reason: 'no_drift' | 'obstacle' | 'roll5' | 'holding' }
  | { type: 'fed'; seat: PlayerId; amoebaId: AmoebaId; cellId: CellId; ate: Partial<Record<Color, number>>; excreted: Partial<Record<Color, number>> }
  | { type: 'starved'; seat: PlayerId; amoebaId: AmoebaId; cellId: CellId }
  | { type: 'gene_bought'; seat: PlayerId; gene: GeneId; cost: number; gaveUp: GeneId | null }
  | { type: 'defect_balanced'; seat: PlayerId; gaveUp: GeneId[]; bpPaid: number }
  | { type: 'divided'; seat: PlayerId; newAmoebaId: AmoebaId; cellId: CellId; cost: number }
  | { type: 'died'; seat: PlayerId; amoebaId: AmoebaId; cellId: CellId; cause: 'natural' | 'struggle' | 'aggression' | 'fight' }
  | { type: 'scored'; seat: PlayerId; from: number; to: number; amoebaSpaces: number; geneSpaces: number }
  | { type: 'game_over'; winner: PlayerId; finalScores: Record<PlayerId, number> }
  // full-ruleset combat
  | { type: 'attacked'; seat: PlayerId; amoebaId: AmoebaId; targetSeat: PlayerId; targetAmoebaId: AmoebaId; kind: 'struggle' | 'aggression' }
  | { type: 'defended'; seat: PlayerId; outcome: 'attacker_won' | 'defender_won' }
  | { type: 'escaped'; seat: PlayerId; amoebaId: AmoebaId; from: CellId; to: CellId };

export type GameEventType = GameEvent['type'];
