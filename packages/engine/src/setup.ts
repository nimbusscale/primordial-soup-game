// Setup and initial state (spec §4). createInitialState builds a deterministic active
// game resting on the first `place_starting_amoeba` decision; the engine then resolves
// placements (ascending then descending) and auto-advances into round 1, Phase 1.

import type {
  Color,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  PlayerState,
} from '@ps/shared';
import {
  ALL_COLORS,
  BOARD_CELLS,
  CUBES_PER_COLOR_TOTAL,
  ENV_CARDS,
  isPlayableCell,
  MAX_AMOEBAS_PER_PLAYER,
  playerCountConfig,
  SCHEMA_VERSION,
  SETUP_CUBES_PER_CELL_PER_COLOR,
  STARTING_BP,
} from '@ps/shared';
import type { Rng } from './rng.js';
import type { SetupOptions } from './types.js';
import { getPlayer, occupantsOf, onBoardAmoebas } from './state-helpers.js';
import { ascendingOrder, descendingOrder } from './turn-order.js';
import { beginPhase1 } from './phases/phase1.js';

function emptyAmoebas(): PlayerState['amoebas'] {
  const out: PlayerState['amoebas'] = [];
  for (let id = 1; id <= MAX_AMOEBAS_PER_PLAYER; id++) {
    out.push({ id, location: null, dp: 0 });
  }
  return out;
}

/**
 * Build a deterministic active game in `setup`. Rolls the opening dice (spec §4 step 6)
 * to resolve play order and assign start spaces, then issues the first placement decision.
 */
export function createInitialState(opts: SetupOptions, rng: Rng): GameState {
  const pc = opts.playerCount;
  const cfg = playerCountConfig(pc);
  const colors: Color[] = opts.colors ?? ALL_COLORS.slice(0, pc);
  if (colors.length !== pc) throw new Error(`expected ${pc} colors, got ${colors.length}`);
  const seatIds: PlayerId[] = opts.seatIds ?? Array.from({ length: pc }, (_, i) => `seat-${i}`);
  if (seatIds.length !== pc) throw new Error(`expected ${pc} seat ids, got ${seatIds.length}`);

  // Board: 24 cells, each with 2 cubes of every in-play color.
  const board: GameState['board'] = {};
  for (const id of BOARD_CELLS) {
    const [col, row] = id.split(',').map(Number) as [number, number];
    const cubes: Partial<Record<Color, number>> = {};
    for (const c of colors) cubes[c] = SETUP_CUBES_PER_CELL_PER_COLOR;
    board[id] = { id, col, row, cubes };
  }

  // Supply: 55 per in-play color minus what is on the board; out-of-play colors are 0.
  const onBoardPerColor = SETUP_CUBES_PER_CELL_PER_COLOR * BOARD_CELLS.length;
  const supply: Record<Color, number> = { red: 0, green: 0, blue: 0, yellow: 0 };
  for (const c of colors) supply[c] = CUBES_PER_COLOR_TOTAL - onBoardPerColor;

  // Opening dice: each seat rolls two dice; rank by sum (desc), ties broken by seat order.
  const rolls = seatIds.map((seat, idx) => ({
    seat,
    idx,
    sum: rng.rollDie() + rng.rollDie(),
  }));
  const ranked = [...rolls].sort((a, b) => (b.sum - a.sum) || (a.idx - b.idx));
  // Highest roller takes the best (highest-numbered) start space; lowest takes space 1.
  const scoreBySeat: Record<PlayerId, number> = {};
  ranked.forEach((r, rank) => {
    scoreBySeat[r.seat] = cfg.startSpaces[cfg.startSpaces.length - 1 - rank]!;
  });

  const players: Record<PlayerId, PlayerState> = {};
  for (let i = 0; i < pc; i++) {
    const seat = seatIds[i]!;
    players[seat] = {
      id: seat,
      color: colors[i]!,
      kind: opts.seatKinds?.[seat] ?? 'human',
      connected: false,
      bp: STARTING_BP,
      genes: [],
      amoebas: emptyAmoebas(),
      score: scoreBySeat[seat]!,
    };
  }

  const [current, ...deckRemaining] = ENV_CARDS;

  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    variant: opts.variant ?? 'standard',
    playerCount: pc,
    colorsInPlay: colors,
    round: 0,
    phase: 'setup',
    board,
    supply,
    players,
    seatOrder: seatIds,
    turnOrder: [],
    environment: {
      current: current!,
      deckRemaining: deckRemaining.map((c) => c.id),
      discarded: [],
    },
    currentDecision: null,
    winner: null,
  };

  // First placement: ascending order (player on the lowest start space first).
  state.turnOrder = ascendingOrder(state);
  issuePlacementDecision(state);
  return state;
}

/** Total amoebas already placed on the board, across all players. */
function totalPlaced(state: GameState): number {
  return state.seatOrder.reduce((n, seat) => n + onBoardAmoebas(state.players[seat]!).length, 0);
}

/** The seat that must place next, or null when setup is complete. */
export function setupPlacer(state: GameState): { seat: PlayerId; ordinal: number } | null {
  const placed = totalPlaced(state);
  const n = state.playerCount;
  if (placed >= 2 * n) return null;
  const ordinal = placed + 1;
  if (placed < n) {
    // First-amoeba round: ascending order.
    return { seat: ascendingOrder(state)[placed]!, ordinal };
  }
  // Second-amoeba round: descending order.
  return { seat: descendingOrder(state)[placed - n]!, ordinal };
}

function issuePlacementDecision(state: GameState): void {
  const placer = setupPlacer(state);
  if (!placer) {
    state.currentDecision = null;
    return;
  }
  state.currentDecision = {
    seat: placer.seat,
    kind: 'place_starting_amoeba',
    context: { placementOrdinal: placer.ordinal },
  };
}

/** Cells legal for a starting-amoeba placement: playable, currently empty (no amoeba). */
function emptyCells(state: GameState): string[] {
  return BOARD_CELLS.filter((id) => occupantsOf(state, id).length === 0);
}

/** legalActions for the place_starting_amoeba decision (one per empty cell). */
export function legalPlacementActions(state: GameState, seat: PlayerId): GameAction[] {
  const player = getPlayer(state, seat);
  const offBoard = player.amoebas.find((a) => a.location === null);
  if (!offBoard) return [];
  // Any off-board amoeba is interchangeable at setup; offer the lowest-id one per cell.
  return emptyCells(state).map((cellId) => ({
    type: 'place_starting_amoeba',
    amoebaId: offBoard.id,
    cellId,
  }));
}

/**
 * Apply a place_starting_amoeba action. Mutates `state` (already a clone). Returns an
 * error string if the action is illegal, otherwise null and appends events.
 */
export function applyPlaceStartingAmoeba(
  state: GameState,
  action: Extract<GameAction, { type: 'place_starting_amoeba' }>,
  events: GameEvent[],
): string | null {
  const decision = state.currentDecision;
  if (!decision || decision.kind !== 'place_starting_amoeba') {
    return 'no placement decision is pending';
  }
  const seat = decision.seat;
  const player = getPlayer(state, seat);
  const amoeba = player.amoebas.find((a) => a.id === action.amoebaId);
  if (!amoeba) return `unknown amoeba ${action.amoebaId} for ${seat}`;
  if (amoeba.location !== null) return `amoeba ${action.amoebaId} is already on the board`;
  if (!isPlayableCell(action.cellId)) return `cell ${action.cellId} is not playable`;
  if (occupantsOf(state, action.cellId).length > 0) return `cell ${action.cellId} is not empty (occupied)`;

  const placedBefore = totalPlaced(state);
  const cfg = playerCountConfig(state.playerCount);
  const isFirstRound = placedBefore < state.playerCount;
  amoeba.location = action.cellId;
  amoeba.dp = isFirstRound ? cfg.setupFirstAmoebaDp : cfg.setupSecondAmoebaDp;
  events.push({ type: 'amoeba_placed', seat, amoebaId: amoeba.id, cellId: action.cellId });

  // Advance to the next placer, or into Phase 1 once all placements are done.
  const next = setupPlacer(state);
  if (next) {
    issuePlacementDecision(state);
    events.push({ type: 'turn_changed', seat: next.seat });
  } else {
    beginPhase1(state, events);
  }
  return null;
}
