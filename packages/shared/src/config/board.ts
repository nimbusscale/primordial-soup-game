// Board topology (spec §3a). A 5×5 grid, columns 0..4 (W→E), rows 0..4 (N→S).
// The center cell (2,2) is the island/Compass and is not playable, leaving 24 cells.
// Adjacency is orthogonal only; moves into the edge or the island are not carried out.

import type { CellId, Direction } from '../ids.js';
import { GRID_SIZE, ISLAND_CELL } from './constants.js';

export interface CellCoord {
  col: number;
  row: number;
}

export function cellId(col: number, row: number): CellId {
  return `${col},${row}`;
}

export function parseCellId(id: CellId): CellCoord {
  const parts = id.split(',');
  return { col: Number(parts[0]), row: Number(parts[1]) };
}

function isPlayable(col: number, row: number): boolean {
  if (col < 0 || col >= GRID_SIZE || row < 0 || row >= GRID_SIZE) return false;
  return cellId(col, row) !== ISLAND_CELL;
}

// Direction → grid delta. N = row−1, S = row+1, W = col−1, E = col+1 (spec §3a).
export const DIRECTION_DELTAS: Readonly<Record<Direction, CellCoord>> = {
  N: { col: 0, row: -1 },
  S: { col: 0, row: 1 },
  W: { col: -1, row: 0 },
  E: { col: 1, row: 0 },
};

// The 24 playable cell ids, in a stable column-major order.
export const BOARD_CELLS: readonly CellId[] = (() => {
  const cells: CellId[] = [];
  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE; row++) {
      if (isPlayable(col, row)) cells.push(cellId(col, row));
    }
  }
  return cells;
})();

// Orthogonal adjacency map (no diagonals; island/edge excluded).
export const ADJACENCY: Readonly<Record<CellId, readonly CellId[]>> = (() => {
  const map: Record<CellId, CellId[]> = {};
  for (const id of BOARD_CELLS) {
    const { col, row } = parseCellId(id);
    const neighbors: CellId[] = [];
    for (const dir of ['N', 'S', 'E', 'W'] as const) {
      const d = DIRECTION_DELTAS[dir];
      const nc = col + d.col;
      const nr = row + d.row;
      if (isPlayable(nc, nr)) neighbors.push(cellId(nc, nr));
    }
    map[id] = neighbors;
  }
  return map;
})();

/**
 * The cell one step in `dir` from `from`, or null if that step hits an obstacle
 * (board edge or the island). Used for drift/move resolution.
 */
export function neighborInDirection(from: CellId, dir: Direction): CellId | null {
  const { col, row } = parseCellId(from);
  const d = DIRECTION_DELTAS[dir];
  const nc = col + d.col;
  const nr = row + d.row;
  return isPlayable(nc, nr) ? cellId(nc, nr) : null;
}

export function areAdjacent(a: CellId, b: CellId): boolean {
  return (ADJACENCY[a] ?? []).includes(b);
}

export function isPlayableCell(id: CellId): boolean {
  const { col, row } = parseCellId(id);
  return isPlayable(col, row);
}
