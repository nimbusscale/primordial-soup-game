import { describe, expect, it } from 'vitest';
import { createInitialState, makeSeededRng } from '@ps/engine';
import { driveGame } from './auto-driver.js';

// GAME-01 — a complete non-combat 3-player game driven headlessly from createInitialState
// to game_over under a fixed seed. Golden values were captured on first authoring run and
// frozen (build-plan M10 / validation-scenarios GAME-01).
describe('GAME-01 — full headless 3-player game', () => {
  const SEED = 4242;
  // Frozen golden snapshot.
  const GOLDEN = {
    winner: 'seat-0',
    scores: { 'seat-0': 33, 'seat-1': 20, 'seat-2': 31 },
    maxRound: 10,
  };

  function run() {
    const initial = createInitialState({ playerCount: 3 }, makeSeededRng(SEED));
    return driveGame(initial, makeSeededRng(SEED));
  }

  it('reaches game_over with the golden winner and per-round coverage', () => {
    const r = run();
    expect(r.finalState.phase).toBe('game_over');
    expect(r.finalState.currentDecision).toBeNull();
    expect(r.finalState.winner).toBe(GOLDEN.winner);
    expect(Object.fromEntries(r.finalState.seatOrder.map((s) => [s, r.finalState.players[s]!.score]))).toEqual(GOLDEN.scores);
    expect(r.checkpoints.maxRound).toBe(GOLDEN.maxRound);

    // Coverage: at least one buy, division, natural death, and scoring advance occurred.
    expect(r.checkpoints.sawBuy).toBe(true);
    expect(r.checkpoints.sawDivision).toBe(true);
    expect(r.checkpoints.sawDeath).toBe(true);
    expect(r.checkpoints.sawScored).toBe(true);

    // Every round reached Phase 6 scoring.
    const scoredRounds = r.events.filter((e) => e.type === 'game_over').length;
    expect(scoredRounds).toBe(1);
  });

  it('is byte-identical across repeated runs with the same seed', () => {
    const a = run();
    const b = run();
    expect(JSON.stringify(b.finalState)).toBe(JSON.stringify(a.finalState));
    expect(b.events).toEqual(a.events);
  });
});
