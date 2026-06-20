import { describe, it } from 'vitest';
import type { EnvCard, GameState } from '@ps/shared';
import { runScenario, type DeepPartial, type Scenario, type Step } from './runner.js';

// A Phase-1 state for seat-0 (one amoeba) whose drift ends Phase 1 and triggers Phase 2.
function phase1ToPhase2(opts: {
  round: number;
  genes?: string[];
  bp?: number;
  oldCard: EnvCard;
  deck: string[];
}): DeepPartial<GameState> {
  return {
    round: opts.round,
    phase: 'phase1_movement_feeding',
    environment: { current: opts.oldCard, deckRemaining: opts.deck, discarded: [] },
    players: {
      'seat-0': { genes: opts.genes ?? [], bp: opts.bp ?? 4, amoebas: [{ id: 1, location: '1,1', dp: 0 }] },
    },
    currentDecision: {
      seat: 'seat-0',
      kind: 'amoeba_action',
      context: { amoebaId: 1, cellId: '1,1', driftDirection: 'none', moveCostBp: 1 },
    },
  };
}

// A state resting directly on a balance_gene_defect decision for seat-0.
function defectDecisionState(opts: { genes: string[]; bp: number; excessMp: number; card: EnvCard }): DeepPartial<GameState> {
  return {
    round: 2,
    phase: 'phase2_environment',
    environment: { current: opts.card },
    players: { 'seat-0': { genes: opts.genes, bp: opts.bp, amoebas: [] } },
    currentDecision: { seat: 'seat-0', kind: 'balance_gene_defect', context: { excessMp: opts.excessMp } },
  };
}

const NONE_OZONE13: EnvCard = { id: 'env-08', ozoneThickness: 13, drift: 'none' };
const OZONE6 = { id: 'env-10', ozoneThickness: 6, drift: 'none' as const };
const OZONE10 = { id: 'env-01', ozoneThickness: 10, drift: 'none' as const };

function scn(id: string, given: DeepPartial<GameState>, when: Step[], then?: Scenario['then']): Scenario {
  return { id, title: id, tier: 'mvp-core', gates: ['M5'], given: { playerCount: 3, rng: { rolls: [] }, state: given }, when, then };
}

describe('Phase 2 environment & gene defects (DEFECT-*)', () => {
  it('DEFECT-01 — no defect in round 1 even if MP exceeds ozone', () => {
    runScenario(
      scn(
        'DEFECT-01',
        phase1ToPhase2({ round: 1, genes: ['SPEED', 'DIVISION_RATE', 'STREAMLINING'], oldCard: { id: 'env-01', ozoneThickness: 10, drift: 'none' }, deck: ['env-10', 'env-02'] }),
        [{ seat: 'seat-0', action: { type: 'drift', amoebaId: 1 } }],
        [
          { path: 'currentDecision', equals: null }, // proceeded past phase 2; no defect decision
          { path: 'phase', equals: 'phase3_genes' },
        ],
      ),
    );
  });

  it('DEFECT-02 — defect decision with locked-in excess', () => {
    runScenario(
      scn(
        'DEFECT-02',
        phase1ToPhase2({ round: 2, bp: 6, genes: ['SPEED', 'DIVISION_RATE', 'STREAMLINING'], oldCard: { id: 'env-01', ozoneThickness: 10, drift: 'none' }, deck: ['env-10', 'env-02'] }),
        [{ seat: 'seat-0', action: { type: 'drift', amoebaId: 1 }, expectEvents: [{ type: 'environment_revealed' }] }],
        [
          { path: 'currentDecision.kind', equals: 'balance_gene_defect' },
          { path: 'currentDecision.context.excessMp', equals: 6 }, // MP 12 − ozone 6
          { path: 'phase', equals: 'phase2_environment' },
        ],
      ),
    );
  });

  it('DEFECT-03 — balance by paying BP', () => {
    runScenario(
      scn(
        'DEFECT-03',
        defectDecisionState({ genes: ['SPEED', 'DIVISION_RATE', 'STREAMLINING'], bp: 6, excessMp: 6, card: OZONE6 }),
        [
          {
            seat: 'seat-0',
            action: { type: 'balance_defect', giveUp: [], payBp: 6 },
            expectEvents: [{ type: 'defect_balanced', bpPaid: 6, gaveUp: [] }],
          },
        ],
        [
          { path: 'player("seat-0").bp', equals: 0 },
          { path: 'player("seat-0").genes', equals: ['SPEED', 'DIVISION_RATE', 'STREAMLINING'] },
        ],
      ),
    );
  });

  it('DEFECT-04 — balance by giving up genes; excess lost; under-balance rejected', () => {
    runScenario(
      scn(
        'DEFECT-04',
        defectDecisionState({ genes: ['SPEED', 'DIVISION_RATE', 'STREAMLINING'], bp: 0, excessMp: 6, card: OZONE6 }),
        [
          // SPEED (3) alone does not cover 6 → rejected, state unchanged
          { seat: 'seat-0', action: { type: 'balance_defect', giveUp: ['SPEED'], payBp: 0 }, expectReject: { reasonMatches: 'cover|does not' } },
          // STREAMLINING (4) + DIVISION_RATE (5) = 9 covers 6; the 3 excess is lost
          {
            seat: 'seat-0',
            action: { type: 'balance_defect', giveUp: ['STREAMLINING', 'DIVISION_RATE'], payBp: 0 },
            expectEvents: [{ type: 'defect_balanced', gaveUp: ['STREAMLINING', 'DIVISION_RATE'], bpPaid: 0 }],
          },
        ],
        [
          { path: 'player("seat-0").genes', equals: ['SPEED'] },
          { path: 'player("seat-0").bp', equals: 0 },
        ],
      ),
    );
  });

  it('DEFECT-05 — RAY PROTECTION −2 to the MP sum (locked excess = 2)', () => {
    runScenario(
      scn(
        'DEFECT-05',
        phase1ToPhase2({ round: 2, genes: ['LONGEVITY', 'STREAMLINING', 'MOVEMENT_II', 'RAY_PROTECTION'], oldCard: NONE_OZONE13, deck: ['env-01', 'env-02'] }),
        [{ seat: 'seat-0', action: { type: 'drift', amoebaId: 1 } }],
        [
          { path: 'currentDecision.kind', equals: 'balance_gene_defect' },
          { path: 'currentDecision.context.excessMp', equals: 2 }, // raw 14 − 2 (RAY) = 12 vs ozone 10
        ],
      ),
    );
  });

  it('DEFECT-06 — give up RAY PROTECTION satisfies 4 (FAQ); no MP recompute', () => {
    runScenario(
      scn(
        'DEFECT-06',
        defectDecisionState({ genes: ['LONGEVITY', 'STREAMLINING', 'MOVEMENT_II', 'RAY_PROTECTION'], bp: 0, excessMp: 2, card: OZONE10 }),
        [
          {
            seat: 'seat-0',
            action: { type: 'balance_defect', giveUp: ['RAY_PROTECTION'], payBp: 0 },
            expectEvents: [{ type: 'defect_balanced', gaveUp: ['RAY_PROTECTION'] }],
          },
        ],
        [{ path: 'player("seat-0").genes', equals: ['LONGEVITY', 'STREAMLINING', 'MOVEMENT_II'] }],
      ),
    );
  });

  it('DEFECT-07 — environment reveal and deck order', () => {
    runScenario(
      scn(
        'DEFECT-07',
        phase1ToPhase2({ round: 1, oldCard: { id: 'env-01', ozoneThickness: 10, drift: 'none' }, deck: ['env-05', 'env-06', 'env-07'] }),
        [{ seat: 'seat-0', action: { type: 'drift', amoebaId: 1 }, expectEvents: [{ type: 'environment_revealed' }] }],
        [
          { path: 'environment.current.id', equals: 'env-05' },
          { path: 'environment.discarded.0', equals: 'env-01' },
          { path: 'environment.deckRemaining.0', equals: 'env-06' },
        ],
      ),
    );
  });
});
