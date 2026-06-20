// The serializable GameState and its sub-shapes.
// Mirrors docs/state-model-and-protocol.md §4–§5 exactly. JSON-serializable only:
// no Map/Set/class instances/functions/undefined-as-data. Keyed collections are
// Record<string, T>; ordered collections are arrays.

import type {
  AmoebaId,
  CellId,
  Color,
  Direction,
  EnvCardId,
  GeneId,
  Phase,
  PlayerId,
} from './ids.js';

export interface Cell {
  id: CellId;
  col: number; // 0..4
  row: number; // 0..4
  cubes: Partial<Record<Color, number>>; // per-color count; omit a color when 0
}

export interface Amoeba {
  id: AmoebaId; // 1..7
  location: CellId | null; // null = off-board (in the player's supply)
  dp: number; // damage points (0+); meaningful only on-board
}

export interface PlayerState {
  id: PlayerId;
  color: Color;
  kind: 'human' | 'bot'; // 'bot' reserved for the 2-player variant; always 'human' in v1
  connected: boolean; // server-maintained; not used by the engine
  bp: number; // biological points
  genes: GeneId[]; // owned genes (no duplicates)
  amoebas: Amoeba[]; // length 7; off-board ones have location null
  score: number; // ladder position (starts at the assigned start space 1..4)
}

export interface EnvCard {
  id: EnvCardId;
  ozoneThickness: number;
  drift: Direction | 'none'; // 'none' = no drift this round
}

// ── Decision-point model (protocol §5) ──────────────────────────────────────

export type DecisionKind =
  // setup
  | 'place_starting_amoeba'
  // phase 1
  | 'amoeba_action'
  | 'amoeba_feed'
  | 'choose_move_direction'
  | 'struggle_target'
  | 'attack_response'
  // phase 2
  | 'balance_gene_defect'
  // phase 3
  | 'buy_genes'
  // phase 4
  | 'divide_amoebas'
  // phase 5
  | 'aggression_target'
  | 'aggression_response';

export interface PlaceStartingAmoebaContext {
  placementOrdinal: number; // 1-based index in the ascending-then-descending setup order
}
export interface AmoebaActionContext {
  amoebaId: AmoebaId;
  cellId: CellId;
  driftDirection: Direction | 'none';
  moveCostBp: number;
}
export interface FeedContext {
  amoebaId: AmoebaId;
  cellId: CellId;
}
export interface MoveDirectionContext {
  amoebaId: AmoebaId;
  cellId: CellId;
  // Engine bookkeeping carried across the choose_move_direction sub-decision (protocol §5
  // leaves sub-choice sequencing to the engine). `allowedDirections` are the legal
  // set_move_direction choices; the rest let the engine finish the move (and any SPEED
  // second move / TENTACLE carry) once a direction is picked.
  allowedDirections: Direction[];
  stepBpSpent: number; // bp already spent for this step (reported in the moved event)
  rollForEvent: number; // die value to report in the moved event (0 if no die was drawn)
  carry?: Partial<Record<Color, number>>; // TENTACLE cubes to carry with this step
  freeMovesOwed: number; // SPEED: free move-steps still owed after this one completes
}
export interface StruggleTargetContext {
  attackerId: AmoebaId;
  cellId: CellId;
}
export interface AttackResponseContext {
  attackerSeat: PlayerId;
  attackerId: AmoebaId;
  defenderId: AmoebaId;
  cellId: CellId;
  phase: 'phase1' | 'phase5';
  kind: 'struggle' | 'aggression';
}
export interface DefectContext {
  excessMp: number; // must balance this many points (locked-in value)
}
export interface BuyGenesContext {
  // Genes this seat has bought during THIS Phase 3 visit. Used to enforce the rule that a
  // basic gene must be held a full prior round before it can be upgraded (spec §8); the
  // concrete buy options are in legalActions.
  boughtThisRound: GeneId[];
}
export interface DivideAmoebasContext {
  // options are in legalActions
  placeholder?: never;
}
export interface AggressionTargetContext {
  cellId?: CellId; // optional framing; full options in legalActions
}
export interface AggressionResponseContext {
  attackerSeat: PlayerId;
  attackerId: AmoebaId;
  defenderId: AmoebaId;
  cellId: CellId;
}

export type DecisionContext =
  | PlaceStartingAmoebaContext
  | AmoebaActionContext
  | FeedContext
  | MoveDirectionContext
  | StruggleTargetContext
  | AttackResponseContext
  | DefectContext
  | BuyGenesContext
  | DivideAmoebasContext
  | AggressionTargetContext
  | AggressionResponseContext;

export interface CurrentDecision {
  seat: PlayerId; // whose input is required
  kind: DecisionKind;
  context: DecisionContext; // kind-specific framing
}

// ── GameState ────────────────────────────────────────────────────────────────

export interface GameState {
  schemaVersion: number; // bump on breaking shape changes
  variant: 'standard' | 'two_player_bots';
  playerCount: number; // 3 (MVP) or 4
  colorsInPlay: Color[];

  round: number; // 1-based; 0 during setup
  phase: Phase;

  board: Record<CellId, Cell>; // exactly the 24 playable cells
  supply: Record<Color, number>; // off-board cubes remaining, per color (global limit 55 each)

  players: Record<PlayerId, PlayerState>;
  seatOrder: PlayerId[]; // fixed seat order (creation order)
  turnOrder: PlayerId[]; // resolved order for the ACTIVE phase (derived-but-cached)

  environment: {
    current: EnvCard;
    deckRemaining: EnvCardId[]; // face-down, in draw order
    discarded: EnvCardId[];
  };

  currentDecision: CurrentDecision | null; // null only when phase === 'game_over'
  winner: PlayerId | null;
}

export const SCHEMA_VERSION = 1;
