// Reactive combat (spec §7–§9, FAQ §10). STRUGGLE FOR SURVIVAL (Phase 1) and AGGRESSION
// (Phase 5) are attacks that can produce a decision owned by the DEFENDER (DEFENSE/ESCAPE),
// with ARMOR, HOLDING-follow, and PERSISTENCE retries. The attack-in-progress state is
// carried in the decision context (AttackResponseContext).

import type {
  Amoeba,
  AttackResponseContext,
  Direction,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
} from '@ps/shared';
import { ALL_DIRECTIONS, neighborInDirection } from '@ps/shared';
import type { Rng } from '../rng.js';
import { getAmoeba, getPlayer, occupantsOf, placeCubesFromSupply } from '../state-helpers.js';
import {
  hasAggression,
  hasArmor,
  hasDefense,
  hasEscape,
  hasHolding,
  hasPersistence,
  hasStreamlining,
  hasStruggle,
} from '../genes/capabilities.js';
import { advanceToNextActor } from './phase1.js';
import { feedThenAdvanceNoStruggle, starveThenAdvance } from './feeding.js';
import { descendingOrder } from '../turn-order.js';
import { beginPhase6 } from './phase6.js';

const STRUGGLE_CUBES_PER_COLOR = 1; // special excretion on a successful struggle
const AGGRESSION_CUBES_PER_COLOR = 2; // replacement on a successful aggression kill

function escapeCost(state: GameState, seat: PlayerId): number {
  return hasStreamlining(getPlayer(state, seat)) ? 0 : 1;
}

function fightWinner(rng: Rng): 'attacker' | 'defender' {
  for (;;) {
    const a = rng.rollDie();
    const d = rng.rollDie();
    if (a !== d) return a > d ? 'attacker' : 'defender'; // reroll ties
  }
}

// ── Phase 1: STRUGGLE FOR SURVIVAL ──────────────────────────────────────────────

/** Co-located amoebas a Phase-1 struggle may target (any owner; armored excluded). */
function struggleTargets(state: GameState, cellId: string, attackerSeat: PlayerId, attackerId: number) {
  return occupantsOf(state, cellId)
    .filter(({ seat, amoeba }) => !(seat === attackerSeat && amoeba.id === attackerId))
    .filter(({ seat }) => !hasArmor(getPlayer(state, seat)))
    .map(({ seat, amoeba }) => ({ seat, id: amoeba.id }));
}

/** If a starving amoeba can struggle, issue a struggle_target decision. Returns whether it did. */
export function tryInitStruggle(state: GameState, seat: PlayerId, amoeba: Amoeba, _events: GameEvent[]): boolean {
  const player = getPlayer(state, seat);
  if (!hasStruggle(player) || player.bp < 1) return false;
  if (struggleTargets(state, amoeba.location!, seat, amoeba.id).length === 0) return false;
  state.currentDecision = {
    seat,
    kind: 'struggle_target',
    context: { attackerId: amoeba.id, cellId: amoeba.location! },
  };
  return true;
}

export function legalStruggleTargets(state: GameState): GameAction[] {
  const d = state.currentDecision!;
  const ctx = d.context as { attackerId: number; cellId: string };
  const targets = struggleTargets(state, ctx.cellId, d.seat, ctx.attackerId);
  const out: GameAction[] = targets.map((t) => ({
    type: 'struggle_attack',
    attackerId: ctx.attackerId,
    targetSeat: t.seat,
    targetAmoebaId: t.id,
  }));
  out.push({ type: 'feed', amoebaId: ctx.attackerId, eat: {} }); // decline → starve
  return out;
}

export function applyStruggleAttack(
  state: GameState,
  action: Extract<GameAction, { type: 'struggle_attack' }>,
  rng: Rng,
  events: GameEvent[],
): string | null {
  const d = state.currentDecision!;
  const attackerSeat = d.seat;
  const ctx = d.context as { attackerId: number; cellId: string };
  if (action.attackerId !== ctx.attackerId) return 'wrong attacker';
  const attacker = getPlayer(state, attackerSeat);
  const defenderPlayer = getPlayer(state, action.targetSeat);
  const targetAmoeba = getAmoeba(defenderPlayer, action.targetAmoebaId);
  if (!targetAmoeba || targetAmoeba.location !== ctx.cellId) return 'target is not co-located';
  if (hasArmor(defenderPlayer)) return 'target is protected by ARMOR';
  if (attacker.bp < 1) return 'not enough BP to struggle';
  attacker.bp -= 1;
  events.push({
    type: 'attacked',
    seat: attackerSeat,
    amoebaId: ctx.attackerId,
    targetSeat: action.targetSeat,
    targetAmoebaId: action.targetAmoebaId,
    kind: 'struggle',
  });
  resolveAttack(state, buildCtx(state, attackerSeat, ctx.attackerId, action.targetSeat, action.targetAmoebaId, ctx.cellId, 'phase1', 'struggle'), rng, events);
  return null;
}

// ── Phase 5: AGGRESSION ──────────────────────────────────────────────────────────

/** Whether `seat` can use its once-per-round aggression: owns AGGRESSION, has BP, and an
 *  on-board amoeba co-located with an enemy. */
function aggressionEligible(state: GameState, seat: PlayerId): boolean {
  const player = getPlayer(state, seat);
  if (!hasAggression(player) || player.bp < 1) return false;
  return player.amoebas.some(
    (a) => a.location !== null && occupantsOf(state, a.location).some(({ seat: s }) => s !== seat),
  );
}

/** Offer aggression to the next eligible seat (descending order from `fromIndex`), else
 *  proceed to Phase 6. Called after natural deaths and after each aggression resolves. */
export function continueAggression(state: GameState, fromIndex: number, events: GameEvent[]): void {
  const order = descendingOrder(state);
  for (let i = fromIndex; i < order.length; i++) {
    if (aggressionEligible(state, order[i]!)) {
      state.currentDecision = { seat: order[i]!, kind: 'aggression_target', context: { seat: order[i]! } };
      events.push({ type: 'turn_changed', seat: order[i]! });
      return;
    }
  }
  beginPhase6(state, events);
}

export function beginAggression(state: GameState, events: GameEvent[]): void {
  continueAggression(state, 0, events);
}

export function legalAggressionTargets(state: GameState): GameAction[] {
  const seat = state.currentDecision!.seat;
  const player = getPlayer(state, seat);
  const out: GameAction[] = [];
  for (const a of player.amoebas) {
    if (a.location === null) continue;
    for (const { seat: ts, amoeba } of occupantsOf(state, a.location)) {
      if (ts === seat) continue; // enemies only
      out.push({ type: 'aggression_attack', attackerId: a.id, targetSeat: ts, targetAmoebaId: amoeba.id });
    }
  }
  out.push({ type: 'aggression_pass' });
  return out;
}

export function applyAggressionAttack(
  state: GameState,
  action: Extract<GameAction, { type: 'aggression_attack' }>,
  rng: Rng,
  events: GameEvent[],
): string | null {
  const attackerSeat = state.currentDecision!.seat;
  const attacker = getPlayer(state, attackerSeat);
  const attackerAmoeba = getAmoeba(attacker, action.attackerId);
  if (!attackerAmoeba || attackerAmoeba.location === null) return 'attacker not on board';
  const defenderPlayer = getPlayer(state, action.targetSeat);
  const target = getAmoeba(defenderPlayer, action.targetAmoebaId);
  if (!target || target.location !== attackerAmoeba.location) return 'target is not co-located';
  if (action.targetSeat === attackerSeat) return 'aggression targets enemies only';
  if (attacker.bp < 1) return 'not enough BP for aggression';
  attacker.bp -= 1;
  events.push({
    type: 'attacked',
    seat: attackerSeat,
    amoebaId: action.attackerId,
    targetSeat: action.targetSeat,
    targetAmoebaId: action.targetAmoebaId,
    kind: 'aggression',
  });
  resolveAttack(state, buildCtx(state, attackerSeat, action.attackerId, action.targetSeat, action.targetAmoebaId, attackerAmoeba.location, 'phase5', 'aggression'), rng, events);
  return null;
}

export function applyAggressionPass(state: GameState, events: GameEvent[]): string | null {
  const seat = state.currentDecision!.seat;
  const idx = descendingOrder(state).indexOf(seat);
  continueAggression(state, idx + 1, events);
  return null;
}

// ── Shared resolution ──────────────────────────────────────────────────────────

function buildCtx(
  state: GameState,
  attackerSeat: PlayerId,
  attackerId: number,
  defenderSeat: PlayerId,
  defenderId: number,
  cellId: string,
  phase: 'phase1' | 'phase5',
  kind: 'struggle' | 'aggression',
): AttackResponseContext {
  const defender = getPlayer(state, defenderSeat);
  const attacker = getPlayer(state, attackerSeat);
  return {
    attackerSeat,
    attackerId,
    defenderSeat,
    defenderId,
    cellId,
    phase,
    kind,
    defenseAvailable: hasDefense(defender) && defender.bp >= 1,
    escapeAvailable: hasEscape(defender) && defender.bp >= escapeCost(state, defenderSeat),
    persistenceAvailable: hasPersistence(attacker),
    attackerHasHolding: hasHolding(attacker),
  };
}

/** Either hand the decision to the defender (if it can respond) or land the attack. */
function resolveAttack(state: GameState, ctx: AttackResponseContext, rng: Rng, events: GameEvent[]): void {
  if (ctx.defenseAvailable || ctx.escapeAvailable) {
    const kind = ctx.phase === 'phase1' ? 'attack_response' : 'aggression_response';
    state.currentDecision = { seat: ctx.defenderSeat, kind, context: ctx };
    events.push({ type: 'turn_changed', seat: ctx.defenderSeat });
    return;
  }
  landAttack(state, ctx, events);
}

/** The attack lands unopposed (no DEFENSE/ESCAPE). */
function landAttack(state: GameState, ctx: AttackResponseContext, events: GameEvent[]): void {
  const defender = getPlayer(state, ctx.defenderSeat);
  const target = getAmoeba(defender, ctx.defenderId)!;
  if (ctx.kind === 'aggression' && hasArmor(defender)) {
    target.dp += 1; // ARMOR: survives Phase 5 aggression but takes 1 DP (a successful attack)
  } else {
    killTarget(state, ctx, ctx.kind === 'struggle' ? STRUGGLE_CUBES_PER_COLOR : AGGRESSION_CUBES_PER_COLOR, ctx.kind, events);
  }
  finishAfterCombat(state, ctx, events);
}

function killTarget(
  state: GameState,
  ctx: AttackResponseContext,
  cubesPerColor: number,
  cause: 'struggle' | 'aggression' | 'fight',
  events: GameEvent[],
): void {
  const target = getAmoeba(getPlayer(state, ctx.defenderSeat), ctx.defenderId)!;
  target.location = null;
  target.dp = 0;
  for (const color of state.colorsInPlay) placeCubesFromSupply(state, ctx.cellId, color, cubesPerColor);
  events.push({ type: 'died', seat: ctx.defenderSeat, amoebaId: ctx.defenderId, cellId: ctx.cellId, cause });
}

export function legalAttackResponse(state: GameState): GameAction[] {
  const ctx = state.currentDecision!.context as AttackResponseContext;
  const out: GameAction[] = [{ type: 'respond_none' }];
  if (ctx.defenseAvailable) out.push({ type: 'respond_defense' });
  if (ctx.escapeAvailable) out.push({ type: 'respond_escape' });
  return out;
}

export function applyAttackResponse(
  state: GameState,
  action: Extract<GameAction, { type: 'respond_defense' | 'respond_escape' | 'respond_none' }>,
  rng: Rng,
  events: GameEvent[],
): string | null {
  const ctx = { ...(state.currentDecision!.context as AttackResponseContext) };

  if (action.type === 'respond_none') {
    landAttack(state, ctx, events);
    return null;
  }

  if (action.type === 'respond_defense') {
    if (!ctx.defenseAvailable) return 'DEFENSE is not available';
    const defender = getPlayer(state, ctx.defenderSeat);
    if (defender.bp < 1) return 'not enough BP to DEFEND';
    defender.bp -= 1;
    ctx.defenseAvailable = false;
    const winner = fightWinner(rng);
    if (winner === 'attacker') {
      events.push({ type: 'defended', seat: ctx.defenderSeat, outcome: 'attacker_won' });
      // Attacker wins the fight: eats the defender (no cube replacement for a struggle fight;
      // aggression replaces with its cubes).
      killTarget(state, ctx, ctx.kind === 'aggression' ? AGGRESSION_CUBES_PER_COLOR : 0, 'fight', events);
      finishAfterCombat(state, ctx, events);
    } else {
      events.push({ type: 'defended', seat: ctx.defenderSeat, outcome: 'defender_won' });
      onAttackFailed(state, ctx, rng, events);
    }
    return null;
  }

  // respond_escape
  if (!ctx.escapeAvailable) return 'ESCAPE is not available';
  const defenderSeat = ctx.defenderSeat;
  const cost = escapeCost(state, defenderSeat);
  const defender = getPlayer(state, defenderSeat);
  if (defender.bp < cost) return 'not enough BP to ESCAPE';
  const target = getAmoeba(defender, ctx.defenderId)!;
  const dir: Direction | undefined = action.direction ?? ALL_DIRECTIONS.find((dd) => neighborInDirection(target.location!, dd) !== null);
  if (!dir) return 'no escape route';
  const dest = neighborInDirection(target.location!, dir);
  if (dest === null) return `cannot escape ${dir} (obstacle)`;
  defender.bp -= cost;
  const from = target.location!;
  target.location = dest;
  events.push({ type: 'escaped', seat: defenderSeat, amoebaId: ctx.defenderId, from, to: dest });
  ctx.escapeAvailable = false;
  ctx.cellId = dest;

  if (ctx.attackerHasHolding) {
    // HOLDING: the attacker follows to the new cell. With PERSISTENCE it may attack again
    // (a fresh attempt); otherwise the attack ends (Phase 1 attacker may still eat there).
    const attacker = getAmoeba(getPlayer(state, ctx.attackerSeat), ctx.attackerId)!;
    attacker.location = dest;
    if (ctx.persistenceAvailable) {
      onRetry(state, ctx, rng, events);
    } else {
      endAttackNoKill(state, ctx, events);
    }
  } else {
    endAttackNoKill(state, ctx, events);
  }
  return null;
}

/** The attack attempt failed (defender won a fight). PERSISTENCE grants one fresh attempt. */
function onAttackFailed(state: GameState, ctx: AttackResponseContext, rng: Rng, events: GameEvent[]): void {
  if (ctx.persistenceAvailable) {
    onRetry(state, ctx, rng, events);
    return;
  }
  if (ctx.kind === 'struggle') {
    // The attacker did not eat → it starves.
    const attacker = getAmoeba(getPlayer(state, ctx.attackerSeat), ctx.attackerId)!;
    starveThenAdvance(state, ctx.attackerSeat, attacker, events);
  } else {
    finishAfterCombat(state, ctx, events); // aggression: no effect, no starvation
  }
}

/** Re-attempt the attack (PERSISTENCE). Resets DEFENSE/ESCAPE availability for the new attempt. */
function onRetry(state: GameState, ctx: AttackResponseContext, rng: Rng, events: GameEvent[]): void {
  const defender = getPlayer(state, ctx.defenderSeat);
  const fresh: AttackResponseContext = {
    ...ctx,
    persistenceAvailable: false,
    defenseAvailable: hasDefense(defender) && defender.bp >= 1,
    escapeAvailable: hasEscape(defender) && defender.bp >= escapeCost(state, ctx.defenderSeat),
  };
  resolveAttack(state, fresh, rng, events);
}

/** The attack ended without a kill (target escaped and was not pursued to a kill). */
function endAttackNoKill(state: GameState, ctx: AttackResponseContext, events: GameEvent[]): void {
  if (ctx.kind === 'struggle') {
    const attacker = getAmoeba(getPlayer(state, ctx.attackerSeat), ctx.attackerId)!;
    if (ctx.attackerHasHolding && attacker.location === ctx.cellId) {
      // Followed via HOLDING: may eat at the destination instead of starving.
      feedThenAdvanceNoStruggle(state, ctx.attackerSeat, attacker, events);
    } else {
      starveThenAdvance(state, ctx.attackerSeat, attacker, events);
    }
  } else {
    finishAfterCombat(state, ctx, events);
  }
}

/** Continue the round after a combat resolves. */
function finishAfterCombat(state: GameState, ctx: AttackResponseContext, events: GameEvent[]): void {
  if (ctx.phase === 'phase1') {
    // Struggle resolved (success): the attacker has eaten — advance to the next actor.
    advanceToNextActor(state, ctx.attackerSeat, ctx.attackerId, events);
  } else {
    const idx = descendingOrder(state).indexOf(ctx.attackerSeat);
    continueAggression(state, idx + 1, events);
  }
}
