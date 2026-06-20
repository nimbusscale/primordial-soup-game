// Phase 3 — New Genes (spec §6 Phase 3, Descending Order). Filled in M6. Until then this
// is a stub transition so the round can advance past Phase 2.

import type { GameEvent, GameState } from '@ps/shared';

export function beginPhase3(state: GameState, events: GameEvent[]): void {
  state.phase = 'phase3_genes';
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });
  // M6 issues the buy_genes decisions; until then, no decision pending.
  state.currentDecision = null;
}
