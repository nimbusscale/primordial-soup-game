// Phase 1 — Feeding (spec §6 Phase 1: Feeding, Shortage of Food). After an amoeba
// finishes moving it eats 3 cubes (never its own color) or starves. 3p eats single+double;
// excretion replaces the eaten cubes with 2 of the eater's own color. SUBSTITUTION (3p:
// eat 4 of one color) is the feeding-modifier gene in scope here. FRUGALITY/PARASITISM and
// the 4p combinations are M17.

import type {
  Amoeba,
  Color,
  GameAction,
  GameEvent,
  GameState,
  PlayerId,
  PlayerState,
} from '@ps/shared';
import { EXCRETION_CUBES, FEED_FOOD_COUNT } from '@ps/shared';
import { getAmoeba, getPlayer, placeCubesFromSupply, takeCubesToSupply } from '../state-helpers.js';
import { hasSubstitution } from '../genes/capabilities.js';
import { advanceToNextActor } from './phase1.js';

type EatCombo = Partial<Record<Color, number>>;

function otherColors(state: GameState, player: PlayerState): Color[] {
  return state.colorsInPlay.filter((c) => c !== player.color);
}

function comboSatisfiable(state: GameState, cellId: string, combo: EatCombo): boolean {
  const cubes = state.board[cellId]!.cubes;
  return Object.entries(combo).every(([c, n]) => (cubes[c as Color] ?? 0) >= (n ?? 0));
}

function comboEquals(a: EatCombo, b: EatCombo): boolean {
  const colors = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const c of colors) {
    if ((a[c as Color] ?? 0) !== (b[c as Color] ?? 0)) return false;
  }
  return true;
}

/**
 * All eat combos the cell can satisfy under the player-count ratio and feeding genes.
 * Empty list ⇒ the amoeba must starve.
 */
export function legalFeedCombos(state: GameState, seat: PlayerId, amoeba: Amoeba): EatCombo[] {
  const player = getPlayer(state, seat);
  const others = otherColors(state, player);
  const cellId = amoeba.location!;
  const combos: EatCombo[] = [];

  if (others.length === 2) {
    // 3-player: single + double (1 of one color, 2 of the other).
    const [a, b] = others as [Color, Color];
    combos.push({ [a]: 1, [b]: 2 });
    combos.push({ [a]: 2, [b]: 1 });
    if (hasSubstitution(player)) {
      // SUBSTITUTION (3p): eat one fewer color, one more of the others ⇒ 4 of one color.
      combos.push({ [a]: FEED_FOOD_COUNT + 1 });
      combos.push({ [b]: FEED_FOOD_COUNT + 1 });
    }
  } else if (others.length === 3) {
    // 4-player base ratio 1:1:1 (4p SUBSTITUTION/FRUGALITY combinations are M17).
    const combo: EatCombo = {};
    for (const c of others) combo[c] = 1;
    combos.push(combo);
  }

  return combos.filter((combo) => comboSatisfiable(state, cellId, combo));
}

/** legalActions for the amoeba_feed decision: the satisfiable combos, or a forced starve. */
export function legalFeedActions(state: GameState, seat: PlayerId): GameAction[] {
  const decision = state.currentDecision!;
  const amoebaId = (decision.context as { amoebaId: number }).amoebaId;
  const amoeba = getAmoeba(getPlayer(state, seat), amoebaId)!;
  const combos = legalFeedCombos(state, seat, amoeba);
  if (combos.length === 0) return [{ type: 'feed', amoebaId, eat: {} }];
  return combos.map((eat) => ({ type: 'feed', amoebaId, eat }));
}

function resolveFeed(
  state: GameState,
  seat: PlayerId,
  amoeba: Amoeba,
  eat: EatCombo,
  events: GameEvent[],
): void {
  const player = getPlayer(state, seat);
  const cellId = amoeba.location!;
  // Eaten cubes leave the cell and return to the general supply.
  for (const [c, n] of Object.entries(eat)) {
    if ((n ?? 0) > 0) takeCubesToSupply(state, cellId, c as Color, n!);
  }
  // Excretion: 2 cubes of the eater's own color, supply-limited.
  const excretedCount = placeCubesFromSupply(state, cellId, player.color, EXCRETION_CUBES);
  const excreted: EatCombo = {};
  if (excretedCount > 0) excreted[player.color] = excretedCount;
  events.push({ type: 'fed', seat, amoebaId: amoeba.id, cellId, ate: eat, excreted });
}

function resolveStarve(state: GameState, seat: PlayerId, amoeba: Amoeba, events: GameEvent[]): void {
  amoeba.dp += 1;
  events.push({ type: 'starved', seat, amoebaId: amoeba.id, cellId: amoeba.location! });
}

/**
 * Begin feeding for an amoeba that has finished moving. Auto-resolves when there is exactly
 * one outcome (a single combo, or a forced starve); otherwise issues an amoeba_feed decision.
 */
export function beginFeeding(state: GameState, seat: PlayerId, amoeba: Amoeba, events: GameEvent[]): void {
  const combos = legalFeedCombos(state, seat, amoeba);
  if (combos.length === 0) {
    resolveStarve(state, seat, amoeba, events);
    advanceToNextActor(state, seat, amoeba.id, events);
    return;
  }
  if (combos.length === 1) {
    resolveFeed(state, seat, amoeba, combos[0]!, events);
    advanceToNextActor(state, seat, amoeba.id, events);
    return;
  }
  state.currentDecision = {
    seat,
    kind: 'amoeba_feed',
    context: { amoebaId: amoeba.id, cellId: amoeba.location! },
  };
}

export function applyFeed(
  state: GameState,
  action: Extract<GameAction, { type: 'feed' }>,
  events: GameEvent[],
): string | null {
  const decision = state.currentDecision!;
  const seat = decision.seat;
  const ctx = decision.context as { amoebaId: number };
  if (action.amoebaId !== ctx.amoebaId) return `it is amoeba ${ctx.amoebaId}'s feeding turn`;
  const amoeba = getAmoeba(getPlayer(state, seat), action.amoebaId)!;
  const combos = legalFeedCombos(state, seat, amoeba);
  const eat = action.eat ?? {};
  const eatTotal = Object.values(eat).reduce((s, n) => s + (n ?? 0), 0);

  if (eatTotal === 0) {
    // A forced starve is legal only when no combo is satisfiable.
    if (combos.length > 0) return 'must feed when food is available';
    resolveStarve(state, seat, amoeba, events);
  } else {
    if (!combos.some((c) => comboEquals(c, eat))) return 'illegal feeding combo for this cell';
    resolveFeed(state, seat, amoeba, eat, events);
  }
  advanceToNextActor(state, seat, amoeba.id, events);
  return null;
}
