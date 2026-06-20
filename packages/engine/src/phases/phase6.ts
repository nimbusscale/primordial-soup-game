// Phase 6 — Scoring and Game End (spec §6 Phase 6; Descending Order). Filled in M9. Until
// then a stub transition that ends the round with no pending decision.

import type { GameEvent, GameState } from '@ps/shared';

export function beginPhase6(state: GameState, events: GameEvent[]): void {
  state.phase = 'phase6_scoring';
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });
  state.currentDecision = null;
}
