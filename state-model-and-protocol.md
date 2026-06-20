# Primordial Soup — State Model & Protocol

> Companion to **`game-spec.md`** (rules, source of truth) and **`architecture.md`** (system design). This document pins the **concrete shapes**: the serializable `GameState`, the `GameAction` and `GameEvent` catalogs, and the client/server wire messages. Game *semantics* (what a legal move does) live in the rules spec; this document defines the *data*. Where a type is marked **MVP-core** vs **full-ruleset**, the Build Plan decides scheduling.

All types below live in `packages/shared` and are imported by both the engine and the apps.

---

## 1. Conventions

- **JSON-serializable only.** Every value in `GameState` must survive `JSON.parse(JSON.stringify(x))` unchanged. No class instances, no `Map`/`Set`, no `undefined`-as-data, no functions. Collections keyed by id use **plain objects with string keys** (`Record<string, T>`); ordered collections use arrays.
- **Ids are strings or small ints** (see Section 2). They are stable for the life of a game.
- **The engine never reads randomness from state.** Dice and any bot randomness come from the injected `Rng` (per the architecture). The PRNG seed and cursor live in the server-side `GameRecord`, not in `GameState`, so a snapshot is pure game data. Dice *outcomes* are recorded in events after the fact.
- **`GameState` is the wire state.** The same object the engine mutates is what the server serializes to clients (Primordial Soup is open-information, so v1 sends the full state to everyone). Any future hidden-info filtering happens at the server's serialization boundary, never in the engine.

---

## 2. Identifiers & Enums

```ts
type PlayerId  = string;   // stable seat id, e.g. "seat-0" … "seat-3"
type Color     = 'red' | 'green' | 'blue' | 'yellow';
type CellId    = string;   // "col,row", e.g. "1,3"; the island "2,2" is never a CellId
type AmoebaId  = number;   // 1..7, unique within a player
type GeneId    = string;   // matches gene names in the rules spec, e.g. "DEFENSE", "MOVEMENT_I"
type EnvCardId = string;   // "env-01" … "env-11"
type Direction = 'N' | 'S' | 'E' | 'W';

type Phase =
  | 'setup'
  | 'phase1_movement_feeding'
  | 'phase2_environment'
  | 'phase3_genes'
  | 'phase4_division'
  | 'phase5_deaths'
  | 'phase6_scoring'
  | 'game_over';
```

---

## 3. Static Configuration (not part of `GameState`)

These are constants derived from the rules spec, defined once in `packages/shared` and referenced by the engine. They are **not** stored in per-game state because they never change during a game.

- **Board.** The 24 playable cells (`col,row` for `0..4 × 0..4`, excluding `2,2`), and a derived orthogonal adjacency map. Direction deltas: `N = row−1`, `S = row+1`, `W = col−1`, `E = col+1`. Moves into the edge or the island are not carried out.
- **Ladder.** `LADDER_MAX = 50`, `FINISH_ZONE_START = 41` (the final 10 spaces). Start spaces are `1..4` (`1..3` in a 3-player game).
- **Compass mapping.** `1=W, 2=N, 3=E, 4=S, 5=stay, 6=free choice` (per the rules spec note).
- **Gene catalog.** For each `GeneId`: price, mutation points, copy counts per player-count, prerequisite (for advanced genes), and a tag for which effects it grants. Values come straight from the rules spec tables. Ownership and availability are dynamic (Section 4) and derived from this catalog plus current ownership.
- **Environment cards.** The 11 `EnvCard` definitions (ozone thickness + drift).
- **Player-count config table.** The 3p/4p differences the rules call out: feeding ratios, gene copies, TENTACLE capacity, death-cube counts, and setup-DP rules. The engine reads this table by `playerCount` so adding 4-player support is data, not branching.

---

## 4. `GameState`

The complete per-game state.

```ts
interface GameState {
  schemaVersion: number;            // bump on breaking shape changes
  variant: 'standard';              // future: 'two_player_bots'
  playerCount: number;              // 3 (MVP) or 4
  colorsInPlay: Color[];

  round: number;                    // 1-based; 0 during setup
  phase: Phase;

  board: Record<CellId, Cell>;      // exactly the 24 playable cells
  supply: Record<Color, number>;    // off-board cubes remaining, per color (global limit 55 each)

  players: Record<PlayerId, PlayerState>;
  seatOrder: PlayerId[];            // fixed seat order (creation order)
  turnOrder: PlayerId[];            // resolved order for the ACTIVE phase (see note)

  environment: {
    current: EnvCard;
    deckRemaining: EnvCardId[];     // face-down, in draw order
    discarded: EnvCardId[];
  };

  currentDecision: CurrentDecision | null;  // null only when phase === 'game_over'
  winner: PlayerId | null;
}
```

```ts
interface Cell {
  id: CellId;
  col: number;                      // 0..4
  row: number;                      // 0..4
  cubes: Partial<Record<Color, number>>;   // per-color count; omit a color when 0
}

interface Amoeba {
  id: AmoebaId;                     // 1..7
  location: CellId | null;          // null = off-board (in the player's supply)
  dp: number;                       // damage points (0+); meaningful only on-board
}

interface PlayerState {
  id: PlayerId;
  color: Color;
  kind: 'human' | 'bot';            // 'bot' reserved for the 2-player variant; always 'human' in v1
  connected: boolean;               // server-maintained; not used by the engine
  bp: number;                       // biological points
  genes: GeneId[];                  // owned genes (no duplicates)
  amoebas: Amoeba[];                // length 7; off-board ones have location null
  score: number;                    // ladder position (starts at the assigned start space 1..4)
}

interface EnvCard {
  id: EnvCardId;
  ozoneThickness: number;
  drift: Direction | 'none';        // 'none' = no drift this round
}
```

**Notes.**

- `turnOrder` is **derived** from `score` and the phase's direction (Phase 1 ascending; Phases 2–6 descending; deaths in Phase 5 descending). It is cached in state for client convenience and recomputed by the engine whenever it could change. Treat it as authoritative-but-derived.
- **Gene availability is derived,** not stored: a gene is buyable if `copies(gene, playerCount) − (players currently owning it) > 0` and the buyer does not already own it. The engine computes this from the catalog plus `players[*].genes`.
- **Colors map 1:1 to seats** in the standard variant, but cube counts and `supply` are keyed by `Color` (cubes are colored objects), so the 2-player variant's neutral tribes fit without reshaping.

---

## 5. The Decision-Point Model

This is the backbone. At all times except `game_over`, the game **rests on exactly one `currentDecision`** owned by one seat. The engine's job in `reduce(state, action)` is: validate that `action` resolves the current decision, apply it, then **auto-advance** through every deterministic step (drift resolution, scoring, environment flips, natural deaths) until it reaches the next decision that requires a seat's input, emitting `GameEvent`s along the way.

Auto-advance **stops** the moment any seat input is required, including a *reactive* input from a different seat (a defender responding to an attack). That is how reactive genes fit: an attack action can produce a `currentDecision` owned by the **defending** player.

```ts
interface CurrentDecision {
  seat: PlayerId;            // whose input is required
  kind: DecisionKind;
  context: DecisionContext;  // kind-specific framing (see below)
}

type DecisionKind =
  // setup
  | 'place_starting_amoeba'     // MVP-core
  // phase 1
  | 'amoeba_action'             // MVP-core: drift / stay / move for the current amoeba
  | 'amoeba_feed'               // MVP-core: pick a feeding combo (issued only when >1 legal combo)
  | 'choose_move_direction'     // MVP-core: only after a roll of 6 / free-choice movement
  | 'struggle_target'           // full-ruleset: pick a co-located amoeba to attack
  | 'attack_response'           // full-ruleset: defender picks DEFENSE / ESCAPE / none
  // phase 2
  | 'balance_gene_defect'       // MVP-core: issued only to players over ozone
  // phase 3
  | 'buy_genes'                 // MVP-core: buy any number, then pass
  // phase 4
  | 'divide_amoebas'            // MVP-core: divide/place any number, then pass
  // phase 5
  | 'aggression_target'         // full-ruleset: optional, once per round
  | 'aggression_response';      // full-ruleset: defender response
```

`DecisionContext` carries only the *framing* a client needs to render the prompt; the enumerated **choices** come from `legalActions` (Section 7), so the two never duplicate. Illustrative core contexts:

```ts
// amoeba_action
interface AmoebaActionContext { amoebaId: AmoebaId; cellId: CellId; driftDirection: Direction | 'none'; moveCostBp: number; }
// amoeba_feed
interface FeedContext { amoebaId: AmoebaId; cellId: CellId; }   // legal combos are in legalActions
// choose_move_direction
interface MoveDirectionContext { amoebaId: AmoebaId; cellId: CellId; }
// balance_gene_defect
interface DefectContext { excessMp: number; }                   // must balance this many points (locked-in value)
// buy_genes / divide_amoebas carry minimal context; options are in legalActions
```

**Sequenced sub-decisions.** One conceptual player choice can span several decision points. A plain move is `amoeba_action(move)`; if the roll comes up 6, the engine immediately issues `choose_move_direction` to the same seat rather than guessing. Gene-driven extras (SPEED's second move, TENTACLE cube-carrying, HOLDING follow) are modeled the same way: the engine resolves what it can and re-prompts the same seat for any remaining sub-choice. The doc does not enumerate every gene's sub-choice; that is engine logic against the rules spec. The protocol guarantee is only that each sub-choice surfaces as its own `currentDecision` with its own `legalActions`.

**Trivial auto-resolution.** When a decision has exactly one legal action (e.g. feeding when only one combo is possible, or movement when drift is forced by obstacles), the engine **may** resolve it automatically instead of prompting, to cut clicks. This is an allowed engine behavior, not a protocol requirement; clients must handle decisions appearing or being skipped.

---

## 6. `GameAction` Catalog

Actions a seat can send. Each resolves the current decision of the matching kind. Anything sent that does not match `currentDecision` (wrong seat, wrong kind, or not in `legalActions`) is rejected.

```ts
type GameAction =
  // setup
  | { type: 'place_starting_amoeba'; amoebaId: AmoebaId; cellId: CellId }      // MVP-core

  // phase 1 — movement
  | { type: 'drift'; amoebaId: AmoebaId }                                      // MVP-core (free)
  | { type: 'stay';  amoebaId: AmoebaId }                                      // MVP-core (no-drift or HOLDING)
  | { type: 'move';  amoebaId: AmoebaId }                                      // MVP-core (pay 1 BP, engine rolls)
  | { type: 'set_move_direction'; amoebaId: AmoebaId; direction: Direction }   // MVP-core (answers choose_move_direction)

  // phase 1 — feeding
  | { type: 'feed'; amoebaId: AmoebaId; eat: Partial<Record<Color, number>> }  // MVP-core (chosen combo)

  // phase 2
  | { type: 'balance_defect'; giveUp: GeneId[]; payBp: number }                // MVP-core

  // phase 3
  | { type: 'buy_gene'; gene: GeneId; upgradeFrom?: GeneId }                   // MVP-core (upgradeFrom for advanced genes)
  | { type: 'pass_buying' }                                                    // MVP-core

  // phase 4
  | { type: 'divide'; newAmoebaId: AmoebaId; cellId: CellId }                  // MVP-core
  | { type: 'pass_division' }                                                  // MVP-core

  // full-ruleset — combat & reactive
  | { type: 'struggle_attack'; attackerId: AmoebaId; targetSeat: PlayerId; targetAmoebaId: AmoebaId }
  | { type: 'respond_defense' }
  | { type: 'respond_escape'; direction?: Direction }
  | { type: 'respond_none' }
  | { type: 'aggression_attack'; attackerId: AmoebaId; targetSeat: PlayerId; targetAmoebaId: AmoebaId }
  | { type: 'aggression_pass' };
```

**`legalActions(state)` contract.** Given the current decision, the engine returns the concrete, fully-specified actions the current seat may take right now. For `amoeba_feed`, that is the list of valid `feed` actions (each with a concrete `eat` map that the cell can satisfy under the player-count ratio and the player's feeding genes). For `buy_genes`, it is one `buy_gene` per affordable available gene plus `pass_buying`. Clients render affordances directly from this list, so they never recompute rules. Per the architecture, the full list is sent to the seat on turn.

---

## 7. `GameEvent` Catalog

Events describe what happened during a transition. They drive the client's log and animations and are **not** required to reconstruct state (the snapshot does that); they explain the delta. A transition produces an ordered `GameEvent[]`.

```ts
type GameEvent =
  | { type: 'phase_changed'; phase: Phase; round: number }
  | { type: 'turn_changed'; seat: PlayerId }
  | { type: 'environment_revealed'; card: EnvCard }
  | { type: 'amoeba_placed'; seat: PlayerId; amoebaId: AmoebaId; cellId: CellId }
  | { type: 'drifted'; seat: PlayerId; amoebaId: AmoebaId; from: CellId; to: CellId }
  | { type: 'moved';   seat: PlayerId; amoebaId: AmoebaId; from: CellId; to: CellId; roll: number; bpSpent: number }
  | { type: 'stayed';  seat: PlayerId; amoebaId: AmoebaId; cellId: CellId; reason: 'no_drift' | 'obstacle' | 'roll5' | 'holding' }
  | { type: 'fed';     seat: PlayerId; amoebaId: AmoebaId; cellId: CellId; ate: Partial<Record<Color, number>>; excreted: Partial<Record<Color, number>> }
  | { type: 'starved'; seat: PlayerId; amoebaId: AmoebaId; cellId: CellId }
  | { type: 'gene_bought'; seat: PlayerId; gene: GeneId; cost: number; gaveUp: GeneId | null }
  | { type: 'defect_balanced'; seat: PlayerId; gaveUp: GeneId[]; bpPaid: number }
  | { type: 'divided'; seat: PlayerId; newAmoebaId: AmoebaId; cellId: CellId; cost: number }
  | { type: 'died';    seat: PlayerId; amoebaId: AmoebaId; cellId: CellId; cause: 'natural' | 'struggle' | 'aggression' | 'fight' }
  | { type: 'scored';  seat: PlayerId; from: number; to: number; amoebaSpaces: number; geneSpaces: number }
  | { type: 'game_over'; winner: PlayerId; finalScores: Record<PlayerId, number> }
  // full-ruleset combat
  | { type: 'attacked'; seat: PlayerId; amoebaId: AmoebaId; targetSeat: PlayerId; targetAmoebaId: AmoebaId; kind: 'struggle' | 'aggression' }
  | { type: 'defended'; seat: PlayerId; outcome: 'attacker_won' | 'defender_won' }
  | { type: 'escaped';  seat: PlayerId; amoebaId: AmoebaId; from: CellId; to: CellId };
```

---

## 8. Wire Protocol

JSON messages over one WebSocket per connected client. Game creation is a small HTTP step before any socket exists.

### HTTP (creation + static)

- `POST /api/games` with `{ playerCount: number, variant?: 'standard' }` creates a live game and returns:
  ```ts
  interface CreateGameResponse {
    gameId: string;
    seats: Array<{ playerId: PlayerId; color: Color; link: string }>;  // one link per seat, incl. the creator's
  }
  ```
  `link` is `<PUBLIC_BASE_URL>/play?g=<gameId>&t=<seatToken>`. The game is already in `setup`/active state on return; there is no separate start call.
- `GET /` serves the built client. `GET /ws` upgrades to WebSocket.

### Client → Server

```ts
type ClientMessage =
  | { type: 'join'; gameId: string; token: string }   // first message after connecting
  | { type: 'intent'; action: GameAction };            // resolves the current decision
```

### Server → Client

```ts
type ServerMessage =
  | { type: 'welcome'; you: PlayerId; color: Color; gameId: string }
  | { type: 'snapshot'; state: GameState; you: PlayerId; legalActions: GameAction[]; events: GameEvent[] }
  | { type: 'reject'; reason: string; action: GameAction }   // your intent was illegal; state unchanged
  | { type: 'error'; code: string; message: string };        // protocol error (bad token, no such game)
```

**Flow.**
1. Client connects, sends `join` with the token from its link.
2. Server validates the token, binds the socket to the seat, marks it connected, and replies `welcome` then a `snapshot` (with `events: []`).
3. On any seat's action: server validates and `reduce`s, then **broadcasts a `snapshot` to every connected seat**, each carrying that recipient's `legalActions` (non-empty only for the seat whose `currentDecision` it now is) and the `events` from this transition.
4. An illegal intent gets a `reject` to the sender only; no broadcast.
5. For a bot seat (2-player variant), the server obtains the action from the bot `ActionSource` and runs the same path, so other clients just receive the resulting `snapshot`.

`legalActions` is always computed **per recipient**, so a client can trust that a non-empty list means "it is your move, here are your options," and an empty list means "wait."

---

## 9. MVP Subset vs Full-Ruleset Trajectory

A natural seam for the Build Plan, so the MVP is playable end-to-end before the hardest interactions land:

- **MVP-core (a complete playable loop):** setup placement; Phase 1 drift/stay/move/feed (including roll-of-6 direction and obstacle handling); Phase 2 defect balancing; Phase 3 buying basic genes and passing; Phase 4 division and passing; Phase 5 natural deaths (automatic); Phase 6 scoring (automatic); game-end and winner. Genes whose effects are non-reactive (movement, feeding-modifier, division, longevity, ray protection, spores, tentacle, holding, intelligence) fit here.
- **Full-ruleset follow-on (a coherent combat milestone):** the reactive genes and their decision kinds (`struggle_target`, `attack_response`, `aggression_target`, `aggression_response`) and the genes that drive them (STRUGGLE FOR SURVIVAL, DEFENSE, ESCAPE, ARMOR, AGGRESSION, PERSISTENCE, PARASITISM). These share one trait: they introduce a decision owned by a *different* player mid-resolution, which is why grouping them is cleaner than scattering them.
- **Later variants:** 4-player content (already shaped by the config table) and the 2-player automated-player variant (`variant: 'two_player_bots'`, `kind: 'bot'` seats, the `bots` package).

The decision-point model and the message envelope are identical across all of these; the later work adds decision kinds, actions, events, and gene logic without reshaping the protocol.

---

## 10. A Worked Micro-Transition

To make the loop concrete. Suppose it is Phase 1, and `currentDecision` is:

```
{ seat: "seat-2", kind: "amoeba_action", context: { amoebaId: 3, cellId: "1,2", driftDirection: "E", moveCostBp: 1 } }
```

`legalActions` sent to `seat-2` might be: `drift(3)`, `stay(3)` (if eligible), `move(3)` (if BP ≥ 1). The player sends `{ type: 'intent', action: { type: 'move', amoebaId: 3 } }`. The engine spends 1 BP, rolls (say a 6), and because 6 is free choice it does **not** finish the move; it emits no `moved` event yet and sets:

```
currentDecision = { seat: "seat-2", kind: "choose_move_direction", context: { amoebaId: 3, cellId: "1,2" } }
```

The new snapshot to `seat-2` carries `legalActions` of the legal `set_move_direction` options (directions not blocked by an obstacle). The player picks `S`; the engine moves the amoeba, emits `moved`, then proceeds to feeding for amoeba 3 (auto-resolving if only one combo is legal, or issuing `amoeba_feed` if there is a choice), and so on, until the next seat input is needed. Every client receives the resulting snapshot; only the seat now on decision has a non-empty `legalActions`.

---

## 11. Left to the Engine / Build Plan

- The exact `legalActions` computation per decision kind (this is the rules engine, validated by the scenarios doc).
- Per-gene effect logic and sub-decision sequencing.
- The `Rng` interface details and seeding (architecture-level; seed/cursor live in `GameRecord`).
- `GameRecord` (server wrapper): `{ state: GameState, tokens: Record<PlayerId, string>, rngSeed, rngCursor, createdAt }`. Defined where the `GameStore` lives, not in shared, since clients never see tokens.

---

*Companion documents: `game-spec.md` (rules), `architecture.md` (system design), `build-plan.md` (construction sequence, next).*
