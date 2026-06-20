// Phase 4 — Cell Division (spec §6 Phase 4, Descending Order). Filled in M7. Until then a
// stub transition so the round can advance past Phase 3.

import type { GameEvent, GameState } from '@ps/shared';

export function beginPhase4(state: GameState, events: GameEvent[]): void {
  state.phase = 'phase4_division';
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });
  state.currentDecision = null;
}
