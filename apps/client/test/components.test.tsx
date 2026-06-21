import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameAction, GameState } from '@ps/shared';
import { Board } from '../src/components/Board.js';
import { PlayerPanel } from '../src/components/PlayerPanel.js';
import { ActionBar } from '../src/components/ActionBar.js';

// A compact but valid sample snapshot resting on an amoeba_action decision for seat-0.
function sample(): GameState {
  return {
    schemaVersion: 1,
    variant: 'standard',
    playerCount: 3,
    colorsInPlay: ['red', 'green', 'blue'],
    round: 1,
    phase: 'phase1_movement_feeding',
    board: {
      '1,1': { id: '1,1', col: 1, row: 1, cubes: { green: 2, blue: 1 } },
    },
    supply: { red: 7, green: 7, blue: 7, yellow: 0 },
    players: {
      'seat-0': {
        id: 'seat-0', color: 'red', kind: 'human', connected: true, bp: 4, genes: ['MOVEMENT_I'],
        amoebas: [{ id: 2, location: '1,1', dp: 1 }, { id: 1, location: null, dp: 0 }],
        score: 1,
      },
      'seat-1': { id: 'seat-1', color: 'green', kind: 'human', connected: false, bp: 4, genes: [], amoebas: [], score: 2 },
      'seat-2': { id: 'seat-2', color: 'blue', kind: 'human', connected: true, bp: 4, genes: [], amoebas: [], score: 3 },
    },
    seatOrder: ['seat-0', 'seat-1', 'seat-2'],
    turnOrder: ['seat-0', 'seat-1', 'seat-2'],
    environment: { current: { id: 'env-01', ozoneThickness: 10, drift: 'E' }, deckRemaining: ['env-02'], discarded: [] },
    currentDecision: { seat: 'seat-0', kind: 'amoeba_action', context: { amoebaId: 2, cellId: '1,1', driftDirection: 'E', moveCostBp: 1 } },
    winner: null,
  };
}

describe('M13 — client components render from a snapshot', () => {
  it('Board renders cube counts and amoebas with DP', () => {
    const html = renderToStaticMarkup(<Board game={sample()} />);
    expect(html).toContain('Island'); // the 2,2 island is drawn
    expect(html).toContain('1,1'); // cell coordinate label
    expect(html).toContain('2·1'); // amoeba 2 with DP 1
  });

  it('PlayerPanel shows BP, genes, and on-board amoebas', () => {
    const html = renderToStaticMarkup(<PlayerPanel game={sample()} you="seat-0" />);
    expect(html).toContain('BP:');
    expect(html).toContain('MOVEMENT_I');
    expect(html).toContain('#2 @ 1,1');
  });

  it('ActionBar offers exactly the actions in legalActions (and no others)', () => {
    const legal: GameAction[] = [
      { type: 'drift', amoebaId: 2 },
      { type: 'move', amoebaId: 2 },
    ];
    let acted: GameAction | null = null;
    const html = renderToStaticMarkup(
      <ActionBar game={sample()} you="seat-0" legalActions={legal} onAct={(a) => (acted = a)} />,
    );
    const buttonCount = (html.match(/<button/g) ?? []).length;
    expect(buttonCount).toBe(2); // one per legal action
    expect(html).toContain('Drift amoeba 2');
    expect(html).toContain('Move amoeba 2');
    expect(acted).toBeNull(); // nothing sent on render

    // A non-current seat sees only a waiting message (no action buttons).
    const waiting = renderToStaticMarkup(
      <ActionBar game={sample()} you="seat-1" legalActions={[]} onAct={() => {}} />,
    );
    expect((waiting.match(/<button/g) ?? []).length).toBe(0);
    expect(waiting).toContain('Waiting');
  });
});
