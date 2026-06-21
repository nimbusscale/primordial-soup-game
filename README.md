# Primordial Soup

A server-authoritative, all-TypeScript multiplayer implementation of the board game
**Primordial Soup** (aka *Ursuppe*). A pure, deterministic rules engine decides outcomes; a
thin Node/WebSocket server orchestrates; a thin React client renders snapshots and sends
intents. Players join by opening a per-seat link — no accounts, no lobby, no start button.

> **Status:** MVP complete (a deployable, rules-faithful **3-player** game with the full
> 3-player gene set, including reactive combat). 4-player content and an automated-player
> variant are planned post-MVP work.

## Quick start

The whole thing runs as one Docker image (built client + WebSocket on a single port).

```bash
make build      # build the image (once)
make up         # run it in the background on http://localhost:8787
make game       # create a 3-player game and print one seat link per player
# → open each printed /play?g=…&t=… link in a browser; play proceeds by turn order
make down       # stop & remove the container
```

Override defaults inline: `make up PORT=9000`, `make game PLAYERS=4`.

### Dev mode (hot reload, no Docker)

```bash
npm install
npm run dev:server          # server + WS on :8787
npm run dev:client          # Vite client on :5173 (proxies /api and /ws to the server)
make game BASE_URL=http://localhost:5173
```

## How it works

- **Create = start.** `POST /api/games` builds an active game, assigns colors, resolves
  first-round play order with a seeded RNG, and returns one unguessable join link per seat.
- **Intents up, state down.** Clients send the player's chosen action; the server validates
  it, runs the engine's `reduce`, and broadcasts the new authoritative snapshot to everyone.
- **Reconnection is free.** Reopening a link re-presents the token and reloads the current
  snapshot — a refresh or dropped socket just rejoins the live game.
- **Affordances come from the engine.** Each snapshot carries `legalActions` for the seat on
  turn, so the UI only ever offers valid moves and never re-implements the rules.

## Project layout

```
packages/shared   @ps/shared  — types only: GameState, actions, events, messages, config tables
packages/engine   @ps/engine  — the pure rules engine: reduce, legalActions, setup, phases/, genes/
packages/bots     @ps/bots    — automated action sources (post-MVP variant)
apps/server       @ps/server  — Node + ws: HTTP lobby, WS session, validate→reduce→broadcast
apps/client       @ps/client  — React + Vite: renders snapshots, sends intents
docker/           — multi-stage Dockerfile + optional compose.yaml
docs/             — design docs (rules spec is the read-only source of truth)
```

`shared`, `engine`, and `bots` never import from the apps; the engine has no knowledge of
sockets or storage. All randomness flows through an injected, seedable `Rng`, so games are
deterministic and reproducible.

## Commands

```bash
npm test                 # full Vitest suite (engine scenarios + server/client integration)
npm run typecheck        # type-check every workspace
make test / make typecheck
```

## Documentation

The design is captured in [`docs/`](docs/):

- [`game-spec.md`](docs/game-spec.md) — the rules (source of truth, read-only)
- [`architecture.md`](docs/architecture.md) — system design (stack, server model, seams, deployment)
- [`state-model-and-protocol.md`](docs/state-model-and-protocol.md) — `GameState`, action/event catalogs, wire protocol
- [`build-plan.md`](docs/build-plan.md) — the construction sequence (milestones M0–M18)
- [`validation-scenarios.md`](docs/validation-scenarios.md) — the deterministic golden scenarios that gate each milestone

Contributor notes and conventions live in [`CLAUDE.md`](CLAUDE.md).
