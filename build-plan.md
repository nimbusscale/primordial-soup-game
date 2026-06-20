# Primordial Soup — Build Plan

> Companion to **`game-spec.md`** (rules, source of truth, read-only), **`architecture.md`** (system design), **`state-model-and-protocol.md`** (state shape, action/event catalogs, wire protocol), and **`validation-scenarios.md`** (the golden scenarios that gate the milestones here). This document defines the **construction sequence**: ordered, checkpointable milestones an agentic builder (Claude Code) can complete and verify one at a time, instead of one large attempt. Each milestone names its objective, scope, deliverables, dependencies, the architecture/protocol sections it implements, and **runnable acceptance criteria**. It does not restate game rules; the spec owns those.

---

## 1. How To Use This Plan

The plan exists to keep a long build **checkpointable and independently verifiable**. Work milestones strictly in order. A milestone is "done" only when its acceptance criteria pass, which for engine work means its **gating validation scenarios** (from the scenarios doc) run green under Vitest, and for app work means a stated runnable check passes (a server that boots, an HTTP call that returns the expected shape, a client that renders and completes a turn).

Rules for the builder:

1. **Do not start the next milestone until the current one is green.** Each milestone ends in a committable, runnable state.
2. **One commit per milestone, on the `dev` branch.** When a milestone's acceptance criteria pass, stage the milestone's work as a **single commit** (message prefixed with the milestone id, e.g. `M4: Phase 1 feeding`) and **push it to the `dev` branch**. Do not move to the next milestone before the commit is pushed. All milestone work lands on `dev`; the commit history then reads as one commit per milestone in order.
3. **The rules spec is read-only.** Never edit `game-spec.md`. When a rule is unclear, the spec plus its FAQ and Implementation Notes are authoritative; do not invent mechanics.
4. **The protocol doc owns the data shapes.** Types in `packages/shared` mirror it exactly. Do not reshape `GameState`, actions, or events to make a milestone easier.
5. **Determinism is non-negotiable.** All randomness flows through the injected `Rng` (architecture §13). Given the same seed and action list, a scenario reproduces exactly. No `Math.random`, no `Date.now`, no I/O in the engine.
6. **Player count is data, not branches.** Read 3p/4p differences from the config table (protocol §3), never from scattered `if (playerCount === 3)` logic.
7. **`legalActions` is built alongside each phase,** not deferred. Every decision kind a milestone introduces ships with its `legalActions` cases, because the client and bots depend on it (architecture §6).

Each engine milestone delivers: the phase/effect logic in `reduce`, the matching `legalActions` cases, and the Vitest scenarios that gate it. App milestones deliver the orchestration around the engine and a manual or scripted runnable check.

---

## 2. `CLAUDE.md` (create in M0, keep current)

Place a `CLAUDE.md` at the repo root in the first milestone and update it whenever conventions change. It is the builder's standing context. It must contain:

- **What this is:** a server-authoritative, all-TypeScript multiplayer implementation of Primordial Soup. One sentence, then point to the four docs in `docs/`.
- **Read-only boundary:** `docs/game-spec.md` is the source of truth for rules and must never be edited. The architecture, protocol, and validation docs are authoritative for their domains.
- **Where things live:** the package map (`packages/shared`, `packages/engine`, `packages/bots`, `apps/server`, `apps/client`), with the one-line role of each and the rule that `shared`, `engine`, and `bots` never import from the apps.
- **Install / run / test commands:** how to bootstrap (`npm install` at root), run the engine tests (`npm -w packages/engine test`), run all tests (`npm test`), start the server in dev, and start the client dev server. Fill these in as each milestone adds them.
- **Conventions:** JSON-serializable state only (no `Map`/`Set`/class instances in `GameState`); `Record<string, T>` for keyed collections, arrays for ordered ones; engine purity; the `Rng` is injected, never imported as a singleton; events explain deltas and are never required to reconstruct state.
- **Determinism contract:** every engine change must keep existing scenarios green; new rule logic ships with a gating scenario.
- **Git workflow:** all work lands on the `dev` branch as **one commit per milestone**, committed and pushed only after that milestone's acceptance criteria pass. Commit messages are prefixed with the milestone id (e.g. `M7: Phase 4 cell division`).
- **The milestone you are on:** a single line the builder updates, so a resumed session knows where it is.

Acceptance for the `CLAUDE.md` itself is part of M0: it exists, names the read-only spec, and lists the commands that exist so far.

---

## 3. Pinned Dependencies

Pin exact versions at the root and per workspace so the build is reproducible. The versions below are known-good starting pins; on first `npm install` the builder commits the resolved `package-lock.json`, and may bump within the same major only after confirming the engine scenarios still pass. (Authored against a January 2026 toolchain; confirm current patch releases at build time and lock whatever resolves.)

| Concern | Package | Pinned version |
|---|---|---|
| Language | `typescript` | `5.4.5` |
| Runtime baseline | Node.js | `20.x` LTS (22.x acceptable) |
| Workspace tooling | npm | `10.x` (ships with Node 20) |
| Server WebSocket | `ws` | `8.17.1` |
| WS types | `@types/ws` | `8.5.10` |
| Node types | `@types/node` | `20.14.x` |
| Dev TS runner (server) | `tsx` | `4.16.x` |
| Client framework | `react`, `react-dom` | `18.3.1` |
| React types | `@types/react`, `@types/react-dom` | `18.3.x` |
| Client bundler | `vite` | `5.2.x` |
| React plugin | `@vitejs/plugin-react` | `4.3.x` |
| Tests | `vitest` | `1.6.0` |

No HTTP framework is pinned: the lobby has only a few endpoints (architecture §4), so use Node `http` plus a tiny hand-rolled router unless a later milestone justifies more. No client transport library: use the native browser `WebSocket`.

---

## 4. Milestone Map

| ID | Milestone | Tier | Gating scenarios (see §6) |
|---|---|---|---|
| M0 | Repo scaffold + toolchain + `CLAUDE.md` | infra | repo boots; `npm test` runs (zero tests OK) |
| M1 | `shared` types + static config | infra | type-check passes; config self-checks |
| M2 | Engine: setup / initial state | MVP-core | `SETUP-*` |
| M3 | Engine: Phase 1 movement | MVP-core | `MOVE-*` |
| M4 | Engine: Phase 1 feeding | MVP-core | `FEED-01,03,04,05,06` |
| M5 | Engine: Phase 2 environment + defects | MVP-core | `DEFECT-*` |
| M6 | Engine: Phase 3 gene buying | MVP-core | `BUY-*` |
| M7 | Engine: Phase 4 cell division | MVP-core | `DIV-*` |
| M8 | Engine: Phase 5 natural deaths | MVP-core | `DEATH-*` |
| M9 | Engine: Phase 6 scoring + game end | MVP-core | `SCORE-*`, `END-*` |
| M10 | Engine integration: full headless 3p game | MVP-core | `GAME-01` |
| M11 | `GameStore` + server loop | infra | server boots; `POST /api/games`; WS join |
| M12 | Join-link flow end to end | infra | two browsers join distinct seats from links |
| M13 | React client | infra | board renders; one turn completes via UI |
| M14 | Playable milestone: full non-combat 3p game | MVP-core | humans finish a game start to winner |
| M15 | Combat genes (reactive) | full-ruleset | `COMBAT-*` (3p subset) |
| M16 | Docker packaging (**MVP release**) | infra | one image serves client + WS |
| _— end of MVP —_ | | | |
| M17 | Future: 4-player content | full-ruleset | `SETUP-02`, `FEED-02,07`, `P4-*` |
| M18 | Future: 2-player bots variant | full-ruleset | bot finishes a game deterministically |

Tiers mirror protocol §9. The engine is functionally complete for non-combat play at M10; M11 through M14 wrap it in transport and UI; M15 adds combat to reach the full 3-player ruleset; **M16 is the MVP release**: a complete, rules-faithful, deployable 3-player game. M17 and M18 are post-MVP future work (see §5a); they add a different player count and a separate variant, not new rules for the 3-player game.

---

## 5. Milestones

Each milestone lists objective, in/out of scope, deliverables, dependencies and ordering rationale, the architecture/protocol sections it implements, and acceptance criteria. "Green" means the named Vitest scenarios pass and any stated runnable check succeeds.

### M0 — Repo scaffold + toolchain + `CLAUDE.md`

**Objective.** A monorepo that installs, type-checks, and runs an (empty) Vitest suite, with the doc set and `CLAUDE.md` in place.

**In scope.** npm workspaces root; the five workspace folders from architecture §5 (`packages/shared`, `packages/engine`, `packages/bots`, `apps/server`, `apps/client`) with minimal `package.json` and `tsconfig` each; a root `tsconfig` with project references; Vitest config; the pinned versions from §3; `docs/` populated with the four markdown docs; root `CLAUDE.md` per §2.

**Out of scope.** Any game logic, types, server, or client code beyond stubs.

**Deliverables.** Root `package.json` (workspaces, scripts: `test`, `typecheck`), `tsconfig.base.json`, per-workspace `package.json`/`tsconfig`, `vitest.config.ts`, `docker/` placeholder, `CLAUDE.md`, `.gitignore`, committed `package-lock.json`, and an initialized git repository with a `dev` branch.

**Dependencies / ordering.** First. Everything else imports from `shared`, which needs the workspace wiring.

**Implements.** Architecture §5 (layout), §4 (stack), §17 (resolved tooling).

**Acceptance.**
- `npm install` at root succeeds and writes a lockfile.
- `npm run typecheck` passes across all workspaces.
- `npm test` runs Vitest and reports zero tests (or a trivial passing one) with exit 0.
- `CLAUDE.md` exists, marks the rules spec read-only, and lists the commands above.
- The repo is on a `dev` branch, and the scaffold is committed as `M0: scaffold + toolchain` and pushed to `dev`.

---

### M1 — `shared` types + static configuration

**Objective.** The contract package: every type from the protocol doc plus the static config tables, type-checking and self-consistent.

**In scope.** In `packages/shared/src`: the identifiers and enums (protocol §2); `GameState`, `Cell`, `Amoeba`, `PlayerState`, `EnvCard`, `CurrentDecision`, `DecisionKind`, the `DecisionContext` variants, the full `GameAction` and `GameEvent` catalogs, and the wire `ClientMessage`/`ServerMessage` types (protocol §4–§8); the static config (protocol §3): the 24-cell board with derived orthogonal adjacency, direction deltas, ladder constants (`LADDER_MAX=50`, `FINISH_ZONE_START=41`), compass mapping, the gene catalog (price, MP, 3p/4p copy counts, advanced-gene prerequisite, effect tags), the 11 environment-card definitions, and the player-count config table (feeding ratios, gene copies, TENTACLE capacity, death-cube counts, setup-DP rules).

**Out of scope.** Any behavior. No `reduce`, no `legalActions`. Config is data only.

**Deliverables.** `packages/shared/src/{ids,state,actions,events,messages,config}.ts` (or similar), a barrel `index.ts`, and a small set of **config self-check tests** (e.g. exactly 24 cells, island `2,2` absent, adjacency symmetric, every advanced gene names a real prerequisite, gene copy counts match the spec tables, environment deck has 11 cards).

**Dependencies / ordering.** After M0, before all engine work. The whole engine and both apps import these types.

**Implements.** Protocol §2, §3, §4, §6, §7, §8; architecture §5–§6.

**Acceptance.**
- `npm -w packages/shared run typecheck` passes.
- The config self-check tests pass (board size, adjacency symmetry, gene-catalog totals, env-deck count).
- No value intended for `GameState` uses `Map`, `Set`, class instances, or `undefined`-as-data (a serialization round-trip test on a hand-built sample state passes).

---

### M2 — Engine: setup and initial state

**Objective.** `createInitialState(opts, rng)` produces a correct, deterministic active game in `setup`, and the engine resolves `place_starting_amoeba` decisions through to the start of round 1, Phase 1.

**In scope.** `createInitialState`; seeded play-order roll; score-marker placement on start spaces (`1..3` for 3p, `1..4` for 4p); two cubes of each in-play color on every cell with `supply` decremented accordingly; the **starting-DP asymmetry** (first amoebas 0 DP in 3p, 1 DP in 4p; second amoebas never get DP); the ascending-then-descending placement order; the `place_starting_amoeba` decision kind plus its `legalActions` (empty cells only, no two amoebas sharing a cell after setup); the auto-advance into Phase 1 once setup completes.

**Out of scope.** Any Phase 1 logic beyond entering it. No movement, no feeding yet.

**Deliverables.** `packages/engine/src/setup.ts`, the first slice of `reduce.ts` and `legalActions.ts`, the `Rng` interface and a seedable implementation (or a thin wrapper if the architecture's `Rng` lives in shared), and the `SETUP-*` scenarios wired as Vitest cases.

**Dependencies / ordering.** After M1. Setup builds the state object every later phase mutates, and the decision-point loop scaffolding lands here.

**Implements.** Spec §4 (Setup); protocol §4 (`GameState`), §5 (decision model), §3 (config); architecture §6 (engine contract), §13 (determinism).

**Acceptance.** `SETUP-01` (3p), `SETUP-02` (4p asymmetry), `SETUP-03` (placement legality) pass. A round-trip test confirms the produced state serializes and deserializes unchanged.

---

### M3 — Engine: Phase 1 movement

**Objective.** Drift, stay, and move resolve correctly for one amoeba at a time in numerical order, including the roll-of-6 sub-decision and obstacle handling, with the non-reactive movement genes in scope.

**In scope.** The `amoeba_action` decision (drift / stay / move) and `choose_move_direction`; drift in the env-card direction with obstacle and no-drift handling; move paying 1 BP with a seeded roll, compass mapping (`1=W,2=N,3=E,4=S,5=stay,6=free`), move-into-obstacle not carried out; the `set_move_direction` follow-up after a 6; `moved`/`drifted`/`stayed` events with correct `reason`. Movement genes (all non-reactive): MOVEMENT I (roll two dice, pick either), MOVEMENT II (advanced, choose direction without rolling), SPEED (second free move, no double-drift, no drift/move mix), STREAMLINING (movement cost 0), TENTACLE (carry up to 2 cubes in 3p while moving), HOLDING **function 1 only** (stay instead of drift). Each gene's movement sub-choices surface as their own decisions per protocol §5.

**Out of scope.** Feeding (M4). HOLDING **function 2** (follow a departing co-located amoeba) is deferred to the combat milestone M15, because it is a cross-seat reactive sub-decision and the spec's HOLDING-versus-ESCAPE resolution lives in the combat section. ESCAPE-driven movement is M15.

**Deliverables.** `packages/engine/src/phases/phase1_movement.ts`, movement-gene modules under `genes/`, the `MOVE-*` scenarios.

**Dependencies / ordering.** After M2. Movement precedes feeding because feeding happens in the destination cell.

**Implements.** Spec §6 Phase 1 (Drift/Move), §3a (topology), §7 (movement genes), §11 (movement validity); protocol §5 (sequenced sub-decisions), §6, §7; architecture §6, §13.

**Acceptance.** `MOVE-01`..`MOVE-14` pass (drift normal / edge-obstacle / island-obstacle / no-drift; move normal / roll-5 / roll-6-then-direction / move-into-obstacle; MOVEMENT I; STREAMLINING; SPEED; MOVEMENT II; TENTACLE carry; HOLDING stay).

---

### M4 — Engine: Phase 1 feeding

**Objective.** After movement, each amoeba feeds or starves correctly, including the 3-player single-plus-double ratio, excretion, starvation DP, and cube-supply shortage.

**In scope.** The `amoeba_feed` decision and its `legalActions` (only combos the cell can satisfy under the player-count ratio and the player's feeding genes); 3p single-plus-double eating with player choice of which color is single and which is double; excretion of +2 of the eater's own color; starvation granting 1 DP with no eat or excrete; the `fed`/`starved` events; cube-supply shortage (place as many as the global reserve allows, skip the rest, never substitute color); trivial auto-resolution when exactly one combo is legal. SUBSTITUTION (3p: eat 4 of one color) as a feeding-modifier gene.

**Out of scope.** STRUGGLE FOR SURVIVAL (a starving amoeba attacking instead of taking DP) is M15. PARASITISM and FRUGALITY are 4-player only (M17). The 4p `1:1:1` ratio is exercised in M17 but the ratio table is read from config now.

**Deliverables.** `packages/engine/src/phases/phase1_feeding.ts`, SUBSTITUTION under `genes/`, the `FEED-01,03,04,05,06` scenarios.

**Dependencies / ordering.** After M3; feeding consumes the post-movement cell. Completing M4 closes the Phase 1 loop for non-combat play.

**Implements.** Spec §6 Phase 1 (Feeding, Shortage of Food), §7 (SUBSTITUTION), §11 (cube supply); protocol §5–§7.

**Acceptance.** `FEED-01` (3p ratio + excretion), `FEED-03` (starvation), `FEED-04` (supply shortage), `FEED-05` (SUBSTITUTION combo present), `FEED-06` (legalActions enumeration + auto-resolve) pass.

---

### M5 — Engine: Phase 2 environment and gene defects

**Objective.** Flip the environment card and resolve gene defects with the locked-in difference, including RAY PROTECTION's two roles.

**In scope.** Removing the old env card and revealing the next in deck order with the `environment_revealed` event; no defects in round 1; summing MP per player; the `balance_gene_defect` decision issued only to players over ozone, carrying the **locked-in** `excessMp`; `balance_defect` resolution by paying BP and/or giving up genes (each at its MP value), with excess lost and no refund; RAY PROTECTION counting `-2` toward the MP sum and balancing a difference of 4 when given up; the rule that MP is not recalculated mid-resolution.

**Out of scope.** Scoring effects of genes (M9). Buying genes (M6).

**Deliverables.** `packages/engine/src/phases/phase2_environment.ts`, the `DEFECT-*` scenarios.

**Dependencies / ordering.** After M4. Phase 2 opens the round after Phase 1; its defect math needs the gene catalog (M1) but not buying (M6).

**Implements.** Spec §6 Phase 2, §3 (Mutation Points), §10 (RAY PROTECTION FAQ), §11 (MP math); protocol §5 (`DefectContext.excessMp`), §6, §7.

**Acceptance.** `DEFECT-01` (no round-1 defect), `DEFECT-02` (decision with locked-in excess), `DEFECT-03` (pay BP), `DEFECT-04` (give up genes, excess lost), `DEFECT-05` (RAY `-2`), `DEFECT-06` (give-up-RAY satisfies 4, the FAQ case), `DEFECT-07` (env reveal + deck order) pass.

---

### M6 — Engine: Phase 3 gene buying

**Objective.** Players buy basic genes and upgrade to advanced genes under the full purchase constraints, with availability derived from the catalog and current ownership.

**In scope.** The `buy_genes` decision (buy any number, then `pass_buying`); `buy_gene` with availability derived as `copies(gene, playerCount) − owners > 0` and no duplicates; cost paid in BP; the `gene_bought` event; advanced-gene upgrades via `upgradeFrom`: the prerequisite must have been held for **at least one full prior round** (cannot buy basic then upgrade in the same Phase 3), the upgrade consumes the prerequisite, and holding the advanced gene locks out re-buying the basic; affordability and availability reflected in `legalActions` so the client only offers valid buys.

**Out of scope.** Gene *effects* already landed in their phases (movement in M3, feeding in M4, division in M7, longevity in M8, scoring weights in M9). M6 is the *transaction*, not the effects. Combat genes are purchasable only once their effects exist (M15); until then they are excluded from availability via a build-tier flag so the MVP loop cannot buy a gene with no implemented effect.

**Deliverables.** `packages/engine/src/phases/phase3_genes.ts`, advanced-gene purchase logic, the `BUY-*` scenarios.

**Dependencies / ordering.** After M5. Needs the catalog and ownership; the "held one prior round" rule needs round tracking, which exists by now.

**Implements.** Spec §6 Phase 3, §8 (Advanced Genes), §11 (purchase constraints); protocol §4 (availability derived), §6 (`buy_gene.upgradeFrom`), §7.

**Acceptance.** `BUY-01` (basic buy), `BUY-02` (copy limit / no duplicate), `BUY-03` (advanced upgrade consumes prerequisite, locks re-buy), `BUY-04` (same-phase upgrade rejected), `BUY-05` (multi-buy then pass), `BUY-06` (unaffordable excluded) pass.

---

### M7 — Engine: Phase 4 cell division

**Objective.** Grant the round's BP and let players divide and place new amoebas under adjacency, special-placement, and SPORES rules.

**In scope.** The +10 BP grant at phase start; the `divide_amoebas` decision (divide/place any number, then pass); `divide` at 6 BP (4 with DIVISION RATE); newborn 0 DP; placement onto a cell with no same-color amoeba that borders a same-color amoeba, with chains allowed (a newborn may border one placed earlier this phase); the 0-amoeba free-anywhere placement and the exactly-1-amoeba place-anywhere-at-cost case; SPORES overriding adjacency; the `divided` event; illegal placements rejected.

**Out of scope.** Deaths (M8). No combat.

**Deliverables.** `packages/engine/src/phases/phase4_division.ts`, DIVISION RATE and SPORES under `genes/`, the `DIV-*` scenarios.

**Dependencies / ordering.** After M6 (so DIVISION RATE/SPORES can be owned). Division precedes deaths in the round.

**Implements.** Spec §6 Phase 4, §7 (DIVISION RATE, SPORES), §11 (free/special placement); protocol §5, §6, §7.

**Acceptance.** `DIV-01` (+10 BP), `DIV-02` (adjacent placement, 6 BP, 0 DP), `DIV-03` (DIVISION RATE 4 BP), `DIV-04` (0-amoeba free), `DIV-05` (1-amoeba special), `DIV-06` (SPORES), `DIV-07` (chain), `DIV-08` (illegal rejected) pass.

---

### M8 — Engine: Phase 5 natural deaths

**Objective.** Resolve natural deaths automatically in descending order, with the LONGEVITY threshold and death-cube replacement.

**In scope.** Processing deaths in descending player order; natural death at 2+ DP (3+ with LONGEVITY); removing the amoeba to the player's off-board supply; replacing it with two cubes of each in-play color (6 in 3p, 8 in 4p), subject to supply; the `died` event with `cause: 'natural'`. This phase is automatic in the MVP (no decision kind); AGGRESSION's after-deaths attack is M15.

**Out of scope.** AGGRESSION (M15). No player decision in this phase for the MVP.

**Deliverables.** `packages/engine/src/phases/phase5_deaths.ts`, LONGEVITY under `genes/`, the `DEATH-*` scenarios.

**Dependencies / ordering.** After M7. Deaths follow division in the round.

**Implements.** Spec §6 Phase 5, §7 (LONGEVITY), §10 (death ordering), §11 (death cubes); protocol §7.

**Acceptance.** `DEATH-01` (natural death, cubes, descending order), `DEATH-02` (LONGEVITY threshold 3), `DEATH-03` (death-cube supply shortage) pass.

---

### M9 — Engine: Phase 6 scoring and game end

**Objective.** Advance score markers from both advance tables with the special gene weights and leapfrogging, then detect game end and the winner.

**In scope.** The amoeba and gene advance tables summed; advanced genes counting as two cards; RAY PROTECTION counting as zero; leapfrogging (occupied ladder spaces skipped and not counted toward distance); the `scored` event; game-end at the end of Phase 6 when a marker reaches the finish zone (`score >= 41`) or the last environment card has been flipped; winner as the furthest marker (furthest into the finish zone if several); transition to `game_over` with `currentDecision === null` and the `game_over` event.

**Out of scope.** Nothing rules-wise for non-combat; this closes the MVP round loop.

**Deliverables.** `packages/engine/src/phases/phase6_scoring.ts`, end-condition logic, INTELLIGENCE handled as a scoring-only card, the `SCORE-*` and `END-*` scenarios.

**Dependencies / ordering.** After M8. Scoring is the round's last phase and owns end detection.

**Implements.** Spec §6 Phase 6 + Game End, §7 (INTELLIGENCE, RAY PROTECTION), §8 (advanced as two cards), §11 (leapfrogging); protocol §4 (`winner`, `game_over`), §7.

**Acceptance.** `SCORE-01`..`SCORE-05` (amoeba table, gene table, advanced-as-two, RAY-as-zero, leapfrog) and `END-01`..`END-03` (finish zone, last env card, winner determination) pass.

---

### M10 — Engine integration: full headless 3-player game

**Objective.** Prove the engine plays a complete non-combat 3-player game from `createInitialState` to `game_over` with no transport or UI, as one deterministic scripted scenario.

**In scope.** A single long golden scenario (`GAME-01`) that seeds a 3p game and drives a scripted action list (resolving each `currentDecision` for the seat it points to) across multiple rounds to a winner, asserting checkpoints (per-round phase transitions, a feeding, a buy, a division, a death, a scoring advance) and the final winner. A small **scenario runner** harness that feeds actions to `reduce`, follows auto-advance, and applies assertions.

**Out of scope.** Server, client, bots, combat. This is the engine-complete checkpoint that gates building transport.

**Deliverables.** `packages/engine/test/runner.ts` (or shared test util), `GAME-01`, and any small fixtures.

**Dependencies / ordering.** After M9. This is the gate between "engine" and "apps": do not start M11 until the engine can finish a game headless.

**Implements.** Protocol §5 (decision loop end to end), §9 (MVP-core subset complete); architecture §6, §13.

**Acceptance.** `GAME-01` reaches `game_over`, the asserted checkpoints hold, the winner matches, and the run is byte-identical across repeated executions with the same seed.

---

### M11 — `GameStore` + server loop

**Objective.** A server that creates games, accepts WebSocket joins, and runs the validate-then-reduce-then-broadcast loop over the engine.

**In scope.** The async `GameStore` interface and its in-memory `Map` implementation; the `GameRecord` wrapper (state, per-seat tokens, rng seed/cursor, createdAt, seats, connection status, player count, variant); `POST /api/games` building an active game via `createInitialState`, assigning one color per seat, resolving first-round play order with the seeded RNG, generating one unguessable token per seat, and returning `CreateGameResponse` (one link per seat); `GET /` static serving stub and `GET /ws` upgrade; the WS `join` handshake (validate token, bind socket to seat, mark connected, reply `welcome` then `snapshot` with `events: []`); the intent loop (confirm it is this seat's current decision, `reduce`, on success persist via the store and broadcast a `snapshot` to every connected seat with per-recipient `legalActions` and this transition's `events`, on failure `reject` to the sender only).

**Out of scope.** The React client (M13); join-link UX polish (M12); bots (M18). A scripted WS client in tests stands in for the browser.

**Deliverables.** `apps/server/src/{index,gameStore,lobby,session}.ts`, a Vitest integration test using a programmatic WS client.

**Dependencies / ordering.** After M10. The server orchestrates the finished engine and holds no rules logic of its own.

**Implements.** Architecture §8 (server responsibilities), §9 (creation), §10 (networking), §11 (`GameStore`), §13 (per-game seeding); protocol §8 (HTTP + WS messages), §11 (`GameRecord`).

**Acceptance.**
- Server boots on a configured port.
- `POST /api/games {playerCount:3}` returns a `gameId` and three seat links, and the game is already active.
- A scripted WS client sends `join` with a valid token, receives `welcome` then a `snapshot`; an invalid token yields `error`.
- An out-of-turn or illegal intent yields `reject` (state unchanged); a legal one broadcasts a `snapshot` whose `legalActions` is non-empty only for the seat now on decision.

---

### M12 — Join-link flow end to end

**Objective.** The real join path works in a browser: opening a seat link connects that seat and shows the live game, and reopening reloads the snapshot.

**In scope.** Client reads `g` and `t` from `/play?g=...&t=...`, opens a WebSocket, sends `join`, renders from the received snapshot; a minimal status indication of which seats have joined and whose turn it is, with a "waiting for player N" state when the current seat has not connected; reopening the link (refresh, new tab, dropped socket) re-loads the current snapshot. No start button; the game is live at creation.

**Out of scope.** Full board and panel rendering (M13); this milestone proves the link-to-seat binding and snapshot reload with a deliberately bare UI.

**Deliverables.** Client connection module and a bare status view; a manual test checklist plus, where feasible, an automated WS-level test of the reconnect-reloads-snapshot property.

**Dependencies / ordering.** After M11. Needs real tokens and links from the lobby.

**Implements.** Architecture §9 (join flow), §10 (snapshots make reconnection trivial), §12 (status strip); protocol §8 (flow).

**Acceptance.** Two browser tabs opened on two distinct seat links bind to two distinct seats and show the same live game; refreshing one tab re-loads the current snapshot without a separate start step; the current actor is indicated and a not-yet-joined seat shows "waiting for player N".

---

### M13 — React client

**Objective.** A usable desktop client that renders the full game state and lets a seat take a turn purely from `legalActions`.

**In scope.** The board view (24 cells with per-cell per-color cube counts and amoebas with DP, the compass/environment card, the scoring ladder); the player panel (own BP, owned genes, own amoebas with DP, available actions); the status strip (seats joined, whose turn, waiting indicator); affordances rendered **only** from the snapshot's `legalActions`, building a `GameAction` intent and sending it, then waiting for the next snapshot; in-progress local selection state (e.g. a half-chosen feeding combo) that is not applied until sent. Cube display style (badges, stacks, grid) is a UI choice, not a rule.

**Out of scope.** Mobile/responsive layout (deferred wholesale, architecture §2); animations beyond what events trivially drive; combat-specific prompts (M15) appear automatically once those decision kinds exist, since the client renders whatever `legalActions` it is sent.

**Deliverables.** `apps/client/src` board, panel, status components, a snapshot store, and an intent sender; a component-level smoke test.

**Dependencies / ordering.** After M12. Renders the snapshots the join flow already delivers.

**Implements.** Architecture §12 (client architecture), §10 (intents up / state down); protocol §6–§8 (actions, events, messages).

**Acceptance.** The board renders from a live snapshot; on the active seat, the UI offers exactly the actions in `legalActions` and no others; sending one produces a new snapshot that the UI reflects; a full Phase 1 amoeba turn (move or drift, then feed) completes through the UI.

---

### M14 — Playable milestone: full non-combat 3-player game

**Objective.** Three humans in three browsers play a complete non-combat 3-player game from join to winner.

**In scope.** Wiring M10's engine, M11's server, and M13's client into a complete loop with the MVP non-reactive gene set available; verifying the round structure, decision prompts, and end/winner display all work with real clients.

**Out of scope.** Combat, 4-player, bots, Docker. This is the MVP definition of done.

**Deliverables.** No new subsystems; integration fixes, a documented play-through script, and any `legalActions`/UI gaps closed.

**Dependencies / ordering.** After M13. This is the playable milestone the whole MVP arc targets.

**Implements.** The MVP-core subset of protocol §9 end to end across architecture §8–§12.

**Acceptance.** A scripted or live three-seat game reaches `game_over` with a correct winner, every phase reached, at least one buy, one division, one death, and one scoring advance observed through the real client; `GAME-01` still green to guarantee the engine underneath is unchanged.

---

### M15 — Combat genes (reactive)

**Objective.** Add the reactive combat genes and their cross-seat decision kinds as one coherent milestone, since they all introduce a decision owned by a different player mid-resolution.

**In scope.** Decision kinds `struggle_target`, `attack_response`, `aggression_target`, `aggression_response` and actions `struggle_attack`, `respond_defense`, `respond_escape`, `respond_none`, `aggression_attack`, `aggression_pass`; the `attacked`/`defended`/`escaped` events and the `died` causes `struggle`/`aggression`/`fight`. Genes: STRUGGLE FOR SURVIVAL (Phase 1 starving attack, 1 BP, once per amoeba, special one-cube-each-color excretion on success), DEFENSE (convert attack to a die-roll fight; Phase 1 loser-attacker starves, Phase 5 no starvation per FAQ), ESCAPE (move away paying 1 BP using movement genes even in Phase 5), ARMOR (Phase 1 cannot be attacked; Phase 5 survives AGGRESSION but takes 1 DP), AGGRESSION (Phase 5 after natural deaths, kill co-located enemy for 1 BP, once per round, ARMOR target takes 1 DP instead), PERSISTENCE (free second attempt at STRUGGLE/DEFENSE/AGGRESSION when the first fails; also carries SPEED's movement), and HOLDING **function 2** (follow a departing co-located amoeba, including the HOLDING-versus-ESCAPE resolution). The DEFENSE-plus-ESCAPE same-attack interaction (both usable, any order, each once).

**Out of scope.** PARASITISM is implemented here as a reactive gene but is only reachable in 4-player games (0 copies in 3p), so its availability waits on M17. Bots (M18).

**Deliverables.** `packages/engine/src/genes/combat/*`, the reactive decision/`legalActions` cases, and the `COMBAT-*` scenarios; the client surfaces the new prompts automatically.

**Dependencies / ordering.** After M14 (a stable non-combat game first). Grouped per protocol §9 because these genes share the cross-seat reactive trait.

**Implements.** Spec §7–§9 (combat genes and the Combat & Interaction summary), §10 (the combat FAQ resolutions); protocol §5 (reactive decisions), §6–§7, §9 (full-ruleset group).

**Acceptance.** The `COMBAT-*` scenarios pass, including the specific FAQ cases: AGGRESSION + PERSISTENCE versus ARMOR counting as successful, ARMOR + ESCAPE surviving AGGRESSION + PERSISTENCE + HOLDING (both resolution paths), DEFENSE versus AGGRESSION leaving no starvation, and HOLDING ending an attack when the victim escapes while still allowing a Phase 1 eat in the destination.

---

### M16 — Docker packaging (MVP release)

**Objective.** One image runs the whole thing: built client assets plus the WS endpoint on a single port. This is the **MVP release milestone**: completing it yields a deployable, fully rules-faithful 3-player game with the complete 3-player gene set (M15 combat included), the only later work being a different player count (M17) and a separate variant (M18).

**In scope.** A multi-stage Dockerfile (build client and server, then copy into a slim runtime image); the server serving the built client and the WebSocket on one port; environment configuration for port, public base URL (used to build join links), and an optional seed override for debugging; the `docker/` folder with the Dockerfile and an optional compose file.

**Out of scope.** Orchestration, TLS termination, persistence backends (the in-memory store is fine per architecture §15).

**Deliverables.** `docker/Dockerfile`, optional `docker/compose.yaml`, an entrypoint, and documented `docker build` / `docker run` commands in `CLAUDE.md`.

**Dependencies / ordering.** After M15, so the released image ships the full 3-player ruleset (a deployable demo can be cut earlier against the non-combat loop if wanted, but the official MVP release is post-combat). This is the last MVP milestone.

**Implements.** Architecture §15 (deployment), §4 (single container), §9 (public base URL for links).

**Acceptance.** `docker build` produces one image; `docker run -e PORT=... -e PUBLIC_BASE_URL=...` serves the client at `/`, accepts `POST /api/games`, and the returned links connect over WS from a browser on the host. A full 3-player game can be played to a winner against the image, following the complete rules.

---

---

## 5a. Future Milestones (post-MVP)

Everything up to and including M16 is the MVP: a complete, rules-faithful, deployable 3-player game. The two milestones below are **future work**, scheduled only after the MVP ships. Neither changes how the 3-player game plays; M17 adds a different player count and M18 adds a separate variant with its own rules addendum. They keep stable IDs (M17, M18) so the validation-scenarios cross-references stay intact, but they sit outside the MVP line.

### M17 — 4-player content

**Objective.** Make 4-player games fully playable by filling the config table and exercising the 4p-only differences and genes.

**In scope.** The 4p column of the player-count config table active end to end: feeding `1:1:1`, the setup-DP asymmetry (first amoebas 1 DP), TENTACLE capacity 3, death cubes 8, full 4p gene copy counts; the 4p-only genes FRUGALITY (eat one less, non-reactive) and PARASITISM (reactive, becomes available now that M15 implemented its logic and 4p gives it copies); 4p SUBSTITUTION combinations (`2:2:0`, `3:1:0`) and their interaction with FRUGALITY.

**Out of scope.** Any architectural change; this is data plus tests, per architecture §6 and protocol §3.

**Deliverables.** Config-table completion, gene modules for FRUGALITY and PARASITISM availability, the `SETUP-02`, `FEED-02`, `FEED-07`, and `P4-*` scenarios, and a headless full 4p game scenario mirroring `GAME-01`.

**Dependencies / ordering.** After M15 (PARASITISM's reactive logic exists) and a stable client (M14). Cleanly a config-and-test milestone.

**Implements.** Spec §6–§8 (4p values throughout), §11 (player-count branching); protocol §3 (config table), §9 (later variants).

**Acceptance.** `SETUP-02`, `FEED-02`, `FEED-07`, and the `P4-*` scenarios pass; a headless full 4-player game reaches a correct winner; a live 4-player game runs through the client.

---

### M18 — 2-player automated-player variant

**Objective.** A 2-player game with one or more automated seats that take legal turns deterministically, slotting into the normal loop with no engine changes.

**In scope.** The `bots` package implementing `ActionSource.nextAction(state, seat, rng)` by inspecting state, calling `legalActions`, and choosing per the variant's heuristics with randomness from the injected `rng`; `variant: 'two_player_bots'` and `kind: 'bot'` seats; the server driving a bot seat through the same validate-then-reduce-then-broadcast path; the neutral-tribe behavior rules (a rules-spec addendum to be written when this milestone starts, since the base spec does not define them).

**Out of scope.** Anything that would special-case the engine for bots; the engine stays unaware of seat kind (architecture §7).

**Deliverables.** `packages/bots/src`, the server's bot-driving branch, a determinism scenario (a seeded bot game replays identically), and the neutral-tribe addendum referenced from `CLAUDE.md`.

**Dependencies / ordering.** Last. Reuses the finished engine, server, and (optionally) combat genes through the existing `ActionSource` seam.

**Implements.** Architecture §7 (action-source seam), §8 (driving automated seats), §13 (bot randomness via `rng`); protocol §9 (later variants).

**Acceptance.** A 2-player-plus-bot game runs to `game_over` with the bot taking only legal actions; replaying with the same seed reproduces the game exactly; no engine file changed to support bots (the diff touches `bots`, the server's seat-driving branch, and config only).

---

## 6. Scenario-to-Milestone Gating Map

"Done" for an engine milestone is objective: the listed scenarios pass. Full scenario definitions live in `validation-scenarios.md`; this is the gate index.

| Milestone | Tier | Gating scenarios |
|---|---|---|
| M2 setup | MVP-core | `SETUP-01`, `SETUP-02`, `SETUP-03` |
| M3 movement | MVP-core | `MOVE-01`..`MOVE-14` |
| M4 feeding | MVP-core | `FEED-01`, `FEED-03`, `FEED-04`, `FEED-05`, `FEED-06` |
| M5 environment/defects | MVP-core | `DEFECT-01`..`DEFECT-07` |
| M6 gene buying | MVP-core | `BUY-01`..`BUY-06` |
| M7 division | MVP-core | `DIV-01`..`DIV-08` |
| M8 deaths | MVP-core | `DEATH-01`, `DEATH-02`, `DEATH-03` |
| M9 scoring/end | MVP-core | `SCORE-01`..`SCORE-05`, `END-01`..`END-03` |
| M10 headless game | MVP-core | `GAME-01` |
| M11 server | infra | server-boot + `POST /api/games` + WS-join integration tests |
| M14 playable | MVP-core | live three-seat game to winner; `GAME-01` still green |
| M15 combat | full-ruleset | `COMBAT-01`..`COMBAT-12` (3p reactive set) |
| M17 4-player | full-ruleset | `SETUP-02`, `FEED-02`, `FEED-07`, `COMBAT-13`, `P4-01`..`P4-06` |
| M18 bots | full-ruleset | seeded bot game replays identically |

Scenarios `FEED-02`/`FEED-07` and `COMBAT-13` (PARASITISM) are authored early but only **gate** the 4-player milestone, since their content is 4p-only.

---

## 7. Gene-By-Gene Order Toward the Full Ruleset

Non-reactive genes live in the MVP loop and are wired into the phase that hosts their effect; the reactive/combat genes are grouped into M15; the 4-player-only genes wait for M17. This matches protocol §9 and keeps the cross-seat reactive decisions out of the MVP. Copy counts are from the spec's gene tables.

**MVP non-reactive genes (available in 3p, built across M3–M9).**

| Gene | 3p copies | Hosting milestone | Effect surface |
|---|---|---|---|
| MOVEMENT I | 2 | M3 | Phase 1 two-dice movement |
| SPEED | 1 | M3 | Phase 1 second free move |
| STREAMLINING | 1 | M3 | Phase 1 movement cost 0 |
| TENTACLE | 1 | M3 | Phase 1 carry up to 2 cubes (3p) |
| HOLDING (fn 1) | 1 | M3 | Phase 1 stay instead of drift |
| MOVEMENT II (adv) | 1 | M3 + M6 | Phase 1 choose direction; advanced buy in M6 |
| SUBSTITUTION | 1 | M4 | Phase 1 feeding combos |
| RAY PROTECTION | 1 | M5 + M9 | Defect math (`-2`, give-up = 4); scoring as 0 |
| DIVISION RATE | 1 | M7 | Phase 4 division costs 4 BP |
| SPORES | 1 | M7 | Phase 4 ignore adjacency |
| LONGEVITY | 1 | M8 | Phase 5 death threshold 3 DP |
| INTELLIGENCE | 1 | M9 | Scoring-only card, no in-game effect |

**Reactive/combat genes (M15), available in 3p once their effects exist.**

| Gene | 3p copies | Role |
|---|---|---|
| STRUGGLE FOR SURVIVAL | 2 | Phase 1 starving attack |
| DEFENSE | 1 | Convert attack to a fight (Phase 1 and 5) |
| ESCAPE | 1 | Move away from an attack (Phase 1 and 5) |
| ARMOR (adv, from DEFENSE or ESCAPE) | 1 | Block Phase 1 attack; survive AGGRESSION at 1 DP |
| AGGRESSION (adv, from STRUGGLE) | 1 | Phase 5 kill for 1 BP, once per round |
| PERSISTENCE (adv, from SPEED) | 1 | Free second attempt on a failed attack/defense |
| HOLDING (fn 2) | (same card) | Follow a departing amoeba; HOLDING-vs-ESCAPE |

**4-player-only genes (M17).**

| Gene | 4p copies | Role |
|---|---|---|
| FRUGALITY | 1 | Phase 1 eat one less (non-reactive) |
| PARASITISM | 1 | Phase 1 reactive: another player pays 1 BP |

Plus the higher 4p copy counts for several MVP genes, which are config-only.

Ordering rationale: every non-reactive gene attaches to a phase the MVP already builds, so it costs only its own module and scenarios. The reactive genes are deferred together because each introduces a mid-resolution decision owned by another seat, which is a new protocol pattern best landed once, after a stable non-combat game exists. PARASITISM is reactive *and* 4p-only, so its logic ships with M15 but its availability with M17.

---

*Companion documents: `game-spec.md` (rules, source of truth), `architecture.md` (system design), `state-model-and-protocol.md` (state + protocol), `validation-scenarios.md` (the gating scenarios).*
