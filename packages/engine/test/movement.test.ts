import { describe, it } from 'vitest';
import type { Color, Direction, GameState } from '@ps/shared';
import { runScenario, type DeepPartial, type RngSpec, type Scenario, type Step } from './runner.js';

// Build a single-amoeba Phase-1 state resting on an amoeba_action decision for seat-0.
function moveState(opts: {
  drift?: Direction | 'none';
  bp?: number;
  genes?: string[];
  amoeba: { id: number; location: string; dp?: number };
  cubesAt?: Record<string, Partial<Record<Color, number>>>;
}): DeepPartial<GameState> {
  const drift = opts.drift ?? 'none';
  const state: DeepPartial<GameState> = {
    round: 1,
    phase: 'phase1_movement_feeding',
    environment: { current: { drift } },
    players: {
      'seat-0': {
        bp: opts.bp ?? 4,
        genes: opts.genes ?? [],
        amoebas: [{ id: opts.amoeba.id, location: opts.amoeba.location, dp: opts.amoeba.dp ?? 0 }],
      },
    },
    currentDecision: {
      seat: 'seat-0',
      kind: 'amoeba_action',
      context: { amoebaId: opts.amoeba.id, cellId: opts.amoeba.location, driftDirection: drift, moveCostBp: 1 },
    },
  };
  if (opts.cubesAt) {
    state.board = Object.fromEntries(
      Object.entries(opts.cubesAt).map(([id, cubes]) => [id, { cubes }]),
    ) as DeepPartial<GameState>['board'];
  }
  return state;
}

function scenario(
  id: string,
  rng: RngSpec,
  given: DeepPartial<GameState>,
  when: Step[],
  then?: Scenario['then'],
): Scenario {
  return { id, title: id, tier: 'mvp-core', gates: ['M3'], given: { playerCount: 3, rng, state: given }, when, then };
}

describe('Phase 1 movement (MOVE-*)', () => {
  it('MOVE-01 — drift normal (E from 0,2 to 1,2)', () => {
    runScenario(
      scenario(
        'MOVE-01',
        { rolls: [] },
        moveState({ drift: 'E', amoeba: { id: 2, location: '0,2' } }),
        [
          {
            seat: 'seat-0',
            action: { type: 'drift', amoebaId: 2 },
            expectEvents: [{ type: 'drifted', from: '0,2', to: '1,2' }],
          },
        ],
        [
          { path: 'amoeba("seat-0",2).location', equals: '1,2' },
          { path: 'player("seat-0").bp', equals: 4 },
        ],
      ),
    );
  });

  it('MOVE-02 — drift into edge stays (obstacle)', () => {
    runScenario(
      scenario('MOVE-02', { rolls: [] }, moveState({ drift: 'E', amoeba: { id: 2, location: '4,2' } }), [
        { seat: 'seat-0', action: { type: 'drift', amoebaId: 2 }, expectEvents: [{ type: 'stayed', cellId: '4,2', reason: 'obstacle' }] },
      ], [{ path: 'amoeba("seat-0",2).location', equals: '4,2' }]),
    );
  });

  it('MOVE-03 — drift into island stays (obstacle)', () => {
    runScenario(
      scenario('MOVE-03', { rolls: [] }, moveState({ drift: 'E', amoeba: { id: 2, location: '1,2' } }), [
        { seat: 'seat-0', action: { type: 'drift', amoebaId: 2 }, expectEvents: [{ type: 'stayed', cellId: '1,2', reason: 'obstacle' }] },
      ], [{ path: 'amoeba("seat-0",2).location', equals: '1,2' }]),
    );
  });

  it('MOVE-04 — no-drift card resolves as stay (no_drift)', () => {
    runScenario(
      scenario('MOVE-04', { rolls: [] }, moveState({ drift: 'none', amoeba: { id: 2, location: '1,1' } }), [
        { seat: 'seat-0', action: { type: 'drift', amoebaId: 2 }, expectEvents: [{ type: 'stayed', reason: 'no_drift' }] },
      ], [{ path: 'amoeba("seat-0",2).location', equals: '1,1' }]),
    );
  });

  it('MOVE-05 — move, normal roll 3 (East)', () => {
    runScenario(
      scenario('MOVE-05', { rolls: [3] }, moveState({ amoeba: { id: 2, location: '1,1' }, bp: 4 }), [
        { seat: 'seat-0', action: { type: 'move', amoebaId: 2 }, expectEvents: [{ type: 'moved', roll: 3, bpSpent: 1, from: '1,1', to: '2,1' }] },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '2,1' },
        { path: 'player("seat-0").bp', equals: 3 },
      ]),
    );
  });

  it('MOVE-06 — move, roll 5 stays (roll5), BP still spent', () => {
    runScenario(
      scenario('MOVE-06', { rolls: [5] }, moveState({ amoeba: { id: 2, location: '1,1' }, bp: 4 }), [
        { seat: 'seat-0', action: { type: 'move', amoebaId: 2 }, expectEvents: [{ type: 'stayed', reason: 'roll5' }] },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '1,1' },
        { path: 'player("seat-0").bp', equals: 3 },
      ]),
    );
  });

  it('MOVE-07 — move, roll 6 → choose direction → move', () => {
    runScenario(
      scenario('MOVE-07', { rolls: [6] }, moveState({ amoeba: { id: 2, location: '1,1' }, bp: 4 }), [
        {
          seat: 'seat-0',
          action: { type: 'move', amoebaId: 2 },
          assert: [{ path: 'currentDecision.kind', equals: 'choose_move_direction' }],
        },
        {
          seat: 'seat-0',
          action: { type: 'set_move_direction', amoebaId: 2, direction: 'S' },
          expectEvents: [{ type: 'moved', to: '1,2' }],
        },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '1,2' },
        { path: 'player("seat-0").bp', equals: 3 },
      ]),
    );
  });

  it('MOVE-08 — move into obstacle after roll, stays, BP spent', () => {
    runScenario(
      scenario('MOVE-08', { rolls: [3] }, moveState({ amoeba: { id: 2, location: '4,1' }, bp: 4 }), [
        { seat: 'seat-0', action: { type: 'move', amoebaId: 2 }, expectEvents: [{ type: 'stayed', reason: 'obstacle' }] },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '4,1' },
        { path: 'player("seat-0").bp', equals: 3 },
      ]),
    );
  });

  it('MOVE-09 — MOVEMENT I rolls [2,3]: choose N or E', () => {
    runScenario(
      scenario('MOVE-09', { rolls: [2, 3] }, moveState({ genes: ['MOVEMENT_I'], amoeba: { id: 2, location: '1,1' }, bp: 4 }), [
        {
          seat: 'seat-0',
          action: { type: 'move', amoebaId: 2 },
          assert: [
            { path: 'currentDecision.kind', equals: 'choose_move_direction' },
            { legalFor: 'seat-0', count: 2 },
            { legalFor: 'seat-0', includes: { type: 'set_move_direction', amoebaId: 2, direction: 'N' } },
            { legalFor: 'seat-0', includes: { type: 'set_move_direction', amoebaId: 2, direction: 'E' } },
          ],
        },
        { seat: 'seat-0', action: { type: 'set_move_direction', amoebaId: 2, direction: 'E' } },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '2,1' },
        { path: 'player("seat-0").bp', equals: 3 },
      ]),
    );
  });

  it('MOVE-10 — STREAMLINING: move costs 0 BP', () => {
    runScenario(
      scenario('MOVE-10', { rolls: [3] }, moveState({ genes: ['STREAMLINING'], amoeba: { id: 2, location: '1,1' }, bp: 4 }), [
        { seat: 'seat-0', action: { type: 'move', amoebaId: 2 }, expectEvents: [{ type: 'moved', bpSpent: 0 }] },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '2,1' },
        { path: 'player("seat-0").bp', equals: 4 },
      ]),
    );
  });

  it('MOVE-11 — SPEED: two moves [3,3], second free', () => {
    runScenario(
      scenario('MOVE-11', { rolls: [3, 3] }, moveState({ genes: ['SPEED'], amoeba: { id: 2, location: '1,1' }, bp: 4 }), [
        { seat: 'seat-0', action: { type: 'move', amoebaId: 2 } },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '3,1' },
        { path: 'player("seat-0").bp', equals: 3 },
      ]),
    );
  });

  it('MOVE-12 — MOVEMENT II: choose direction, no die drawn', () => {
    runScenario(
      scenario('MOVE-12', { rolls: [] }, moveState({ genes: ['MOVEMENT_II'], amoeba: { id: 2, location: '1,1' }, bp: 4 }), [
        {
          seat: 'seat-0',
          action: { type: 'move', amoebaId: 2 },
          assert: [{ path: 'currentDecision.kind', equals: 'choose_move_direction' }],
        },
        { seat: 'seat-0', action: { type: 'set_move_direction', amoebaId: 2, direction: 'S' } },
      ], [
        { path: 'amoeba("seat-0",2).location', equals: '1,2' },
        { path: 'player("seat-0").bp', equals: 3 },
      ]),
    );
  });

  it('MOVE-13 — TENTACLE carry (3p capacity 2)', () => {
    runScenario(
      scenario('MOVE-13', { rolls: [3] }, moveState({
        genes: ['TENTACLE'],
        amoeba: { id: 2, location: '1,1' },
        bp: 4,
        cubesAt: { '1,1': { green: 2 } },
      }), [
        // carrying 3 in 3p is rejected (capacity 2); state unchanged, no die consumed
        { seat: 'seat-0', action: { type: 'move', amoebaId: 2, carry: { green: 3 } }, expectReject: { reasonMatches: 'capacity' } },
        { seat: 'seat-0', action: { type: 'move', amoebaId: 2, carry: { green: 2 } }, expectEvents: [{ type: 'moved', from: '1,1', to: '2,1' }] },
      ], [
        { path: 'cell("1,1").cubes.green', absent: true },
        { path: 'cell("2,1").cubes.green', equals: 2 },
        { path: 'amoeba("seat-0",2).location', equals: '2,1' },
      ]),
    );
  });

  it('MOVE-14 — HOLDING stay instead of drift (function 1)', () => {
    runScenario(
      scenario('MOVE-14', { rolls: [] }, moveState({ genes: ['HOLDING'], drift: 'E', amoeba: { id: 2, location: '0,2' } }), [
        {
          seat: 'seat-0',
          action: { type: 'stay', amoebaId: 2 },
          assertBefore: [
            { legalFor: 'seat-0', includes: { type: 'drift', amoebaId: 2 } },
            { legalFor: 'seat-0', includes: { type: 'stay', amoebaId: 2 } },
          ],
          expectEvents: [{ type: 'stayed', reason: 'holding' }],
        },
      ], [{ path: 'amoeba("seat-0",2).location', equals: '0,2' }]),
    );
  });
});
