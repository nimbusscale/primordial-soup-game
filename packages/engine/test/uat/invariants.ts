// UAT invariants: structural and rules-faithfulness checks run after EVERY reduce in a game.
// Anomalies are returned (not thrown) so the harness records full diagnostics and the report
// captures everything that went wrong in a game rather than dying on the first trip.

import type { GameAction, GameEvent, GameState } from '@ps/shared';
import {
  ALL_COLORS,
  CUBES_PER_COLOR_TOTAL,
  GENE_IDS,
  LADDER_MAX,
  geneCopies,
  geneDef,
  isPlayableCell,
} from '@ps/shared';
import { legalActions } from '@ps/engine';

/**
 * Check the invariants that must hold on the post-state of a transition (with `prev` for
 * the monotonic / delta checks). Returns a list of human-readable anomaly descriptions;
 * empty means the transition was clean.
 */
export function checkInvariants(
  prev: GameState,
  next: GameState,
  _action: GameAction,
  events: readonly GameEvent[],
): string[] {
  const out: string[] = [];

  // ── Cube conservation: 55 per in-play color (board + supply), 0 per out-of-play color ──
  for (const color of ALL_COLORS) {
    let total = next.supply[color] ?? 0;
    for (const id of Object.keys(next.board)) total += next.board[id]!.cubes[color] ?? 0;
    const expected = next.colorsInPlay.includes(color) ? CUBES_PER_COLOR_TOTAL : 0;
    if (total !== expected) out.push(`cube conservation: ${color} totals ${total}, expected ${expected}`);
    const sup = next.supply[color] ?? 0;
    if (sup < 0 || sup > CUBES_PER_COLOR_TOTAL) out.push(`supply ${color} out of range: ${sup}`);
  }

  // ── Players: amoebas, dp/bp, score, genes ──
  for (const seat of next.seatOrder) {
    const p = next.players[seat]!;
    if (p.amoebas.length !== 7) out.push(`${seat}: has ${p.amoebas.length} amoebas (expected 7)`);
    const onBoard = p.amoebas.filter((a) => a.location !== null);
    if (onBoard.length > 7) out.push(`${seat}: ${onBoard.length} amoebas on board (>7)`);
    for (const a of p.amoebas) {
      if (a.location !== null && !isPlayableCell(a.location)) {
        out.push(`${seat}: amoeba ${a.id} on non-playable cell ${a.location}`);
      }
      if (a.dp < 0) out.push(`${seat}: amoeba ${a.id} has negative dp ${a.dp}`);
      if (a.location === null && a.dp !== 0) out.push(`${seat}: off-board amoeba ${a.id} has dp ${a.dp} (expected 0)`);
    }
    if (p.bp < 0) out.push(`${seat}: negative bp ${p.bp}`);
    const prevScore = prev.players[seat]?.score ?? 0;
    if (p.score < prevScore) out.push(`${seat}: score went backward ${prevScore} → ${p.score}`);
    if (p.score > LADDER_MAX) out.push(`${seat}: score ${p.score} exceeds ${LADDER_MAX}`);

    // Gene uniqueness + advanced-implies-prerequisite-removed.
    if (new Set(p.genes).size !== p.genes.length) out.push(`${seat}: duplicate gene in ${JSON.stringify(p.genes)}`);
    for (const g of p.genes) {
      const def = geneDef(g);
      if (!def.isAdvanced) continue;
      for (const pre of def.prerequisite ?? []) {
        if (p.genes.includes(pre)) out.push(`${seat}: holds advanced ${g} but still owns prerequisite ${pre}`);
      }
    }
  }

  // ── Gene copy limits across all seats ──
  for (const g of GENE_IDS) {
    const owners = next.seatOrder.filter((s) => next.players[s]!.genes.includes(g)).length;
    const cap = geneCopies(g, next.playerCount);
    if (owners > cap) out.push(`gene ${g}: ${owners} owners exceeds copy limit ${cap}`);
  }

  // ── Decision availability ──
  if (next.phase !== 'game_over') {
    if (!next.currentDecision) {
      out.push('non-terminal state has no currentDecision');
    } else if (legalActions(next).length === 0) {
      out.push(`no legal actions for pending decision ${next.currentDecision.kind}`);
    }
  }

  // ── winner ⇔ game_over ──
  if ((next.winner !== null) !== (next.phase === 'game_over')) {
    out.push(`winner/game_over mismatch: winner=${next.winner}, phase=${next.phase}`);
  }

  // ── Event ↔ state agreement ──
  for (const e of events) {
    if (e.type === 'died') {
      const a = next.players[e.seat]?.amoebas.find((x) => x.id === e.amoebaId);
      if (a && (a.location !== null || a.dp !== 0)) {
        out.push(`died(${e.seat},${e.amoebaId}) but location=${a.location} dp=${a.dp}`);
      }
    }
    if (e.type === 'gene_bought') {
      const delta = (prev.players[e.seat]?.bp ?? 0) - (next.players[e.seat]?.bp ?? 0);
      if (delta !== e.cost) out.push(`gene_bought cost ${e.cost} ≠ bp delta ${delta} for ${e.seat}`);
    }
    if (e.type === 'divided') {
      const delta = (prev.players[e.seat]?.bp ?? 0) - (next.players[e.seat]?.bp ?? 0);
      if (delta !== e.cost) out.push(`divided cost ${e.cost} ≠ bp delta ${delta} for ${e.seat}`);
    }
    if (e.type === 'scored') {
      const score = next.players[e.seat]?.score;
      if (score !== e.to) out.push(`scored to=${e.to} ≠ resulting score ${score} for ${e.seat}`);
      if (e.to < e.from) out.push(`scored went backward from=${e.from} to=${e.to} for ${e.seat}`);
    }
  }

  return out;
}
