// UAT policy: a parameterized action chooser. Forked from test/auto-driver.ts but driven by
// a per-game GamePlan that assigns each seat its buy list and steering hints, so a game can
// be aimed at exercising specific genes (movement-gene events, feeding combos, division
// placement, and combat responses). It always returns a legal action (falling back to the
// first legal one) so the harness never wedges.

import type { Color, GameAction, GameState, GeneId, PlayerId } from '@ps/shared';
import { geneDef, playerCountConfig } from '@ps/shared';
import { legalActions, type Rng } from '@ps/engine';

/** Per-seat steering for a game. All fields optional; sensible defaults per plan style. */
export interface SeatPlan {
  /** Ordered gene buy list (seeded/"real" games). Advanced genes are bought as upgrades
   *  automatically once their prerequisite has been held a prior round. */
  buy?: GeneId[];
  /** Phase-1 amoeba action preference. Default: 'move' in real games, 'drift' in scripted. */
  phase1?: 'drift' | 'stay' | 'move' | 'moveCarry';
  /** Feeding preference. 'sub4' picks the SUBSTITUTION 4-of-one-color combo when offered. */
  feed?: 'sub4' | 'default';
  /** Division preference. 'spores' places onto a non-adjacent cell; 'normal' divides greedily. */
  divide?: 'spores' | 'normal' | 'none';
  /** Whether to press an offered attack (struggle/aggression). Default true. */
  attack?: boolean;
  /** How this seat responds when it is the defender of an attack. Default 'none'. */
  respond?: 'defense' | 'escape' | 'none';
}

export interface GamePlan {
  id: string;
  description: string;
  /** Genes this game is designed to cover (for reporting / re-targeting). */
  targets: GeneId[];
  /** 'real' drives a full seeded game (movement, opportunistic buying); 'scripted' drives a
   *  crafted state with a scripted RNG, drifting by default to avoid stray die rolls. */
  style: 'real' | 'scripted';
  /** Build the initial state and the RNG that drives this game. */
  build: () => { state: GameState; rng: Rng };
  seats: Record<PlayerId, SeatPlan>;
}

function giveUpValue(gene: GeneId): number {
  return gene === 'RAY_PROTECTION' ? 4 : geneDef(gene).mutationPoints;
}

function pickCarry(state: GameState, seat: PlayerId, cellId: string): Partial<Record<Color, number>> {
  const player = state.players[seat]!;
  const cap = playerCountConfig(state.playerCount).tentacleCapacity;
  const cubes = state.board[cellId]?.cubes ?? {};
  for (const color of state.colorsInPlay) {
    if (color === player.color) continue; // carry a foreign cube so the delta is unambiguous
    const have = cubes[color] ?? 0;
    if (have >= 1) return { [color]: Math.min(have, cap) };
  }
  return {};
}

function chooseAmoebaAction(state: GameState, seat: PlayerId, sp: SeatPlan, plan: GamePlan, legal: GameAction[]): GameAction {
  const player = state.players[seat]!;
  const pref = sp.phase1 ?? (plan.style === 'real' ? 'move' : 'drift');
  const cellId = (state.currentDecision!.context as { cellId: string }).cellId;

  if (pref === 'stay') {
    const stay = legal.find((a) => a.type === 'stay');
    if (stay) return stay;
  }
  if (pref === 'moveCarry') {
    const move = legal.find((a) => a.type === 'move');
    if (move) return { type: 'move', amoebaId: (move as Extract<GameAction, { type: 'move' }>).amoebaId, carry: pickCarry(state, seat, cellId) };
  }
  if (pref === 'move' || pref === 'moveCarry') {
    const move = legal.find((a) => a.type === 'move');
    if (move && (plan.style !== 'real' || player.bp >= 2)) return move;
  }
  return legal.find((a) => a.type === 'drift') ?? legal[0]!;
}

function chooseBuy(state: GameState, seat: PlayerId, sp: SeatPlan, plan: GamePlan, legal: GameAction[]): GameAction {
  const player = state.players[seat]!;
  for (const gene of sp.buy ?? []) {
    if (player.genes.includes(gene)) continue;
    const opt = legal.find((a) => a.type === 'buy_gene' && a.gene === gene);
    if (opt) return opt;
  }
  if (plan.style === 'real') {
    // Opportunistic: one affordable non-combat gene per visit, to make a real game richer.
    const bought = (state.currentDecision!.context as { boughtThisRound: GeneId[] }).boughtThisRound;
    if (bought.length === 0 && player.bp >= 6) {
      const buy = legal.find((a) => a.type === 'buy_gene' && !geneDef(a.gene).combatOnly);
      if (buy) return buy;
    }
  }
  return { type: 'pass_buying' };
}

function chooseDivide(state: GameState, seat: PlayerId, sp: SeatPlan, plan: GamePlan, legal: GameAction[]): GameAction {
  const mode = sp.divide ?? (plan.style === 'real' ? 'normal' : 'none');
  const player = state.players[seat]!;
  const onBoard = player.amoebas.filter((a) => a.location !== null).length;
  const divides = legal.filter((a): a is Extract<GameAction, { type: 'divide' }> => a.type === 'divide');

  if (mode === 'spores') {
    // A cell with no same-color neighbour proves SPORES (illegal without it once 2+ on board).
    const far = divides.find((a) => {
      return !player.amoebas.some((am) => am.location !== null && areNeighbors(am.location, a.cellId));
    });
    if (far) return far;
  }
  if ((mode === 'normal' || mode === 'spores') && divides[0]) {
    if (plan.style === 'real' ? onBoard < 4 : onBoard < 7) return divides[0];
  }
  return { type: 'pass_division' };
}

function areNeighbors(a: string, b: string): boolean {
  const [ac, ar] = a.split(',').map(Number);
  const [bc, br] = b.split(',').map(Number);
  return Math.abs(ac! - bc!) + Math.abs(ar! - br!) === 1;
}

function balanceDefect(state: GameState, seat: PlayerId): GameAction {
  const player = state.players[seat]!;
  const excess = (state.currentDecision!.context as { excessMp: number }).excessMp;
  if (player.bp >= excess) return { type: 'balance_defect', giveUp: [], payBp: excess };
  const giveUp: GeneId[] = [];
  let covered = 0;
  for (const g of player.genes) {
    if (covered >= excess) break;
    giveUp.push(g);
    covered += giveUpValue(g);
  }
  return { type: 'balance_defect', giveUp, payBp: 0 };
}

/** Resolve the current decision under the game plan; always returns a legal action. */
export function chooseAction(state: GameState, plan: GamePlan): GameAction {
  const decision = state.currentDecision!;
  const seat = decision.seat;
  const sp = plan.seats[seat] ?? {};
  const legal = legalActions(state);
  if (legal.length === 0) throw new Error(`no legal actions for ${decision.kind} (seat ${seat})`);

  switch (decision.kind) {
    case 'place_starting_amoeba':
      return legal[0]!;

    case 'amoeba_action':
      return chooseAmoebaAction(state, seat, sp, plan, legal);

    case 'choose_move_direction':
      return legal[0]!;

    case 'amoeba_feed': {
      if (sp.feed === 'sub4') {
        const four = legal.find((a) => {
          if (a.type !== 'feed') return false;
          const entries = Object.entries(a.eat).filter(([, n]) => (n ?? 0) > 0);
          return entries.length === 1 && entries[0]![1] === 4;
        });
        if (four) return four;
      }
      return legal[0]!;
    }

    case 'balance_gene_defect':
      return balanceDefect(state, seat);

    case 'buy_genes':
      return chooseBuy(state, seat, sp, plan, legal);

    case 'divide_amoebas':
      return chooseDivide(state, seat, sp, plan, legal);

    case 'struggle_target': {
      if (sp.attack !== false) {
        const atk = legal.find((a) => a.type === 'struggle_attack');
        if (atk) return atk;
      }
      return legal.find((a) => a.type === 'feed') ?? legal[0]!;
    }

    case 'attack_response':
    case 'aggression_response': {
      const want = sp.respond === 'defense' ? 'respond_defense' : sp.respond === 'escape' ? 'respond_escape' : 'respond_none';
      return legal.find((a) => a.type === want) ?? legal.find((a) => a.type === 'respond_none') ?? legal[0]!;
    }

    case 'aggression_target': {
      if (sp.attack !== false) {
        const atk = legal.find((a) => a.type === 'aggression_attack');
        if (atk) return atk;
      }
      return legal.find((a) => a.type === 'aggression_pass') ?? legal[0]!;
    }

    default:
      return legal[0]!;
  }
}
