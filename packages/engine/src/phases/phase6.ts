// Phase 6 — Scoring and Game End (spec §6 Phase 6 + Game End; Descending Order). Each
// player advances their marker by (amoeba table + gene table), with advanced genes counting
// as two cards, RAY PROTECTION as zero, and leapfrogging over occupied ladder spaces. The
// game ends at the end of Phase 6 if a marker reached the finish zone or the last
// environment card has been turned over (deck empty).

import type { GameEvent, GameState, PlayerId } from '@ps/shared';
import {
  amoebaAdvanceSpaces,
  FINISH_ZONE_START,
  geneAdvanceSpaces,
  geneDef,
  LADDER_MAX,
} from '@ps/shared';
import { getPlayer, onBoardAmoebas } from '../state-helpers.js';
import { descendingOrder } from '../turn-order.js';
import { beginPhase1 } from './phase1.js';

/** Gene-card count for the advance table: advanced = 2, RAY PROTECTION = 0, else 1. */
function geneCardCount(state: GameState, seat: PlayerId): number {
  return getPlayer(state, seat).genes.reduce((n, g) => n + geneDef(g).advancementCardValue, 0);
}

/** Advance `from` by `distance` unoccupied spaces, leapfrogging over other markers. */
function leapfrogAdvance(state: GameState, mover: PlayerId, from: number, distance: number): number {
  const occupied = new Set(
    state.seatOrder.filter((s) => s !== mover).map((s) => state.players[s]!.score),
  );
  let pos = from;
  let remaining = distance;
  while (remaining > 0 && pos < LADDER_MAX) {
    pos++;
    if (occupied.has(pos)) continue; // skip occupied spaces; they don't count
    remaining--;
  }
  return pos;
}

function determineWinner(state: GameState): PlayerId {
  return state.seatOrder.reduce((best, seat) =>
    state.players[seat]!.score > state.players[best]!.score ? seat : best,
  );
}

export function beginPhase6(state: GameState, events: GameEvent[]): void {
  state.phase = 'phase6_scoring';
  state.turnOrder = descendingOrder(state);
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });

  for (const seat of descendingOrder(state)) {
    const player = getPlayer(state, seat);
    const amoebaSpaces = amoebaAdvanceSpaces(onBoardAmoebas(player).length);
    const geneSpaces = geneAdvanceSpaces(geneCardCount(state, seat));
    const from = player.score;
    const to = leapfrogAdvance(state, seat, from, amoebaSpaces + geneSpaces);
    player.score = to;
    events.push({ type: 'scored', seat, from, to, amoebaSpaces, geneSpaces });
  }

  // Game-end check (spec §6 Game End): a marker in the finish zone, or the last env card
  // turned over (deck empty).
  const reachedFinish = state.seatOrder.some((s) => state.players[s]!.score >= FINISH_ZONE_START);
  const deckEmpty = state.environment.deckRemaining.length === 0;
  if (reachedFinish || deckEmpty) {
    const winner = determineWinner(state);
    state.phase = 'game_over';
    state.winner = winner;
    state.turnOrder = [];
    state.currentDecision = null;
    const finalScores: Record<PlayerId, number> = {};
    for (const s of state.seatOrder) finalScores[s] = state.players[s]!.score;
    events.push({ type: 'game_over', winner, finalScores });
    return;
  }

  // Otherwise, begin the next round at Phase 1 (round incremented here).
  state.round += 1;
  beginPhase1(state, events);
}
