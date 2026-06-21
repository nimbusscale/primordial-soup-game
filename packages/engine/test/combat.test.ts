import { describe, it } from 'vitest';
import type { Color, GameState } from '@ps/shared';
import { runScenario, type DeepPartial, type RngSpec, type Scenario, type Step } from './runner.js';

function scn(id: string, rng: RngSpec, given: DeepPartial<GameState>, when: Step[], then?: Scenario['then']): Scenario {
  return { id, title: id, tier: 'full-ruleset', gates: ['M15'], given: { playerCount: 3, rng, state: given }, when, then };
}

// Phase-1 state pinned on a struggle_target decision for seat-0 (attacker, red).
function struggleState(opts: {
  attackerGenes?: string[];
  attackerBp?: number;
  defenderGenes?: string[];
  defenderBp?: number;
  cubesAt?: Record<string, Partial<Record<Color, number>>>;
  defenderLoc?: string;
}): DeepPartial<GameState> {
  const cell = '1,1';
  const state: DeepPartial<GameState> = {
    round: 1,
    phase: 'phase1_movement_feeding',
    players: {
      'seat-0': { color: 'red', bp: opts.attackerBp ?? 4, genes: opts.attackerGenes ?? ['STRUGGLE_FOR_SURVIVAL'], amoebas: [{ id: 1, location: cell, dp: 0 }] },
      'seat-1': { color: 'green', bp: opts.defenderBp ?? 4, genes: opts.defenderGenes ?? [], amoebas: [{ id: 2, location: opts.defenderLoc ?? cell, dp: 0 }] },
    },
    currentDecision: { seat: 'seat-0', kind: 'struggle_target', context: { attackerId: 1, cellId: cell } },
  };
  if (opts.cubesAt) state.board = Object.fromEntries(Object.entries(opts.cubesAt).map(([id, cubes]) => [id, { cubes }])) as DeepPartial<GameState>['board'];
  return state;
}

// Phase-4 state pinned on seat-2 (descending-last) divide; passing → Phase 5 deaths → aggression.
function aggressionTrigger(opts: {
  attackerGenes: string[];
  attackerBp?: number;
  defenderGenes?: string[];
  defenderBp?: number;
  defenderDp?: number;
}): DeepPartial<GameState> {
  const cell = '1,1';
  return {
    round: 5,
    phase: 'phase4_division',
    supply: { red: 10, green: 10, blue: 10 },
    players: {
      'seat-0': { color: 'red', score: 30, bp: opts.attackerBp ?? 4, genes: opts.attackerGenes, amoebas: [{ id: 1, location: cell, dp: 0 }] },
      'seat-1': { color: 'green', score: 20, bp: opts.defenderBp ?? 4, genes: opts.defenderGenes ?? [], amoebas: [{ id: 2, location: cell, dp: opts.defenderDp ?? 0 }] },
      'seat-2': { color: 'blue', score: 10, bp: 0, genes: [], amoebas: [] },
    },
    currentDecision: { seat: 'seat-2', kind: 'divide_amoebas', context: {} },
  };
}

const passToAggression: Step = { seat: '<current>', action: { type: 'pass_division' } };

describe('Combat genes (COMBAT-*)', () => {
  it('COMBAT-01 — STRUGGLE basic: kill, special one-cube-each excretion', () => {
    runScenario(
      scn('COMBAT-01', { rolls: [] }, struggleState({}), [
        {
          seat: 'seat-0',
          action: { type: 'struggle_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 },
          expectEvents: [{ type: 'attacked', kind: 'struggle' }, { type: 'died', cause: 'struggle' }],
        },
      ], [
        { path: 'amoeba("seat-1",2).location', equals: null },
        { path: 'cell("1,1").cubes.red', equals: 1 },
        { path: 'cell("1,1").cubes.green', equals: 1 },
        { path: 'cell("1,1").cubes.blue', equals: 1 },
        { path: 'player("seat-0").bp', equals: 3 },
      ]),
    );
  });

  it('COMBAT-02 — DEFENSE fight, attacker wins (no replacement cubes)', () => {
    runScenario(
      scn('COMBAT-02', { rolls: [6, 2] }, struggleState({ defenderGenes: ['DEFENSE'] }), [
        { seat: 'seat-0', action: { type: 'struggle_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
        { seat: 'seat-1', action: { type: 'respond_defense' }, expectEvents: [{ type: 'defended', outcome: 'attacker_won' }, { type: 'died', cause: 'fight' }] },
      ], [
        { path: 'amoeba("seat-1",2).location', equals: null },
        { path: 'cell("1,1").cubes.red', absent: true }, // no replacement on a DEFENSE fight
      ]),
    );
  });

  it('COMBAT-02b — DEFENSE fight, defender wins → attacker starves', () => {
    runScenario(
      scn('COMBAT-02b', { rolls: [2, 6] }, struggleState({ defenderGenes: ['DEFENSE'] }), [
        { seat: 'seat-0', action: { type: 'struggle_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
        { seat: 'seat-1', action: { type: 'respond_defense' }, expectEvents: [{ type: 'defended', outcome: 'defender_won' }] },
      ], [
        { path: 'amoeba("seat-1",2).location', equals: '1,1' }, // survives
        { path: 'amoeba("seat-0",1).dp', equals: 1 }, // attacker starves
      ]),
    );
  });

  it('COMBAT-03 — ESCAPE avoids the attack', () => {
    runScenario(
      scn('COMBAT-03', { rolls: [] }, struggleState({ defenderGenes: ['ESCAPE'] }), [
        { seat: 'seat-0', action: { type: 'struggle_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
        { seat: 'seat-1', action: { type: 'respond_escape', direction: 'E' }, expectEvents: [{ type: 'escaped', from: '1,1', to: '2,1' }] },
      ], [{ path: 'amoeba("seat-1",2).location', equals: '2,1' }]),
    );
  });

  it('COMBAT-04 — DEFENSE + ESCAPE both offered against the same attack', () => {
    runScenario(
      scn('COMBAT-04', { rolls: [] }, struggleState({ defenderGenes: ['DEFENSE', 'ESCAPE'] }), [
        { seat: 'seat-0', action: { type: 'struggle_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
        {
          seat: 'seat-1',
          action: { type: 'respond_none' },
          assertBefore: [
            { legalFor: 'seat-1', count: 3 },
            { legalFor: 'seat-1', includes: { type: 'respond_defense' } },
            { legalFor: 'seat-1', includes: { type: 'respond_escape' } },
          ],
        },
      ]),
    );
  });

  it('COMBAT-05 — HOLDING follows an escaping victim; attacker may eat at destination', () => {
    runScenario(
      scn('COMBAT-05', { rolls: [] }, struggleState({
        attackerGenes: ['STRUGGLE_FOR_SURVIVAL', 'HOLDING'],
        defenderGenes: ['ESCAPE'],
        cubesAt: { '2,1': { green: 2, blue: 1 } }, // food at the destination
      }), [
        { seat: 'seat-0', action: { type: 'struggle_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
        { seat: 'seat-1', action: { type: 'respond_escape', direction: 'E' }, expectEvents: [{ type: 'escaped' }, { type: 'fed' }] },
      ], [
        { path: 'amoeba("seat-0",1).location', equals: '2,1' }, // followed
        { path: 'amoeba("seat-0",1).dp', equals: 0 }, // ate, did not starve
      ]),
    );
  });

  it('COMBAT-06 — ARMOR cannot be attacked in Phase 1', () => {
    runScenario(
      scn('COMBAT-06', { rolls: [] }, struggleState({ defenderGenes: ['ARMOR'] }), [
        {
          seat: 'seat-0',
          action: { type: 'struggle_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 },
          assertBefore: [{ legalFor: 'seat-0', excludes: { type: 'struggle_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } }],
          expectReject: { reasonMatches: 'ARMOR' },
        },
      ]),
    );
  });

  it('COMBAT-07 — AGGRESSION kills a co-located enemy in Phase 5', () => {
    runScenario(
      scn('COMBAT-07', { rolls: [] }, aggressionTrigger({ attackerGenes: ['AGGRESSION'] }), [
        passToAggression,
        {
          seat: '<current>',
          action: { type: 'aggression_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 },
          expectEvents: [{ type: 'attacked', kind: 'aggression' }, { type: 'died', cause: 'aggression' }],
        },
      ], [
        { path: 'amoeba("seat-1",2).location', equals: null },
        { path: 'cell("1,1").cubes.red', equals: 2 },
        { path: 'player("seat-0").bp', equals: 3 },
      ]),
    );
  });

  it('COMBAT-08 — AGGRESSION vs ARMOR: not killed, takes 1 DP', () => {
    runScenario(
      scn('COMBAT-08', { rolls: [] }, aggressionTrigger({ attackerGenes: ['AGGRESSION'], defenderGenes: ['ARMOR'] }), [
        passToAggression,
        { seat: '<current>', action: { type: 'aggression_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 }, expectEvents: [{ type: 'attacked', kind: 'aggression' }] },
      ], [
        { path: 'amoeba("seat-1",2).location', equals: '1,1' },
        { path: 'amoeba("seat-1",2).dp', equals: 1 },
      ]),
    );
  });

  it('COMBAT-09 — AGGRESSION + PERSISTENCE vs ARMOR succeeds (no retry)', () => {
    runScenario(
      scn('COMBAT-09', { rolls: [] }, aggressionTrigger({ attackerGenes: ['AGGRESSION', 'PERSISTENCE'], defenderGenes: ['ARMOR'] }), [
        passToAggression,
        { seat: '<current>', action: { type: 'aggression_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
      ], [
        { path: 'amoeba("seat-1",2).dp', equals: 1 }, // ARMOR took 1 DP; attack succeeded, no PERSISTENCE retry
      ]),
    );
  });

  it('COMBAT-10a — ARMOR + ESCAPE survive AGGRESSION + PERSISTENCE + HOLDING (escape twice)', () => {
    runScenario(
      scn('COMBAT-10a', { rolls: [] }, aggressionTrigger({ attackerGenes: ['AGGRESSION', 'PERSISTENCE', 'HOLDING'], defenderGenes: ['ARMOR', 'ESCAPE'], defenderBp: 4 }), [
        passToAggression,
        { seat: '<current>', action: { type: 'aggression_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
        { seat: 'seat-1', action: { type: 'respond_escape', direction: 'E' } }, // 1,1→2,1; attacker follows + PERSISTENCE retries
        { seat: 'seat-1', action: { type: 'respond_escape', direction: 'E' } }, // 2,1→3,1; escapes again → survives
      ], [{ path: 'amoeba("seat-1",2).location', equals: '3,1' }]),
    );
  });

  it('COMBAT-10b — ARMOR + ESCAPE: decline escape, ARMOR absorbs (1 DP)', () => {
    runScenario(
      scn('COMBAT-10b', { rolls: [] }, aggressionTrigger({ attackerGenes: ['AGGRESSION', 'PERSISTENCE', 'HOLDING'], defenderGenes: ['ARMOR', 'ESCAPE'], defenderBp: 4 }), [
        passToAggression,
        { seat: '<current>', action: { type: 'aggression_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
        { seat: 'seat-1', action: { type: 'respond_none' } },
      ], [
        { path: 'amoeba("seat-1",2).location', equals: '1,1' },
        { path: 'amoeba("seat-1",2).dp', equals: 1 },
      ]),
    );
  });

  it('COMBAT-11 — DEFENSE vs AGGRESSION, defender wins → no starvation', () => {
    runScenario(
      scn('COMBAT-11', { rolls: [2, 6] }, aggressionTrigger({ attackerGenes: ['AGGRESSION'], defenderGenes: ['DEFENSE'] }), [
        passToAggression,
        { seat: '<current>', action: { type: 'aggression_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
        { seat: 'seat-1', action: { type: 'respond_defense' }, expectEvents: [{ type: 'defended', outcome: 'defender_won' }] },
      ], [
        { path: 'amoeba("seat-0",1).dp', equals: 0 }, // attacker not starved (aggression ≠ feeding)
        { path: 'amoeba("seat-1",2).location', equals: '1,1' }, // defender survives
      ]),
    );
  });

  it('COMBAT-12 — PERSISTENCE second attempt on a failed struggle', () => {
    runScenario(
      scn('COMBAT-12', { rolls: [2, 6, 6, 2] }, struggleState({ attackerGenes: ['STRUGGLE_FOR_SURVIVAL', 'PERSISTENCE'], defenderGenes: ['DEFENSE'], defenderBp: 4 }), [
        { seat: 'seat-0', action: { type: 'struggle_attack', attackerId: 1, targetSeat: 'seat-1', targetAmoebaId: 2 } },
        { seat: 'seat-1', action: { type: 'respond_defense' }, expectEvents: [{ type: 'defended', outcome: 'defender_won' }] }, // attempt 1: attacker loses
        { seat: 'seat-1', action: { type: 'respond_defense' }, expectEvents: [{ type: 'defended', outcome: 'attacker_won' }, { type: 'died', cause: 'fight' }] }, // attempt 2: attacker wins
      ], [{ path: 'amoeba("seat-1",2).location', equals: null }]),
    );
  });
});
