// Phase 5 — Deaths (spec §6 Phase 5, Descending Order). Filled in M8. Until then a stub
// transition so the round can advance past Phase 4.

import type { GameEvent, GameState } from '@ps/shared';

export function beginPhase5(state: GameState, events: GameEvent[]): void {
  state.phase = 'phase5_deaths';
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });
  state.currentDecision = null;
}
