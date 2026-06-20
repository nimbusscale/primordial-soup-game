// Phase 4 — Cell Division (spec §6 Phase 4, Descending Order). Each player first receives
// 10 BP, then may divide amoebas (6 BP each, 4 with DIVISION RATE) onto a cell that holds
// no same-color amoeba and borders one (chains allowed). Special cases: a player with 0
// on-board amoebas places one free anywhere; with exactly 1, a second anywhere at normal
// cost. SPORES ignores the adjacency requirement.

import type { CellId, GameAction, GameEvent, GameState, PlayerId, PlayerState } from '@ps/shared';
import {
  ADJACENCY,
  BOARD_CELLS,
  DIVISION_BP_GRANT,
  DIVISION_COST,
  DIVISION_COST_DISCOUNTED,
  isPlayableCell,
} from '@ps/shared';
import { cellHasColor, getPlayer, onBoardAmoebas } from '../state-helpers.js';
import { hasDivisionRate, hasSpores } from '../genes/capabilities.js';
import { descendingOrder } from '../turn-order.js';
import { beginPhase5 } from './phase5.js';

function divisionCost(player: PlayerState): number {
  if (onBoardAmoebas(player).length === 0) return 0; // free first placement
  return hasDivisionRate(player) ? DIVISION_COST_DISCOUNTED : DIVISION_COST;
}

function bordersSameColor(state: GameState, player: PlayerState, cellId: CellId): boolean {
  return (ADJACENCY[cellId] ?? []).some((n) => cellHasColor(state, n, player.color));
}

/** Whether a newborn of this player may be placed on `cellId` (excluding cost/affordability). */
function canPlace(state: GameState, player: PlayerState, cellId: CellId): { ok: true } | { ok: false; reason: string } {
  if (!isPlayableCell(cellId)) return { ok: false, reason: `cell ${cellId} is not playable` };
  if (cellHasColor(state, cellId, player.color)) {
    return { ok: false, reason: `cell ${cellId} already holds a same-color amoeba` };
  }
  const onBoard = onBoardAmoebas(player).length;
  if (onBoard <= 1) return { ok: true }; // 0 → free anywhere; 1 → second anywhere
  if (hasSpores(player)) return { ok: true }; // SPORES ignores adjacency
  if (!bordersSameColor(state, player, cellId)) {
    return { ok: false, reason: `cell ${cellId} must be adjacent to a same-color amoeba` };
  }
  return { ok: true };
}

export function legalDivideActions(state: GameState, seat: PlayerId): GameAction[] {
  const player = getPlayer(state, seat);
  const out: GameAction[] = [];
  const newId = player.amoebas.find((a) => a.location === null)?.id;
  const cost = divisionCost(player);
  if (newId !== undefined && player.bp >= cost) {
    for (const cellId of BOARD_CELLS) {
      if (canPlace(state, player, cellId).ok) out.push({ type: 'divide', newAmoebaId: newId, cellId });
    }
  }
  out.push({ type: 'pass_division' });
  return out;
}

export function applyDivide(
  state: GameState,
  action: Extract<GameAction, { type: 'divide' }>,
  events: GameEvent[],
): string | null {
  const seat = state.currentDecision!.seat;
  const player = getPlayer(state, seat);
  const amoeba = player.amoebas.find((a) => a.id === action.newAmoebaId);
  if (!amoeba) return `unknown amoeba ${action.newAmoebaId}`;
  if (amoeba.location !== null) return `amoeba ${action.newAmoebaId} is already on the board`;

  const placement = canPlace(state, player, action.cellId);
  if (!placement.ok) return placement.reason;

  const cost = divisionCost(player);
  if (player.bp < cost) return `not enough BP to divide (need ${cost}, have ${player.bp})`;

  player.bp -= cost;
  amoeba.location = action.cellId;
  amoeba.dp = 0;
  events.push({ type: 'divided', seat, newAmoebaId: amoeba.id, cellId: action.cellId, cost });
  return null; // decision stays divide_amoebas for this seat
}

export function applyPassDivision(state: GameState, events: GameEvent[]): string | null {
  const seat = state.currentDecision!.seat;
  const order = descendingOrder(state);
  const idx = order.indexOf(seat);
  if (idx + 1 < order.length) issueDivide(state, order[idx + 1]!, events);
  else beginPhase5(state, events);
  return null;
}

function issueDivide(state: GameState, seat: PlayerId, events: GameEvent[]): void {
  state.currentDecision = { seat, kind: 'divide_amoebas', context: {} };
  events.push({ type: 'turn_changed', seat });
}

export function beginPhase4(state: GameState, events: GameEvent[]): void {
  state.phase = 'phase4_division';
  state.turnOrder = descendingOrder(state);
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });
  // Each player first receives 10 BP (spec §6 Phase 4 step 1).
  for (const seat of state.seatOrder) state.players[seat]!.bp += DIVISION_BP_GRANT;
  issueDivide(state, state.turnOrder[0]!, events);
}
