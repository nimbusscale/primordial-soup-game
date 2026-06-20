# Primordial Soup — Validation Scenarios

> Companion to **`game-spec.md`** (rules, source of truth, read-only), **`architecture.md`** (system design), **`state-model-and-protocol.md`** (state shape, action/event catalogs, wire protocol), and **`build-plan.md`** (the milestones these scenarios gate). This document defines the **deterministic golden scenarios** the pure engine must reproduce. Each becomes one or more Vitest cases and gates a build-plan milestone. Scenarios are expressed as data: an initial condition, an ordered list of `GameAction`s, and assertions on the resulting `GameState` and `GameEvent`s. Determinism comes from a fixed RNG, so outcomes are reproducible. The scenarios encode expected engine input and output; they do not restate the rules, which the spec owns.

---

## 1. Purpose

These scenarios turn "the engine is correct" into a runnable check. They exist so each engine milestone in the build plan has an objective gate: the milestone is done when its scenarios pass. They draw the hard cases straight from the spec's Implementation Notes (§11) and FAQ (§10). Every scenario is tagged **MVP-core** or **full-ruleset** and lists the milestone it gates, matching the build plan.

---

## 2. Scenario Format

A scenario is a plain-data record. The shapes below live alongside the engine tests and are consumed by a small runner that feeds each action to `reduce`, follows auto-advance, and checks assertions.

```ts
interface Scenario {
  id: string;                          // e.g. "FEED-01"
  title: string;
  tier: 'mvp-core' | 'full-ruleset';
  gates: string[];                     // milestone ids, e.g. ["M4"]
  given: Given;
  when: Step[];                        // ordered actions, each resolving the then-current decision
  then?: Assertion[];                  // final assertions after all steps
}

interface Given {
  playerCount: 3 | 4;
  rng: { seed: number } | { rolls: number[] };   // see "Determinism" below
  // exactly one of the next two:
  state?: DeepPartial<GameState>;      // hand-built start; deep-merged onto a baseline; may set currentDecision directly
  setupActions?: GameAction[];         // or: build via createInitialState(playerCount) then apply these
  notes?: string;
}

interface Step {
  seat: PlayerId | '<current>';        // expected owner of currentDecision ('<current>' = whoever the engine asks)
  action: GameAction;
  expectEvents?: DeepPartial<GameEvent>[];   // events this transition must emit (subset match, order-preserving)
  expectReject?: { reasonMatches?: string }; // this action must be rejected; state unchanged
  assert?: Assertion[];                       // checked immediately after this transition
}

type Assertion =
  | { path: string; equals: unknown }                 // state path equals value
  | { path: string; absent: true }                    // key omitted (e.g. a color count that reached 0)
  | { legalFor: PlayerId; includes?: GameAction }     // legalActions for a seat contains this action
  | { legalFor: PlayerId; excludes?: GameAction }     // ...does not contain this action
  | { legalFor: PlayerId; count?: number };           // ...has exactly N entries
```

**State-path vocabulary.** Paths use a small accessor grammar so ids that are not array indices stay unambiguous:

- `round`, `phase`, `winner`
- `currentDecision.seat`, `currentDecision.kind`, `currentDecision.context.<field>`
- `player(seat).<field>` e.g. `player("seat-0").bp`, `player("seat-0").score`, `player("seat-0").genes`
- `amoeba(seat, id).<field>` e.g. `amoeba("seat-0",3).location`, `amoeba("seat-0",3).dp`
- `cell("col,row").cubes.<color>` e.g. `cell("1,3").cubes.red`
- `supply.<color>`

**Determinism.** The injected `Rng` is a test double. Two flavors:

- `{ rolls: [...] }` scripts the exact die faces (`1..6`) the engine will draw, in order. Use this for any roll-dependent scenario so the expected outcome is fixed and human-readable without depending on a particular PRNG algorithm. A `move` that needs a 6 then a chosen direction uses `rolls: [6]`; the direction comes from a `set_move_direction` action, not the die.
- `{ seed: n }` seeds the real production PRNG. Use this only for integration scenarios (`GAME-01`) where the point is end-to-end determinism; capture the resulting values as a golden snapshot on first authoring run and freeze them.

**Constructed vs. driven start.** Most mechanic scenarios set `given.state` directly (often pinning `currentDecision` to the exact decision under test) so assertions are crisp and isolated. Setup and integration scenarios use `setupActions` or a seed to exercise the real entry path.

---

## 3. Worked Example (canonical format)

`FEED-01` fully expanded, to anchor the format. It isolates the 3-player single-plus-double feed by constructing a state already resting on an `amoeba_feed` decision.

```json
{
  "id": "FEED-01",
  "title": "3p feeding: single+double ratio, excretion, supply movement",
  "tier": "mvp-core",
  "gates": ["M4"],
  "given": {
    "playerCount": 3,
    "rng": { "rolls": [] },
    "state": {
      "round": 1, "phase": "phase1_movement_feeding",
      "colorsInPlay": ["red","green","blue"],
      "supply": { "red": 7, "green": 7, "blue": 7 },
      "board": { "1,1": { "id": "1,1", "col": 1, "row": 1, "cubes": { "green": 2, "blue": 2 } } },
      "players": {
        "seat-0": { "id": "seat-0", "color": "red", "bp": 4,
          "amoebas": [ { "id": 3, "location": "1,1", "dp": 0 } ] }
      },
      "currentDecision": { "seat": "seat-0", "kind": "amoeba_feed",
        "context": { "amoebaId": 3, "cellId": "1,1" } }
    }
  },
  "when": [
    { "seat": "seat-0",
      "action": { "type": "feed", "amoebaId": 3, "eat": { "green": 1, "blue": 2 } },
      "expectEvents": [ { "type": "fed", "amoebaId": 3, "cellId": "1,1",
                         "ate": { "green": 1, "blue": 2 }, "excreted": { "red": 2 } } ] }
  ],
  "then": [
    { "path": "cell(\"1,1\").cubes.green", "equals": 1 },
    { "path": "cell(\"1,1\").cubes.blue", "absent": true },
    { "path": "cell(\"1,1\").cubes.red", "equals": 2 },
    { "path": "supply.red", "equals": 5 },
    { "path": "supply.green", "equals": 8 },
    { "path": "supply.blue", "equals": 9 }
  ]
}
```

The remaining scenarios use the same shape, shown compactly: a prose line, then **Given / When / Then**. Concrete actions are written as JSON; where a value is golden (seed flavor) it is marked as captured on first run.

---

## 4. MVP-Core Scenarios

### Setup (`SETUP-*`) — gates M2 (and `SETUP-02` also gates M17)

**SETUP-01 — 3-player setup correctness.** Three colors in play; markers on distinct start spaces `1..3`; every one of the 24 cells holds 2 cubes of each of the 3 colors; first amoebas get **0 DP** in 3p; second amoebas get 0 DP; no cell ends with more than one amoeba; play advances into round 1 Phase 1.

```
Given: playerCount 3, rng {seed: 11}, setupActions: [] (drive createInitialState)
When:  six place_starting_amoeba onto distinct empty cells, applied to '<current>' in setup order
       cells: "0,0","0,4","4,0","4,4","1,1","3,3"
Then:  player(*).score are 3 distinct integers in 1..3            (exact assignment golden)
       cell(C).cubes.{red,green,blue} == 2 for all 24 cells C
       supply.red == 7 && supply.green == 7 && supply.blue == 7   (55 - 24*2)
       every on-board amoeba has dp == 0
       count of amoebas per seat with location != null == 2
       no cellId hosts >1 amoeba
       round == 1 && phase == "phase1_movement_feeding"
       currentDecision.kind == "amoeba_action"
```

**SETUP-02 — 4-player starting-DP asymmetry.** Same as SETUP-01 but four colors; start spaces `1..4`; **first amoebas get 1 DP**; second amoebas 0 DP; 2 cubes of each of 4 colors per cell; supply 55 − 48 = 7 each. Tier mvp-core for the asymmetry rule; also gates the 4-player milestone.

```
Given: playerCount 4, rng {seed: 11}, setupActions: []
When:  eight place_starting_amoeba onto distinct empty cells (applied to '<current>')
Then:  each seat's FIRST-placed amoeba has dp == 1; each SECOND has dp == 0
       cell(C).cubes has all 4 colors == 2 for all 24 cells
       supply.<each color> == 7
       player(*).score are 4 distinct integers in 1..4
gates: ["M2","M17"]
```

**SETUP-03 — placement legality.** A `place_starting_amoeba` onto an occupied cell is rejected; `legalActions` for the placing seat excludes occupied cells and the island; placement strictly follows ascending-then-descending order.

```
Given: playerCount 3, rng {seed: 7}, setupActions: []
When:  step1 '<current>' place_starting_amoeba {amoebaId: 1, cellId: "0,0"}
       step2 '<current>' place_starting_amoeba {amoebaId: 1, cellId: "0,0"} -> expectReject {reasonMatches: "occupied|not empty"}
       assert legalFor(currentDecision.seat) excludes place onto "0,0" and onto "2,2"
Then:  amoeba("...",placed) count unchanged by the rejected step
```

---

### Phase 1 movement (`MOVE-*`) — gates M3

All movement scenarios construct a state on an `amoeba_action` decision and script rolls.

**MOVE-01 — drift normal.** Env drift `E`; amoeba drifts one cell east; `drifted` event; location updated; no BP spent.

```
Given: pc3, rng {rolls:[]}, state: env.drift "E", amoeba seat-0 #2 at "1,2", decision amoeba_action ctx.driftDirection "E"
When:  seat-0 {type:"drift",amoebaId:2} expectEvents [{type:"drifted",from:"1,2",to:"2,2"... }]
```
Correction: "2,2" is the island. Use a non-island target. Place amoeba at "0,2", drift E to "1,2".
```
state: amoeba seat-0 #2 at "0,2"; When drift E -> to "1,2"; Then amoeba("seat-0",2).location == "1,2"; player.bp unchanged
```

**MOVE-02 — drift into edge.** Amoeba at "4,2" (east edge column), drift `E` blocked; stays; `stayed` reason `"obstacle"`.

```
When: drift -> expectEvents [{type:"stayed",cellId:"4,2",reason:"obstacle"}]; Then location == "4,2"
```

**MOVE-03 — drift into island.** Amoeba at "1,2" (west of island), drift `E` toward "2,2" blocked by island; stays; reason `"obstacle"`.

```
state: amoeba at "1,2", env.drift "E"; When drift -> stayed reason "obstacle"; location == "1,2"
```

**MOVE-04 — no-drift card.** Env drift `"none"`; `drift` resolves as a stay with reason `"no_drift"`.

```
state: env.drift "none", ctx.driftDirection "none"; When drift -> stayed reason "no_drift"
```

**MOVE-05 — move, normal roll.** Pay 1 BP, scripted roll `3` (East); moves east one cell; `moved` event with `roll:3,bpSpent:1`.

```
Given: rng {rolls:[3]}, state amoeba at "1,1" bp 4; When {type:"move",amoebaId:#} 
Then: location == "2,1"; player.bp == 3; expectEvents [{type:"moved",roll:3,bpSpent:1,from:"1,1",to:"2,1"}]
```

**MOVE-06 — move, roll of 5 = stay.** Scripted roll `5`; amoeba stays; BP still spent; `stayed` reason `"roll5"`.

```
Given rng {rolls:[5]} bp 4; When move -> stayed reason "roll5"; Then bp == 3; location unchanged
```

**MOVE-07 — move, roll of 6 = free choice.** Scripted roll `6`; engine issues `choose_move_direction` to the same seat; `set_move_direction S` resolves; `moved`.

```
Given rng {rolls:[6]} amoeba at "1,1" bp 4
When  step1 move -> assert currentDecision.kind == "choose_move_direction", expectEvents excludes any "moved"
      step2 set_move_direction {direction:"S"} -> expectEvents [{type:"moved",to:"1,2"}]
Then  location == "1,2"; bp == 3
```

**MOVE-08 — move into obstacle after roll.** Amoeba at "4,1", scripted roll `3` (East) into the edge; move not carried out; stays; BP spent.

```
Given rng {rolls:[3]} amoeba at "4,1" bp 4; When move
Then location == "4,1"; bp == 3; expectEvents [{type:"stayed",reason:"obstacle"}]
```

**MOVE-09 — MOVEMENT I (two dice, pick either).** Owner has MOVEMENT_I; scripted rolls `[2,3]` (N or E); engine offers a direction choice between the two die results; choosing `E` moves east.

```
Given rng {rolls:[2,3]} player genes ["MOVEMENT_I"] amoeba at "1,1" bp 4
When  move -> choose between N(from die 2) and E(from die 3); set_move_direction {direction:"E"}
Then  location == "2,1"; bp == 3
assert legalFor(seat) for the direction choice includes only the two rolled directions
```

**MOVE-10 — STREAMLINING (free movement).** Owner has STREAMLINING; a `move` costs 0 BP.

```
Given genes ["STREAMLINING"] rng {rolls:[3]} bp 4; When move
Then bp == 4 (unchanged); expectEvents [{type:"moved",bpSpent:0}]
```

**MOVE-11 — SPEED (two moves, feed once).** Owner has SPEED; first move paid normally, second move free; amoeba feeds only after the complete movement; cannot drift twice or mix.

```
Given genes ["SPEED"] rng {rolls:[3,4]} amoeba at "1,1" bp 4 (cell at final dest has food)
When  move (roll 3 -> "2,1", bp 3) ; engine prompts second move ; second move (roll 4 -> "2,2"? island) 
      -- pick a clear path: rolls [3,3] from "1,1" -> "2,1" -> "3,1"
Then  location == "3,1"; bp == 3 (second move free); exactly one feed decision/auto-resolve occurs for this amoeba
assert no second drift was offered; drift+move mix not in legalActions during the SPEED sequence
```

**MOVE-12 — MOVEMENT II (choose direction, no roll).** Owner has MOVEMENT_II (advanced); `move` goes straight to a direction choice with no die.

```
Given genes ["MOVEMENT_II"] rng {rolls:[]} amoeba at "1,1" bp 4
When  move -> choose_move_direction (no roll consumed) ; set_move_direction {direction:"S"}
Then  location == "1,2"; bp == 3; rng cursor unchanged (no die drawn)
```

**MOVE-13 — TENTACLE carry (3p capacity 2).** Owner has TENTACLE; while moving, may carry up to 2 cubes (3p) from origin to destination.

```
Given pc3 genes ["TENTACLE"] rng {rolls:[3]} amoeba at "1,1" (cubes green:2) bp 4
When  move carrying {green:2} from "1,1" to "2,1"
Then  cell("1,1").cubes.green absent; cell("2,1").cubes.green == 2 (plus any prior)
assert attempting to carry 3 cubes in 3p is rejected or not offered (cap is 2 in 3p)
```

**MOVE-14 — HOLDING stay-instead-of-drift (function 1).** Owner has HOLDING; on its turn it may `stay` rather than drift even when a drift direction exists.

```
Given genes ["HOLDING"] env.drift "E" amoeba at "0,2"
When  stay -> expectEvents [{type:"stayed",reason:"holding"}]
Then  location == "0,2"
assert legalFor(seat) includes both {type:"drift"} and {type:"stay"}
```

---

### Phase 1 feeding (`FEED-*`) — gates M4 (`FEED-02`,`FEED-07` gate M17)

**FEED-01 — 3p ratio + excretion + supply movement.** See §3 (worked example).

**FEED-02 — 4p ratio 1:1:1.** Four colors; eater (red) eats one of each other color; excretes +2 red. Tier mvp-core; gates M17 (needs 4p).

```
Given pc4 colorsInPlay [red,green,blue,yellow], cell cubes {green:1,blue:1,yellow:1}, decision amoeba_feed, supply each 7
When  feed {eat:{green:1,blue:1,yellow:1}} expectEvents [{type:"fed",excreted:{red:2}}]
Then  cell green/blue/yellow absent; cell.red == 2; supply.red == 5; supply.{green,blue,yellow} == 8
gates: ["M4","M17"]
```

**FEED-03 — starvation grants 1 DP.** Cell lacks a satisfiable combo; the only legal action is a feed that fails, resolving to a starve: +1 DP, no eat, no excrete.

```
Given pc3 cell cubes {green:1} (no double available, no second color), amoeba #3 dp 0, decision amoeba_feed
When  the engine surfaces starvation (no legal eat combo) -> '<current>' feed with the empty/forced result
      (model: legalFor(seat) contains no satisfiable eat; engine emits starved)
Then  amoeba("seat-0",3).dp == 1; expectEvents [{type:"starved",amoebaId:3}]; cell.cubes unchanged
```

**FEED-04 — excretion supply shortage.** Eater's own-color supply is below the 2 needed for excretion; place as many as available, skip the rest, never substitute.

```
Given pc3 supply.red == 1, cell cubes {green:2,blue:2}, eater red, decision amoeba_feed
When  feed {eat:{green:1,blue:2}}
Then  cell.red == 1 (only 1 placed); supply.red == 0; no other color substituted for the missing red cube
      expectEvents [{type:"fed",excreted:{red:1}}]
```

**FEED-05 — SUBSTITUTION combo present (3p eat 4 of one color).** Owner has SUBSTITUTION; `legalActions` includes the 4-of-one-color combo in 3p.

```
Given pc3 genes ["SUBSTITUTION"] cell cubes {green:4}, eater red, decision amoeba_feed
assert legalFor(seat) includes {type:"feed",eat:{green:4}}
When  feed {eat:{green:4}} Then cell.green absent; cell.red == 2 (excretion unchanged)
```

**FEED-06 — legalActions enumeration + auto-resolve.** `legalActions` lists exactly the combos the cell can satisfy under the player-count ratio and feeding genes; when exactly one combo is legal, the engine may auto-resolve without prompting.

```
Given pc3 cell cubes {green:2,blue:1}, eater red, no feeding genes, decision amoeba_feed
assert legalFor(seat) == [{type:"feed",eat:{green:2,blue:1}}]  (only one satisfiable single+double)
Then  the engine either prompts that one action or auto-resolves it; after resolution amoeba fed, not starved
```

**FEED-07 — FRUGALITY (4p, eat one less).** Owner has FRUGALITY in a 4p game; may eat one fewer cube; excretion normal. Tier full-ruleset-adjacent; gates M17.

```
Given pc4 genes ["FRUGALITY"] cell cubes {green:1,blue:1}, eater red
assert legalFor(seat) includes a 2-cube combo (one less than 1:1:1)
gates: ["M4","M17"]
```

---

### Phase 2 environment & gene defects (`DEFECT-*`) — gates M5

**DEFECT-01 — no defect in round 1.** Even if MP exceeds ozone, no `balance_gene_defect` decision is issued during round 1.

```
Given pc3 round 1, player genes summing MP 12, new env ozone 6
When  advance into phase2_environment
Then  no currentDecision of kind "balance_gene_defect" is created; phase proceeds
```

**DEFECT-02 — defect decision with locked-in excess.** Round 2+, MP sum exceeds ozone; the player gets `balance_gene_defect` carrying `excessMp` equal to the locked-in difference at reveal.

```
Given pc3 round 2, player genes MP sum 12, new env ozone 6
When  reveal new env card
Then  currentDecision.kind == "balance_gene_defect"; currentDecision.context.excessMp == 6
      expectEvents [{type:"environment_revealed"}]
```

**DEFECT-03 — balance by paying BP.** Pay the full difference in BP.

```
Given the DEFECT-02 state, player bp 6
When  balance_defect {giveUp:[], payBp:6}
Then  player.bp == 0; player.genes unchanged; expectEvents [{type:"defect_balanced",bpPaid:6,gaveUp:[]}]
```

**DEFECT-04 — balance by giving up genes, excess lost.** Give up a gene worth more than required; the excess is lost, no refund.

```
Given player genes ["SPEED"(MP3),"DIVISION_RATE"(MP5),"STREAMLINING"(MP4)] sum 12, ozone 6, excessMp 6, bp 0
When  balance_defect {giveUp:["STREAMLINING","DIVISION_RATE"], payBp:0}  (gives up 9 to cover 6)
Then  player.genes == ["SPEED"]; player.bp == 0 (no refund of the 3 excess)
      expectEvents [{type:"defect_balanced",gaveUp:["STREAMLINING","DIVISION_RATE"],bpPaid:0}]
assert a give-up totaling less than excessMp is rejected
```

**DEFECT-05 — RAY PROTECTION −2 to the MP sum.** Owning RAY PROTECTION lowers the summed MP by 2 when computing the defect.

```
Given player genes with raw MP 14 plus RAY_PROTECTION, ozone 10
Then  the locked-in excessMp == 2   (14 - 2 = 12 vs 10)
```

**DEFECT-06 — give up RAY PROTECTION satisfies 4 (FAQ).** From the spec FAQ: 14 MP + RAY (−2) = 12 vs ozone 10, must balance 2; giving up RAY satisfies 4, more than enough; MP is not recalculated mid-resolution.

```
Given player genes raw MP 14 + RAY_PROTECTION, ozone 10, excessMp locked at 2
When  balance_defect {giveUp:["RAY_PROTECTION"], payBp:0}
Then  player.genes excludes RAY_PROTECTION; difference satisfied; excess (4-2) lost; no MP recompute step
      expectEvents [{type:"defect_balanced",gaveUp:["RAY_PROTECTION"]}]
```

**DEFECT-07 — environment reveal and deck order.** Revealing draws the next card in `deckRemaining` order, moves the old card to `discarded`, and updates ozone/drift.

```
Given env.deckRemaining ["env-05","env-06",...]
When  reveal
Then  env.current.id == "env-05"; env.discarded contains the previous current; deckRemaining[0] == "env-06"
```

---

### Phase 3 gene buying (`BUY-*`) — gates M6

**BUY-01 — buy a basic gene.** BP decremented by price; gene added; `gene_bought` emitted.

```
Given pc3 phase3 player bp 4, genes []
When  buy_gene {gene:"DEFENSE"}   (price 4)
Then  player.bp == 0; player.genes includes "DEFENSE"; expectEvents [{type:"gene_bought",gene:"DEFENSE",cost:4,gaveUp:null}]
```

**BUY-02 — copy limit and no duplicate.** A gene with all copies owned (by others) is excluded from `legalActions`; buying a gene already owned is rejected.

```
Given pc3 SPORES has 1 copy (3p), already owned by seat-1; seat-0 deciding buy_genes
assert legalFor("seat-0") excludes {type:"buy_gene",gene:"SPORES"}
When  seat-0 buy_gene {gene:"DEFENSE"} (owns it already) -> expectReject {reasonMatches:"duplicate|already own"}
```

**BUY-03 — advanced upgrade consumes prerequisite, locks re-buy.** Holding SPEED since a prior round, upgrade to PERSISTENCE: pay price, give up SPEED, and SPEED becomes un-buyable while PERSISTENCE is held.

```
Given pc3 player genes ["SPEED"] held since round 1, now round 2 phase3, bp 4
When  buy_gene {gene:"PERSISTENCE", upgradeFrom:"SPEED"}   (price 4)
Then  player.genes includes "PERSISTENCE" && excludes "SPEED"; bp == 0
      expectEvents [{type:"gene_bought",gene:"PERSISTENCE",cost:4,gaveUp:"SPEED"}]
assert legalFor("seat-0") excludes {type:"buy_gene",gene:"SPEED"} while PERSISTENCE held
```

**BUY-04 — same-phase upgrade restriction.** Buying SPEED this Phase 3 then immediately upgrading to PERSISTENCE in the same Phase 3 is rejected (prerequisite must be held a full prior round).

```
Given pc3 player genes [] bp 8 phase3 round 2
When  step1 buy_gene {gene:"SPEED"}   (now owns SPEED, bought THIS phase)
      step2 buy_gene {gene:"PERSISTENCE", upgradeFrom:"SPEED"} -> expectReject {reasonMatches:"prior round|same phase"}
Then  player.genes == ["SPEED"]
```

**BUY-05 — buy multiple then pass.** Several buys in one Phase 3, ended by `pass_buying`.

```
Given pc3 bp 7 genes []
When  buy_gene {gene:"INTELLIGENCE"}(2) ; buy_gene {gene:"MOVEMENT_I"}(3) ; pass_buying
Then  player.genes includes both; player.bp == 2; currentDecision moves on from buy_genes for this seat
```

**BUY-06 — unaffordable excluded.** A gene the player cannot afford is not in `legalActions`.

```
Given pc3 bp 2
assert legalFor(seat) excludes {type:"buy_gene",gene:"LONGEVITY"} (price 5) ; includes {type:"buy_gene",gene:"INTELLIGENCE"} (price 2)
```

---

### Phase 4 cell division (`DIV-*`) — gates M7

**DIV-01 — +10 BP at phase start.** Entering Phase 4 adds 10 BP to each player's saved BP.

```
Given pc3 entering phase4, player bp 3
Then  player.bp == 13 before any division action
```

**DIV-02 — divide adjacent, 6 BP, newborn 0 DP.** Place a newborn on a cell with no same-color amoeba bordering a same-color amoeba.

```
Given pc3 player color red, amoeba #1 at "1,1", bp 13, no DIVISION_RATE
When  divide {newAmoebaId:2, cellId:"2,1"}   ("2,1" borders "1,1", holds no red)
Then  amoeba("seat-0",2).location == "2,1" && .dp == 0; player.bp == 7; expectEvents [{type:"divided",cost:6}]
```

**DIV-03 — DIVISION RATE cost 4.** With DIVISION_RATE, a division costs 4 BP.

```
Given pc3 genes ["DIVISION_RATE"] amoeba #1 at "1,1" bp 13
When  divide {newAmoebaId:2, cellId:"2,1"} Then bp == 9; expectEvents [{type:"divided",cost:4}]
```

**DIV-04 — 0-amoeba free placement anywhere.** A player with no on-board amoebas places one free on any cell.

```
Given pc3 player has zero on-board amoebas, bp 13
assert legalFor(seat) includes divide onto non-adjacent empty cells at cost 0
When  divide {newAmoebaId:1, cellId:"3,3"} Then bp == 13 (free); expectEvents [{type:"divided",cost:0}]
```

**DIV-05 — 1-amoeba special placement anywhere at cost.** A player with exactly one on-board amoeba may place a second on any cell, paying normal cost.

```
Given pc3 player has one amoeba at "0,0", bp 13
When  divide {newAmoebaId:2, cellId:"4,4"}  (non-adjacent, allowed by the 1-amoeba rule)
Then  amoeba("...",2).location == "4,4"; bp == 7
```

**DIV-06 — SPORES ignores adjacency.** With SPORES, a newborn may go on any cell not already holding that color, regardless of adjacency.

```
Given pc3 genes ["SPORES"] amoebas at "1,1" only, bp 13
When  divide {newAmoebaId:2, cellId:"4,4"}  (non-adjacent)
Then  amoeba("...",2).location == "4,4"
```

**DIV-07 — adjacency chain within the phase.** A newborn may border an amoeba placed earlier this same Phase 4.

```
Given pc3 amoeba #1 at "1,1", bp 13, no SPORES
When  divide {newAmoebaId:2, cellId:"2,1"} ; divide {newAmoebaId:3, cellId:"3,1"}  ("3,1" borders the just-placed "2,1")
Then  amoeba("...",3).location == "3,1"
```

**DIV-08 — illegal placement rejected.** Non-adjacent without SPORES, or onto a cell already holding that color, is rejected.

```
Given pc3 amoeba #1 at "1,1", bp 13, no SPORES
When  divide {newAmoebaId:2, cellId:"4,4"} -> expectReject {reasonMatches:"adjacent"}
      divide {newAmoebaId:2, cellId:"1,1"} -> expectReject {reasonMatches:"same color"}
```

---

### Phase 5 natural deaths (`DEATH-*`) — gates M8

**DEATH-01 — natural death at 2 DP.** An amoeba with 2 DP dies, is removed to supply, and is replaced by 2 cubes of each in-play color (6 in 3p), supply-limited; processed in descending order; `died` cause `natural`.

```
Given pc3 amoeba seat-0 #4 at "2,2"? island -> use "2,1", dp 2; supply each 10
When  advance into phase5_deaths
Then  amoeba("seat-0",4).location == null; cell("2,1").cubes each in-play color += 2
      supply.<each> == 8; expectEvents [{type:"died",amoebaId:4,cause:"natural"}]
```

**DEATH-02 — LONGEVITY raises threshold to 3.** With LONGEVITY, a 2-DP amoeba survives; a 3-DP amoeba dies.

```
Given pc3 genes ["LONGEVITY"], amoeba A dp 2 at "1,1", amoeba B dp 3 at "3,3"
When  advance into phase5_deaths
Then  A.location != null (survives); B.location == null (dies)
```

**DEATH-03 — death-cube supply shortage.** When the reserve cannot supply all replacement cubes, place as many as available and skip the rest.

```
Given pc3 amoeba dp 2 at "1,1"; supply {red:1, green:0, blue:5}
When  advance into phase5_deaths
Then  cell("1,1").cubes.red += 1 (only 1 available); green not increased; blue += 2; no color substituted
      supply.red == 0; supply.green == 0; supply.blue == 3
```

---

### Phase 6 scoring (`SCORE-*`) and game end (`END-*`) — gate M9

**SCORE-01 — amoeba advance table.** 5 live amoebas advance 4 spaces; 0–2 advance 0; 7 advance 6.

```
Given pc3 seat-0 has 5 on-board amoebas, 0 genes (or <3), score 10, ladder otherwise empty
When  phase6_scoring
Then  player("seat-0").score == 14; expectEvents [{type:"scored",amoebaSpaces:4,geneSpaces:0}]
```

**SCORE-02 — gene advance table.** 4 gene cards advance 2 spaces (amoebas 0–2 contribute 0).

```
Given pc3 seat-0 has 2 amoebas and 4 plain gene cards, score 10
Then  player.score == 12 (0 + 2); scored event geneSpaces 2
```

**SCORE-03 — advanced gene counts as two cards.** An advanced gene contributes 2 to the gene-card count on the table.

```
Given pc3 seat-0 has genes [INTELLIGENCE, MOVEMENT_I, AGGRESSION] where AGGRESSION is advanced
Then  gene-card count for the table == 4 (1 + 1 + 2); geneSpaces == 2
```

**SCORE-04 — RAY PROTECTION counts as zero.** RAY PROTECTION does not count toward the advancement card total.

```
Given pc3 seat-0 has genes [INTELLIGENCE, MOVEMENT_I, RAY_PROTECTION]
Then  gene-card count == 2 (RAY counts 0); geneSpaces == 0
```

**SCORE-05 — leapfrogging.** A marker never lands on an occupied ladder space; occupied spaces are skipped and not counted toward the distance moved.

```
Given pc3 seat-0 score 10 advancing 4; seat-1 marker on 12, seat-2 on 13 (both occupied)
When  phase6_scoring for seat-0 (advance 4)
Then  seat-0 lands on 16 (passes 12 and 13 without counting them, counts 11,14,15,16)
```

**END-01 — finish-zone reached.** At end of Phase 6, a marker at or past `FINISH_ZONE_START` (41) ends the game; winner is the furthest marker.

```
Given pc3 seat-0 score 38 advancing 5, seat-1 score 30, seat-2 score 25
When  phase6_scoring
Then  seat-0.score >= 41; phase == "game_over"; winner == "seat-0"; currentDecision == null
      expectEvents [{type:"game_over",winner:"seat-0"}]
```

**END-02 — last environment card flipped.** Turning over the last env card ends the game at the end of that round's scoring even if no marker reached the finish zone.

```
Given pc3 env.deckRemaining == [] after this round's reveal, no marker in finish zone
When  the round completes phase6_scoring
Then  phase == "game_over"; winner == furthest marker
```

**END-03 — winner determination.** Winner is the furthest-along marker (furthest into the finish zone if several are inside it).

```
Given pc3 final scores seat-0 44, seat-1 47, seat-2 41 (all in finish zone)
Then  winner == "seat-1" (furthest into the zone)
```

---

### Full headless game (`GAME-01`) — gates M10

**GAME-01 — complete non-combat 3-player game.** Seed a 3-player game and drive a scripted action list across multiple rounds to a winner, asserting checkpoints and the final result. Uses the seed RNG; expected values captured as a golden snapshot on first run and frozen.

```
Given pc3, rng {seed: 4242}, setupActions: [] (real createInitialState)
When  a long scripted GameAction list resolving each currentDecision for the seat it names,
      covering: setup placements; several full rounds of drift/move/feed; at least one buy;
      at least one division; at least one natural death; scoring each round; to game end
Then  phase reaches "game_over"; winner == <golden>; per-round checkpoints == <golden>;
      re-running with the same seed reproduces the run byte-for-byte
tier: mvp-core
```

---

## 5. Full-Ruleset Combat Scenarios (`COMBAT-*`) — gate M15

These introduce the reactive decision kinds (`struggle_target`, `attack_response`, `aggression_target`, `aggression_response`) and the combat genes. Each pins the relevant rolls so fight outcomes are fixed.

**COMBAT-01 — STRUGGLE FOR SURVIVAL basic.** A starving STRUGGLE amoeba attacks a co-located amoeba (1 BP), succeeds (no DEFENSE/ESCAPE/ARMOR on target), removes the target, and the attacker's space gets one cube of each color instead of normal excretion. Once per amoeba.

```
Given pc3 seat-0 amoeba #1 STRUGGLE owner, starving at "1,1"; seat-1 amoeba #2 at "1,1" (no defenses); bp ok
When  struggle_attack {attackerId:1, targetSeat:"seat-1", targetAmoebaId:2}
Then  amoeba("seat-1",2).location == null; cell("1,1").cubes each color += 1 (special); attacker bp -= 1
      expectEvents [{type:"attacked",kind:"struggle"},{type:"died",cause:"struggle"}]
assert the same attacker cannot struggle a second time this round
```

**COMBAT-02 — DEFENSE converts to a fight (Phase 1).** Defender pays 1 BP to convert; both roll; higher wins; reroll ties. Attacker wins -> eats defender (no cube replacement). Defender wins -> attacker starves.

```
Given pc3 attacker STRUGGLE at "1,1"; defender seat-1 amoeba #2 DEFENSE at "1,1"; rng {rolls:[6,2]} (attacker 6, defender 2)
When  struggle_attack {...} ; defender attack_response respond_defense
Then  defender removed (attacker won), no replacement cubes; expectEvents [{type:"defended",outcome:"attacker_won"}]
Variant COMBAT-02b: rng {rolls:[2,6]} -> defender wins; attacker starves (+1 DP); defended outcome "defender_won"
```

**COMBAT-03 — ESCAPE avoids attack.** Defender pays 1 BP and moves away using movement genes; the attack does not land.

```
Given pc3 attacker STRUGGLE at "1,1"; defender seat-1 ESCAPE at "1,1", bp ok; rng {rolls:[3]} for the escape move
When  struggle_attack {...} ; defender respond_escape {direction:"E"}
Then  defender.location == "2,1"; defender survives; expectEvents [{type:"escaped"}]
```

**COMBAT-04 — DEFENSE + ESCAPE vs the same attack.** A player owning both may use each once against one attack, in either order.

```
Given pc3 defender owns DEFENSE and ESCAPE; attacker STRUGGLE
When  attack_response uses ESCAPE first (fails to fully avoid via interaction under test) then DEFENSE,
      or DEFENSE first then ESCAPE; assert each is offered at most once per attack
Then  the second response is still legal after the first; a third (re-using one) is rejected
```

**COMBAT-05 — HOLDING vs ESCAPE.** Attacker has HOLDING; victim ESCAPEs; the attack ends (attacker cannot attack again). In Phase 1 the attacker may still eat in the destination if there is enough food.

```
Given pc3 attacker STRUGGLE+HOLDING at "1,1"; victim ESCAPE at "1,1"; destination "2,1" has food
When  struggle_attack {...} ; victim respond_escape {direction:"E"} ; attacker uses HOLDING follow
Then  attack ended (no second attack); attacker may feed in "2,1" if food suffices
assert attacker gets no second struggle this round
```

**COMBAT-06 — ARMOR blocks Phase 1 attack.** An armored amoeba may not be attacked by STRUGGLE in Phase 1.

```
Given pc3 attacker STRUGGLE at "1,1"; target seat-1 ARMOR at "1,1"
assert legalFor("seat-0") for struggle_target excludes the armored target
When  struggle_attack {targetAmoebaId: armored} -> expectReject {reasonMatches:"armor"}
```

**COMBAT-07 — AGGRESSION in Phase 5 after natural deaths.** Once per round, kill a co-located enemy for 1 BP; target replaced by 2 cubes of each color; resolves after natural deaths.

```
Given pc3 phase5, seat-0 AGGRESSION amoeba at "1,1"; seat-1 amoeba at "1,1"; supply each 10
When  (natural deaths resolve first) ; aggression_attack {attackerId, targetSeat:"seat-1", targetAmoebaId}
Then  target removed; cell cubes each color += 2; attacker bp -= 1; expectEvents [{type:"died",cause:"aggression"}]
assert a second aggression_attack this round is rejected (once per round, not per amoeba)
```

**COMBAT-08 — AGGRESSION vs ARMOR.** Armored target is not killed but takes 1 DP.

```
Given pc3 phase5 attacker AGGRESSION; target ARMOR at same cell, dp 0
When  aggression_attack {...}
Then  target.location != null; target.dp == 1; expectEvents [{type:"attacked",kind:"aggression"}] (no died)
```

**COMBAT-09 — AGGRESSION + PERSISTENCE vs ARMOR counts as successful (FAQ).** The armored target takes 1 DP, so the attack succeeded; PERSISTENCE does not re-fire because the first attempt did not fail.

```
Given pc3 phase5 attacker AGGRESSION+PERSISTENCE; target ARMOR dp 0
When  aggression_attack {...}
Then  target.dp == 1; no PERSISTENCE retry decision is offered (attack succeeded)
```

**COMBAT-10 — ARMOR + ESCAPE survive AGGRESSION + PERSISTENCE + HOLDING (FAQ).** Two resolution paths, each survivable.

```
Given pc3 phase5 attacker AGGRESSION+PERSISTENCE+HOLDING; defender ARMOR+ESCAPE, bp ok; rng {rolls for escapes}
Path A: aggression_attack -> defender respond_escape (move away) -> attacker HOLDING follow + PERSISTENCE retry
        -> defender respond_escape again -> Then defender alive
Path B: defender does not escape -> AGGRESSION lands -> ARMOR -> defender takes 1 DP, survives;
        PERSISTENCE does not re-fire (attack succeeded) -> Then defender alive, dp 1
Then  in both paths defender.location != null
```

**COMBAT-11 — DEFENSE vs AGGRESSION (Phase 5).** A player may DEFEND against AGGRESSION; if the defender wins, the attacker does NOT starve (AGGRESSION is unrelated to feeding).

```
Given pc3 phase5 attacker AGGRESSION; defender DEFENSE; rng {rolls:[2,6]} -> defender wins
When  aggression_attack {...} ; defender respond_defense
Then  attacker survives with no added DP and does not starve; defender survives; defended outcome "defender_won"
Variant: rng {rolls:[6,2]} -> attacker wins -> defender removed
```

**COMBAT-12 — PERSISTENCE second attempt on failure.** When a first STRUGGLE/DEFENSE/AGGRESSION attempt fails, PERSISTENCE grants a free second attempt.

```
Given pc3 attacker STRUGGLE+PERSISTENCE; target DEFENSE; rng {rolls:[2,6, 6,2]} (attempt1 attacker loses, attempt2 attacker wins)
When  struggle_attack ; target respond_defense (attacker loses) ; PERSISTENCE retry struggle_attack ; respond_defense (attacker wins)
Then  target removed on the second attempt; expectEvents includes two "defended" with outcomes [defender_won, attacker_won]
```

**COMBAT-13 — PARASITISM (4p).** In a 4-player game, a parasite needs one less food and the other amoeba's owner pays 1 BP to the bank; no defense; the parasite must still eat to parasitize. Tier full-ruleset; gates M17 (4p availability) and M15 (logic).

```
Given pc4 seat-0 PARASITISM amoeba at "1,1"; seat-1 amoeba at "1,1" with bp >= 1; cell has food for a reduced eat
When  feed using the parasitism reduction, naming the target owner
Then  seat-0 eats one less; seat-1.bp -= 1 (to bank); excretion normal; no defense decision offered
gates: ["M15","M17"]
```

---

## 6. Four-Player Content Scenarios (`P4-*`) — gate M17

Most 4p behavior is the same engine reading the 4p config column. These pin the differences.

**P4-01 — 4p gene copies/availability.** Genes with higher 4p copy counts allow more concurrent owners; 4p-only genes (FRUGALITY, PARASITISM) are available.

```
Given pc4; assert availability reflects the 4p copy column for a sampled set
      (e.g. MOVEMENT_I 2 copies, ESCAPE 2, FRUGALITY available, PARASITISM available)
```

**P4-02 — 4p feeding 1:1:1.** Cross-listed with FEED-02.

**P4-03 — TENTACLE capacity 3 in 4p.** A TENTACLE amoeba may carry up to 3 cubes in 4p.

```
Given pc4 genes ["TENTACLE"] amoeba at "1,1" cubes {green:3}; rng {rolls:[3]}
When  move carrying {green:3} to "2,1" Then cell("2,1").cubes.green == 3
assert carrying 4 is not permitted
```

**P4-04 — death cubes 8 in 4p.** A natural death replaces with 2 cubes of each of 4 colors (8 total), supply-limited.

```
Given pc4 amoeba dp 2 at "1,1"; supply each 10
When  phase5_deaths Then cell("1,1").cubes each of 4 colors += 2; supply.<each> == 8
```

**P4-05 — FRUGALITY available and effective.** Cross-listed with FEED-07.

**P4-06 — 4p SUBSTITUTION combinations.** SUBSTITUTION in 4p enables 2:2:0 and 3:1:0; combines with FRUGALITY for further combos.

```
Given pc4 genes ["SUBSTITUTION"] cell cubes {green:3,blue:1}, eater red
assert legalFor(seat) includes {type:"feed",eat:{green:3,blue:1}} and {type:"feed",eat:{green:2,blue:2}}
Given additionally genes include "FRUGALITY"
assert legalFor(seat) includes a one-less variant of the above combos
```

---

## 7. Tier & Gating Index

| Scenario group | Tier | Gates |
|---|---|---|
| `SETUP-01`, `SETUP-03` | mvp-core | M2 |
| `SETUP-02` | mvp-core | M2, M17 |
| `MOVE-01`..`MOVE-14` | mvp-core | M3 |
| `FEED-01`, `FEED-03`, `FEED-04`, `FEED-05`, `FEED-06` | mvp-core | M4 |
| `FEED-02`, `FEED-07` | mvp-core | M4 (logic), M17 (4p) |
| `DEFECT-01`..`DEFECT-07` | mvp-core | M5 |
| `BUY-01`..`BUY-06` | mvp-core | M6 |
| `DIV-01`..`DIV-08` | mvp-core | M7 |
| `DEATH-01`..`DEATH-03` | mvp-core | M8 |
| `SCORE-01`..`SCORE-05`, `END-01`..`END-03` | mvp-core | M9 |
| `GAME-01` | mvp-core | M10 |
| `COMBAT-01`..`COMBAT-12` | full-ruleset | M15 |
| `COMBAT-13` (PARASITISM) | full-ruleset | M15, M17 |
| `P4-01`..`P4-06` | full-ruleset | M17 |

MVP-core scenarios together prove a complete non-combat game (setup through game end). The full-ruleset groups land with their dedicated milestones and never reshape the protocol; they only add decision kinds, actions, events, and gene logic, exactly as the build plan and protocol §9 schedule them.

---

*Companion documents: `game-spec.md` (rules, source of truth), `architecture.md` (system design), `state-model-and-protocol.md` (state + protocol), `build-plan.md` (construction sequence).*
