// Phase 2 — Environment and Gene Defects (spec §6 Phase 2, Descending Order).
// Reveal the next environment card, then (from round 2 on) make each over-ozone player
// balance the locked-in difference. RAY PROTECTION counts −2 toward the MP sum and balances
// a difference of 4 when given up; MP is not recalculated mid-resolution (spec §10 FAQ).

import type { GameAction, GameEvent, GameState, GeneId, PlayerId, PlayerState } from '@ps/shared';
import { envCard, geneDef } from '@ps/shared';
import { getPlayer } from '../state-helpers.js';
import { descendingOrder } from '../turn-order.js';
import { beginPhase3 } from './phase3.js';

const RAY_PROTECTION_GIVEUP_VALUE = 4; // spec §7: giving up RAY PROTECTION balances 4.

/** Sum of Mutation Points of a player's genes (RAY PROTECTION already contributes −2). */
function mpSum(player: PlayerState): number {
  return player.genes.reduce((s, g) => s + geneDef(g).mutationPoints, 0);
}

/** Value a gene contributes when GIVEN UP to balance a defect. */
function giveUpValue(gene: GeneId): number {
  return gene === 'RAY_PROTECTION' ? RAY_PROTECTION_GIVEUP_VALUE : geneDef(gene).mutationPoints;
}

/** Locked-in excess for a player against the current card's ozone. */
function defectExcess(state: GameState, player: PlayerState): number {
  return Math.max(0, mpSum(player) - state.environment.current.ozoneThickness);
}

/** Reveal the next environment card: old card → discarded, next in deck order → current. */
export function revealNextEnvCard(state: GameState, events: GameEvent[]): void {
  const nextId = state.environment.deckRemaining.shift();
  if (nextId === undefined) return; // deck exhausted (end-of-game is detected in Phase 6)
  state.environment.discarded.push(state.environment.current.id);
  state.environment.current = envCard(nextId);
  events.push({ type: 'environment_revealed', card: state.environment.current });
}

function issueNextDefect(state: GameState, fromIndex: number, events: GameEvent[]): void {
  const order = descendingOrder(state);
  for (let i = fromIndex; i < order.length; i++) {
    const seat = order[i]!;
    const excess = defectExcess(state, getPlayer(state, seat));
    if (excess > 0) {
      state.currentDecision = { seat, kind: 'balance_gene_defect', context: { excessMp: excess } };
      events.push({ type: 'turn_changed', seat });
      return;
    }
  }
  beginPhase3(state, events);
}

export function beginPhase2(state: GameState, events: GameEvent[]): void {
  state.phase = 'phase2_environment';
  state.turnOrder = descendingOrder(state);
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });
  revealNextEnvCard(state, events);
  // Gene Defects do not occur during the first round (spec §6 Phase 2).
  if (state.round <= 1) {
    beginPhase3(state, events);
    return;
  }
  issueNextDefect(state, 0, events);
}

/** Best-effort legalActions for balance_gene_defect (a dedicated client panel may build
 *  arbitrary giveUp+payBp combinations; the engine validates any of them). */
export function legalBalanceDefect(state: GameState, seat: PlayerId): GameAction[] {
  const player = getPlayer(state, seat);
  const excess = defectExcess(state, player);
  const out: GameAction[] = [];
  if (player.bp >= excess) out.push({ type: 'balance_defect', giveUp: [], payBp: excess });
  for (const g of player.genes) {
    if (giveUpValue(g) >= excess) out.push({ type: 'balance_defect', giveUp: [g], payBp: 0 });
  }
  return out;
}

export function applyBalanceDefect(
  state: GameState,
  action: Extract<GameAction, { type: 'balance_defect' }>,
  events: GameEvent[],
): string | null {
  const decision = state.currentDecision!;
  const seat = decision.seat;
  const player = getPlayer(state, seat);
  const excess = (decision.context as { excessMp: number }).excessMp;

  // Validate the genes are owned (no duplicates in the give-up list).
  const giveUp = action.giveUp ?? [];
  const seen = new Set<GeneId>();
  for (const g of giveUp) {
    if (!player.genes.includes(g)) return `cannot give up ${g}: not owned`;
    if (seen.has(g)) return `duplicate gene in give-up list: ${g}`;
    seen.add(g);
  }
  if (action.payBp < 0) return 'payBp cannot be negative';
  if (action.payBp > player.bp) return `not enough BP (have ${player.bp}, paying ${action.payBp})`;

  const balanced = giveUp.reduce((s, g) => s + giveUpValue(g), 0) + action.payBp;
  if (balanced < excess) return `balanced ${balanced} does not cover the defect of ${excess}`;

  // Apply: remove given-up genes, pay BP. Excess over the difference is lost (no refund).
  player.genes = player.genes.filter((g) => !seen.has(g));
  player.bp -= action.payBp;
  events.push({ type: 'defect_balanced', seat, gaveUp: giveUp, bpPaid: action.payBp });

  // Advance to the next over-ozone player in descending order (forward only).
  const order = descendingOrder(state);
  const idx = order.indexOf(seat);
  issueNextDefect(state, idx + 1, events);
  return null;
}
