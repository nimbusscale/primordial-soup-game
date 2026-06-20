# Primordial Soup (aka Ursuppe) — Game Implementation Specification

> A functional rules specification for implementing the board game *Primordial Soup* (Doris Matthäus & Frank Nestel, Z-Man Games 2004 English edition) as a digital multiplayer game. This document describes **how the game works**, not how to build it. All architecture, UI, and code decisions are left to the implementer.

---

## 1. Overview

Each player controls a tribe of amoebas in a primordial soup. Amoebas feed, multiply, and move. By buying **Genes**, players extend the capabilities of their amoebas, changing how the rules apply to them. The goal is to advance furthest up the **Scoring Ladder** ("evolution"). More living amoebas and more gene capabilities mean faster advancement.

- **Players:** 3 or 4
- **Recommended age:** 12+
- **Typical duration:** ~2 hours

### Key resources at a glance
- **Biological Points (BP):** the currency of vitality. Spent on movement, buying genes, cell division, fights, gene-defect balancing, and special gene actions.
- **Foodstuff cubes:** 4 colors, one per player color. Amoebas eat cubes to survive and excrete cubes of their own color.
- **Damage Points (DP):** accumulate on amoebas; cause death.
- **Genes:** cards granting special capabilities.
- **Score Markers:** one per player, tracked on the Scoring Ladder.

---

## 2. Components

| Component | Quantity / Detail |
|---|---|
| Game Board | The Primordial Soup: a **5×5 grid** of spaces with the **center square as the island/Compass** (out of bounds), leaving **24 playable spaces**, plus a Scoring Ladder running around the edge. See **Section 3a — Board Topology**. |
| Amoebas | 28 total: 4 colors × 7 amoebas each. Each amoeba is numbered 1–7. |
| Biological Points (BP) | Small = worth 1, large = worth 5. |
| Damage Point (DP) beads | Track damage on amoebas. |
| Foodstuff cubes | 220 total: 55 each of 4 colors. |
| Score Markers | One per player (a pawn). |
| Gene Cards | 33 cards with amoeba capabilities (plus blanks). With **3 players, only Gene Cards marked "3"** in the bottom corner are used. |
| Environment Cards | 11 cards. Each shows an **Ozone Layer Thickness** and a **Direction of Drift** (indicated in red). |
| Dice | 2 dice. |

> **Color/player note:** Each color is tied to a player. Foodstuff cubes and amoebas of colors not in play are set aside. In a 3-player game, only 3 colors are used.

---

## 3. Core Concepts

### Amoebas and Numerical Order
- Each player has up to 7 amoebas, numbered 1–7.
- Amoebas act (move, die, etc.) in **numerical order**: amoeba #1 first, then #2, up to #7.
- Amoebas not on the board do not count and are skipped.
- When **placing** a new amoeba, the player may use any available (off-board) amoeba regardless of its number.

### The Board and Spaces
- The soup is a **5×5 grid** of spaces. The **center square is the island/Compass** and is **out of bounds**, leaving **24 playable spaces**. See **Section 3a** for full topology.
- Multiple amoebas (any colors) may share the same space. Other amoebas are **not obstacles**.
- Obstacles are: the edge of the board and the central island/Compass.

> **Correction vs. printed rules:** The rulebook text states "19 spaces." This is an error in the printed rules. The actual board (verified from board photos) is a 5×5 grid with the center out of bounds = **24 playable spaces**. Use 24.

### Board Topology (Section 3a)

Model the soup as a **5×5 coordinate grid**, columns 0–4 (West→East) and rows 0–4 (North→South), giving 25 cells. The **center cell (2,2) is the island/Compass and is not playable**. The remaining **24 cells are playable spaces**.

- **Adjacency** is orthogonal only (N, S, E, W) — never diagonal. Two playable cells are adjacent if they differ by exactly one step in a single axis.
- A cell adjacent to the center (the four cells at (2,1), (2,3), (1,2), (3,2)) treats the **island side as an obstacle** (cannot move/drift into the island).
- **Direction → grid delta:** North = row − 1, South = row + 1, West = column − 1, East = column + 1.
- **Drift/move into an obstacle** (board edge or island) is not carried out; the amoeba stays put for that movement.
- **Each playable space independently tracks a multiset of Foodstuff cubes** — a per-color count for each of the colors in play (see *Foodstuff Cube Tracking* below).

**Scoring Ladder.** A separate one-dimensional track running around the board edge, numbered from **start spaces 1–4** (the initial play-order positions) up through markers at 5, 10, 15, 20, 25, 30, 35, 40, 45, 50. The **final 10 spaces form the dark Finish Zone**. Only the relative ordering and absolute position of each player's marker matter; model it as a single integer track with the leapfrog rule (Section 6, Phase 6).

### Foodstuff Cube Tracking
- Each playable space holds a per-color count of Foodstuff cubes. At setup, every space holds **2 cubes of each color in play**.
- There is **no rules-imposed per-space cap**: counts grow via excretion (+2 of the eater's own color per successful feed) and shrink via eating, death replacement, and TENTACLE transport. The only hard limit is the **global supply of 55 cubes per color** (shared across the whole board and the off-board reserve).
- When cubes must be placed (excretion, death replacement) but the global reserve of that color is exhausted, the missing cubes are simply **not placed** — never substituted with another color (see *Shortage of Food*).
- **Implementation note (the "poop tracker"):** Physical fan-made boards print a small grid in each space to slot cubes into; this is purely a display aid, **not a rule**. Whether to show a grid, color-count badges, or stacks is a UI decision. The rule is only that each space's per-color cube counts are tracked exactly and the global supply is enforced.

### Drift Direction & The Compass
- The Compass converts a die roll into a direction. There are **4 directions**: North, South, West, East. No diagonal movement.
- Die-to-direction mapping (uncoordinated movement):
  - **1 = West**
  - **2 = North**
  - **3 = East** *(implementer note: the rules state "1=West, 2=North, etc." and "3=East, 4=South" follows from the standard Ursuppe compass; treat 3=East, 4=South)*
  - **4 = South**
  - **5 = amoeba stays in place** (fails to move)
  - **6 = free choice of direction**
- The current Environment Card shows the **Direction of Drift** in red. If the center of the compass image is shaded red, there is **no drift** that round.

### Biological Points (BP)
- Represent vitality. Used to: move amoebas, buy genes, divide amoebas, convert attacks into fights, balance gene defects, and pay for various gene effects.
- BP can be saved across rounds.

### Damage Points (DP)
- An amoeba gains 1 DP when it **starves** (fails to feed) or when struck by certain attacks (see ARMOR/AGGRESSION).
- A newborn amoeba has 0 DP.
- An **unmutated** amoeba dies when it collects its **second** DP (i.e., 2+ DP) — see Phase 5. (The gene LONGEVITY raises this threshold to 3 DP.)

### Genes
- Each Gene grants all of the owning player's amoebas an extra capability. **Gene rules override standard rules.**
- Each Gene has a **price** (in BP) and a **Mutation Point** value.
- No player may own a duplicate of a Gene they already possess.
- A new Gene applies immediately to all of that player's amoebas.
- Genes given up (returned to the pool) can be bought again later by anyone.

### Mutation Points & Gene Defects
- Sum the Mutation Points of all genes a player possesses.
- If the sum **exceeds** the current Environment Card's Ozone Layer Thickness, a **Gene Defect** occurs and the player must balance the difference (see Phase 2).

### Ozone Layer Thickness
- Shown on each Environment Card. The thicker the ozone layer, the less chance of gene defects. Changes each round as cards are flipped.

---

## 4. Setup

1. Lay the board in the center.
2. Each player chooses a **color**, taking all 7 amoebas of that color, 1 reference booklet, and **4 BP** (large BP counts as 5).
3. Place **2 Foodstuff cubes of each color in play** onto **every space** on the board. Remaining cubes are kept handy as a supply.
4. **3-player game:** use only Gene Cards marked "3"; set aside the unused color's cubes and amoebas.
5. Shuffle the Environment Cards. Place one face up on the Compass in the board center. The rest go face down nearby.
6. **Determine play order (first round):** each player rolls two dice. Highest roller places their Score Marker on any of the spaces marked 1–4 (1–3 with three players). Next highest chooses next, and so on. Only one Score Marker per space.
7. **Place starting amoebas:**
   - In **Ascending Order** (player on space "1" first), each player places one amoeba on an empty space and gives that amoeba **1 DP**. *(Exception: in a 3-player game, these first amoebas do **not** receive a DP.)*
   - Then in **Descending Order**, each player places a **second** amoeba on an empty space; these do **not** receive a DP.
   - Players may use any of their amoebas (not necessarily #1).
   - After setup, **no space may contain more than one amoeba**.

---

## 5. Turn Order Terminology

- **Ascending Order:** the player whose marker is **last** on the Scoring Ladder goes first, then next-to-last, up to the first-place player who goes last.
- **Descending Order:** the first-place player goes first, continuing down to last place.

Each phase specifies which order is used.

---

## 6. Course of Play — The Six Phases

The game is divided into rounds. Each round has 6 phases, carried out in order.

### Phase 1 — Movement and Feeding *(Ascending Order)*

Each player, on their turn, deals with **each** of their on-board amoebas in **Numerical Order (1–7)**. For each amoeba: it must **Drift** or **Move**, then it attempts to **Feed**.

**Option A — Drift**
- The amoeba drifts **one space** in the Direction of Drift shown (red) on the current Environment Card.
- If an obstacle (board edge or island/Compass) blocks the drift, the amoeba stays put.
- If there is no drift this round (center of compass shaded red), the amoeba effectively stays put when drifting.
- Drift is free (no BP).

**Option B — Move (uncoordinated)**
- Pay **1 BP** and roll a die. The amoeba moves one space in the rolled direction (see compass mapping).
- Roll of **5** = stays in place. Roll of **6** = free choice of direction.
- If the move would hit an obstacle, the move is **not carried out** (but the BP/attempt is spent as resolved by the roll).

**Staying put** is only possible via: a die roll of 5, an obstacle, or no-drift conditions.

**Feeding** (after moving/drifting)
- An amoeba eats **3 Foodstuff cubes** per turn, but **never its own color**.
  - **4-player game:** one cube of each of the other 3 colors (1:1:1).
  - **3-player game:** one cube of one color and two of another (player chooses which is single, which is double).
- If it finds enough food: the eaten cubes are removed and replaced with **2 cubes of the amoeba's own color** (excretion). This can deplete cubes on a space over time.
- If it cannot find enough food **or** the right color combination, it **Starves**: eats nothing, excretes nothing, and gains **1 DP**.

After an amoeba finishes, the next amoeba (in number order) goes. After a player finishes all amoebas, the next player (Ascending Order) takes their turn.

> **Shortage of Food:** Cube supply is limited. If there aren't enough off-board cubes to fully replace/excrete, the missing cubes are simply **not** placed (not substituted with another color). The space ends up with fewer cubes than normal.

---

### Phase 2 — Environment and Gene Defects *(Descending Order)*

1. Remove the old Environment Card from the Compass; place a new one.
2. **Gene Defects do not occur during the first round.**
3. In subsequent rounds, each player sums the **Mutation Points** of all their Gene cards.
4. If the total **exceeds** the new card's Ozone Layer Thickness, the player must **balance the difference**, by:
   - Giving up Gene cards (each counts as its Mutation Point value), and/or
   - Paying BP (each BP counts as 1).
5. If the only way to balance is to give up more Mutation Points than required, the **excess is lost** (no refund/cash back).
6. Genes returned to the pool may be bought again later.

**Example:** A player has STREAMLINING (4) + DIVISION RATE (3) + SPEED (5) = 12 Mutation Points. If Ozone Thickness is 6, the difference is 6. They could pay 6 BP, or return SPEED (3) + pay 3 BP, etc. With no free BP, they'd have to give up cards even if the total exceeds 6 (excess lost).

---

### Phase 3 — New Genes *(Descending Order)*

- Each player, in turn, may spend BP to buy new Genes.
- Each player has **one chance** per round to buy whatever card(s) they want and can afford.
- **Buying is not random:** any Gene not currently owned by someone is available. A player may look through the available Genes and purchase any they wish (subject to cost and restrictions).
- No player may own a duplicate Gene.
- A new Gene applies immediately to all of the player's amoebas.
- See **Section 8** for Advanced Gene purchase rules.

---

### Phase 4 — Cell Division *(Descending Order)*

1. Each player first receives **10 BP** (added to any saved BP).
2. The player may divide amoebas at **6 BP per new amoeba** (reduced to **4 BP** with the DIVISION RATE gene).
3. A new amoeba has **0 DP** and must be placed on a space that:
   - Contains **no amoeba of the same color**, AND
   - **Borders** (horizontally or vertically, **not diagonally**) a space that already contains an amoeba of the same color.
   - The bordering amoeba may be one just placed this phase (chains allowed).
4. **Special placement cases:**
   - If a player has **no amoebas** on the board, they may place one amoeba **free** on any space of their choice.
   - If a player has **only one** amoeba on the board, they may place a second **anywhere**, but must still pay the normal cost.

> Gene exceptions: **SPORES** lets a new amoeba be placed on any space not already holding that color (ignores the adjacency requirement).

---

### Phase 5 — Deaths *(Descending Order)*

- **Process amoeba deaths in Descending Order** (this ordering appears on the reference sheet; it governs the order players resolve deaths).
- An amoeba with **2 or more DP** dies a **Natural Death** (threshold is **3 DP** if the player has LONGEVITY).
- A dead amoeba is **removed** and replaced by **2 Foodstuff cubes of each color in play** (4 colors → 8 cubes; 3 colors → 6 cubes), subject to cube supply.
- Dead amoebas return to the player's supply and may be reused later.
- **AGGRESSION attacks** happen during this phase, **after** natural deaths (see Section 8).

---

### Phase 6 — Scoring *(Descending Order)*

Each player advances their Score Marker based on **(a)** the number of live amoebas they have on the board and **(b)** the number of Gene cards they possess, using the **Advance Table** below. Sum the spaces from both rows.

**Advance Table — Amoebas:**

| Live amoebas | 0–2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|
| Spaces advanced | 0 | 1 | 2 | 4 | 5 | 6 |

**Advance Table — Gene cards:**

| Gene cards | 0–2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|
| Spaces advanced | 0 | 1 | 2 | 3 | 4 |

**Scoring rules:**
- **Advanced Genes count as TWO cards** on the advance table (PERSISTENCE, MOVEMENT II, AGGRESSION, ARMOR).
- The Gene **RAY PROTECTION counts as ZERO** for advancement.
- **Leapfrogging:** Only one marker may occupy a space on the Scoring Ladder. Occupied spaces are skipped ("leapfrogged") — a marker never lands on a space already occupied; it moves past it. Occupied spaces are not counted toward the distance moved.

---

### Game End / Winner

The game ends at the **end of the Scoring phase** of a round in which **either**:
- One or more Score Markers reaches the dark **Finish Zone** of the Scoring Ladder (the final 10 spaces), **or**
- The **last Environment Card** has been turned over.

The winner is the player whose marker is **furthest along** the Scoring Ladder (furthest into the Finish Zone if multiple are there).

> Optional: players may shorten the game by declaring an earlier Finish Zone.

---

## 7. Basic Genes Reference

Each gene lists: **Price** (BP to buy), **Mutation Points** (MP), copy counts for 3-player and 4-player games, and effect. With 3 players, only genes with a count in the "3-player" column are available, and only that many copies exist.

| Gene | Price | MP | Copies (3p) | Copies (4p) | Effect |
|---|---|---|---|---|---|
| **INTELLIGENCE** | 2 | 3 | 1 | 2 | No in-game effect ("useless in the soup") but helps with Advancement (counts as a gene card). |
| **MOVEMENT I** | 3 | 2 | 2 | 2 | In Phase 1, the player rolls **2 dice** instead of one and chooses the direction indicated by **either** die. Movement cost unchanged. |
| **SPORES** | 3 | 3 | 1 | 1 | During Cell Division (Phase 4), the new amoeba may be placed on **any** space that doesn't already hold an amoeba of that color (ignores adjacency). |
| **SPEED** | 4 | 3 | 1 | 2 | In Phase 1, amoebas may **move twice**. The second movement begins where the first ended and costs **no extra BP**. Roll a die for the second move's direction (with MOVEMENT I, roll 2 dice; with MOVEMENT II, choose direction). An amoeba **cannot Drift twice** nor mix Drifting with Movement: pay for the first Movement normally, then make the second. The amoeba **feeds only once**, after its complete movement. |
| **DEFENSE** | 4 | 4 | 1 | 1 | Attacks in Phase 1 or 5 can be converted into a **fight** by paying **1 BP**. Attacker and defender each roll a die; higher roll wins; reroll ties. If attacker wins, it eats the defender (do **not** replace with cubes). If defender wins, the **attacker starves**. |
| **ESCAPE** | 4 | 4 | 1 | 2 | An amoeba may try to **avoid an attack** in Phase 1 or 5 by **moving away**. Escaping amoebas may use **all** their movement genes (MOVEMENT I/II, SPEED, STREAMLINING, TENTACLE) even in Phase 5. This movement costs **1 BP**. |
| **SUBSTITUTION** | 4 | 4 | 1 | 1 | In Phase 1, the amoeba may eat **one less color**, but must then eat **one cube more** of the others. 4p: may eat 2:2:0 or 3:1:0 instead of 1:1:1. 3p: may eat 4 of one color. Excretion unchanged. |
| **RAY PROTECTION** | 5 | **−2** | 1 | 2 | Double protection against Gene Defects in Phase 2: (1) counts **−2** toward total Mutation Points, and (2) if given up, it balances a difference of **4**. **Counts as ZERO when calculating Advancement.** |
| **STREAMLINING** | 5 | 4 | 1 | 1 | **Movement (and ESCAPE) costs no BP.** |
| **TENTACLE** | 5 | 4 | 1 | 2 | While drifting or moving, each amoeba may **take up to 3 Foodstuff cubes with it** (only **2 cubes** in a 3-player game). |
| **HOLDING** | 5 | 4 | 1 | 1 | Two functions: (1) In Phase 1, amoebas may choose to **stay in the same space** rather than drift. (2) If an amoeba moves away from a space shared with a HOLDING amoeba, the HOLDING amoeba may **follow and move with it** (decided after the moving amoeba picks a direction). If the holding amoeba also has TENTACLE, it can drag cubes along after deciding to follow. |
| **LONGEVITY** | 5 | 5 | 1 | 2 | In Phase 5, amoebas only die if they have **3 DP** (instead of 2). |
| **FRUGALITY** | 6 | 5 | 0 | 1 | In Phase 1, amoebas eat **one less** Foodstuff cube. Excretion is normal. *(0 copies in 3-player game = not available.)* |
| **STRUGGLE FOR SURVIVAL** | 6 | 4 | 2 | 2 | In Phase 1, if there's insufficient food for an amoeba that would otherwise starve, it may **attack** another amoeba in the same space. Costs **1 BP** and is **always successful** unless the target has DEFENSE, ESCAPE, or ARMOR. On success, the target is **removed from the board**; the attacker eats but does **not** excrete normally — instead **one cube of each color** is placed in that space. **Only one attack per amoeba before it starves.** You may attack one of **your own** amoebas. |
| **PARASITISM** | 6 | 5 | 0 | 1 | In Phase 1, if an amoeba shares a space with another player's amoeba that still has BP, the parasite needs **1 less Foodstuff**, but the **owner of the other amoeba pays 1 BP to the bank**. No defense against PARASITISM. May parasitize even if enough food is available, **but you must eat to parasitize**. If multiple targets, the parasite's player chooses which to parasitize. *(0 copies in 3-player game = not available.)* |
| **DIVISION RATE** | 6 | 5 | 1 | 2 | In Phase 4, division costs only **4 BP** instead of 6. |

> **Alternative feeding genes** (FRUGALITY, SUBSTITUTION, PARASITISM) may, but need not, be used at any time. Their effects can combine, giving an amoeba multiple possible feeding methods (e.g., FRUGALITY + SUBSTITUTION yields combinations like 1:1:1, 2:2:0, 3:1:0, 1:1:0, 2:1:0, 3:0:0, plus more with PARASITISM).

---

## 8. Advanced Genes

Advanced Genes are bought by **giving up a specific basic Gene** AND paying the BP price.

**Purchase rules:**
- The basic Gene to be given up must have been possessed for **at least one full round** (cannot have been bought in the same phase). You cannot buy the basic and then immediately upgrade it in the same Phase 3.
- A player who already holds an Advanced Gene **cannot buy** the corresponding basic Gene.
- **Advanced Genes count as TWO cards** on the Advance Table (scoring).

| Advanced Gene | Price | Give Up | MP | Copies (3p) | Copies (4p) | Effect |
|---|---|---|---|---|---|---|
| **PERSISTENCE** | 4 | SPEED | 4 | 1 | 1 | Same capabilities as SPEED, **plus** allows players with STRUGGLE FOR SURVIVAL, DEFENSE, and AGGRESSION to make a **second, free attempt** to use those genes if the first attempt fails. |
| **MOVEMENT II** | 5 | MOVEMENT I | 5 | 1 | 2 | In Phase 1, amoebas may **choose the direction** of movement rather than rolling dice. |
| **AGGRESSION** | 5 | STRUGGLE FOR SURVIVAL | 5 | 1 | 1 | Same capabilities as STRUGGLE FOR SURVIVAL, **plus** during Phase 5, **after natural deaths**, one amoeba of **another player** in the same space as the AGGRESSION amoeba may be **killed by paying 1 BP**. The dead amoeba is replaced by **2 Foodstuff cubes of each color**. Usable **once per round** (not once per amoeba). Targets with **ARMOR** are not killed but **take 1 DP**. |
| **ARMOR** | 6 | DEFENSE **or** ESCAPE | 6 | 1 | 1 | Protects in Phase 1 and Phase 5 from enemy STRUGGLE FOR SURVIVAL or AGGRESSION. In Phase 1, an armored amoeba **may not be attacked**. In Phase 5, an armored amoeba attacked by AGGRESSION **survives but takes 1 DP** (which may later cause a natural death). |

---

## 9. Combat & Interaction Summary

This section consolidates how attacks, fights, and defenses interact across the relevant genes.

### Attack sources
- **STRUGGLE FOR SURVIVAL (Phase 1):** a starving amoeba attacks a co-located amoeba; 1 BP; always succeeds unless target has DEFENSE, ESCAPE, or ARMOR. Once per amoeba per round.
- **AGGRESSION (Phase 5, after natural deaths):** kill a co-located enemy amoeba by paying 1 BP; once per **round** (not per amoeba); ARMOR target survives but takes 1 DP.

### Defenses
- **DEFENSE:** convert an attack (Phase 1 or 5) into a die-roll fight by paying 1 BP. Higher roll wins; reroll ties. Attacker wins → eats defender (no cube replacement). Defender wins → attacker starves.
- **ESCAPE:** move away to avoid an attack (Phase 1 or 5), paying 1 BP, using any movement genes (even in Phase 5).
- **ARMOR:** cannot be attacked in Phase 1; in Phase 5 survives AGGRESSION but takes 1 DP.
- **DEFENSE + ESCAPE together:** if a player owns both, they may use both against the **same attack**, in **any order**, but each only **once**.
- **PERSISTENCE:** grants a free second attempt to use STRUGGLE FOR SURVIVAL, DEFENSE, or AGGRESSION if the first attempt fails.

### HOLDING vs ESCAPE interaction
- If an attacker has HOLDING and the victim tries to ESCAPE to another square: the **attack ends** (the attacker cannot attack a second time). However, in **Phase 1**, the attacker may still eat in the destination square if there are enough Foodstuff cubes there.

---

## 10. Clarifications & FAQ

These resolve edge cases and ambiguities. They take precedence where they clarify the base rules.

### Death ordering
- **Q:** In what order do players resolve amoeba deaths in Phase 5?
- **A:** **Descending Order.** (Missing from the rules text but present on the reference sheet.)

### Buying genes
- **Q:** Are genes drawn randomly from a pool?
- **A:** **No.** Any Gene not currently owned is available. On their turn (Phase 3) a player may look through the available Genes and purchase any they wish, subject to cost and restrictions.

### Gene Defects & RAY PROTECTION
- **Q:** A new Environment card shows Ozone Thickness 10. I have 14 MP of genes plus RAY PROTECTION (−2), bringing me to 12. Can I get rid of RAY PROTECTION to satisfy the defect?
- **A:** **Yes.** With RAY PROTECTION you're at 12 MP vs. Ozone 10, so you must balance **2 points**. Giving up RAY PROTECTION satisfies **4 points** — more than needed. You do **not** recalculate Mutation Points at this moment; you simply pay the difference that was locked in when the new Environment card was revealed.

### HOLDING vs ESCAPE
- **Q:** What happens when an attacker uses HOLDING when its victim tries to ESCAPE to another square?
- **A:** The **attack is ended** — the attacker cannot attack a second time. In Phase 1, the attacker can still eat in the destination square if there are enough Foodstuff cubes there.

### AGGRESSION + PERSISTENCE vs ARMOR
- **Q:** If an amoeba with AGGRESSION and PERSISTENCE (attacking in Phase 5 by paying 1 BP) attacks an amoeba with ARMOR, is that a successful attack?
- **A:** **Yes.** Even though the ARMORed amoeba isn't killed, it takes 1 DP from the attack, so the attack counts as successful.

### Surviving AGGRESSION + PERSISTENCE + HOLDING with ARMOR + ESCAPE
- **Q:** Can an amoeba with ARMOR and ESCAPE stay alive against an amoeba with AGGRESSION, PERSISTENCE, and HOLDING during Phase 5?
- **A:** **Yes**, it can survive in either of these ways:
  - When AGGRESSION is used, the defender uses ESCAPE to move away. The attacker may then use HOLDING to follow and PERSISTENCE to attack again, but the defender may again pay for ESCAPE.
  - Alternatively, if AGGRESSION succeeds, the attacked amoeba takes 1 DP (because of ARMOR) and **PERSISTENCE would not activate** (PERSISTENCE only grants a retry when the first attempt **fails**). Neither ESCAPE nor HOLDING would matter in this case.
  - **ARMOR only "kicks in" when ESCAPE fails** (the defender either didn't want to use it or couldn't pay the 1 BP).

### STRUGGLE FOR SURVIVAL "once per amoeba"
- **Q:** What does "You can only attack once per amoeba before you starve" mean?
- **A:** Each of your amoebas may use the STRUGGLE FOR SURVIVAL attack **once per round per amoeba**. Example: if one of your amoebas shares a space with two other amoebas, it may attack only **one** of them that round.

### AGGRESSION frequency
- **Q:** Can all my amoebas use AGGRESSION in Phase 5?
- **A:** **No.** AGGRESSION may be used only **once per round**, not once per amoeba.

### DEFENSE vs AGGRESSION (Phase 5)
- **Q:** In Phase 5, can a player DEFEND against AGGRESSION?
- **A:** **Yes.**
- **Q:** If the DEFENDer wins against AGGRESSION, does the attacker starve?
- **A:** **No.** AGGRESSION has nothing to do with feeding, so there is no starvation. (Contrast with Phase 1 DEFENSE outcomes, where a losing attacker starves.)

---

## 11. Implementation Notes & Edge Cases for the Developer

These are practical points to track when modeling the game state:

- **Player count branching:** Many values change with 3 vs 4 players — gene availability/copies (only "3"-marked cards in 3p), feeding requirements (1:1:1 in 4p vs single+double in 3p), TENTACLE carry capacity (3 cubes 4p / 2 cubes 3p), SUBSTITUTION combinations, cubes placed on death (8 vs 6), and starting-DP rules during setup.
- **Setup DP asymmetry:** First amoebas get 1 DP in a 4-player game but **0 DP** in a 3-player game; second amoebas never get a DP.
- **DP death thresholds:** Default death at 2 DP; LONGEVITY raises to 3 DP. ARMOR/AGGRESSION interactions can add DP that later triggers a natural death in a subsequent Phase 5.
- **Mutation Point math:** RAY PROTECTION is **−2** to the MP sum and counts as **0** for advancement; Advanced Genes count as **2 cards** for advancement. The defect difference is "locked in" at the moment the new Environment Card is revealed — do not recalculate mid-resolution.
- **Cube supply limits:** Track the finite cube pool. When replacements/excretions/death-cubes cannot be fully supplied, place as many as available and skip the rest (never substitute another color).
- **Movement validity:** A move into an obstacle is not carried out. Roll of 5 = stay; roll of 6 = free choice. STREAMLINING zeroes movement (and ESCAPE) cost. SPEED grants a second free move; the amoeba feeds only once after the full movement; cannot drift twice or mix drift with movement.
- **Phase ordering of attacks:** STRUGGLE FOR SURVIVAL resolves in Phase 1 (tied to starvation); AGGRESSION resolves in Phase 5 **after** natural deaths.
- **Gene purchase constraints:** No duplicates; Advanced Genes require possessing the prerequisite basic gene for at least one prior round, consume it on purchase, and lock out re-buying that basic gene afterward.
- **Turn-order direction per phase:** Phase 1 = Ascending; Phases 2, 3, 4, 5, 6 = Descending. Death resolution in Phase 5 is Descending (per FAQ).
- **Leapfrogging on the ladder:** Score markers never share a space; occupied spaces are skipped and not counted toward the advance distance.
- **Free/special placements in Phase 4:** Player with 0 amoebas places one free anywhere; player with exactly 1 amoeba may place a second anywhere at normal cost; otherwise the adjacency rule applies (or SPORES overrides adjacency).
- **Compass direction ambiguity:** The printed rules explicitly give 1=West, 2=North and abbreviate the rest with "etc." Standard Ursuppe mapping is 1=West, 2=North, 3=East, 4=South, 5=stay, 6=free choice. Confirm against the physical board art if available.

---

*Source material: Primordial Soup / Ursuppe rulebook, reference sheet, and FAQ. © 1997 Spiele von Doris & Frank; English version © 2004 Z-Man Games, Inc. This specification is a functional summary for personal implementation use.*
