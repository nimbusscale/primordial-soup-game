// A deterministic auto-driver for the integration scenario (GAME-01). It resolves each
// currentDecision by choosing a legal action via a fixed policy, so a seeded game runs to
// completion identically every time. Not a bot heuristic (that is M18) — just enough to
// exercise the whole MVP loop headlessly.

import type { GameAction, GameEvent, GameState } from '@ps/shared';
import { geneDef } from '@ps/shared';
import { legalActions, reduce, type Rng } from '@ps/engine';

export interface DriveResult {
  finalState: GameState;
  events: GameEvent[];
  checkpoints: { sawBuy: boolean; sawDivision: boolean; sawDeath: boolean; sawScored: boolean; maxRound: number };
  steps: number;
}

function giveUpValue(gene: string): number {
  return gene === 'RAY_PROTECTION' ? 4 : geneDef(gene).mutationPoints;
}

/** Choose the action that resolves the current decision under a fixed, deterministic policy. */
function chooseAction(state: GameState): GameAction {
  const decision = state.currentDecision!;
  const seat = decision.seat;
  const player = state.players[seat]!;
  const legal = legalActions(state);

  switch (decision.kind) {
    case 'place_starting_amoeba':
      return legal[0]!; // first legal empty cell

    case 'amoeba_action': {
      // Move when we can spare BP (exercises movement); otherwise drift (free).
      const move = legal.find((a) => a.type === 'move');
      if (move && player.bp >= 2) return move;
      const drift = legal.find((a) => a.type === 'drift');
      return drift ?? legal[0]!;
    }

    case 'choose_move_direction':
      return legal[0]!; // first allowed direction

    case 'amoeba_feed':
      return legal[0]!; // first satisfiable combo (or the forced starve)

    case 'balance_gene_defect': {
      const excess = (decision.context as { excessMp: number }).excessMp;
      if (player.bp >= excess) return { type: 'balance_defect', giveUp: [], payBp: excess };
      // Greedily give up genes until the difference is covered (always possible).
      const giveUp: string[] = [];
      let covered = 0;
      for (const g of player.genes) {
        if (covered >= excess) break;
        giveUp.push(g);
        covered += giveUpValue(g);
      }
      return { type: 'balance_defect', giveUp, payBp: 0 };
    }

    case 'buy_genes': {
      const bought = (decision.context as { boughtThisRound: string[] }).boughtThisRound;
      // Buy one affordable NON-COMBAT gene per visit when BP is comfortable, else pass.
      // (Skipping combat genes keeps GAME-01 a deterministic non-combat game regardless of
      // whether combat is enabled.)
      if (bought.length === 0 && player.bp >= 6) {
        const buy = legal.find((a) => a.type === 'buy_gene' && !geneDef(a.gene).combatOnly);
        if (buy) return buy;
      }
      return { type: 'pass_buying' };
    }

    case 'divide_amoebas': {
      const onBoard = player.amoebas.filter((a) => a.location !== null).length;
      if (onBoard < 4) {
        const divide = legal.find((a) => a.type === 'divide');
        if (divide) return divide;
      }
      return { type: 'pass_division' };
    }

    default:
      // Unknown/unsupported decision kind: fall back to the first legal action if any.
      if (legal[0]) return legal[0];
      throw new Error(`auto-driver: no legal action for decision kind ${decision.kind}`);
  }
}

export function driveGame(initial: GameState, rng: Rng, maxSteps = 100000): DriveResult {
  let state = initial;
  const events: GameEvent[] = [];
  const checkpoints = { sawBuy: false, sawDivision: false, sawDeath: false, sawScored: false, maxRound: 0 };
  let steps = 0;

  while (state.phase !== 'game_over' && state.currentDecision) {
    if (steps++ > maxSteps) throw new Error('auto-driver exceeded maxSteps (non-terminating game?)');
    const action = chooseAction(state);
    const res = reduce(state, action, rng);
    if (!res.ok) throw new Error(`auto-driver action rejected: ${res.reason} (action ${JSON.stringify(action)})`);
    state = res.state;
    for (const e of res.events) {
      events.push(e);
      if (e.type === 'gene_bought') checkpoints.sawBuy = true;
      if (e.type === 'divided') checkpoints.sawDivision = true;
      if (e.type === 'died' && e.cause === 'natural') checkpoints.sawDeath = true;
      if (e.type === 'scored') checkpoints.sawScored = true;
    }
    checkpoints.maxRound = Math.max(checkpoints.maxRound, state.round);
  }

  return { finalState: state, events, checkpoints, steps };
}
