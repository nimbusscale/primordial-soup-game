// The player panel: own BP, owned genes, and own amoebas with DP / location.

import type { GameState, PlayerId } from '@ps/shared';
import { COLOR_HEX } from '../format.js';

export function PlayerPanel(props: { game: GameState; you: PlayerId | null }): JSX.Element {
  const { game, you } = props;
  if (!you) return <div />;
  const p = game.players[you];
  if (!p) return <div />;
  const onBoard = p.amoebas.filter((a) => a.location !== null);
  const offBoard = p.amoebas.filter((a) => a.location === null);
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10, minWidth: 220 }}>
      <h3 style={{ margin: '0 0 6px' }}>
        You — <span style={{ color: COLOR_HEX[p.color] }}>{p.color}</span> ({you})
      </h3>
      <div>
        <strong>BP:</strong> {p.bp}
      </div>
      <div>
        <strong>Genes:</strong> {p.genes.length ? p.genes.join(', ') : '—'}
      </div>
      <div style={{ marginTop: 6 }}>
        <strong>Amoebas on board ({onBoard.length}):</strong>
        <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
          {onBoard.map((a) => (
            <li key={a.id}>
              #{a.id} @ {a.location} {a.dp > 0 ? `(DP ${a.dp})` : ''}
            </li>
          ))}
        </ul>
        <div style={{ color: '#888', fontSize: 12 }}>Off-board: {offBoard.map((a) => a.id).join(', ') || '—'}</div>
      </div>
    </div>
  );
}
