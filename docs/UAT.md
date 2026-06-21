# UAT — User-Acceptance Testing harness

A reusable harness that plays full games headlessly through the pure rules engine and proves
that each gene's effect actually fires in live game flow, while checking structural and
rules-faithfulness invariants after **every** `reduce`. It exists to surface real-game bugs
(gene interactions, phase sequencing, combat in live flow) that the per-mechanic validation
scenarios in `docs/validation-scenarios.md` can miss.

This document is a **guide to running and extending the harness**. It is not a results log —
a sweep prints its own results report (see [Reading the report](#reading-the-report)).

## TL;DR

```bash
# Run a full UAT sweep and print a markdown + JSON report:
npx tsx packages/engine/test/uat/run-uat.ts

# Save the report for review (this file is temporary — do NOT commit it):
npx tsx packages/engine/test/uat/run-uat.ts > UAT-results.local.md

# Run the regression test that locks in "all 18 genes covered, zero anomalies":
npx vitest run packages/engine/test/uat.test.ts
```

The sweep exits non-zero if any gene is left uncovered or any invariant trips.

## What the harness does

For each **game plan** it:

1. Builds an initial `GameState` + `Rng` (a real seeded game from `createInitialState`, or a
   crafted scenario positioned to trigger a specific gene).
2. Drives the game to `game_over` with a gene-targeting **policy** that resolves every
   `currentDecision` (movement, feeding, buying, division, and combat responses).
3. After every `reduce`, runs **invariants** (`checkInvariants`) and **activation detectors**
   (`detectActivations`) over the chosen action, the emitted events, and the pre/post state.
4. Records, per game, which genes were **owned** and which **activated**, plus any anomalies.

The driver runs plans in order and stops as soon as all 18 three-player genes are covered.
The **15-game cap is only a backstop** so a non-terminating game can't run forever; if
coverage is still incomplete at the cap, the run stops and reports the uncovered genes.

## How coverage is defined

A gene counts as **COVERED** only when, **within a single game that tripped zero
invariants**, it was both:

- **Owned** — present in some seat's `players[seat].genes` (pre-placed in a crafted state, or
  bought via a `gene_bought` event), and
- **Activated** — its effect demonstrably fired, proven by a specific event / state-delta
  predicate (below).

Activations observed during a game that *did* trip an invariant do **not** count — that gene
must be re-exercised cleanly after the bug is fixed.

### Per-gene activation predicates

| Gene | Activation predicate |
|------|----------------------|
| INTELLIGENCE | a `scored` event with `geneSpaces > 0` for an owner |
| MOVEMENT_I | a `moved` event by an owner of MOVEMENT_I (and not MOVEMENT_II) |
| MOVEMENT_II | a `moved` event with `roll === 0` by a MOVEMENT_II owner |
| SPEED | ≥2 movement-step events for one amoeba in a single `reduce` (free second move) |
| SUBSTITUTION | a `fed` event whose `ate` is a single color = 4 |
| RAY_PROTECTION | at an environment reveal, the owner's `mpSum ≤ ozone` but `mpSum + 2 > ozone` (the −2 is load-bearing) |
| STREAMLINING | a `moved` event with `bpSpent === 0` by a STREAMLINING owner |
| TENTACLE | a `moved` event by a TENTACLE owner whose origin cell lost cubes (a carry) |
| HOLDING | a `stayed` event with `reason === 'holding'` |
| LONGEVITY | in Phase 5, an owner's amoeba at `dp ∈ [2,3)` survives |
| DIVISION_RATE | a `divided` event with `cost === 4` |
| SPORES | a `divided` event onto a cell with no same-color neighbor (owner already 2+ on board) |
| STRUGGLE_FOR_SURVIVAL | an `attacked` event with `kind: 'struggle'` by a STRUGGLE owner |
| AGGRESSION | an `attacked` event with `kind: 'aggression'` by an AGGRESSION owner |
| DEFENSE | a `defended` event by a DEFENSE owner |
| ESCAPE | an `escaped` event by an ESCAPE owner |
| ARMOR | an aggression vs an ARMOR owner → target `dp += 1` and no `died` |
| PERSISTENCE | ≥2 movement-step events for one amoeba in a single `reduce` (free second move) |

The predicates live in `packages/engine/test/uat/coverage.ts`.

## Invariants checked after every step

From `packages/engine/test/uat/invariants.ts`:

- **Cube conservation** — 55 cubes per in-play color (board + supply), 0 per out-of-play
  color; supply within `[0,55]`.
- **Amoebas** — exactly 7 per player; on-board amoebas on playable cells; `dp ≥ 0`; an
  off-board amoeba has `dp === 0`.
- **BP / score** — `bp ≥ 0`; score monotonic non-decreasing and `≤ 50`.
- **Genes** — no duplicates; copy limits per player count; an advanced gene implies its
  prerequisite basic has been removed.
- **Decision liveness** — a non-`game_over` state has a `currentDecision` with at least one
  legal action.
- **Termination** — `winner !== null` iff `phase === 'game_over'`.
- **Event ↔ state agreement** — `gene_bought.cost` / `divided.cost` match the BP delta;
  `scored.to` matches the resulting score and never goes backward; a `died` amoeba is
  off-board with `dp 0`.

Anomalies are **recorded, not thrown**, so one game captures every problem it hits.

## Harness layout

```
packages/engine/test/uat/
  coverage.ts    the 18 genes, per-gene activation detectors, and the coverage tracker
  invariants.ts  checkInvariants(prev, next, action, events) → string[] anomalies
  policy.ts      chooseAction(state, plan): a parameterized, plan-driven action chooser
  craft.ts       craftGame(...): build a complete, cube-conserving GameState mid-game
  game-plans.ts  the STANDARD_PLANS list (real + crafted games)
  run-uat.ts     the driver loop + markdown/JSON report
packages/engine/test/uat.test.ts   regression test (all 18 covered, zero anomalies)
```

## Reading the report

`run-uat.ts` prints:

- A header with games run, genes covered, uncovered genes, and total anomalies.
- A **coverage matrix** (18 genes × games): `✅` owned+activated in a clean game, `o` owned
  only, `⚠️` activated but in a game that tripped an anomaly (does not count).
- A **per-gene status** list (`COVERED` / `NOT COVERED`).
- A **per-game** section: targets, steps, rounds, winner, each seat's genes, the genes it
  covered cleanly, and an **Issues** block (`No issues.` or every anomaly with diagnostics).

## Adding a game plan / targeting new genes

A `GamePlan` (`policy.ts`) is:

```ts
{
  id, description, targets,           // metadata + the genes this game aims to cover
  style: 'real' | 'scripted',         // real = full seeded game; scripted = crafted + scripted RNG
  build: () => ({ state, rng }),      // initial state + RNG
  seats: { 'seat-0': SeatPlan, ... }, // per-seat steering (buy list / phase-1 pref / combat)
}
```

To target a new gene:

1. Add its activation predicate to `detectActivations` in `coverage.ts` (and the gene to
   `THREE_P_GENES` if it's new to 3p).
2. Author a `GamePlan` that owns and triggers it:
   - **Real game** — give the seat a `buy` list and let it play (good for surfacing
     interaction bugs); steer phase-1/feeding/division via `SeatPlan`.
   - **Crafted scenario** — use `craftGame(...)` to place amoebas/genes/cubes and a
     `currentDecision` exactly where the effect fires, then drive to `game_over`. Crafted
     games drift by default (no stray die rolls), so a scripted RNG only needs the dice you
     actually force (e.g. fight rolls). `craftGame` conserves cubes (supply = 55 − on-board)
     and pads amoebas to ids 1..7; keep the env `deck` short so the game ends in a round or
     two.
3. Append the plan to `STANDARD_PLANS` in `game-plans.ts` and re-run the sweep.

## When the sweep finds a bug

Per the project's determinism contract: fix the bug **in the engine source only**
(`packages/engine/src/...`), keep the full validation suite green (`npm test`, including the
GAME-01 golden and combat scenarios), then re-run the offending game from scratch until it
completes with zero anomalies. Only bug-free activations count toward coverage, so a gene
exercised during a buggy game must be re-covered cleanly after the fix.
