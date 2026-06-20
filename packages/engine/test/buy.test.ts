import { describe, it } from 'vitest';
import type { GameState } from '@ps/shared';
import { runScenario, type DeepPartial, type Scenario, type Step } from './runner.js';

// A Phase-3 state resting on a buy_genes decision for seat-0.
function buyState(opts: {
  bp: number;
  genes?: string[];
  round?: number;
  others?: Record<string, string[]>;
}): DeepPartial<GameState> {
  const players: DeepPartial<GameState>['players'] = {
    'seat-0': { bp: opts.bp, genes: opts.genes ?? [] },
  };
  for (const [seat, genes] of Object.entries(opts.others ?? {})) players[seat] = { genes };
  return {
    round: opts.round ?? 1,
    phase: 'phase3_genes',
    players,
    currentDecision: { seat: 'seat-0', kind: 'buy_genes', context: { boughtThisRound: [] } },
  };
}

function scn(id: string, given: DeepPartial<GameState>, when: Step[], then?: Scenario['then']): Scenario {
  return { id, title: id, tier: 'mvp-core', gates: ['M6'], given: { playerCount: 3, rng: { rolls: [] }, state: given }, when, then };
}

describe('Phase 3 gene buying (BUY-*)', () => {
  it('BUY-01 — buy a basic gene', () => {
    runScenario(
      scn('BUY-01', buyState({ bp: 4, genes: [] }), [
        {
          seat: 'seat-0',
          action: { type: 'buy_gene', gene: 'DEFENSE' },
          expectEvents: [{ type: 'gene_bought', gene: 'DEFENSE', cost: 4, gaveUp: null }],
        },
      ], [
        { path: 'player("seat-0").bp', equals: 0 },
        { path: 'player("seat-0").genes', equals: ['DEFENSE'] },
      ]),
    );
  });

  it('BUY-02 — copy limit excludes SPORES; duplicate buy rejected', () => {
    runScenario(
      scn('BUY-02', buyState({ bp: 4, genes: ['DEFENSE'], others: { 'seat-1': ['SPORES'] } }), [
        {
          seat: 'seat-0',
          action: { type: 'buy_gene', gene: 'DEFENSE' },
          assertBefore: [{ legalFor: 'seat-0', excludes: { type: 'buy_gene', gene: 'SPORES' } }],
          expectReject: { reasonMatches: 'duplicate|already own' },
        },
      ]),
    );
  });

  it('BUY-03 — advanced upgrade consumes prerequisite, locks re-buy', () => {
    runScenario(
      scn('BUY-03', buyState({ bp: 4, genes: ['SPEED'], round: 2 }), [
        {
          seat: 'seat-0',
          action: { type: 'buy_gene', gene: 'PERSISTENCE', upgradeFrom: 'SPEED' },
          expectEvents: [{ type: 'gene_bought', gene: 'PERSISTENCE', cost: 4, gaveUp: 'SPEED' }],
          assert: [{ legalFor: 'seat-0', excludes: { type: 'buy_gene', gene: 'SPEED' } }],
        },
      ], [
        { path: 'player("seat-0").genes', equals: ['PERSISTENCE'] },
        { path: 'player("seat-0").bp', equals: 0 },
      ]),
    );
  });

  it('BUY-04 — same-phase upgrade rejected (prereq must be held a prior round)', () => {
    runScenario(
      scn('BUY-04', buyState({ bp: 8, genes: [], round: 2 }), [
        { seat: 'seat-0', action: { type: 'buy_gene', gene: 'SPEED' } },
        {
          seat: 'seat-0',
          action: { type: 'buy_gene', gene: 'PERSISTENCE', upgradeFrom: 'SPEED' },
          expectReject: { reasonMatches: 'prior round|same phase' },
        },
      ], [{ path: 'player("seat-0").genes', equals: ['SPEED'] }]),
    );
  });

  it('BUY-05 — buy multiple then pass', () => {
    runScenario(
      scn('BUY-05', buyState({ bp: 7, genes: [] }), [
        { seat: 'seat-0', action: { type: 'buy_gene', gene: 'INTELLIGENCE' } },
        {
          seat: 'seat-0',
          action: { type: 'buy_gene', gene: 'MOVEMENT_I' },
          // 7 − 2 − 3 = 2 BP left after both buys (checked before the +10 grant at Phase 4 start)
          assert: [
            { path: 'player("seat-0").bp', equals: 2 },
            { path: 'player("seat-0").genes', equals: ['INTELLIGENCE', 'MOVEMENT_I'] },
          ],
        },
        { seat: 'seat-0', action: { type: 'pass_buying' } },
      ], [
        { path: 'phase', equals: 'phase4_division' }, // moved on from buying
      ]),
    );
  });

  it('BUY-06 — unaffordable gene excluded from legalActions', () => {
    runScenario(
      scn('BUY-06', buyState({ bp: 2, genes: [] }), [], [
        { legalFor: 'seat-0', excludes: { type: 'buy_gene', gene: 'LONGEVITY' } },
        { legalFor: 'seat-0', includes: { type: 'buy_gene', gene: 'INTELLIGENCE' } },
      ]),
    );
  });
});
