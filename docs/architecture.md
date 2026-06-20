# Primordial Soup — Architecture & Technical Design

> Companion to **`game-spec.md`** (the functional rules). This document describes **how the digital multiplayer game is built**: stack, structure, server model, networking, and the seams that keep future work cheap. It does **not** restate game rules; the rules spec is the single source of truth for game logic, and is treated as **read-only** by the implementation.

---

## 1. Purpose & Scope

This document defines the technical shape of the project so an implementer (Claude Code) can build it in verifiable increments without re-deciding architecture at every step.

- **In scope:** stack, repository layout, the rules-engine contract, the player/action-source model, server responsibilities, the lobby and join-link flow, the networking model, the persistence seam, the client architecture, and deployment.
- **Out of scope (defined elsewhere):** the exact game-state shape and the wire message types live in the **State Model & Protocol** doc. The construction sequence lives in the **Build Plan**. Game rules live in the rules spec.

---

## 2. Goals & Constraints

These are fixed inputs that the design must satisfy.

1. **Multiplayer over a network.** Two-plus people on separate machines play the same live game in desktop browsers. Mobile/phone support is deferred entirely; it is almost purely a client-layout concern and is a later follow-on, not a v1 requirement.
2. **MVP is 3 players; 4 players must be reachable** without architectural change. Player count is a parameter, never a hardcoded assumption.
3. **The build drives toward the full ruleset** eventually (every gene, every FAQ edge case). The MVP may ship a reduced gene set, but nothing in the architecture may make the remaining genes hard to add.
4. **A 2-player variant with automated players is a planned follow-on.** The neutral tribes react via randomness (movement, gene buying, etc.). The design must let an automated player slot into the normal turn flow without special-casing the engine.
5. **State lives in memory now, behind a seam that allows real persistence later.** No database in v1. A `GameStore` interface isolates storage so a Redis or SQL implementation can drop in untouched-engine.
6. **Real-time, single-sitting play.** A game is created, played, and finished in one session. The design does **not** need to survive server restarts. Because a player joins by opening their link and receiving the current snapshot, a refresh or a dropped connection naturally reloads the live game; reconnection is a property of the join model rather than a separately engineered feature.
7. **No accounts.** Access to a seat is by a per-player link carrying a token. There is no login, signup, or user database.
8. **Container-based, always-on deployment.** The whole thing runs as a single Docker container the host already has somewhere to run.
9. **All TypeScript**, end to end.

---

## 3. High-Level Architecture

A **server-authoritative** model with a **pure rules engine**.

```
            intents (actions)                      authoritative state
  Client  ───────────────────────▶   Server   ◀──────────────────────  Rules Engine
 (React)  ◀───────────────────────  (Node/ws)  ──────────────────────▶  (pure module)
            state snapshots / events                 (state, action) -> result
```

- **Clients are thin.** They render whatever state the server sends and send player *intents* ("feed amoeba 3 as 2-blue/1-green", "buy DEFENSE", "drift", "end phase"). They never compute rules outcomes themselves; any local prediction is cosmetic only.
- **The server is the single authority.** It owns every game's state, validates every intent against the rules, applies legal ones via the engine, and broadcasts the resulting state. Illegal intents are rejected and the client is told why.
- **The rules engine is a pure module** with no knowledge of sockets, players' identities-as-connections, or storage. It is a function of `(state, action) -> result`. This is what makes the rules testable in isolation and reusable by automated players and (later) replays.

Why server-authoritative rather than a relay where each client computes its own outcomes: the rules here are large and interlocking (the gene combat web, locked-in defect math, cube-supply shortages). Centralizing them means a single correct implementation of the rules and removes whole categories of desync between clients. This is about **correctness**, not defense. Cheating and malicious clients are explicitly a non-concern (Section 14); the reason to be authoritative is that we want the rules implemented once, in one testable place, with no chance of two clients disagreeing about what just happened.

---

## 4. Technology Choices

| Concern | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** everywhere | Matches prior work; shared types across client/server are a large win for a rules-heavy game. |
| Runtime | **Node.js** (current LTS) | Standard, container-friendly. |
| Monorepo tooling | **npm workspaces** | Ships with Node, so nothing extra enters the Docker build; one repo with a shared `types` package consumed by server and client. |
| Server transport | **`ws`** (raw WebSocket) | Minimal and transparent. Server-authoritative full-state snapshots make reconnection trivial without a heavier library. *Alternative:* Socket.IO if batteries-included rooms/reconnect are wanted later. |
| HTTP (lobby) | **Node `http`** or a tiny router (e.g. a minimal framework) | Only a few endpoints (create game, fetch join info, serve static client). Keep it small. |
| Client framework | **React + Vite** | Fast dev loop; renders cleanly from a single server-provided state object. |
| Client transport | Native browser **WebSocket** | No client transport library needed for raw `ws`. |
| RNG | **Seedable PRNG** injected into the engine | Deterministic dice and bot randomness; reproducible tests and scenarios. |
| Tests | **Vitest** | TypeScript-native, fast, pairs with the Vite client, and drives the engine against the validation scenarios. |
| Container | **Docker**, single image | Server serves built client static files + the WS endpoint on one port. |

Pin specific versions in the build plan / `package.json`, not here.

---

## 5. Repository Layout

A monorepo with three packages. The **shared types package is the contract** between client and server.

```
primordial-soup/
├─ package.json                # workspace root
├─ docker/                      # Dockerfile, compose (optional), entrypoint
├─ docs/
│  ├─ game-spec.md        # rules (read-only source of truth)
│  ├─ architecture.md     # this file
│  ├─ state-model-and-protocol.md         # (next)
│  └─ build-plan.md                        # (later)
├─ packages/
│  ├─ shared/                   # types ONLY: GameState, actions, messages, config
│  │  └─ src/
│  ├─ engine/                   # pure rules engine; depends on shared
│  │  └─ src/
│  │     ├─ reduce.ts           # (state, action) -> result
│  │     ├─ legalActions.ts     # enumerate legal actions at a decision point
│  │     ├─ setup.ts            # build initial state for N players
│  │     ├─ phases/             # one module per phase (1..6)
│  │     └─ genes/              # gene effects, kept modular for full-ruleset growth
│  └─ bots/                     # automated action sources (2-player variant); depends on engine + shared
│     └─ src/
├─ apps/
│  ├─ server/                   # Node + ws; depends on engine, shared, bots
│  │  └─ src/
│  │     ├─ index.ts            # http + ws bootstrap, static serving
│  │     ├─ gameStore.ts        # GameStore interface + in-memory impl
│  │     ├─ lobby.ts            # create game, issue tokens/links
│  │     └─ session.ts          # per-game connection mgmt, broadcast, validate->reduce
│  └─ client/                   # React + Vite; depends on shared
│     └─ src/
```

Engine, bots, and shared have **no** dependency on the server or client. The dependency arrows point inward toward `shared`.

---

## 6. The Rules Engine

The engine is the heart of the system and is deliberately isolated.

**Contract (illustrative, not final; real types live in the protocol doc):**

```ts
// Apply one action to a state. Pure: no I/O, no globals, no Date/Math.random.
function reduce(state: GameState, action: GameAction, rng: Rng): ReduceResult;

type ReduceResult =
  | { ok: true;  state: GameState; events: GameEvent[] }
  | { ok: false; reason: string };   // illegal action; state unchanged

// What can the current decision-maker legally do right now?
function legalActions(state: GameState): GameAction[];

// Deterministic initial state for a given player count and config.
function createInitialState(opts: SetupOptions, rng: Rng): GameState;
```

Properties the engine must hold to:

- **Purity & determinism.** No `Math.random`, no `Date.now`, no network, no storage. All randomness comes through the injected `rng`. Given the same `(state, action, rng-seed)`, the result is identical. This is what makes the validation scenarios reliable.
- **Player count is data, not code.** Feeding ratios, gene copy counts, TENTACLE capacity, death-cube counts, and setup-DP rules come from a **player-count-aware config table** (3p and 4p columns mirror the rules spec). Adding 4-player support is filling in the table and testing, not branching logic everywhere.
- **Phase structure mirrors the spec.** One module per phase keeps Phase 1 movement/feeding, Phase 2 defects, Phase 3 buying, Phase 4 division, Phase 5 deaths, and Phase 6 scoring independently testable.
- **Genes are modular.** Each gene's effect is encapsulated so the MVP can ship a subset and the rest can be added without disturbing the core loop. This is the main lever for the "full ruleset eventually" goal.
- **`legalActions` is first-class.** The engine can enumerate the legal choices at the current decision point. The client uses this to show only valid affordances; automated players use it to pick from. Implementing it well early prevents the UI and bots from re-deriving rules.

---

## 7. Players & Action Sources (the automated-player seam)

Every player is the same to the engine: a seat with state. What differs is **where that seat's actions come from**.

```ts
interface ActionSource {
  // Given the state and which seat must act, produce the next action.
  // Human source: resolves when an intent arrives over the socket.
  // Bot source: computes a legal action, possibly using rng.
  nextAction(state: GameState, seat: PlayerId, rng: Rng): Promise<GameAction>;
}
```

- A **human** seat's source waits for a validated intent from that player's socket.
- An **automated** seat's source (in `packages/bots`) inspects the state, often calls `legalActions`, and chooses one per the variant's heuristics, drawing randomness from the injected `rng`.

Because both feed the *same* `reduce` path, the server's game loop does not care which kind a seat is. The 2-player variant becomes: create a game with 2 human seats and 1+ automated seats, and register bot sources for the automated ones. No engine changes. The variant's *rules* (how neutral tribes behave) will be specified as an addendum to the rules spec when we build it; the architecture just guarantees the slot exists.

---

## 8. Server Responsibilities

The server is the only stateful, networked component.

- **Game lifecycle.** Create a game already in an **active** state (colors assigned and play order resolved at creation), run it as seats connect and take their turns, end it when the rules say so, and discard it. There is **no** separate lobby-wait or start gate.
- **State ownership via `GameStore`.** All live games live behind the store interface (Section 11). In v1 that is an in-memory map.
- **Connection management.** Map sockets to (gameId, seat) using the join token. Track which seats are connected. Tolerate a socket dropping and a new one re-presenting the same token (best-effort; not a v1 guarantee).
- **The validate-then-reduce loop.** On an incoming intent: confirm it is this seat's turn and decision, run `reduce`, and on success persist the new state and broadcast it; on failure return a rejection with a reason to that one client.
- **Broadcasting.** Push authoritative state (and/or events) to every connected seat after each applied action.
- **Driving automated seats.** When the current actor is an automated seat, the server obtains its action from the bot `ActionSource` and runs it through the same loop.

The server holds **no rules logic of its own**. It orchestrates; the engine decides.

---

## 9. Game Creation & Join-Link Flow

No accounts, and **no lobby-wait or start step**. Creating the game *is* starting it.

1. **Create.** Someone opens the app and creates a game, choosing the player count (3 for the MVP; 4 when enabled; later, the 2-player-plus-bots variant). At creation the server immediately:
   - builds the active initial state via `createInitialState`,
   - **assigns one color per seat** (auto-assigned for v1; could be made interactive later),
   - **resolves first-round play order** by rolling with the seeded RNG (the rules' opening dice roll, done automatically so no one has to perform it),
   - generates one **unguessable token per seat**, and
   - returns one **join link per seat**, e.g. `https://host/play?g=<gameId>&t=<seatToken>`.
2. **Distribute.** The creator copies the links and sends them out however they like. Importantly, the creator is **not special**: they also receive a seat link and join the same way everyone else does. One link per person; the token *is* the seat.
3. **Join (any time).** Each player opens their link. The client reads `g` and `t`, opens a WebSocket, presents the token, and receives the **current snapshot**. The server binds that socket to the seat and marks it connected. Opening the link again later (refresh, new tab, dropped connection) simply re-loads the current snapshot.
4. **Play proceeds by turn order, not by a start button.** The game is already live, so whoever is the current actor may move as soon as they have joined. The first player decisions are the **starting-amoeba placements** in setup order; color and play order were already settled at creation. If the current seat has not connected yet, play simply waits on that seat, and clients show a "waiting for player N" indication. There is nothing to "start."

The token is a **bearer identifier for a seat**: holding the link means holding that seat. Given the cooperative threat model (Section 14) that is sufficient; tokens are long and random so links are not guessable, and that is the extent of access control.

---

## 10. Networking Model

- **Transport:** one WebSocket per connected client to the server.
- **Direction of traffic:**
  - **Client → server:** *intents* only (the player's chosen action), plus a join/hello carrying the token.
  - **Server → client:** *authoritative state snapshots* and/or *events*, plus rejections and lobby updates.
- **Snapshots vs diffs:** v1 sends the **full authoritative game state** after each applied action. The state is small enough (a 24-space board, a few players, modest gene/cube counts) that this is simple and robust, and it makes (re)connection trivial: a new socket just receives the current snapshot. Event messages can accompany snapshots to drive animations/log lines. Diff-based updates are a possible later optimization, not a v1 need.
- **Per-client views:** the architecture keeps the door open for hiding hidden information, but Primordial Soup is largely open-information, so v1 may broadcast the same full state to everyone. Any future hidden-info handling happens at the server's serialization boundary, not in the engine.

The exact message envelope and type catalog are defined in the State Model & Protocol doc.

---

## 11. State Ownership & the Persistence Seam

A single small interface isolates storage so persistence is a later drop-in.

```ts
interface GameStore {
  create(game: GameRecord): Promise<void>;
  get(gameId: string): Promise<GameRecord | undefined>;
  set(gameId: string, game: GameRecord): Promise<void>;
  delete(gameId: string): Promise<void>;
}
```

- **v1 implementation:** an in-memory `Map<gameId, GameRecord>`. Lost on restart, which is acceptable per the goals.
- **Future implementations:** Redis or SQL behind the same interface, with no engine or server-logic changes. Because the engine is pure and state is plain serializable data, persisting is just storing the state object.
- The interface is `async` from day one so a synchronous in-memory impl and an async networked impl share the same call sites.

`GameRecord` wraps the `GameState` plus lobby metadata (seats, tokens, connection status, player count, variant).

---

## 12. Client Architecture

- **Single source of truth:** the latest server snapshot. The client renders from it and holds little independent state beyond UI-local concerns (what panel is open, in-progress selections before they are sent).
- **Intents up, state down.** User interactions build an intent and send it; the UI then waits for the next authoritative snapshot rather than mutating local game state.
- **Affordances from `legalActions`** (sent or mirrored to the client) so the UI offers only valid moves, which sidesteps reimplementing rules on the client.
- **Views:** a lightweight **connection/status** strip (which seats have joined, whose turn it is, "waiting for player N"), a **board** view (the 24-space soup with per-space per-color cube counts and amoebas, the compass/environment card, the scoring ladder), and a **player panel** (own BP, genes, amoebas with DP, available actions). There is no lobby screen to clear and no start button. Visual representation of cubes (grid, badges, stacks) is a UI choice per the rules spec; it is not a rule.
- **Desktop browsers are the only v1 target.** No responsive/mobile work in v1; it is deferred per Section 2.

---

## 13. Determinism, Randomness & Testing Hooks

- All randomness (dice in Phase 1, any setup ordering decided by roll, future bot choices) flows through the **injected seedable `Rng`**.
- Tests and validation scenarios run the engine with a **fixed seed** so dice outcomes are reproducible and a scenario's expected end-state is stable.
- In production the server seeds the `Rng` per game from a real entropy source.
- This is the mechanism that makes the **validation scenarios** doc enforceable: a scenario is a seed plus a sequence of actions plus an expected resulting state.

---

## 14. Trust Model

Cooperative, not adversarial. Cheating and malicious clients are **not a concern**: this is a small group of people who want to play a game together.

- **Seat token = identifier.** Long, random, unguessable tokens identify which seat a connection belongs to. There is no further access control and none is needed.
- **No accounts, no PII, no payments.** The blast radius of anything going wrong is a single throwaway game session.
- The server still validates actions before applying them, but for **correctness** (catching client bugs, enforcing turn order, keeping one authoritative truth), not as a defense against bad actors.
- Out of scope: rate limiting, abuse handling, anything beyond whatever TLS the deployment terminates.

---

## 15. Deployment

- **Single Docker image.** The server serves the **built client static assets** and the **WebSocket endpoint** on one port, so deployment is "run the container."
- **Always-on** process on the host's existing server. State is in memory, so a restart ends in-flight games, which is acceptable per the goals.
- **Configuration** via environment variables (port, public base URL used to build join links, optional seed override for debugging).
- A `docker/` folder holds the Dockerfile and an optional compose file. The build plan will specify the multi-stage build (build client + server, then a slim runtime image).

---

## 16. Out of Scope / Future Work

Captured so the seams above are justified and nothing here is a surprise later:

- **Persistence backends** (Redis/SQL) behind `GameStore`.
- **The 2-player automated-player variant**, including its neutral-tribe rules (a rules-spec addendum) and the bot heuristics in `packages/bots`.
- **4-player content** beyond the MVP (enabled by the player-count config table; tested as its own milestone).
- **The remaining genes** toward the full ruleset, added gene-by-gene behind the modular gene structure.
- **Mobile/phone client layout.** The server and protocol do not change; only the client's presentation does, so it is deferred wholesale.
- **Reconnection guarantees, spectators, hidden-information serialization.**

---

## 17. Resolved Decisions

All earlier open questions are now settled:

- **Workspace tool:** npm workspaces.
- **Test runner:** Vitest.
- **Client receives the full `legalActions` list** each turn (rather than a compact summary). Simpler, and the data is small.
- **No lobby start trigger.** The game is live at creation; play begins by turn order.
- **Single container** serving both the client and the WebSocket endpoint.
- **Mobile** deferred entirely to a later follow-on.

Anything genuinely undecided from here is a state-shape or message-type detail, which belongs in the State Model & Protocol doc.

---

*Companion documents: `game-spec.md` (rules, source of truth), `state-model-and-protocol.md` (state shape + wire messages, next), `build-plan.md` (construction sequence, later).*
