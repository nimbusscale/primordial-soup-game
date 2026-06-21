import { describe, it } from 'vitest';
import type { GameState } from '@ps/shared';
import { runScenario, type DeepPartial, type Scenario, type Step } from './runner.js';

// A Phase-4 state resting on a divide_amoebas decision for seat-0 (color red).
function divideState(opts: {
  bp: number;
  genes?: string[];
  amoebas: Array<{ id: number; location: string }>;
}): DeepPartial<GameState> {
  return {
    round: 1,
    phase: 'phase4_division',
    players: {
      'seat-0': {
        color: 'red',
        bp: opts.bp,
        genes: opts.genes ?? [],
        amoebas: opts.amoebas.map((a) => ({ id: a.id, location: a.location, dp: 0 })),
      },
    },
    currentDecision: { seat: 'seat-0', kind: 'divide_amoebas', context: {} },
  };
}

function scn(id: string, given: DeepPartial<GameState>, when: Step[], then?: Scenario['then']): Scenario {
  return { id, title: id, tier: 'mvp-core', gates: ['M7'], given: { playerCount: 3, rng: { rolls: [] }, state: given }, when, then };
}

describe('Phase 4 cell division (DIV-*)', () => {
  it('DIV-01 — +10 BP at phase start', () => {
    // Trigger Phase 3 → Phase 4 by passing as the last (descending) buyer; beginPhase4 grants +10.
    runScenario(
      scn(
        'DIV-01',
        {
          round: 1,
          phase: 'phase3_genes',
          players: { 'seat-0': { bp: 3 } }, // seat-0 has the lowest score ⇒ last in descending order
          currentDecision: { seat: 'seat-0', kind: 'buy_genes', context: { boughtThisRound: [] } },
        },
        [{ seat: 'seat-0', action: { type: 'pass_buying' } }],
        [
          { path: 'phase', equals: 'phase4_division' },
          { path: 'player("seat-0").bp', equals: 13 },
        ],
      ),
    );
  });

  it('DIV-02 — divide adjacent, 6 BP, newborn 0 DP', () => {
    runScenario(
      scn('DIV-02', divideState({ bp: 13, amoebas: [{ id: 1, location: '1,1' }] }), [
        {
          seat: 'seat-0',
          action: { type: 'divide', newAmoebaId: 2, cellId: '2,1' },
          expectEvents: [{ type: 'divided', cost: 6 }],
        },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '2,1' },
        { path: 'amoeba("seat-0",2).dp', equals: 0 },
        { path: 'player("seat-0").bp', equals: 7 },
      ]),
    );
  });

  it('DIV-03 — DIVISION RATE cost 4', () => {
    runScenario(
      scn('DIV-03', divideState({ bp: 13, genes: ['DIVISION_RATE'], amoebas: [{ id: 1, location: '1,1' }] }), [
        { seat: 'seat-0', action: { type: 'divide', newAmoebaId: 2, cellId: '2,1' }, expectEvents: [{ type: 'divided', cost: 4 }] },
      ], [{ path: 'player("seat-0").bp', equals: 9 }]),
    );
  });

  it('DIV-04 — 0-amoeba free placement anywhere', () => {
    runScenario(
      scn('DIV-04', divideState({ bp: 13, amoebas: [] }), [
        {
          seat: 'seat-0',
          action: { type: 'divide', newAmoebaId: 1, cellId: '3,3' },
          assertBefore: [{ legalFor: 'seat-0', includes: { type: 'divide', newAmoebaId: 1, cellId: '3,3' } }],
          expectEvents: [{ type: 'divided', cost: 0 }],
        },
      ], [
        { path: 'amoeba("seat-0",1).location', equals: '3,3' },
        { path: 'player("seat-0").bp', equals: 13 }, // free
      ]),
    );
  });

  it('DIV-05 — 1-amoeba special placement anywhere at cost', () => {
    runScenario(
      scn('DIV-05', divideState({ bp: 13, amoebas: [{ id: 1, location: '0,0' }] }), [
        { seat: 'seat-0', action: { type: 'divide', newAmoebaId: 2, cellId: '4,4' } },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '4,4' },
        { path: 'player("seat-0").bp', equals: 7 },
      ]),
    );
  });

  it('DIV-06 — SPORES ignores adjacency (player has 2 amoebas)', () => {
    runScenario(
      scn('DIV-06', divideState({ bp: 13, genes: ['SPORES'], amoebas: [{ id: 1, location: '1,1' }, { id: 5, location: '0,0' }] }), [
        { seat: 'seat-0', action: { type: 'divide', newAmoebaId: 2, cellId: '4,4' } },
      ], [{ path: 'amoeba("seat-0",2).location', equals: '4,4' }]),
    );
  });

  it('DIV-07 — adjacency chain within the phase', () => {
    runScenario(
      scn('DIV-07', divideState({ bp: 13, amoebas: [{ id: 1, location: '1,1' }] }), [
        { seat: 'seat-0', action: { type: 'divide', newAmoebaId: 2, cellId: '2,1' } },
        { seat: 'seat-0', action: { type: 'divide', newAmoebaId: 3, cellId: '3,1' } }, // borders the just-placed 2,1
      ], [{ path: 'amoeba("seat-0",3).location', equals: '3,1' }]),
    );
  });

  it('DIV-08 — illegal placement rejected (player has 2 amoebas)', () => {
    runScenario(
      scn('DIV-08', divideState({ bp: 13, amoebas: [{ id: 1, location: '1,1' }, { id: 5, location: '0,0' }] }), [
        { seat: 'seat-0', action: { type: 'divide', newAmoebaId: 2, cellId: '4,4' }, expectReject: { reasonMatches: 'adjacent' } },
        { seat: 'seat-0', action: { type: 'divide', newAmoebaId: 2, cellId: '1,1' }, expectReject: { reasonMatches: 'same-color|same color' } },
      ]),
    );
  });
});
