import { describe, it } from 'vitest';
import { BOARD_CELLS } from '@ps/shared';
import type { GameState } from '@ps/shared';
import { runScenario, type DeepPartial, type Scenario, type Step } from './runner.js';

interface SeatSpec {
  seat: string;
  score: number;
  amoebas?: number;
  genes?: string[];
}

// A Phase-4 state whose descending-last seat is on divide; passing cascades Phase 5 → 6.
function scoreState(opts: { players: SeatSpec[]; deckRemaining?: string[]; round?: number }): DeepPartial<GameState> {
  let ci = 0;
  const players: DeepPartial<GameState>['players'] = {};
  for (const p of opts.players) {
    const amoebas = Array.from({ length: p.amoebas ?? 0 }, (_, i) => ({ id: i + 1, location: BOARD_CELLS[ci++]!, dp: 0 }));
    players[p.seat] = { score: p.score, genes: p.genes ?? [], bp: 0, amoebas };
  }
  const last = opts.players.reduce((m, p) => (p.score < m.score ? p : m)).seat;
  const state: DeepPartial<GameState> = {
    round: opts.round ?? 5,
    phase: 'phase4_division',
    players,
    currentDecision: { seat: last, kind: 'divide_amoebas', context: {} },
  };
  if (opts.deckRemaining) state.environment = { deckRemaining: opts.deckRemaining };
  return state;
}

function scn(id: string, given: DeepPartial<GameState>, when: Step[], then?: Scenario['then']): Scenario {
  return { id, title: id, tier: 'mvp-core', gates: ['M9'], given: { playerCount: 3, rng: { rolls: [] }, state: given }, when, then };
}

const pass: Step = { seat: '<current>', action: { type: 'pass_division' } };

describe('Phase 6 scoring (SCORE-*) and game end (END-*)', () => {
  it('SCORE-01 — amoeba advance table (5 amoebas → 4 spaces)', () => {
    runScenario(
      scn(
        'SCORE-01',
        scoreState({ players: [{ seat: 'seat-0', score: 10, amoebas: 5 }, { seat: 'seat-1', score: 20 }, { seat: 'seat-2', score: 21 }] }),
        [{ ...pass, expectEvents: [{ type: 'scored', seat: 'seat-0', amoebaSpaces: 4, geneSpaces: 0 }] }],
        [{ path: 'player("seat-0").score', equals: 14 }],
      ),
    );
  });

  it('SCORE-02 — gene advance table (4 plain genes → 2 spaces)', () => {
    runScenario(
      scn(
        'SCORE-02',
        scoreState({ players: [
          { seat: 'seat-0', score: 10, amoebas: 2, genes: ['INTELLIGENCE', 'MOVEMENT_I', 'SPORES', 'STREAMLINING'] },
          { seat: 'seat-1', score: 20 }, { seat: 'seat-2', score: 21 },
        ] }),
        [{ ...pass, expectEvents: [{ type: 'scored', seat: 'seat-0', amoebaSpaces: 0, geneSpaces: 2 }] }],
        [{ path: 'player("seat-0").score', equals: 12 }],
      ),
    );
  });

  it('SCORE-03 — advanced gene counts as two cards', () => {
    runScenario(
      scn(
        'SCORE-03',
        scoreState({ players: [
          { seat: 'seat-0', score: 10, amoebas: 0, genes: ['INTELLIGENCE', 'MOVEMENT_I', 'AGGRESSION'] }, // 1+1+2 = 4 → 2 spaces
          { seat: 'seat-1', score: 20 }, { seat: 'seat-2', score: 21 },
        ] }),
        [{ ...pass, expectEvents: [{ type: 'scored', seat: 'seat-0', amoebaSpaces: 0, geneSpaces: 2 }] }],
        [{ path: 'player("seat-0").score', equals: 12 }],
      ),
    );
  });

  it('SCORE-04 — RAY PROTECTION counts as zero', () => {
    runScenario(
      scn(
        'SCORE-04',
        scoreState({ players: [
          { seat: 'seat-0', score: 10, amoebas: 0, genes: ['INTELLIGENCE', 'MOVEMENT_I', 'RAY_PROTECTION'] }, // 1+1+0 = 2 → 0 spaces
          { seat: 'seat-1', score: 20 }, { seat: 'seat-2', score: 21 },
        ] }),
        [{ ...pass, expectEvents: [{ type: 'scored', seat: 'seat-0', amoebaSpaces: 0, geneSpaces: 0 }] }],
        [{ path: 'player("seat-0").score', equals: 10 }],
      ),
    );
  });

  it('SCORE-05 — leapfrogging over occupied spaces', () => {
    runScenario(
      scn(
        'SCORE-05',
        scoreState({ players: [{ seat: 'seat-0', score: 10, amoebas: 5 }, { seat: 'seat-1', score: 12 }, { seat: 'seat-2', score: 13 }] }),
        [pass],
        [{ path: 'player("seat-0").score', equals: 16 }], // 11,(skip 12,13),14,15,16
      ),
    );
  });

  it('END-01 — finish-zone reached ends the game', () => {
    runScenario(
      scn(
        'END-01',
        scoreState({ players: [{ seat: 'seat-0', score: 38, amoebas: 6 }, { seat: 'seat-1', score: 30 }, { seat: 'seat-2', score: 25 }] }),
        [{ ...pass, expectEvents: [{ type: 'game_over', winner: 'seat-0' }] }],
        [
          { path: 'phase', equals: 'game_over' },
          { path: 'winner', equals: 'seat-0' },
          { path: 'currentDecision', equals: null },
          { path: 'player("seat-0").score', equals: 43 },
        ],
      ),
    );
  });

  it('END-02 — last environment card flipped ends the game', () => {
    runScenario(
      scn(
        'END-02',
        scoreState({
          players: [{ seat: 'seat-0', score: 30 }, { seat: 'seat-1', score: 20 }, { seat: 'seat-2', score: 10 }],
          deckRemaining: [],
        }),
        [pass],
        [
          { path: 'phase', equals: 'game_over' },
          { path: 'winner', equals: 'seat-0' }, // furthest marker
        ],
      ),
    );
  });

  it('END-03 — winner is the furthest marker (furthest into the finish zone)', () => {
    runScenario(
      scn(
        'END-03',
        scoreState({ players: [{ seat: 'seat-0', score: 44 }, { seat: 'seat-1', score: 47 }, { seat: 'seat-2', score: 41 }] }),
        [pass],
        [
          { path: 'phase', equals: 'game_over' },
          { path: 'winner', equals: 'seat-1' },
        ],
      ),
    );
  });
});
