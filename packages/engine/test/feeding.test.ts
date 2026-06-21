import { describe, it } from 'vitest';
import type { DeepPartial, Scenario, Step } from './runner.js';
import { runScenario } from './runner.js';
import type { Color, GameState } from '@ps/shared';

// A 3p state resting on an amoeba_feed decision for seat-0 (color red) amoeba 3 at 1,1.
function feedState(opts: {
  cubes: Partial<Record<Color, number>>;
  genes?: string[];
  bp?: number;
  supply?: Partial<Record<'red' | 'green' | 'blue', number>>;
}): DeepPartial<GameState> {
  const state: DeepPartial<GameState> = {
    round: 1,
    phase: 'phase1_movement_feeding',
    colorsInPlay: ['red', 'green', 'blue'],
    board: { '1,1': { cubes: opts.cubes } },
    players: {
      'seat-0': { color: 'red', bp: opts.bp ?? 4, genes: opts.genes ?? [], amoebas: [{ id: 3, location: '1,1', dp: 0 }] },
    },
    currentDecision: { seat: 'seat-0', kind: 'amoeba_feed', context: { amoebaId: 3, cellId: '1,1' } },
  };
  if (opts.supply) state.supply = opts.supply;
  return state;
}

function feedScenario(id: string, given: DeepPartial<GameState>, when: Step[], then?: Scenario['then']): Scenario {
  return { id, title: id, tier: 'mvp-core', gates: ['M4'], given: { playerCount: 3, rng: { rolls: [] }, state: given }, when, then };
}

describe('Phase 1 feeding (FEED-*)', () => {
  it('FEED-01 — 3p single+double, excretion, supply movement', () => {
    runScenario(
      feedScenario(
        'FEED-01',
        feedState({ cubes: { green: 2, blue: 2 }, supply: { red: 7, green: 7, blue: 7 } }),
        [
          {
            seat: 'seat-0',
            action: { type: 'feed', amoebaId: 3, eat: { green: 1, blue: 2 } },
            expectEvents: [{ type: 'fed', amoebaId: 3, cellId: '1,1', ate: { green: 1, blue: 2 }, excreted: { red: 2 } }],
          },
        ],
        [
          { path: 'cell("1,1").cubes.green', equals: 1 },
          { path: 'cell("1,1").cubes.blue', absent: true },
          { path: 'cell("1,1").cubes.red', equals: 2 },
          { path: 'supply.red', equals: 5 },
          { path: 'supply.green', equals: 8 },
          { path: 'supply.blue', equals: 9 },
        ],
      ),
    );
  });

  it('FEED-03 — starvation grants 1 DP', () => {
    runScenario(
      feedScenario(
        'FEED-03',
        feedState({ cubes: { green: 1 } }),
        [
          {
            seat: 'seat-0',
            action: { type: 'feed', amoebaId: 3, eat: {} },
            expectEvents: [{ type: 'starved', amoebaId: 3 }],
          },
        ],
        [
          { path: 'amoeba("seat-0",3).dp', equals: 1 },
          { path: 'cell("1,1").cubes.green', equals: 1 }, // unchanged
        ],
      ),
    );
  });

  it('FEED-04 — excretion supply shortage (place as many as available)', () => {
    runScenario(
      feedScenario(
        'FEED-04',
        feedState({ cubes: { green: 2, blue: 2 }, supply: { red: 1, green: 7, blue: 7 } }),
        [
          {
            seat: 'seat-0',
            action: { type: 'feed', amoebaId: 3, eat: { green: 1, blue: 2 } },
            expectEvents: [{ type: 'fed', excreted: { red: 1 } }],
          },
        ],
        [
          { path: 'cell("1,1").cubes.red', equals: 1 },
          { path: 'supply.red', equals: 0 },
        ],
      ),
    );
  });

  it('FEED-05 — SUBSTITUTION combo (3p eat 4 of one color)', () => {
    runScenario(
      feedScenario(
        'FEED-05',
        feedState({ cubes: { green: 4 }, genes: ['SUBSTITUTION'] }),
        [
          {
            seat: 'seat-0',
            action: { type: 'feed', amoebaId: 3, eat: { green: 4 } },
            assertBefore: [{ legalFor: 'seat-0', includes: { type: 'feed', amoebaId: 3, eat: { green: 4 } } }],
          },
        ],
        [
          { path: 'cell("1,1").cubes.green', absent: true },
          { path: 'cell("1,1").cubes.red', equals: 2 },
        ],
      ),
    );
  });

  it('FEED-06 — legalActions enumeration + single satisfiable combo', () => {
    runScenario(
      feedScenario(
        'FEED-06',
        feedState({ cubes: { green: 2, blue: 1 } }),
        [
          {
            seat: 'seat-0',
            action: { type: 'feed', amoebaId: 3, eat: { green: 2, blue: 1 } },
            assertBefore: [
              { legalFor: 'seat-0', count: 1 },
              { legalFor: 'seat-0', includes: { type: 'feed', amoebaId: 3, eat: { green: 2, blue: 1 } } },
            ],
          },
        ],
        [
          { path: 'amoeba("seat-0",3).dp', equals: 0 }, // fed, not starved
          { path: 'cell("1,1").cubes.red', equals: 2 },
        ],
      ),
    );
  });
});
