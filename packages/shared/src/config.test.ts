import { describe, expect, it } from 'vitest';
import {
  ADJACENCY,
  ALL_COLORS,
  amoebaAdvanceSpaces,
  areAdjacent,
  BOARD_CELLS,
  compassResult,
  CUBES_PER_COLOR_TOTAL,
  ENV_CARDS,
  FINISH_ZONE_START,
  GENES,
  GENE_IDS,
  geneAdvanceSpaces,
  geneCopies,
  ISLAND_CELL,
  LADDER_MAX,
  neighborInDirection,
  parseCellId,
  PLAYABLE_CELL_COUNT,
  PLAYER_COUNT_CONFIG,
  SCHEMA_VERSION,
} from './index.js';
import type { GameState } from './index.js';

describe('board topology', () => {
  it('has exactly 24 playable cells', () => {
    expect(BOARD_CELLS).toHaveLength(PLAYABLE_CELL_COUNT);
    expect(new Set(BOARD_CELLS).size).toBe(PLAYABLE_CELL_COUNT);
  });

  it('excludes the island 2,2', () => {
    expect(BOARD_CELLS).not.toContain(ISLAND_CELL);
    expect(ADJACENCY[ISLAND_CELL]).toBeUndefined();
  });

  it('only contains in-range coordinates', () => {
    for (const id of BOARD_CELLS) {
      const { col, row } = parseCellId(id);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThanOrEqual(4);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThanOrEqual(4);
    }
  });

  it('adjacency is orthogonal, one-step, and never includes the island', () => {
    for (const id of BOARD_CELLS) {
      const { col, row } = parseCellId(id);
      for (const n of ADJACENCY[id]!) {
        expect(n).not.toBe(ISLAND_CELL);
        const { col: nc, row: nr } = parseCellId(n);
        const dist = Math.abs(col - nc) + Math.abs(row - nr);
        expect(dist).toBe(1); // orthogonal, one step
      }
    }
  });

  it('adjacency is symmetric', () => {
    for (const id of BOARD_CELLS) {
      for (const n of ADJACENCY[id]!) {
        expect(areAdjacent(n, id)).toBe(true);
      }
    }
  });

  it('cells beside the island treat the island side as an obstacle', () => {
    // (2,1),(2,3),(1,2),(3,2) border the island; the step toward it is blocked.
    expect(neighborInDirection('2,1', 'S')).toBeNull(); // toward 2,2
    expect(neighborInDirection('2,3', 'N')).toBeNull();
    expect(neighborInDirection('1,2', 'E')).toBeNull();
    expect(neighborInDirection('3,2', 'W')).toBeNull();
  });

  it('edge moves off the board are blocked', () => {
    expect(neighborInDirection('4,2', 'E')).toBeNull();
    expect(neighborInDirection('0,2', 'W')).toBeNull();
    expect(neighborInDirection('2,0', 'N')).toBeNull();
    expect(neighborInDirection('2,4', 'S')).toBeNull();
  });

  it('resolves a normal step', () => {
    expect(neighborInDirection('0,2', 'E')).toBe('1,2');
    expect(neighborInDirection('1,1', 'S')).toBe('1,2');
  });
});

describe('compass mapping (spec §3)', () => {
  it('maps die faces to directions/stay/free', () => {
    expect(compassResult(1)).toEqual({ kind: 'direction', direction: 'W' });
    expect(compassResult(2)).toEqual({ kind: 'direction', direction: 'N' });
    expect(compassResult(3)).toEqual({ kind: 'direction', direction: 'E' });
    expect(compassResult(4)).toEqual({ kind: 'direction', direction: 'S' });
    expect(compassResult(5)).toEqual({ kind: 'stay' });
    expect(compassResult(6)).toEqual({ kind: 'free_choice' });
  });
});

describe('ladder advance tables (spec §6 Phase 6)', () => {
  it('amoeba table', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(amoebaAdvanceSpaces)).toEqual([0, 0, 0, 1, 2, 4, 5, 6]);
  });
  it('gene table', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(geneAdvanceSpaces)).toEqual([0, 0, 0, 1, 2, 3, 4, 4]);
  });
  it('ladder constants', () => {
    expect(LADDER_MAX).toBe(50);
    expect(FINISH_ZONE_START).toBe(41);
  });
});

describe('gene catalog (spec §7–§8)', () => {
  it('every gene id is self-consistent', () => {
    for (const id of GENE_IDS) {
      expect(GENES[id]!.id).toBe(id);
    }
  });

  it('every advanced gene names a real, basic prerequisite', () => {
    for (const id of GENE_IDS) {
      const def = GENES[id]!;
      if (def.isAdvanced) {
        expect(def.prerequisite).not.toBeNull();
        for (const pre of def.prerequisite!) {
          expect(GENES[pre]).toBeDefined();
          expect(GENES[pre]!.isAdvanced).toBe(false);
        }
        expect(def.advancementCardValue).toBe(2);
      } else {
        expect(def.prerequisite).toBeNull();
      }
    }
  });

  it('RAY PROTECTION is −2 MP and counts 0 for advancement', () => {
    expect(GENES['RAY_PROTECTION']!.mutationPoints).toBe(-2);
    expect(GENES['RAY_PROTECTION']!.advancementCardValue).toBe(0);
  });

  it('matches the spec copy-count and price tables (spot checks)', () => {
    expect(geneCopies('MOVEMENT_I', 3)).toBe(2);
    expect(geneCopies('SPORES', 3)).toBe(1);
    expect(geneCopies('STRUGGLE_FOR_SURVIVAL', 3)).toBe(2);
    expect(geneCopies('FRUGALITY', 3)).toBe(0); // not available in 3p
    expect(geneCopies('FRUGALITY', 4)).toBe(1);
    expect(geneCopies('PARASITISM', 3)).toBe(0);
    expect(geneCopies('ESCAPE', 4)).toBe(2);
    expect(GENES['DEFENSE']!.price).toBe(4);
    expect(GENES['DIVISION_RATE']!.price).toBe(6);
    expect(GENES['INTELLIGENCE']!.price).toBe(2);
  });

  it('has the expected number of distinct genes (16 basic + 4 advanced)', () => {
    const advanced = GENE_IDS.filter((id) => GENES[id]!.isAdvanced);
    expect(advanced.sort()).toEqual(['AGGRESSION', 'ARMOR', 'MOVEMENT_II', 'PERSISTENCE']);
    expect(GENE_IDS).toHaveLength(20);
  });

  it('reactive (combat) genes are flagged for M15 gating', () => {
    const reactive = GENE_IDS.filter((id) => GENES[id]!.reactive).sort();
    expect(reactive).toEqual(
      [
        'AGGRESSION',
        'ARMOR',
        'DEFENSE',
        'ESCAPE',
        'PARASITISM',
        'PERSISTENCE',
        'STRUGGLE_FOR_SURVIVAL',
      ].sort(),
    );
  });
});

describe('environment deck', () => {
  it('has exactly 11 cards with unique ids', () => {
    expect(ENV_CARDS).toHaveLength(11);
    expect(new Set(ENV_CARDS.map((c) => c.id)).size).toBe(11);
  });
  it('every card has a valid ozone and drift', () => {
    for (const card of ENV_CARDS) {
      expect(card.ozoneThickness).toBeGreaterThan(0);
      expect(['N', 'S', 'E', 'W', 'none']).toContain(card.drift);
    }
  });
});

describe('player-count config table', () => {
  it('3p and 4p differences match the spec', () => {
    expect(PLAYER_COUNT_CONFIG[3]!.startSpaces).toEqual([1, 2, 3]);
    expect(PLAYER_COUNT_CONFIG[4]!.startSpaces).toEqual([1, 2, 3, 4]);
    expect(PLAYER_COUNT_CONFIG[3]!.setupFirstAmoebaDp).toBe(0); // 3p: 0 DP
    expect(PLAYER_COUNT_CONFIG[4]!.setupFirstAmoebaDp).toBe(1); // 4p: 1 DP
    expect(PLAYER_COUNT_CONFIG[3]!.tentacleCapacity).toBe(2);
    expect(PLAYER_COUNT_CONFIG[4]!.tentacleCapacity).toBe(3);
  });

  it('setup supply math: 55 − 2*24 = 7 per color', () => {
    expect(CUBES_PER_COLOR_TOTAL - 2 * PLAYABLE_CELL_COUNT).toBe(7);
  });

  it('there are 4 known colors', () => {
    expect(ALL_COLORS).toEqual(['red', 'green', 'blue', 'yellow']);
  });
});

describe('GameState serialization (JSON round-trip)', () => {
  it('a hand-built sample survives JSON.parse(JSON.stringify(x)) unchanged', () => {
    const sample: GameState = {
      schemaVersion: SCHEMA_VERSION,
      variant: 'standard',
      playerCount: 3,
      colorsInPlay: ['red', 'green', 'blue'],
      round: 1,
      phase: 'phase1_movement_feeding',
      board: {
        '1,1': { id: '1,1', col: 1, row: 1, cubes: { green: 2, blue: 2 } },
      },
      supply: { red: 7, green: 7, blue: 7, yellow: 0 },
      players: {
        'seat-0': {
          id: 'seat-0',
          color: 'red',
          kind: 'human',
          connected: true,
          bp: 4,
          genes: ['MOVEMENT_I'],
          amoebas: [{ id: 1, location: '1,1', dp: 0 }],
          score: 1,
        },
      },
      seatOrder: ['seat-0'],
      turnOrder: ['seat-0'],
      environment: {
        current: { id: 'env-01', ozoneThickness: 10, drift: 'none' },
        deckRemaining: ['env-02', 'env-03'],
        discarded: [],
      },
      currentDecision: {
        seat: 'seat-0',
        kind: 'amoeba_action',
        context: { amoebaId: 1, cellId: '1,1', driftDirection: 'none', moveCostBp: 1 },
      },
      winner: null,
    };
    const roundTripped = JSON.parse(JSON.stringify(sample));
    expect(roundTripped).toEqual(sample);
  });
});
