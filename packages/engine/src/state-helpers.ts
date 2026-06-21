// Small pure helpers over GameState. No randomness, no I/O. All mutating helpers
// operate on a state the caller already owns (a clone made by reduce).

import type { Amoeba, CellId, Color, GameState, PlayerId, PlayerState } from '@ps/shared';
import { CUBES_PER_COLOR_TOTAL } from '@ps/shared';

/** Deep clone for the pure reduce path. structuredClone is deterministic (no RNG/time). */
export function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

export function getPlayer(state: GameState, seat: PlayerId): PlayerState {
  const p = state.players[seat];
  if (!p) throw new Error(`unknown seat: ${seat}`);
  return p;
}

export function getAmoeba(player: PlayerState, amoebaId: number): Amoeba | undefined {
  return player.amoebas.find((a) => a.id === amoebaId);
}

export function onBoardAmoebas(player: PlayerState): Amoeba[] {
  return player.amoebas.filter((a) => a.location !== null);
}

export function offBoardAmoebaIds(player: PlayerState): number[] {
  return player.amoebas.filter((a) => a.location === null).map((a) => a.id);
}

/** Every (seat, amoeba) currently occupying a given cell. */
export function occupantsOf(
  state: GameState,
  cellId: CellId,
): Array<{ seat: PlayerId; amoeba: Amoeba }> {
  const out: Array<{ seat: PlayerId; amoeba: Amoeba }> = [];
  for (const seat of state.seatOrder) {
    for (const amoeba of state.players[seat]!.amoebas) {
      if (amoeba.location === cellId) out.push({ seat, amoeba });
    }
  }
  return out;
}

/** Does any amoeba of `color` occupy `cellId`? */
export function cellHasColor(state: GameState, cellId: CellId, color: Color): boolean {
  return occupantsOf(state, cellId).some(({ seat }) => state.players[seat]!.color === color);
}

/** Cube count of a color in a cell (0 if absent). */
export function cubesOf(state: GameState, cellId: CellId, color: Color): number {
  return state.board[cellId]?.cubes[color] ?? 0;
}

/**
 * Add `count` cubes of `color` to a cell, drawing from the global supply. If the supply
 * is short, place as many as remain and skip the rest (spec: never substitute a color).
 * Returns the number actually placed.
 */
export function placeCubesFromSupply(
  state: GameState,
  cellId: CellId,
  color: Color,
  count: number,
): number {
  const available = state.supply[color];
  const placed = Math.min(available, count);
  if (placed <= 0) return 0;
  const cell = state.board[cellId];
  if (!cell) throw new Error(`unknown cell: ${cellId}`);
  cell.cubes[color] = (cell.cubes[color] ?? 0) + placed;
  state.supply[color] = available - placed;
  return placed;
}

/** Remove `count` cubes of `color` from a cell back to the global supply. */
export function takeCubesToSupply(
  state: GameState,
  cellId: CellId,
  color: Color,
  count: number,
): number {
  const cell = state.board[cellId];
  if (!cell) throw new Error(`unknown cell: ${cellId}`);
  const present = cell.cubes[color] ?? 0;
  const taken = Math.min(present, count);
  if (taken <= 0) return 0;
  const remaining = present - taken;
  if (remaining === 0) delete cell.cubes[color];
  else cell.cubes[color] = remaining;
  state.supply[color] = Math.min(CUBES_PER_COLOR_TOTAL, state.supply[color] + taken);
  return taken;
}

export function playerHasGene(player: PlayerState, gene: string): boolean {
  return player.genes.includes(gene);
}
