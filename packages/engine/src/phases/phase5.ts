// Phase 5 — Deaths (spec §6 Phase 5, Descending Order). Resolves natural deaths
// automatically: an amoeba with 2+ DP (3+ with LONGEVITY) dies, returns to its owner's
// supply, and is replaced by 2 cubes of each in-play color (supply-limited). AGGRESSION's
// after-deaths attack is M15.

import type { GameEvent, GameState } from '@ps/shared';
import { DEATH_CUBES_PER_COLOR, DEATH_DP_DEFAULT, DEATH_DP_LONGEVITY } from '@ps/shared';
import { onBoardAmoebas, placeCubesFromSupply } from '../state-helpers.js';
import { hasLongevity } from '../genes/capabilities.js';
import { descendingOrder } from '../turn-order.js';
import { beginAggression } from './combat.js';

export function beginPhase5(state: GameState, events: GameEvent[]): void {
  state.phase = 'phase5_deaths';
  state.turnOrder = descendingOrder(state);
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });

  // Process deaths in descending player order; within a player, by amoeba number.
  for (const seat of descendingOrder(state)) {
    const player = state.players[seat]!;
    const threshold = hasLongevity(player) ? DEATH_DP_LONGEVITY : DEATH_DP_DEFAULT;
    const dying = onBoardAmoebas(player)
      .filter((a) => a.dp >= threshold)
      .sort((a, b) => a.id - b.id);
    for (const amoeba of dying) {
      const cellId = amoeba.location!;
      amoeba.location = null;
      amoeba.dp = 0; // returns to supply; reused at 0 DP
      for (const color of state.colorsInPlay) {
        placeCubesFromSupply(state, cellId, color, DEATH_CUBES_PER_COLOR);
      }
      events.push({ type: 'died', seat, amoebaId: amoeba.id, cellId, cause: 'natural' });
    }
  }

  // AGGRESSION resolves after natural deaths (no-op if no one owns it), then Phase 6.
  beginAggression(state, events);
}
