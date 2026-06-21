// The UAT driver loop. Runs game plans in order, applying the gene-targeting policy and,
// after every reduce, checking invariants and detecting gene activations. Only genes that
// were owned AND activated in a game that tripped ZERO invariants count toward coverage. The
// loop stops as soon as all 18 three-player genes are covered; the 15-game cap is a backstop
// so a non-terminating game can never run forever.
//
// Run a full sweep:   npx tsx packages/engine/test/uat/run-uat.ts

import type { GameEvent, GameState, GeneId, PlayerId } from '@ps/shared';
import { reduce } from '@ps/engine';
import { checkInvariants } from './invariants.js';
import {
  cleanlyCovered,
  detectActivations,
  newGameCoverage,
  recordActivations,
  recordOwnership,
  THREE_P_GENES,
  type GameCoverage,
} from './coverage.js';
import { chooseAction, type GamePlan } from './policy.js';
import { STANDARD_PLANS } from './game-plans.js';

const GAME_CAP = 15;
const MAX_STEPS = 100_000;

export interface Anomaly {
  step: number;
  action: unknown;
  detail: string;
}

export interface GameReport {
  id: string;
  description: string;
  targets: GeneId[];
  status: 'clean' | 'anomalies' | 'error';
  steps: number;
  rounds: number;
  winner: PlayerId | null;
  seatGenes: Record<PlayerId, GeneId[]>;
  owned: GeneId[];
  activated: GeneId[];
  covered: GeneId[]; // owned ∩ activated, only when status === 'clean'
  anomalies: Anomaly[];
  error?: string;
}

export interface UatReport {
  games: GameReport[];
  covered: GeneId[];
  uncovered: GeneId[];
  totalAnomalies: number;
}

function playGame(plan: GamePlan): { report: GameReport; cov: GameCoverage } {
  const cov: GameCoverage = newGameCoverage();
  const anomalies: Anomaly[] = [];
  let { state, rng } = plan.build();
  const allEvents: GameEvent[] = [];
  let steps = 0;
  let maxRound = state.round;
  let error: string | undefined;

  recordOwnership(cov, state);

  try {
    while (state.phase !== 'game_over' && state.currentDecision) {
      if (steps++ > MAX_STEPS) throw new Error('exceeded MAX_STEPS (non-terminating game?)');
      const action = chooseAction(state, plan);
      const res = reduce(state, action, rng);
      if (!res.ok) {
        anomalies.push({ step: steps, action, detail: `reduce rejected a chosen action: ${res.reason}` });
        break; // a rejected legal action is a defect; stop this game
      }
      const next = res.state;
      for (const v of checkInvariants(state, next, action, res.events)) {
        anomalies.push({ step: steps, action, detail: v });
      }
      for (const a of detectActivations(state, action, res.events, next)) {
        // Attribute only if the seat genuinely owns the gene in `next`.
        if (next.players[a.seat]?.genes.includes(a.gene)) cov.activated.add(a.gene);
      }
      recordOwnership(cov, next);
      allEvents.push(...res.events);
      state = next;
      maxRound = Math.max(maxRound, state.round);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    anomalies.push({ step: steps, action: null, detail: `threw: ${error}` });
  }

  const seatGenes: Record<PlayerId, GeneId[]> = {};
  for (const seat of state.seatOrder) seatGenes[seat] = [...state.players[seat]!.genes];

  const status: GameReport['status'] = error ? 'error' : anomalies.length > 0 ? 'anomalies' : 'clean';
  const covered = status === 'clean' ? [...cleanlyCovered(cov)] : [];

  return {
    cov,
    report: {
      id: plan.id,
      description: plan.description,
      targets: plan.targets,
      status,
      steps,
      rounds: maxRound,
      winner: state.winner,
      seatGenes,
      owned: [...cov.owned],
      activated: [...cov.activated],
      covered,
      anomalies,
      ...(error ? { error } : {}),
    },
  };
}

/** Run the UAT sweep over `plans`, stopping early once all 18 genes are covered. */
export function runUat(plans: GamePlan[] = STANDARD_PLANS): UatReport {
  const coveredGlobal = new Set<GeneId>();
  const games: GameReport[] = [];

  for (const plan of plans) {
    if (games.length >= GAME_CAP) break;
    if (coveredGlobal.size >= THREE_P_GENES.length) break;

    const { report } = playGame(plan);
    games.push(report);
    if (report.status === 'clean') for (const g of report.covered) coveredGlobal.add(g);
  }

  const covered = THREE_P_GENES.filter((g) => coveredGlobal.has(g));
  const uncovered = THREE_P_GENES.filter((g) => !coveredGlobal.has(g));
  const totalAnomalies = games.reduce((n, g) => n + g.anomalies.length, 0);
  return { games, covered, uncovered, totalAnomalies };
}

// ── Markdown report rendering ──────────────────────────────────────────────────

function coverageMatrix(report: UatReport): string {
  const header = ['Gene', ...report.games.map((g) => g.id.split('-')[0])];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const gene of THREE_P_GENES) {
    const cells = report.games.map((g) => {
      if (g.status === 'clean' && g.covered.includes(gene)) return '✅';
      if (g.owned.includes(gene) && g.activated.includes(gene)) return '⚠️'; // hit but game not clean
      if (g.owned.includes(gene)) return 'o';
      return '';
    });
    lines.push(`| ${gene} | ${cells.join(' | ')} |`);
  }
  return lines.join('\n');
}

export function renderMarkdown(report: UatReport): string {
  const out: string[] = [];
  out.push('# UAT results — 3-player gene coverage sweep\n');
  out.push(`**Games run:** ${report.games.length} / ${GAME_CAP} cap`);
  out.push(`**Covered:** ${report.covered.length} / ${THREE_P_GENES.length}`);
  out.push(`**Uncovered:** ${report.uncovered.length ? report.uncovered.join(', ') : 'none — all 18 covered'}`);
  out.push(`**Total invariant anomalies:** ${report.totalAnomalies}\n`);

  out.push('## Coverage matrix\n');
  out.push('Legend: ✅ owned+activated in a clean game · o owned only · ⚠️ activated in a game with anomalies (does not count)\n');
  out.push(coverageMatrix(report));
  out.push('');

  out.push('## Per-gene status\n');
  for (const gene of THREE_P_GENES) {
    const mark = report.covered.includes(gene) ? 'COVERED' : 'NOT COVERED';
    out.push(`- **${gene}** — ${mark}`);
  }
  out.push('');

  out.push('## Per-game detail\n');
  for (const g of report.games) {
    out.push(`### ${g.id} — ${g.status.toUpperCase()}`);
    out.push(g.description);
    out.push(`- Targets: ${g.targets.length ? g.targets.join(', ') : '(smoke)'}`);
    out.push(`- Steps: ${g.steps}, rounds reached: ${g.rounds}, winner: ${g.winner ?? '—'}`);
    for (const seat of Object.keys(g.seatGenes)) out.push(`- ${seat} genes: ${g.seatGenes[seat]!.join(', ') || '(none)'}`);
    out.push(`- Covered (clean owned+activated): ${g.covered.length ? g.covered.join(', ') : '(none)'}`);
    if (g.anomalies.length === 0) {
      out.push('- Issues: No issues.');
    } else {
      out.push('- Issues:');
      for (const a of g.anomalies) out.push(`  - step ${a.step}: ${a.detail}${a.action ? ` — action ${JSON.stringify(a.action)}` : ''}`);
    }
    out.push('');
  }
  return out.join('\n');
}

// ── Entry point (only when invoked directly via tsx/node) ──────────────────────

const invoked = process.argv[1] ?? '';
if (/run-uat\.(ts|js)$/.test(invoked)) {
  const report = runUat();
  process.stdout.write(renderMarkdown(report) + '\n');
  process.stdout.write('\n<!-- JSON -->\n' + JSON.stringify({ covered: report.covered, uncovered: report.uncovered, totalAnomalies: report.totalAnomalies }, null, 2) + '\n');
  if (report.uncovered.length > 0 || report.totalAnomalies > 0) process.exitCode = 1;
}
