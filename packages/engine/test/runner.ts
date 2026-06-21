// Scenario runner (validation-scenarios.md §2). Feeds each action to reduce, follows
// auto-advance, and checks assertions. Reused by every engine milestone. Uses Vitest's
// `expect` (it runs inside test files).

import { expect } from 'vitest';
import type { Color, GameAction, GameEvent, GameState, PlayerId } from '@ps/shared';
import { ALL_COLORS, BOARD_CELLS, ENV_CARDS } from '@ps/shared';
import {
  createInitialState,
  legalActions,
  makeScriptedRng,
  makeSeededRng,
  reduce,
  type Rng,
} from '@ps/engine';

// ── Scenario shapes ───────────────────────────────────────────────────────────

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export type RngSpec = { seed: number } | { rolls: number[] };

export interface Given {
  playerCount: 3 | 4;
  rng: RngSpec;
  state?: DeepPartial<GameState>;
  setupActions?: GameAction[];
  notes?: string;
}

export type Assertion =
  | { path: string; equals: unknown }
  | { path: string; absent: true }
  | { legalFor: PlayerId; includes: GameAction }
  | { legalFor: PlayerId; excludes: GameAction }
  | { legalFor: PlayerId; count: number };

export interface Step {
  seat: PlayerId | '<current>';
  action: GameAction;
  assertBefore?: Assertion[]; // checked against the pre-action state (e.g. legalActions on the current decision)
  expectEvents?: DeepPartial<GameEvent>[];
  expectReject?: { reasonMatches?: string };
  assert?: Assertion[];
}

export interface Scenario {
  id: string;
  title: string;
  tier: 'mvp-core' | 'full-ruleset';
  gates: string[];
  given: Given;
  when?: Step[];
  then?: Assertion[];
}

// ── RNG construction ────────────────────────────────────────────────────────────

export function buildRng(spec: RngSpec): Rng {
  return 'seed' in spec ? makeSeededRng(spec.seed) : makeScriptedRng(spec.rolls);
}

// ── Baseline state for deep-merge (used when given.state is provided) ────────────

function colorsFor(playerCount: number): Color[] {
  return ALL_COLORS.slice(0, playerCount);
}

/** A complete, valid post-setup GameState onto which a partial `given.state` is merged. */
export function makeBaselineState(playerCount: number): GameState {
  const colors = colorsFor(playerCount);
  // Cells start EMPTY in the baseline so a partial `given.state` controls cube counts
  // exactly (a patch can add cubes but cannot remove a baseline color).
  const board: GameState['board'] = {};
  for (const id of BOARD_CELLS) {
    const [col, row] = id.split(',').map(Number) as [number, number];
    board[id] = { id, col, row, cubes: {} };
  }
  const supply: Record<Color, number> = { red: 0, green: 0, blue: 0, yellow: 0 };
  for (const c of colors) supply[c] = 7;

  const players: GameState['players'] = {};
  const seatOrder: PlayerId[] = [];
  for (let i = 0; i < playerCount; i++) {
    const seat = `seat-${i}`;
    seatOrder.push(seat);
    players[seat] = {
      id: seat,
      color: colors[i]!,
      kind: 'human',
      connected: true,
      bp: 0,
      genes: [],
      amoebas: Array.from({ length: 7 }, (_, k) => ({ id: k + 1, location: null, dp: 0 })),
      score: i + 1,
    };
  }

  const [current, ...rest] = ENV_CARDS;
  return {
    schemaVersion: 1,
    variant: 'standard',
    playerCount,
    colorsInPlay: colors,
    round: 1,
    phase: 'phase1_movement_feeding',
    board,
    supply,
    players,
    seatOrder,
    turnOrder: seatOrder,
    environment: { current: current!, deckRemaining: rest.map((c) => c.id), discarded: [] },
    currentDecision: null,
    winner: null,
  };
}

// ── Deep merge (arrays replaced, objects merged) + normalization ─────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (Array.isArray(patch)) return structuredClone(patch) as T;
  if (isPlainObject(patch)) {
    const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
    for (const [k, v] of Object.entries(patch)) {
      out[k] = deepMerge((out as Record<string, unknown>)[k], v);
    }
    return out as T;
  }
  return patch as T;
}

/** After merge: pad every player's amoebas to ids 1..7, ensure supply has all 4 colors. */
function normalize(state: GameState): GameState {
  for (const seat of state.seatOrder) {
    const p = state.players[seat]!;
    const byId = new Map(p.amoebas.map((a) => [a.id, a]));
    const full = [];
    for (let id = 1; id <= 7; id++) {
      full.push(byId.get(id) ?? { id, location: null, dp: 0 });
    }
    p.amoebas = full;
  }
  for (const c of ALL_COLORS) {
    if (state.supply[c] === undefined) state.supply[c] = 0;
  }
  return state;
}

export function buildState(given: Given, rng: Rng): GameState {
  if (given.state) {
    const merged = deepMerge(makeBaselineState(given.playerCount), given.state);
    return normalize(merged);
  }
  let state = createInitialState({ playerCount: given.playerCount }, rng);
  for (const action of given.setupActions ?? []) {
    const res = reduce(state, action, rng);
    if (!res.ok) throw new Error(`setupAction rejected: ${res.reason}`);
    state = res.state;
  }
  return state;
}

// ── Path resolution ──────────────────────────────────────────────────────────────

function walk(obj: unknown, dotted: string): unknown {
  let cur: unknown = obj;
  for (const seg of dotted.split('.')) {
    if (cur === undefined || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function getPath(state: GameState, path: string): unknown {
  let m: RegExpExecArray | null;
  if ((m = /^player\("([^"]+)"\)\.(.+)$/.exec(path))) {
    return walk(state.players[m[1]!], m[2]!);
  }
  if ((m = /^amoeba\("([^"]+)",\s*(\d+)\)\.(.+)$/.exec(path))) {
    const p = state.players[m[1]!];
    const amo = p?.amoebas.find((a) => a.id === Number(m![2]));
    return walk(amo, m[3]!);
  }
  if ((m = /^cell\("([^"]+)"\)\.(.+)$/.exec(path))) {
    return walk(state.board[m[1]!], m[2]!);
  }
  if ((m = /^supply\.(.+)$/.exec(path))) {
    return walk(state.supply, m[1]!);
  }
  return walk(state, path);
}

// ── Subset matching (for legalActions includes/excludes and events) ──────────────

export function subsetMatch(candidate: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(candidate) || candidate.length !== expected.length) return false;
    return expected.every((e, i) => subsetMatch(candidate[i], e));
  }
  if (isPlainObject(expected)) {
    if (!isPlainObject(candidate)) return false;
    return Object.entries(expected).every(([k, v]) => subsetMatch(candidate[k], v));
  }
  return candidate === expected;
}

function legalForSeat(state: GameState, seat: PlayerId): GameAction[] {
  if (!state.currentDecision || state.currentDecision.seat !== seat) return [];
  return legalActions(state);
}

function matchEventsInOrder(actual: GameEvent[], expected: DeepPartial<GameEvent>[]): boolean {
  let i = 0;
  for (const exp of expected) {
    while (i < actual.length && !subsetMatch(actual[i], exp)) i++;
    if (i >= actual.length) return false;
    i++;
  }
  return true;
}

// ── Assertion checking ───────────────────────────────────────────────────────────

function checkAssertion(state: GameState, a: Assertion, ctx: string): void {
  if ('path' in a && 'equals' in a) {
    expect(getPath(state, a.path), `${ctx}: ${a.path}`).toEqual(a.equals);
  } else if ('path' in a && 'absent' in a) {
    expect(getPath(state, a.path), `${ctx}: ${a.path} should be absent`).toBeUndefined();
  } else if ('legalFor' in a) {
    const seat = a.legalFor === '<current>' ? (state.currentDecision?.seat ?? '') : a.legalFor;
    const actions = legalForSeat(state, seat);
    if ('includes' in a) {
      const ok = actions.some((x) => subsetMatch(x, a.includes));
      expect(ok, `${ctx}: legalFor(${a.legalFor}) should include ${JSON.stringify(a.includes)}; got ${JSON.stringify(actions)}`).toBe(true);
    } else if ('excludes' in a) {
      const ok = actions.some((x) => subsetMatch(x, a.excludes));
      expect(ok, `${ctx}: legalFor(${a.legalFor}) should exclude ${JSON.stringify(a.excludes)}; got ${JSON.stringify(actions)}`).toBe(false);
    } else if ('count' in a) {
      expect(actions.length, `${ctx}: legalFor(${a.legalFor}) count`).toBe(a.count);
    }
  }
}

// ── Runner ───────────────────────────────────────────────────────────────────────

export interface RunResult {
  finalState: GameState;
}

export function runScenario(scenario: Scenario): RunResult {
  const rng = buildRng(scenario.given.rng);
  let state = buildState(scenario.given, rng);

  for (const [idx, step] of (scenario.when ?? []).entries()) {
    const ctx = `${scenario.id} step ${idx + 1}`;
    if (step.seat !== '<current>') {
      expect(state.currentDecision?.seat, `${ctx}: expected seat ${step.seat} to be current`).toBe(step.seat);
    }
    for (const a of step.assertBefore ?? []) checkAssertion(state, a, `${ctx} (before)`);
    const res = reduce(state, step.action, rng);

    if (step.expectReject) {
      expect(res.ok, `${ctx}: expected reject for ${JSON.stringify(step.action)}`).toBe(false);
      if (!res.ok && step.expectReject.reasonMatches) {
        expect(res.reason, `${ctx}: reject reason`).toMatch(new RegExp(step.expectReject.reasonMatches));
      }
      // State unchanged on reject — do not advance.
      continue;
    }

    if (!res.ok) throw new Error(`${ctx}: unexpected reject: ${res.reason}`);
    if (step.expectEvents) {
      expect(
        matchEventsInOrder(res.events, step.expectEvents),
        `${ctx}: events ${JSON.stringify(res.events)} should match ${JSON.stringify(step.expectEvents)}`,
      ).toBe(true);
    }
    state = res.state;
    for (const a of step.assert ?? []) checkAssertion(state, a, ctx);
  }

  for (const a of scenario.then ?? []) checkAssertion(state, a, `${scenario.id} then`);
  return { finalState: state };
}
