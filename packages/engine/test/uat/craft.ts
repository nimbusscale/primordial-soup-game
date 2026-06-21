// Helpers for building complete, valid GameStates positioned to exercise a specific gene,
// then play through to game_over. Cube totals are conserved at 55 per in-play color (supply
// is computed as 55 − cubes-on-board); amoebas are padded to ids 1..7; the environment deck
// is short so crafted games terminate in a round or two (deck-empty → game_over in Phase 6).

import type {
  AmoebaId,
  CellId,
  Color,
  CurrentDecision,
  Direction,
  EnvCardId,
  GameState,
  GeneId,
  Phase,
  PlayerId,
} from '@ps/shared';
import { BOARD_CELLS, CUBES_PER_COLOR_TOTAL, SCHEMA_VERSION } from '@ps/shared';

export interface CraftAmoeba {
  id: AmoebaId;
  location: CellId | null;
  dp?: number;
}

export interface CraftPlayer {
  color: Color;
  score: number;
  bp: number;
  genes: GeneId[];
  amoebas: CraftAmoeba[];
}

export interface CraftOpts {
  round: number;
  phase: Phase;
  /** Current environment card (used by Phase 1 drift and as the ozone before the next reveal). */
  current: { id?: EnvCardId; ozoneThickness: number; drift: Direction | 'none' };
  /** Face-down deck (real env-card ids; revealed in Phase 2). Empty ⇒ game ends this round. */
  deck: EnvCardId[];
  /** Seats in creation order (e.g. seat-0, seat-1, seat-2). First three colors are in play. */
  players: Record<PlayerId, CraftPlayer>;
  /** Board cubes by cell; unspecified cells start empty. */
  cubes?: Record<CellId, Partial<Record<Color, number>>>;
  decision: CurrentDecision;
}

export function craftGame(opts: CraftOpts): GameState {
  const seatOrder = Object.keys(opts.players);
  const colorsInPlay = seatOrder.map((s) => opts.players[s]!.color);

  const board: GameState['board'] = {};
  for (const id of BOARD_CELLS) {
    const [col, row] = id.split(',').map(Number) as [number, number];
    board[id] = { id, col, row, cubes: { ...(opts.cubes?.[id] ?? {}) } };
  }

  const supply: Record<Color, number> = { red: 0, green: 0, blue: 0, yellow: 0 };
  for (const color of colorsInPlay) {
    let onBoard = 0;
    for (const id of BOARD_CELLS) onBoard += board[id]!.cubes[color] ?? 0;
    const remaining = CUBES_PER_COLOR_TOTAL - onBoard;
    if (remaining < 0) throw new Error(`craftGame: ${onBoard} ${color} cubes on board exceeds ${CUBES_PER_COLOR_TOTAL}`);
    supply[color] = remaining;
  }

  const players: GameState['players'] = {};
  for (const seat of seatOrder) {
    const cp = opts.players[seat]!;
    const byId = new Map(cp.amoebas.map((a) => [a.id, { id: a.id, location: a.location, dp: a.dp ?? 0 }]));
    const amoebas = [];
    for (let id = 1 as AmoebaId; id <= 7; id++) amoebas.push(byId.get(id) ?? { id, location: null, dp: 0 });
    players[seat] = {
      id: seat,
      color: cp.color,
      kind: 'human',
      connected: true,
      bp: cp.bp,
      genes: [...cp.genes],
      amoebas,
      score: cp.score,
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    variant: 'standard',
    playerCount: seatOrder.length,
    colorsInPlay,
    round: opts.round,
    phase: opts.phase,
    board,
    supply,
    players,
    seatOrder,
    turnOrder: [],
    environment: {
      current: { id: opts.current.id ?? 'env-01', ozoneThickness: opts.current.ozoneThickness, drift: opts.current.drift },
      deckRemaining: [...opts.deck],
      discarded: [],
    },
    currentDecision: opts.decision,
    winner: null,
  };
}

/** A Phase-1 amoeba_action decision for `seat`'s amoeba at `cellId` (mirrors issueAmoebaAction). */
export function amoebaActionDecision(seat: PlayerId, amoebaId: AmoebaId, cellId: CellId, drift: Direction | 'none', moveCostBp = 1): CurrentDecision {
  return { seat, kind: 'amoeba_action', context: { amoebaId, cellId, driftDirection: drift, moveCostBp } };
}

export function struggleDecision(seat: PlayerId, attackerId: AmoebaId, cellId: CellId): CurrentDecision {
  return { seat, kind: 'struggle_target', context: { attackerId, cellId } };
}

export function divideDecision(seat: PlayerId): CurrentDecision {
  return { seat, kind: 'divide_amoebas', context: {} };
}
