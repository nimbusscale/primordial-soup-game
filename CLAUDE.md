# CLAUDE.md — Primordial Soup

> Standing context for the builder. Keep current; update whenever conventions change.

## Current milestone

**M10 — Engine integration: full headless 3p game** (M0–M9 complete).

## What this is

A **server-authoritative, all-TypeScript multiplayer** implementation of the board game
*Primordial Soup*. A pure rules engine decides outcomes; a thin server orchestrates; thin
React clients render snapshots and send intents. The four design docs in `docs/` are
authoritative:

- `docs/game-spec.md` — the rules. **Source of truth. READ-ONLY. Never edit it.**
- `docs/architecture.md` — system design (stack, server model, seams, deployment).
- `docs/state-model-and-protocol.md` — the `GameState` shape, the action/event catalogs, the wire protocol.
- `docs/build-plan.md` — the construction sequence (milestones M0–M18; MVP ends at M16).
- `docs/validation-scenarios.md` — the deterministic golden scenarios that gate milestones.

## Read-only boundary

`docs/game-spec.md` is the single source of truth for rules and **must never be edited**.
When a rule is unclear, the spec plus its FAQ (§10) and Implementation Notes (§11) are
authoritative — do not invent mechanics. The architecture, protocol, and validation docs
are authoritative for their own domains; the protocol doc owns the data shapes and
`packages/shared` mirrors it exactly.

## Where things live

```
packages/shared   @ps/shared  — types ONLY: GameState, actions, events, messages, config tables.
packages/engine   @ps/engine  — the pure rules engine: reduce, legalActions, setup, phases/, genes/.
packages/bots     @ps/bots    — automated action sources (2-player variant, post-MVP M18).
apps/server       @ps/server  — Node + ws: HTTP lobby, WS session, validate→reduce→broadcast.
apps/client       @ps/client  — React + Vite: renders snapshots, sends intents.
```

`shared`, `engine`, and `bots` **never import from the apps**. Dependency arrows point
inward toward `shared`. The engine has no knowledge of sockets, connections, or storage.

## Install / run / test commands

```bash
npm install                      # bootstrap the workspace (writes/commits package-lock.json)
npm run typecheck                # type-check every workspace (tsc --noEmit per package)
npm test                         # run the full Vitest suite once
npm run test:watch               # Vitest in watch mode
npm -w @ps/shared run typecheck        # type-check one workspace
npx vitest run packages/engine         # run one package's tests
npx vitest run -t SETUP-01             # run tests matching a name
# server / client dev servers land in later milestones:
npm run dev:server               # (M11+) tsx watch the server
npm run dev:client               # (M13+) vite dev server
```

## Conventions

- **JSON-serializable state only.** No `Map`/`Set`/class instances/functions/`undefined`-as-data
  in `GameState`. Keyed collections use `Record<string, T>`; ordered ones use arrays.
- **Engine purity & determinism.** No `Math.random`, no `Date.now`, no I/O in the engine.
  All randomness flows through the injected `Rng`; it is injected, never imported as a singleton.
  Given the same `(state, action, rng)`, results are identical.
- **Player count is data, not branches.** Read 3p/4p differences from the config table
  (protocol §3), never scattered `if (playerCount === 3)`.
- **`legalActions` is first-class** and built alongside every decision kind, never deferred.
- **Events explain deltas** and are never required to reconstruct state (the snapshot does that).
- **TS module syntax:** `verbatimModuleSyntax` is on — use `import type` for type-only imports.
  Relative imports use the `.js` extension (NodeNext/bundler ESM).

## Determinism contract

Every engine change must keep existing validation scenarios green. New rule logic ships
with its gating scenario(s) from `docs/validation-scenarios.md`. Roll-dependent scenarios
use the scripted-rolls `Rng` double; `GAME-01` uses a seed with a frozen golden snapshot.

## Git workflow

All work lands on the **`dev`** branch as **one commit per milestone**, committed and
pushed only after that milestone's acceptance criteria pass. Commit messages are prefixed
with the milestone id (e.g. `M7: Phase 4 cell division`). The history reads as one commit
per milestone, M0 through M16 (the MVP release).

## Pinned toolchain

Node 20.x LTS, npm 10.x, TypeScript 5.4.5, Vitest 1.6.0, ws 8.17.1, React 18.3.1,
Vite 5.2.x, tsx 4.16.x. Exact versions in the per-workspace `package.json`; the resolved
`package-lock.json` is committed.
