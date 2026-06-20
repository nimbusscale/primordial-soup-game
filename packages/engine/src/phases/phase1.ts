// Phase 1 — Movement and Feeding (spec §6 Phase 1, Ascending Order).
// M3 implements movement: drift / stay / move (with the roll-of-6 sub-decision), obstacle
// handling, and the non-reactive movement genes (MOVEMENT I/II, SPEED, STREAMLINING,
// TENTACLE carry, HOLDING function 1). Feeding is inserted in M4 at onMovementComplete.

import type {
  Amoeba,
  CellId,
  Color,
  Direction,
  GameAction,
  GameEvent,
  GameState,
  MoveDirectionContext,
  PlayerId,
  PlayerState,
} from '@ps/shared';
import {
  ALL_DIRECTIONS,
  compassResult,
  MOVE_COST_BP,
  neighborInDirection,
  playerCountConfig,
} from '@ps/shared';
import type { Rng } from '../rng.js';
import { getAmoeba, getPlayer, onBoardAmoebas } from '../state-helpers.js';
import { ascendingOrder } from '../turn-order.js';
import {
  hasHolding,
  hasMovementI,
  hasMovementII,
  hasSpeed,
  hasStreamlining,
  hasTentacle,
} from '../genes/capabilities.js';
import { beginFeeding } from './feeding.js';

// ── Geometry / cost helpers ──────────────────────────────────────────────────

function nonObstacleDirections(cellId: CellId): Direction[] {
  return ALL_DIRECTIONS.filter((d) => neighborInDirection(cellId, d) !== null);
}

function moveCostFor(player: PlayerState): number {
  return hasStreamlining(player) ? 0 : MOVE_COST_BP;
}

// ── Decision issuance ──────────────────────────────────────────────────────────

function firstAmoeba(state: GameState, seat: PlayerId): Amoeba | undefined {
  return onBoardAmoebas(state.players[seat]!).sort((a, b) => a.id - b.id)[0];
}

export function issueAmoebaAction(
  state: GameState,
  seat: PlayerId,
  amoeba: Amoeba,
  events: GameEvent[],
): void {
  const player = getPlayer(state, seat);
  state.currentDecision = {
    seat,
    kind: 'amoeba_action',
    context: {
      amoebaId: amoeba.id,
      cellId: amoeba.location!,
      driftDirection: state.environment.current.drift,
      moveCostBp: moveCostFor(player),
    },
  };
  events.push({ type: 'turn_changed', seat });
}

function issueMoveDirection(
  state: GameState,
  seat: PlayerId,
  amoeba: Amoeba,
  allowedDirections: Direction[],
  stepBpSpent: number,
  rollForEvent: number,
  carry: Partial<Record<Color, number>> | undefined,
  freeMovesOwed: number,
): void {
  const ctx: MoveDirectionContext = {
    amoebaId: amoeba.id,
    cellId: amoeba.location!,
    allowedDirections,
    stepBpSpent,
    rollForEvent,
    freeMovesOwed,
    ...(carry ? { carry } : {}),
  };
  state.currentDecision = { seat, kind: 'choose_move_direction', context: ctx };
}

// ── legalActions ─────────────────────────────────────────────────────────────

export function legalAmoebaActions(state: GameState, seat: PlayerId): GameAction[] {
  const decision = state.currentDecision!;
  const ctx = decision.context as { amoebaId: number };
  const amoebaId = ctx.amoebaId;
  const player = getPlayer(state, seat);
  const driftDir = state.environment.current.drift;
  const out: GameAction[] = [{ type: 'drift', amoebaId }];
  // Staying is only legal with no drift this round, or via HOLDING (spec §6 Phase 1).
  if (driftDir === 'none' || hasHolding(player)) out.push({ type: 'stay', amoebaId });
  if (player.bp >= moveCostFor(player)) out.push({ type: 'move', amoebaId });
  return out;
}

export function legalMoveDirections(state: GameState): GameAction[] {
  const decision = state.currentDecision!;
  const ctx = decision.context as MoveDirectionContext;
  return ctx.allowedDirections.map((direction) => ({
    type: 'set_move_direction',
    amoebaId: ctx.amoebaId,
    direction,
  }));
}

// ── Carry (TENTACLE) ─────────────────────────────────────────────────────────

function validateCarry(
  state: GameState,
  player: PlayerState,
  origin: CellId,
  carry: Partial<Record<Color, number>> | undefined,
): string | null {
  if (!carry) return null;
  const total = Object.values(carry).reduce((s, n) => s + (n ?? 0), 0);
  if (total === 0) return null;
  if (!hasTentacle(player)) return 'carrying cubes requires TENTACLE';
  const cap = playerCountConfig(state.playerCount).tentacleCapacity;
  if (total > cap) return `cannot carry ${total} cubes (TENTACLE capacity is ${cap})`;
  const cell = state.board[origin]!;
  for (const [color, n] of Object.entries(carry)) {
    if ((n ?? 0) > (cell.cubes[color as Color] ?? 0)) {
      return `not enough ${color} cubes to carry from ${origin}`;
    }
  }
  return null;
}

function transferCarry(
  state: GameState,
  origin: CellId,
  dest: CellId,
  carry: Partial<Record<Color, number>> | undefined,
): void {
  if (!carry) return;
  const from = state.board[origin]!;
  const to = state.board[dest]!;
  for (const [c, n] of Object.entries(carry)) {
    const color = c as Color;
    const count = n ?? 0;
    if (count <= 0) continue;
    const remaining = (from.cubes[color] ?? 0) - count;
    if (remaining <= 0) delete from.cubes[color];
    else from.cubes[color] = remaining;
    to.cubes[color] = (to.cubes[color] ?? 0) + count;
  }
}

// ── Move-step resolution ─────────────────────────────────────────────────────

/** Resolve a move step in a known direction (or obstacle-stay), then continue. */
function resolveDirectionStep(
  state: GameState,
  seat: PlayerId,
  amoeba: Amoeba,
  direction: Direction,
  stepBpSpent: number,
  rollForEvent: number,
  carry: Partial<Record<Color, number>> | undefined,
  freeMovesOwed: number,
  rng: Rng,
  events: GameEvent[],
): void {
  const origin = amoeba.location!;
  const dest = neighborInDirection(origin, direction);
  if (dest === null) {
    events.push({ type: 'stayed', seat, amoebaId: amoeba.id, cellId: origin, reason: 'obstacle' });
  } else {
    amoeba.location = dest;
    transferCarry(state, origin, dest, carry);
    events.push({
      type: 'moved',
      seat,
      amoebaId: amoeba.id,
      from: origin,
      to: dest,
      roll: rollForEvent,
      bpSpent: stepBpSpent,
    });
  }
  continueAfterStep(state, seat, amoeba, freeMovesOwed, rng, events);
}

function resolveStayStep(
  state: GameState,
  seat: PlayerId,
  amoeba: Amoeba,
  reason: 'no_drift' | 'roll5' | 'holding',
  freeMovesOwed: number,
  rng: Rng,
  events: GameEvent[],
): void {
  events.push({ type: 'stayed', seat, amoebaId: amoeba.id, cellId: amoeba.location!, reason });
  continueAfterStep(state, seat, amoeba, freeMovesOwed, rng, events);
}

/** After a step resolves: take a free SPEED move if owed, else movement is complete. */
function continueAfterStep(
  state: GameState,
  seat: PlayerId,
  amoeba: Amoeba,
  freeMovesOwed: number,
  rng: Rng,
  events: GameEvent[],
): void {
  if (freeMovesOwed > 0) {
    performMoveStep(state, seat, amoeba, 0, undefined, freeMovesOwed - 1, rng, events);
  } else {
    onMovementComplete(state, seat, amoeba, events);
  }
}

/**
 * Start a move step: determine direction per the player's movement genes, rolling dice as
 * needed. May resolve synchronously, or issue a choose_move_direction sub-decision.
 */
function performMoveStep(
  state: GameState,
  seat: PlayerId,
  amoeba: Amoeba,
  stepBpSpent: number,
  carry: Partial<Record<Color, number>> | undefined,
  freeMovesOwed: number,
  rng: Rng,
  events: GameEvent[],
): void {
  const player = getPlayer(state, seat);
  const cell = amoeba.location!;

  // MOVEMENT II: choose a direction, no die drawn.
  if (hasMovementII(player)) {
    issueMoveDirection(state, seat, amoeba, nonObstacleDirections(cell), stepBpSpent, 0, carry, freeMovesOwed);
    return;
  }

  // MOVEMENT I: roll two dice; choose the direction of either.
  if (hasMovementI(player)) {
    const r1 = rng.rollDie();
    const r2 = rng.rollDie();
    const dirs = new Set<Direction>();
    let freeChoice = false;
    for (const r of [r1, r2]) {
      const res = compassResult(r);
      if (res.kind === 'direction') dirs.add(res.direction);
      else if (res.kind === 'free_choice') freeChoice = true;
      // a 5 (stay) contributes no direction option
    }
    const allowed = freeChoice
      ? nonObstacleDirections(cell)
      : [...dirs].filter((d) => neighborInDirection(cell, d) !== null);
    if (allowed.length === 0) {
      // Both dice yielded stay/obstacle: the amoeba stays.
      resolveStayStep(state, seat, amoeba, 'roll5', freeMovesOwed, rng, events);
      return;
    }
    issueMoveDirection(state, seat, amoeba, allowed, stepBpSpent, 0, carry, freeMovesOwed);
    return;
  }

  // Plain movement: roll one die.
  const roll = rng.rollDie();
  const res = compassResult(roll);
  if (res.kind === 'stay') {
    resolveStayStep(state, seat, amoeba, 'roll5', freeMovesOwed, rng, events);
  } else if (res.kind === 'free_choice') {
    issueMoveDirection(state, seat, amoeba, nonObstacleDirections(cell), stepBpSpent, roll, carry, freeMovesOwed);
  } else {
    resolveDirectionStep(state, seat, amoeba, res.direction, stepBpSpent, roll, carry, freeMovesOwed, rng, events);
  }
}

// ── Action handlers (dispatched from reduce) ─────────────────────────────────

export function applyAmoebaAction(
  state: GameState,
  action: Extract<GameAction, { type: 'drift' | 'stay' | 'move' }>,
  rng: Rng,
  events: GameEvent[],
): string | null {
  const decision = state.currentDecision!;
  const seat = decision.seat;
  const player = getPlayer(state, seat);
  const ctx = decision.context as { amoebaId: number };
  if (action.amoebaId !== ctx.amoebaId) return `it is amoeba ${ctx.amoebaId}'s turn, not ${action.amoebaId}`;
  const amoeba = getAmoeba(player, action.amoebaId);
  if (!amoeba || amoeba.location === null) return `amoeba ${action.amoebaId} is not on the board`;

  switch (action.type) {
    case 'drift': {
      const carry = action.carry;
      const carryErr = validateCarry(state, player, amoeba.location, carry);
      if (carryErr) return carryErr;
      const driftDir = state.environment.current.drift;
      if (driftDir === 'none') {
        events.push({ type: 'stayed', seat, amoebaId: amoeba.id, cellId: amoeba.location, reason: 'no_drift' });
        onMovementComplete(state, seat, amoeba, events);
        return null;
      }
      const origin = amoeba.location;
      const dest = neighborInDirection(origin, driftDir);
      if (dest === null) {
        events.push({ type: 'stayed', seat, amoebaId: amoeba.id, cellId: origin, reason: 'obstacle' });
      } else {
        amoeba.location = dest;
        transferCarry(state, origin, dest, carry);
        events.push({ type: 'drifted', seat, amoebaId: amoeba.id, from: origin, to: dest });
      }
      onMovementComplete(state, seat, amoeba, events);
      return null;
    }

    case 'stay': {
      const driftDir = state.environment.current.drift;
      if (driftDir !== 'none' && !hasHolding(player)) {
        return 'staying is only possible with no drift this round or with HOLDING';
      }
      const reason = hasHolding(player) ? 'holding' : 'no_drift';
      events.push({ type: 'stayed', seat, amoebaId: amoeba.id, cellId: amoeba.location, reason });
      onMovementComplete(state, seat, amoeba, events);
      return null;
    }

    case 'move': {
      const cost = moveCostFor(player);
      if (player.bp < cost) return `not enough BP to move (need ${cost}, have ${player.bp})`;
      const carry = action.carry;
      const carryErr = validateCarry(state, player, amoeba.location, carry);
      if (carryErr) return carryErr;
      player.bp -= cost;
      const freeMovesOwed = hasSpeed(player) ? 1 : 0;
      performMoveStep(state, seat, amoeba, cost, carry, freeMovesOwed, rng, events);
      return null;
    }
  }
}

export function applySetMoveDirection(
  state: GameState,
  action: Extract<GameAction, { type: 'set_move_direction' }>,
  rng: Rng,
  events: GameEvent[],
): string | null {
  const decision = state.currentDecision!;
  const seat = decision.seat;
  const ctx = decision.context as MoveDirectionContext;
  if (action.amoebaId !== ctx.amoebaId) return `expected a direction for amoeba ${ctx.amoebaId}`;
  if (!ctx.allowedDirections.includes(action.direction)) {
    return `direction ${action.direction} is not allowed here`;
  }
  const amoeba = getAmoeba(getPlayer(state, seat), ctx.amoebaId)!;
  resolveDirectionStep(
    state,
    seat,
    amoeba,
    action.direction,
    ctx.stepBpSpent,
    ctx.rollForEvent,
    ctx.carry,
    ctx.freeMovesOwed,
    rng,
    events,
  );
  return null;
}

// ── Turn flow ────────────────────────────────────────────────────────────────

/**
 * Hook called once an amoeba has finished moving: it now feeds (or starves). beginFeeding
 * auto-resolves a forced/single outcome, or issues an amoeba_feed decision.
 */
function onMovementComplete(state: GameState, seat: PlayerId, amoeba: Amoeba, events: GameEvent[]): void {
  beginFeeding(state, seat, amoeba, events);
}

/** Find the next amoeba to act (numerical order within a seat, then ascending seats). */
export function advanceToNextActor(
  state: GameState,
  seat: PlayerId,
  afterAmoebaId: number,
  events: GameEvent[],
): void {
  // Remaining amoebas for the current seat, in numerical order.
  const remaining = onBoardAmoebas(state.players[seat]!)
    .filter((a) => a.id > afterAmoebaId)
    .sort((a, b) => a.id - b.id);
  if (remaining[0]) {
    issueAmoebaAction(state, seat, remaining[0], events);
    return;
  }
  // Otherwise, the next seat in turn order with on-board amoebas.
  const order = state.turnOrder.length ? state.turnOrder : ascendingOrder(state);
  const idx = order.indexOf(seat);
  for (let i = idx + 1; i < order.length; i++) {
    const next = firstAmoeba(state, order[i]!);
    if (next) {
      issueAmoebaAction(state, order[i]!, next, events);
      return;
    }
  }
  endPhase1(state, events);
}

/**
 * End of Phase 1. M5 replaces this stub with the transition into Phase 2; until then it
 * leaves the engine with no pending decision (only reached by movement-only test states).
 */
function endPhase1(state: GameState, _events: GameEvent[]): void {
  state.currentDecision = null;
}

export function beginPhase1(state: GameState, events: GameEvent[]): void {
  state.round = state.round === 0 ? 1 : state.round;
  state.phase = 'phase1_movement_feeding';
  state.turnOrder = ascendingOrder(state);
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });
  for (const seat of state.turnOrder) {
    const amoeba = firstAmoeba(state, seat);
    if (amoeba) {
      issueAmoebaAction(state, seat, amoeba, events);
      return;
    }
  }
  state.currentDecision = null;
}
