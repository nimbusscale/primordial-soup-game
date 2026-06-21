import { describe, expect, it } from 'vitest';
import { runUat } from './uat/run-uat.js';
import { THREE_P_GENES } from './uat/coverage.js';

// UAT regression — locks in that the standard UAT sweep covers all 18 three-player genes
// (each owned AND activated in a game that tripped zero invariants) and trips zero invariant
// anomalies across every game. Mirrors the GAME-01 golden pattern: deterministic, so coverage
// can never silently regress. See docs/UAT.md for how the harness works.
describe('UAT — 3-player gene coverage sweep', () => {
  const report = runUat();

  it('covers all 18 three-player genes (owned + activated, clean)', () => {
    expect(report.uncovered).toEqual([]);
    expect(report.covered.length).toBe(THREE_P_GENES.length);
    expect(new Set(report.covered)).toEqual(new Set(THREE_P_GENES));
  });

  it('trips zero invariant anomalies across every game', () => {
    const offenders = report.games
      .filter((g) => g.anomalies.length > 0)
      .map((g) => `${g.id}: ${g.anomalies.map((a) => a.detail).join('; ')}`);
    expect(offenders).toEqual([]);
    expect(report.totalAnomalies).toBe(0);
  });

  it('every game runs to game_over within the 15-game cap', () => {
    expect(report.games.length).toBeLessThanOrEqual(15);
    for (const g of report.games) {
      expect(g.status, `${g.id} should be clean`).toBe('clean');
    }
  });
});
