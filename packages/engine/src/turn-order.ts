// Turn-order derivation (spec §5). Ascending Order = marker last on the ladder goes
// first (lowest score first); Descending Order = first place goes first (highest score
// first). Leapfrogging keeps every score distinct, so the order is a strict total order;
// seatOrder is a stable tiebreak for the (impossible-after-setup) equal-score case.

import type { GameState, PlayerId } from '@ps/shared';

export function ascendingOrder(state: GameState): PlayerId[] {
  return [...state.seatOrder].sort((a, b) => {
    const da = state.players[a]!.score - state.players[b]!.score;
    if (da !== 0) return da;
    return state.seatOrder.indexOf(a) - state.seatOrder.indexOf(b);
  });
}

export function descendingOrder(state: GameState): PlayerId[] {
  return ascendingOrder(state).reverse();
}
