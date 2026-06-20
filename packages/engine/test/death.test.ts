import { describe, it } from 'vitest';
import type { Color, GameState } from '@ps/shared';
import { runScenario, type DeepPartial, type Scenario, type Step } from './runner.js';

// A Phase-4 state on seat-0's (descending-last) divide decision; passing triggers Phase 5.
function preDeathState(opts: {
  genes?: string[];
  amoebas: Array<{ id: number; location: string; dp: number }>;
  supply?: Partial<Record<Color, number>>;
}): DeepPartial<GameState> {
  const state: DeepPartial<GameState> = {
    round: 1,
    phase: 'phase4_division',
    players: { 'seat-0': { color: 'red', genes: opts.genes ?? [], bp: 0, amoebas: opts.amoebas } },
    currentDecision: { seat: 'seat-0', kind: 'divide_amoebas', context: {} },
  };
  if (opts.supply) state.supply = opts.supply;
  return state;
}

const trigger: Step = { seat: 'seat-0', action: { type: 'pass_division' } };

function scn(id: string, given: DeepPartial<GameState>, then: Scenario['then'], expectEvents?: Step['expectEvents']): Scenario {
  return {
    id,
    title: id,
    tier: 'mvp-core',
    gates: ['M8'],
    given: { playerCount: 3, rng: { rolls: [] }, state: given },
    when: [{ ...trigger, ...(expectEvents ? { expectEvents } : {}) }],
    then,
  };
}

describe('Phase 5 natural deaths (DEATH-*)', () => {
  it('DEATH-01 — natural death at 2 DP, cubes placed, descending order', () => {
    runScenario(
      scn(
        'DEATH-01',
        preDeathState({ amoebas: [{ id: 4, location: '2,1', dp: 2 }], supply: { red: 10, green: 10, blue: 10 } }),
        [
          { path: 'amoeba("seat-0",4).location', equals: null },
          { path: 'cell("2,1").cubes.red', equals: 2 },
          { path: 'cell("2,1").cubes.green', equals: 2 },
          { path: 'cell("2,1").cubes.blue', equals: 2 },
          { path: 'supply.red', equals: 8 },
          { path: 'supply.green', equals: 8 },
          { path: 'supply.blue', equals: 8 },
        ],
        [{ type: 'died', amoebaId: 4, cause: 'natural' }],
      ),
    );
  });

  it('DEATH-02 — LONGEVITY raises threshold to 3', () => {
    runScenario(
      scn(
        'DEATH-02',
        preDeathState({
          genes: ['LONGEVITY'],
          amoebas: [
            { id: 1, location: '1,1', dp: 2 }, // survives (2 < 3)
            { id: 2, location: '3,3', dp: 3 }, // dies (3 >= 3)
          ],
          supply: { red: 10, green: 10, blue: 10 },
        }),
        [
          { path: 'amoeba("seat-0",1).location', equals: '1,1' },
          { path: 'amoeba("seat-0",2).location', equals: null },
        ],
      ),
    );
  });

  it('DEATH-03 — death-cube supply shortage (place as many as available)', () => {
    runScenario(
      scn(
        'DEATH-03',
        preDeathState({ amoebas: [{ id: 1, location: '1,1', dp: 2 }], supply: { red: 1, green: 0, blue: 5 } }),
        [
          { path: 'cell("1,1").cubes.red', equals: 1 }, // only 1 available
          { path: 'cell("1,1").cubes.green', absent: true }, // none available
          { path: 'cell("1,1").cubes.blue', equals: 2 },
          { path: 'supply.red', equals: 0 },
          { path: 'supply.green', equals: 0 },
          { path: 'supply.blue', equals: 3 },
        ],
      ),
    );
  });
});
