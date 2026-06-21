// The standard UAT game plans. Game 1 is a real seeded full game (smoke + invariant
// baseline). Games 2+ are crafted scenarios positioned to exercise specific genes, each
// played through to game_over with a scripted RNG. Together they cover all 18 three-player
// genes (owned + activated). Games are run in order; the harness stops as soon as all 18 are
// covered (the 15-game cap is only a backstop).

import { createInitialState, makeScriptedRng, makeSeededRng } from '@ps/engine';
import { amoebaActionDecision, craftGame, divideDecision, struggleDecision } from './craft.js';
import type { GamePlan } from './policy.js';

// Seats: seat-0 = red, seat-1 = green, seat-2 = blue (first three colors are in play).
const RED = 'red';
const GREEN = 'green';
const BLUE = 'blue';

/** Game 1 — a complete real 3-player game from setup (smoke + invariants over live flow). */
const G1: GamePlan = {
  id: 'G1-baseline',
  description: 'Real seeded full game from setup (smoke test + invariant baseline over a full ~10-round game).',
  targets: [],
  style: 'real',
  build: () => ({ state: createInitialState({ playerCount: 3 }, makeSeededRng(4242)), rng: makeSeededRng(4242) }),
  seats: { 'seat-0': {}, 'seat-1': {}, 'seat-2': {} },
};

/** Extra real seeded full games — broaden invariant coverage over live multi-round flow.
 *  They contribute opportunistic coverage but exist mainly to surface real-game bugs. */
function realGame(id: string, seed: number): GamePlan {
  return {
    id,
    description: `Real seeded full game from setup (seed ${seed}) — invariant coverage over live flow.`,
    targets: [],
    style: 'real',
    build: () => ({ state: createInitialState({ playerCount: 3 }, makeSeededRng(seed)), rng: makeSeededRng(seed) }),
    seats: { 'seat-0': {}, 'seat-1': {}, 'seat-2': {} },
  };
}
const G2 = realGame('G2-real-1234', 1234);
const G3 = realGame('G3-real-9999', 9999);

/** Game 2 — MOVEMENT_I (seat-0), SPEED (seat-1), INTELLIGENCE (seat-2). */
const M1: GamePlan = {
  id: 'M1-move-speed-int',
  description: 'MOVEMENT_I forces a direction choice; SPEED takes a free second step; INTELLIGENCE scores extra gene spaces.',
  targets: ['MOVEMENT_I', 'SPEED', 'INTELLIGENCE'],
  style: 'scripted',
  build: () => ({
    rng: makeScriptedRng([3, 1, 3, 3]), // seat-0 MOVEMENT_I (2 dice), seat-1 SPEED (2 dice)
    state: craftGame({
      round: 1,
      phase: 'phase1_movement_feeding',
      current: { ozoneThickness: 12, drift: 'none' },
      deck: [],
      players: {
        'seat-0': { color: RED, score: 1, bp: 5, genes: ['MOVEMENT_I'], amoebas: [{ id: 1, location: '0,0' }] },
        'seat-1': { color: GREEN, score: 2, bp: 5, genes: ['SPEED'], amoebas: [{ id: 1, location: '0,4' }] },
        'seat-2': { color: BLUE, score: 3, bp: 0, genes: ['INTELLIGENCE', 'SUBSTITUTION', 'TENTACLE'], amoebas: [{ id: 1, location: '4,4' }] },
      },
      decision: amoebaActionDecision('seat-0', 1, '0,0', 'none'),
    }),
  }),
  seats: {
    'seat-0': { phase1: 'move' },
    'seat-1': { phase1: 'move' },
    'seat-2': { phase1: 'drift' },
  },
};

/** Game 3 — MOVEMENT_II (seat-0), STREAMLINING (seat-1), PERSISTENCE (seat-2, second move). */
const M2: GamePlan = {
  id: 'M2-mov2-streamline-persist',
  description: 'MOVEMENT_II chooses a direction with no die (roll 0); STREAMLINING moves for 0 BP; PERSISTENCE takes a free second step.',
  targets: ['MOVEMENT_II', 'STREAMLINING', 'PERSISTENCE'],
  style: 'scripted',
  build: () => ({
    rng: makeScriptedRng([3, 3, 3]), // seat-1 STREAMLINING (1 die), seat-2 PERSISTENCE (2 dice)
    state: craftGame({
      round: 1,
      phase: 'phase1_movement_feeding',
      current: { ozoneThickness: 12, drift: 'none' },
      deck: [],
      players: {
        'seat-0': { color: RED, score: 1, bp: 5, genes: ['MOVEMENT_II'], amoebas: [{ id: 1, location: '0,0' }] },
        'seat-1': { color: GREEN, score: 2, bp: 5, genes: ['STREAMLINING'], amoebas: [{ id: 1, location: '0,2' }] },
        'seat-2': { color: BLUE, score: 3, bp: 5, genes: ['PERSISTENCE'], amoebas: [{ id: 1, location: '0,4' }] },
      },
      decision: amoebaActionDecision('seat-0', 1, '0,0', 'none', 0),
    }),
  }),
  seats: {
    'seat-0': { phase1: 'move' },
    'seat-1': { phase1: 'move' },
    'seat-2': { phase1: 'move' },
  },
};

/** Game 4 — TENTACLE (seat-0 carry), SUBSTITUTION (seat-1 eat 4), SPORES (seat-2 non-adjacent divide). */
const C1: GamePlan = {
  id: 'C1-tentacle-sub-spores',
  description: 'TENTACLE carries a cube while moving; SUBSTITUTION eats 4 of one color; SPORES divides onto a non-adjacent cell.',
  targets: ['TENTACLE', 'SUBSTITUTION', 'SPORES'],
  style: 'scripted',
  build: () => ({
    rng: makeScriptedRng([]), // TENTACLE moves via MOVEMENT_II (no die); everyone else drifts/divides
    state: craftGame({
      round: 1,
      phase: 'phase1_movement_feeding',
      current: { ozoneThickness: 12, drift: 'none' },
      deck: [],
      cubes: { '3,3': { green: 2 }, '1,0': { red: 4 } },
      players: {
        'seat-0': { color: RED, score: 1, bp: 5, genes: ['TENTACLE', 'MOVEMENT_II'], amoebas: [{ id: 1, location: '3,3' }] },
        'seat-1': { color: GREEN, score: 2, bp: 5, genes: ['SUBSTITUTION'], amoebas: [{ id: 1, location: '1,0' }] },
        'seat-2': { color: BLUE, score: 3, bp: 10, genes: ['SPORES'], amoebas: [{ id: 1, location: '4,0' }, { id: 2, location: '4,1' }] },
      },
      decision: amoebaActionDecision('seat-0', 1, '3,3', 'none', 0),
    }),
  }),
  seats: {
    'seat-0': { phase1: 'moveCarry' },
    'seat-1': { phase1: 'drift', feed: 'sub4' },
    'seat-2': { phase1: 'drift', divide: 'spores' },
  },
};

/** Game 5 — HOLDING (seat-0 stays under drift), RAY_PROTECTION (seat-1, −2 keeps it under ozone). */
const C2: GamePlan = {
  id: 'C2-holding-rayprotection',
  description: 'HOLDING stays put despite drift; RAY_PROTECTION’s −2 keeps the owner at/under the revealed ozone.',
  targets: ['HOLDING', 'RAY_PROTECTION'],
  style: 'scripted',
  build: () => ({
    rng: makeScriptedRng([]),
    state: craftGame({
      round: 2, // round ≥ 2 so Phase 2 reveals a card and processes defects
      phase: 'phase1_movement_feeding',
      current: { ozoneThickness: 12, drift: 'E' }, // drift ≠ none so HOLDING's stay is meaningful
      deck: ['env-03'], // ozone 8: RAY_PROTECTION owner sits at mpSum 8 (would be 10 without it)
      players: {
        'seat-0': { color: RED, score: 1, bp: 5, genes: ['HOLDING'], amoebas: [{ id: 1, location: '1,1' }] },
        'seat-1': { color: GREEN, score: 2, bp: 5, genes: ['RAY_PROTECTION', 'LONGEVITY', 'DIVISION_RATE'], amoebas: [{ id: 1, location: '3,3' }] },
        'seat-2': { color: BLUE, score: 3, bp: 5, genes: [], amoebas: [{ id: 1, location: '3,1' }] },
      },
      decision: amoebaActionDecision('seat-0', 1, '1,1', 'E'),
    }),
  }),
  seats: {
    'seat-0': { phase1: 'stay' },
    'seat-1': { phase1: 'drift' },
    'seat-2': { phase1: 'drift' },
  },
};

/** Game 6 — LONGEVITY (seat-0 amoeba at dp 2 survives), DIVISION_RATE (seat-0 divides for 4 BP). */
const C3: GamePlan = {
  id: 'C3-longevity-divrate',
  description: 'DIVISION_RATE divides for 4 BP; LONGEVITY keeps a dp-2 amoeba alive through Phase 5.',
  targets: ['LONGEVITY', 'DIVISION_RATE'],
  style: 'scripted',
  build: () => ({
    rng: makeScriptedRng([]),
    state: craftGame({
      round: 1,
      phase: 'phase4_division',
      current: { ozoneThickness: 12, drift: 'none' },
      deck: [],
      players: {
        'seat-0': { color: RED, score: 30, bp: 4, genes: ['LONGEVITY', 'DIVISION_RATE'], amoebas: [{ id: 1, location: '1,1', dp: 2 }] },
        'seat-1': { color: GREEN, score: 20, bp: 0, genes: [], amoebas: [{ id: 1, location: '3,3' }] },
        'seat-2': { color: BLUE, score: 10, bp: 0, genes: [], amoebas: [{ id: 1, location: '3,1' }] },
      },
      decision: divideDecision('seat-0'),
    }),
  }),
  seats: {
    'seat-0': { divide: 'normal' },
    'seat-1': { divide: 'none' },
    'seat-2': { divide: 'none' },
  },
};

/** Game 7 — STRUGGLE FOR SURVIVAL (seat-0) + DEFENSE (seat-1 fights back). */
const C4: GamePlan = {
  id: 'C4-struggle-defense',
  description: 'A starving STRUGGLE amoeba attacks; the DEFENSE owner fights back (attacker wins the scripted fight).',
  targets: ['STRUGGLE_FOR_SURVIVAL', 'DEFENSE'],
  style: 'scripted',
  build: () => ({
    rng: makeScriptedRng([6, 2]), // fight: attacker 6 > defender 2
    state: craftGame({
      round: 1,
      phase: 'phase1_movement_feeding',
      current: { ozoneThickness: 12, drift: 'none' },
      deck: [],
      players: {
        'seat-0': { color: RED, score: 1, bp: 4, genes: ['STRUGGLE_FOR_SURVIVAL'], amoebas: [{ id: 1, location: '1,1' }] },
        'seat-1': { color: GREEN, score: 2, bp: 4, genes: ['DEFENSE'], amoebas: [{ id: 1, location: '1,1' }] },
        'seat-2': { color: BLUE, score: 3, bp: 0, genes: [], amoebas: [{ id: 1, location: '4,4' }] },
      },
      decision: struggleDecision('seat-0', 1, '1,1'),
    }),
  }),
  seats: {
    'seat-0': { attack: true },
    'seat-1': { respond: 'defense' },
    'seat-2': {},
  },
};

/** Game 8 — STRUGGLE FOR SURVIVAL (seat-0) + ESCAPE (seat-1 flees). */
const C5: GamePlan = {
  id: 'C5-struggle-escape',
  description: 'A starving STRUGGLE amoeba attacks; the ESCAPE owner flees to an adjacent cell.',
  targets: ['STRUGGLE_FOR_SURVIVAL', 'ESCAPE'],
  style: 'scripted',
  build: () => ({
    rng: makeScriptedRng([]),
    state: craftGame({
      round: 1,
      phase: 'phase1_movement_feeding',
      current: { ozoneThickness: 12, drift: 'none' },
      deck: [],
      players: {
        'seat-0': { color: RED, score: 1, bp: 4, genes: ['STRUGGLE_FOR_SURVIVAL'], amoebas: [{ id: 1, location: '1,1' }] },
        'seat-1': { color: GREEN, score: 2, bp: 4, genes: ['ESCAPE'], amoebas: [{ id: 1, location: '1,1' }] },
        'seat-2': { color: BLUE, score: 3, bp: 0, genes: [], amoebas: [{ id: 1, location: '4,4' }] },
      },
      decision: struggleDecision('seat-0', 1, '1,1'),
    }),
  }),
  seats: {
    'seat-0': { attack: true },
    'seat-1': { respond: 'escape' },
    'seat-2': {},
  },
};

/** Game 9 — AGGRESSION (seat-0, Phase 5) + ARMOR (seat-1 survives, takes 1 DP). */
const C6: GamePlan = {
  id: 'C6-aggression-armor',
  description: 'AGGRESSION attacks a co-located enemy in Phase 5; ARMOR survives the attack and takes 1 DP.',
  targets: ['AGGRESSION', 'ARMOR'],
  style: 'scripted',
  build: () => ({
    rng: makeScriptedRng([]),
    state: craftGame({
      round: 1,
      phase: 'phase4_division',
      current: { ozoneThickness: 12, drift: 'none' },
      deck: [],
      players: {
        'seat-0': { color: RED, score: 30, bp: 4, genes: ['AGGRESSION'], amoebas: [{ id: 1, location: '1,1' }] },
        'seat-1': { color: GREEN, score: 20, bp: 4, genes: ['ARMOR'], amoebas: [{ id: 1, location: '1,1' }] },
        'seat-2': { color: BLUE, score: 10, bp: 0, genes: [], amoebas: [] },
      },
      decision: divideDecision('seat-2'),
    }),
  }),
  seats: {
    'seat-0': { attack: true },
    'seat-1': { respond: 'none' },
    'seat-2': { divide: 'none' },
  },
};

/** The standard ordered plan list (≤15). Coverage completes by game 9. */
export const STANDARD_PLANS: GamePlan[] = [G1, G2, G3, M1, M2, C1, C2, C3, C4, C5, C6];
