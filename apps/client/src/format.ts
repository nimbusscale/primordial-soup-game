// Human-readable labels for actions and small display helpers. The client renders
// affordances purely from legalActions; these helpers only format them.

import type { Color, GameAction } from '@ps/shared';

export const COLOR_HEX: Record<Color, string> = {
  red: '#d62828',
  green: '#2a9d3f',
  blue: '#1d6fd6',
  yellow: '#e0b000',
};

function cubeList(map: Partial<Record<Color, number>>): string {
  const parts = Object.entries(map)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([c, n]) => `${n} ${c}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

export function formatAction(a: GameAction): string {
  switch (a.type) {
    case 'place_starting_amoeba':
      return `Place amoeba ${a.amoebaId} → ${a.cellId}`;
    case 'drift':
      return `Drift amoeba ${a.amoebaId}`;
    case 'stay':
      return `Stay (amoeba ${a.amoebaId})`;
    case 'move':
      return `Move amoeba ${a.amoebaId}${a.carry ? ` (carry ${cubeList(a.carry)})` : ''}`;
    case 'set_move_direction':
      return `Go ${a.direction}`;
    case 'feed':
      return `Eat ${cubeList(a.eat)}`;
    case 'balance_defect':
      return `Balance: pay ${a.payBp} BP${a.giveUp.length ? `, give up ${a.giveUp.join(', ')}` : ''}`;
    case 'buy_gene':
      return `Buy ${a.gene}${a.upgradeFrom ? ` (from ${a.upgradeFrom})` : ''}`;
    case 'pass_buying':
      return 'Done buying';
    case 'divide':
      return `Divide → ${a.cellId} (amoeba ${a.newAmoebaId})`;
    case 'pass_division':
      return 'Done dividing';
    case 'struggle_attack':
      return `Struggle: amoeba ${a.attackerId} attacks ${a.targetSeat} #${a.targetAmoebaId}`;
    case 'aggression_attack':
      return `Aggression: amoeba ${a.attackerId} attacks ${a.targetSeat} #${a.targetAmoebaId}`;
    case 'respond_defense':
      return 'Defend (fight)';
    case 'respond_escape':
      return `Escape${a.direction ? ` ${a.direction}` : ''}`;
    case 'respond_none':
      return 'Take the hit';
    case 'aggression_pass':
      return 'Skip aggression';
  }
}

export function decisionTitle(kind: string): string {
  const map: Record<string, string> = {
    place_starting_amoeba: 'Place a starting amoeba',
    amoeba_action: 'Move or drift this amoeba',
    amoeba_feed: 'Choose what to eat',
    choose_move_direction: 'Choose a direction',
    balance_gene_defect: 'Balance the gene defect',
    buy_genes: 'Buy genes',
    divide_amoebas: 'Divide amoebas',
    struggle_target: 'Choose an attack target',
    attack_response: 'Respond to the attack',
    aggression_target: 'Aggression (optional)',
    aggression_response: 'Respond to aggression',
  };
  return map[kind] ?? kind;
}
