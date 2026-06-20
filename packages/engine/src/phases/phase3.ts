// Phase 3 — New Genes (spec §6 Phase 3, §8 Advanced Genes; Descending Order). Each player
// gets one buy_genes turn: buy any number of available genes (basic, or advanced via
// upgradeFrom), then pass. Availability is derived from the catalog + current ownership.

import type { GameAction, GameEvent, GameState, GeneId, PlayerId, PlayerState } from '@ps/shared';
import { GENE_IDS, geneCopies, geneDef } from '@ps/shared';
import { getPlayer } from '../state-helpers.js';
import { descendingOrder } from '../turn-order.js';
import { COMBAT_GENES_ENABLED } from '../feature-flags.js';
import { beginPhase4 } from './phase4.js';

/** How many players currently own a gene. */
function owners(state: GameState, gene: GeneId): number {
  return state.seatOrder.reduce((n, seat) => n + (state.players[seat]!.genes.includes(gene) ? 1 : 0), 0);
}

function copiesAvailable(state: GameState, gene: GeneId): boolean {
  return geneCopies(gene, state.playerCount) - owners(state, gene) > 0;
}

/** Does the player own an advanced gene whose prerequisite includes `basic`? */
function ownsAdvancedOf(player: PlayerState, basic: GeneId): boolean {
  return GENE_IDS.some((id) => {
    const def = geneDef(id);
    return def.isAdvanced && (def.prerequisite ?? []).includes(basic) && player.genes.includes(id);
  });
}

function boughtThisRound(state: GameState): GeneId[] {
  return (state.currentDecision!.context as { boughtThisRound: GeneId[] }).boughtThisRound;
}

export function legalBuyGenes(state: GameState, seat: PlayerId): GameAction[] {
  const player = getPlayer(state, seat);
  const bought = boughtThisRound(state);
  const out: GameAction[] = [];

  for (const id of GENE_IDS) {
    const def = geneDef(id);
    if (def.combatOnly && !COMBAT_GENES_ENABLED) continue; // not offered until M15
    if (player.genes.includes(id)) continue; // no duplicates
    if (!copiesAvailable(state, id)) continue; // all copies owned by others
    if (player.bp < def.price) continue; // unaffordable

    if (def.isAdvanced) {
      // An upgrade per owned prerequisite held since a prior round.
      for (const prereq of def.prerequisite ?? []) {
        if (player.genes.includes(prereq) && !bought.includes(prereq)) {
          out.push({ type: 'buy_gene', gene: id, upgradeFrom: prereq });
        }
      }
    } else {
      // A basic gene cannot be bought if the player holds its advanced upgrade.
      if (ownsAdvancedOf(player, id)) continue;
      out.push({ type: 'buy_gene', gene: id });
    }
  }

  out.push({ type: 'pass_buying' });
  return out;
}

export function applyBuyGene(
  state: GameState,
  action: Extract<GameAction, { type: 'buy_gene' }>,
  events: GameEvent[],
): string | null {
  const seat = state.currentDecision!.seat;
  const player = getPlayer(state, seat);
  const def = geneDef(action.gene);

  if (player.genes.includes(action.gene)) return `already own ${action.gene} (duplicate)`;
  if (!copiesAvailable(state, action.gene)) return `no copies of ${action.gene} available`;
  if (player.bp < def.price) return `not enough BP for ${action.gene} (need ${def.price}, have ${player.bp})`;

  let gaveUp: GeneId | null = null;
  if (def.isAdvanced) {
    const from = action.upgradeFrom;
    if (!from) return `${action.gene} is an advanced gene; an upgradeFrom is required`;
    if (!(def.prerequisite ?? []).includes(from)) return `${action.gene} cannot be upgraded from ${from}`;
    if (!player.genes.includes(from)) return `cannot upgrade: ${from} is not owned`;
    if (boughtThisRound(state).includes(from)) {
      return `${from} was bought this phase; it must be held a prior round before upgrading`;
    }
    gaveUp = from;
    player.genes = player.genes.filter((g) => g !== from);
  } else {
    if (ownsAdvancedOf(player, action.gene)) {
      return `cannot buy ${action.gene}: its advanced upgrade is already held`;
    }
  }

  player.bp -= def.price;
  player.genes.push(action.gene);
  boughtThisRound(state).push(action.gene);
  events.push({ type: 'gene_bought', seat, gene: action.gene, cost: def.price, gaveUp });
  return null; // decision stays buy_genes for this seat (they may buy more)
}

export function applyPassBuying(state: GameState, events: GameEvent[]): string | null {
  const seat = state.currentDecision!.seat;
  const order = descendingOrder(state);
  const idx = order.indexOf(seat);
  if (idx + 1 < order.length) {
    issueBuyGenes(state, order[idx + 1]!, events);
  } else {
    beginPhase4(state, events);
  }
  return null;
}

function issueBuyGenes(state: GameState, seat: PlayerId, events: GameEvent[]): void {
  state.currentDecision = { seat, kind: 'buy_genes', context: { boughtThisRound: [] } };
  events.push({ type: 'turn_changed', seat });
}

export function beginPhase3(state: GameState, events: GameEvent[]): void {
  state.phase = 'phase3_genes';
  state.turnOrder = descendingOrder(state);
  events.push({ type: 'phase_changed', phase: state.phase, round: state.round });
  issueBuyGenes(state, state.turnOrder[0]!, events);
}
