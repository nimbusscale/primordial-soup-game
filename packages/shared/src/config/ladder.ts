// Scoring Ladder constants and the two advance tables (spec §6 Phase 6).

// LADDER_MAX and FINISH_ZONE_START are exported from constants.js (and the barrel).
import { FINISH_ZONE_START } from './constants.js';

/** Spaces advanced for a number of live amoebas (spec §6 Phase 6 — Amoebas table). */
export function amoebaAdvanceSpaces(liveAmoebas: number): number {
  if (liveAmoebas <= 2) return 0;
  if (liveAmoebas === 3) return 1;
  if (liveAmoebas === 4) return 2;
  if (liveAmoebas === 5) return 4;
  if (liveAmoebas === 6) return 5;
  return 6; // 7
}

/** Spaces advanced for a gene-card count (spec §6 Phase 6 — Gene cards table). */
export function geneAdvanceSpaces(geneCardCount: number): number {
  if (geneCardCount <= 2) return 0;
  if (geneCardCount === 3) return 1;
  if (geneCardCount === 4) return 2;
  if (geneCardCount === 5) return 3;
  return 4; // 6+
}

export function isInFinishZone(score: number): boolean {
  return score >= FINISH_ZONE_START;
}
