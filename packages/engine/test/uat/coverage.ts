// UAT coverage: the 18 three-player genes, their per-gene activation predicates, and the
// coverage tracker. "Owned" = a gene present in a player's genes (pre-placed or bought).
// "Activated" = the gene's effect demonstrably fired in play, proven by a specific
// event / state-delta predicate (the table in the UAT plan). A gene counts as COVERED only
// when it was owned AND activated within a single game that tripped zero invariants.

import type { Color, GameAction, GameEvent, GameState, GeneId, PlayerId } from '@ps/shared';
import { ADJACENCY, geneDef } from '@ps/shared';

/** The 18 genes available at 3 players (copies[3] > 0). FRUGALITY/PARASITISM are 4p-only. */
export const THREE_P_GENES: readonly GeneId[] = [
  // non-combat (12)
  'INTELLIGENCE', 'MOVEMENT_I', 'MOVEMENT_II', 'SPORES', 'SPEED', 'SUBSTITUTION',
  'RAY_PROTECTION', 'STREAMLINING', 'TENTACLE', 'HOLDING', 'LONGEVITY', 'DIVISION_RATE',
  // combat / reactive (6)
  'DEFENSE', 'ESCAPE', 'STRUGGLE_FOR_SURVIVAL', 'AGGRESSION', 'ARMOR', 'PERSISTENCE',
];

/** An activation: gene `gene` fired for owner `seat` during a step. */
export interface Activation {
  gene: GeneId;
  seat: PlayerId;
}

function owns(state: GameState, seat: PlayerId, gene: GeneId): boolean {
  return state.players[seat]?.genes.includes(gene) ?? false;
}

function totalCubes(cell: GameState['board'][string] | undefined): number {
  if (!cell) return 0;
  return Object.values(cell.cubes).reduce((s, n) => s + (n ?? 0), 0);
}

function findAmoeba(state: GameState, seat: PlayerId, id: number) {
  return state.players[seat]?.amoebas.find((a) => a.id === id);
}

function mpSum(genes: readonly GeneId[]): number {
  return genes.reduce((s, g) => s + geneDef(g).mutationPoints, 0);
}

function onBoardCount(state: GameState, seat: PlayerId): number {
  return state.players[seat]?.amoebas.filter((a) => a.location !== null).length ?? 0;
}

/** Does `cell` border an amoeba of `seat`'s color in `state`? (SPORES non-adjacency test.) */
function hasSameColorNeighbor(state: GameState, seat: PlayerId, cellId: string): boolean {
  const color = state.players[seat]!.color;
  for (const n of ADJACENCY[cellId] ?? []) {
    for (const s of state.seatOrder) {
      if (state.players[s]!.color !== color) continue;
      if (state.players[s]!.amoebas.some((a) => a.location === n)) return true;
    }
  }
  return false;
}

function oneColorCount(eat: Partial<Record<Color, number>>): { color: Color; n: number } | null {
  const entries = Object.entries(eat).filter(([, n]) => (n ?? 0) > 0) as Array<[Color, number]>;
  return entries.length === 1 ? { color: entries[0]![0], n: entries[0]![1] } : null;
}

/**
 * Detect which genes activated during a single reduce step, evaluated against the chosen
 * action, the events it produced, and the pre/post state. Returns every (gene, seat)
 * activation observed (the caller de-dupes per game).
 */
export function detectActivations(
  prev: GameState,
  _action: GameAction,
  events: readonly GameEvent[],
  next: GameState,
): Activation[] {
  const out: Activation[] = [];
  const push = (gene: GeneId, seat: PlayerId) => out.push({ gene, seat });

  // SPEED / PERSISTENCE: a free second movement step → ≥2 movement-step events for the same
  // amoeba within this single reduce (the plain-movement path resolves both steps inline).
  const stepCounts = new Map<string, number>();
  for (const e of events) {
    if (e.type === 'moved' || e.type === 'stayed') {
      const key = `${e.seat}:${e.amoebaId}`;
      stepCounts.set(key, (stepCounts.get(key) ?? 0) + 1);
    }
  }
  for (const [key, count] of stepCounts) {
    if (count < 2) continue;
    const seat = key.split(':')[0]!;
    if (owns(next, seat, 'SPEED')) push('SPEED', seat);
    if (owns(next, seat, 'PERSISTENCE')) push('PERSISTENCE', seat);
  }

  for (const e of events) {
    switch (e.type) {
      case 'moved': {
        const seat = e.seat;
        if (owns(next, seat, 'MOVEMENT_I') && !owns(next, seat, 'MOVEMENT_II')) push('MOVEMENT_I', seat);
        if (owns(next, seat, 'MOVEMENT_II') && e.roll === 0) push('MOVEMENT_II', seat);
        if (owns(next, seat, 'STREAMLINING') && e.bpSpent === 0) push('STREAMLINING', seat);
        if (owns(next, seat, 'TENTACLE')) {
          // Carry transfers cubes off the origin cell; nothing else removes them during a move.
          if (totalCubes(next.board[e.from]) < totalCubes(prev.board[e.from])) push('TENTACLE', seat);
        }
        break;
      }
      case 'stayed': {
        if (e.reason === 'holding' && owns(next, e.seat, 'HOLDING')) push('HOLDING', e.seat);
        break;
      }
      case 'fed': {
        if (owns(next, e.seat, 'SUBSTITUTION')) {
          const single = oneColorCount(e.ate);
          if (single && single.n === 4) push('SUBSTITUTION', e.seat);
        }
        break;
      }
      case 'divided': {
        const seat = e.seat;
        if (owns(next, seat, 'DIVISION_RATE') && e.cost === 4) push('DIVISION_RATE', seat);
        if (owns(next, seat, 'SPORES') && onBoardCount(prev, seat) >= 2 && !hasSameColorNeighbor(prev, seat, e.cellId)) {
          push('SPORES', seat);
        }
        break;
      }
      case 'scored': {
        if (owns(next, e.seat, 'INTELLIGENCE') && e.geneSpaces > 0) push('INTELLIGENCE', e.seat);
        break;
      }
      case 'attacked': {
        if (e.kind === 'struggle' && owns(next, e.seat, 'STRUGGLE_FOR_SURVIVAL')) push('STRUGGLE_FOR_SURVIVAL', e.seat);
        if (e.kind === 'aggression' && owns(next, e.seat, 'AGGRESSION')) push('AGGRESSION', e.seat);
        // ARMOR: an aggression against an ARMOR owner inflicts 1 DP rather than killing.
        if (e.kind === 'aggression' && owns(next, e.targetSeat, 'ARMOR')) {
          const before = findAmoeba(prev, e.targetSeat, e.targetAmoebaId);
          const after = findAmoeba(next, e.targetSeat, e.targetAmoebaId);
          const died = events.some(
            (x) => x.type === 'died' && x.seat === e.targetSeat && x.amoebaId === e.targetAmoebaId,
          );
          if (after && after.location !== null && before && after.dp === before.dp + 1 && !died) {
            push('ARMOR', e.targetSeat);
          }
        }
        break;
      }
      case 'defended': {
        if (owns(next, e.seat, 'DEFENSE')) push('DEFENSE', e.seat);
        break;
      }
      case 'escaped': {
        if (owns(next, e.seat, 'ESCAPE')) push('ESCAPE', e.seat);
        break;
      }
      case 'environment_revealed': {
        // RAY_PROTECTION: the −2 it contributes is what keeps the owner at/under the ozone
        // (without it they'd be over) — i.e. the protection is load-bearing at this reveal.
        const ozone = e.card.ozoneThickness;
        for (const seat of next.seatOrder) {
          if (!owns(next, seat, 'RAY_PROTECTION')) continue;
          const withRp = mpSum(next.players[seat]!.genes);
          const withoutRp = withRp + 2;
          if (withRp <= ozone && withoutRp > ozone) push('RAY_PROTECTION', seat);
        }
        break;
      }
    }
  }

  // LONGEVITY: in a Phase 5 deaths resolution, an owner's amoeba sitting at dp ∈ [2,3)
  // survives (the unmutated threshold of 2 would have killed it).
  if (events.some((e) => e.type === 'phase_changed' && e.phase === 'phase5_deaths')) {
    for (const seat of next.seatOrder) {
      if (!owns(next, seat, 'LONGEVITY')) continue;
      for (const a of prev.players[seat]!.amoebas) {
        if (a.location === null || a.dp < 2 || a.dp >= 3) continue;
        const after = findAmoeba(next, seat, a.id);
        if (after && after.location !== null) push('LONGEVITY', seat);
      }
    }
  }

  return out;
}

// ── Coverage tracker ──────────────────────────────────────────────────────────

export interface GameCoverage {
  owned: Set<GeneId>;
  activated: Set<GeneId>;
}

export function newGameCoverage(): GameCoverage {
  return { owned: new Set(), activated: new Set() };
}

/** Record every gene currently owned by any seat in `state` (captures pre-placed + bought,
 *  including a basic gene before it is consumed by an advanced upgrade). */
export function recordOwnership(cov: GameCoverage, state: GameState): void {
  for (const seat of state.seatOrder) {
    for (const g of state.players[seat]!.genes) {
      if (THREE_P_GENES.includes(g)) cov.owned.add(g);
    }
  }
}

export function recordActivations(cov: GameCoverage, activations: Activation[]): void {
  for (const a of activations) {
    if (THREE_P_GENES.includes(a.gene)) cov.activated.add(a.gene);
  }
}

/** Genes owned AND activated in this (clean) game. */
export function cleanlyCovered(cov: GameCoverage): Set<GeneId> {
  const out = new Set<GeneId>();
  for (const g of cov.activated) if (cov.owned.has(g)) out.add(g);
  return out;
}
