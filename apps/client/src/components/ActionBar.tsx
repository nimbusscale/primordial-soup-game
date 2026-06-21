// Affordances rendered ONLY from the snapshot's legalActions (architecture §12): each is a
// fully-specified GameAction the engine offered, shown as a button that sends the intent.

import type { GameAction, GameState, PlayerId } from '@ps/shared';
import { decisionTitle, formatAction } from '../format.js';

export function ActionBar(props: {
  game: GameState;
  you: PlayerId | null;
  legalActions: GameAction[];
  onAct: (action: GameAction) => void;
}): JSX.Element {
  const { game, you, legalActions, onAct } = props;
  const decision = game.currentDecision;
  const yourTurn = decision?.seat === you && legalActions.length > 0;

  if (game.phase === 'game_over') {
    return <div style={barStyle}><strong>Game over.</strong> Winner: {game.winner}</div>;
  }
  if (!yourTurn) {
    return <div style={barStyle}>Waiting{decision ? ` on ${decision.seat}` : ''}…</div>;
  }

  return (
    <div style={barStyle}>
      <div style={{ marginBottom: 6 }}>
        <strong>{decisionTitle(decision!.kind)}</strong>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {legalActions.map((action, i) => (
          <button key={i} onClick={() => onAct(action)} style={{ padding: '4px 8px', cursor: 'pointer' }}>
            {formatAction(action)}
          </button>
        ))}
      </div>
    </div>
  );
}

const barStyle = { border: '1px solid #ddd', borderRadius: 6, padding: 10, marginTop: 10 } as const;
