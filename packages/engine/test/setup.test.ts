import { describe, expect, it } from 'vitest';
import { ALL_COLORS, BOARD_CELLS } from '@ps/shared';
import type { GameAction, GameState } from '@ps/shared';
import { createInitialState, makeSeededRng } from '@ps/engine';
import { runScenario, type Scenario, type Step } from './runner.js';

// Build the `when` steps for a full setup: ascending round uses amoeba 1, descending
// round uses amoeba 2, one placement per listed cell in placement order.
function placementSteps(cells: string[]): Step[] {
  const n = cells.length / 2;
  return cells.map((cellId, i) => ({
    seat: '<current>' as const,
    action: { type: 'place_starting_amoeba', amoebaId: i < n ? 1 : 2, cellId } satisfies GameAction,
  }));
}

function onBoardCount(state: GameState): number {
  let n = 0;
  for (const seat of state.seatOrder)
    for (const a of state.players[seat]!.amoebas) if (a.location !== null) n++;
  return n;
}

describe('SETUP-01 — 3-player setup correctness', () => {
  it('places two amoebas per seat, 0 DP, distinct start spaces, cubes/supply correct', () => {
    const scenario: Scenario = {
      id: 'SETUP-01',
      title: '3-player setup correctness',
      tier: 'mvp-core',
      gates: ['M2'],
      given: { playerCount: 3, rng: { seed: 11 }, setupActions: [] },
      when: placementSteps(['0,0', '0,4', '4,0', '4,4', '1,1', '3,3']),
      then: [
        { path: 'round', equals: 1 },
        { path: 'phase', equals: 'phase1_movement_feeding' },
        { path: 'currentDecision.kind', equals: 'amoeba_action' },
      ],
    };
    const { finalState: s } = runScenario(scenario);

    // Three colors in play.
    expect(s.colorsInPlay).toEqual(['red', 'green', 'blue']);

    // Every one of the 24 cells holds 2 cubes of each of the 3 colors.
    for (const id of BOARD_CELLS) {
      expect(s.board[id]!.cubes).toEqual({ red: 2, green: 2, blue: 2 });
    }

    // Supply: 55 − 24*2 = 7 per in-play color.
    expect(s.supply.red).toBe(7);
    expect(s.supply.green).toBe(7);
    expect(s.supply.blue).toBe(7);

    // Distinct start spaces in 1..3.
    const scores = s.seatOrder.map((seat) => s.players[seat]!.score);
    expect(new Set(scores).size).toBe(3);
    for (const sc of scores) expect(sc).toBeGreaterThanOrEqual(1), expect(sc).toBeLessThanOrEqual(3);

    // Two on-board amoebas per seat, all 0 DP (3p first amoebas get 0 DP).
    for (const seat of s.seatOrder) {
      const onBoard = s.players[seat]!.amoebas.filter((a) => a.location !== null);
      expect(onBoard).toHaveLength(2);
      for (const a of onBoard) expect(a.dp).toBe(0);
    }

    // No cell hosts more than one amoeba.
    const occupied = new Map<string, number>();
    for (const seat of s.seatOrder)
      for (const a of s.players[seat]!.amoebas)
        if (a.location) occupied.set(a.location, (occupied.get(a.location) ?? 0) + 1);
    for (const count of occupied.values()) expect(count).toBe(1);
  });
});

describe('SETUP-02 — 4-player starting-DP asymmetry', () => {
  it('first amoebas get 1 DP, second 0 DP; 4 colors; supply 7 each', () => {
    const scenario: Scenario = {
      id: 'SETUP-02',
      title: '4-player starting-DP asymmetry',
      tier: 'mvp-core',
      gates: ['M2', 'M17'],
      given: { playerCount: 4, rng: { seed: 11 }, setupActions: [] },
      when: placementSteps(['0,0', '0,4', '4,0', '4,4', '1,1', '3,3', '1,3', '3,1']),
    };
    const { finalState: s } = runScenario(scenario);

    expect(s.colorsInPlay).toEqual(ALL_COLORS);
    for (const c of ALL_COLORS) expect(s.supply[c]).toBe(7);
    for (const id of BOARD_CELLS) {
      expect(s.board[id]!.cubes).toEqual({ red: 2, green: 2, blue: 2, yellow: 2 });
    }

    // Each seat's FIRST-placed amoeba (id 1) has 1 DP; SECOND (id 2) has 0 DP.
    for (const seat of s.seatOrder) {
      const a1 = s.players[seat]!.amoebas.find((a) => a.id === 1)!;
      const a2 = s.players[seat]!.amoebas.find((a) => a.id === 2)!;
      expect(a1.location).not.toBeNull();
      expect(a1.dp).toBe(1);
      expect(a2.location).not.toBeNull();
      expect(a2.dp).toBe(0);
    }

    const scores = s.seatOrder.map((seat) => s.players[seat]!.score);
    expect(new Set(scores).size).toBe(4);
    for (const sc of scores) expect(sc).toBeGreaterThanOrEqual(1), expect(sc).toBeLessThanOrEqual(4);
  });
});

describe('createInitialState determinism & serialization', () => {
  it('produces a JSON round-trippable state and is deterministic for a seed', () => {
    const s1 = createInitialState({ playerCount: 3 }, makeSeededRng(11));
    expect(JSON.parse(JSON.stringify(s1))).toEqual(s1);
    expect(s1.phase).toBe('setup');
    expect(s1.currentDecision?.kind).toBe('place_starting_amoeba');

    const s2 = createInitialState({ playerCount: 3 }, makeSeededRng(11));
    expect(s2).toEqual(s1); // same seed ⇒ identical state
  });
});

describe('SETUP-03 — placement legality', () => {
  it('rejects placing onto an occupied cell; legalActions excludes occupied + island', () => {
    const scenario: Scenario = {
      id: 'SETUP-03',
      title: 'placement legality',
      tier: 'mvp-core',
      gates: ['M2'],
      given: { playerCount: 3, rng: { seed: 7 }, setupActions: [] },
      when: [
        { seat: '<current>', action: { type: 'place_starting_amoeba', amoebaId: 1, cellId: '0,0' } },
        {
          seat: '<current>',
          action: { type: 'place_starting_amoeba', amoebaId: 1, cellId: '0,0' },
          expectReject: { reasonMatches: 'occupied|not empty' },
        },
      ],
      then: [
        { legalFor: '<current>', excludes: { type: 'place_starting_amoeba', amoebaId: 1, cellId: '0,0' } },
        { legalFor: '<current>', excludes: { type: 'place_starting_amoeba', amoebaId: 1, cellId: '2,2' } },
      ],
    };
    const { finalState: s } = runScenario(scenario);
    // Only the one successful placement happened; the rejected step changed nothing.
    expect(onBoardCount(s)).toBe(1);
  });
});
