// The desktop client: renders the full game state and lets a seat take a turn purely from
// legalActions (architecture §12). Intents up, state down — after sending, we wait for the
// next authoritative snapshot.

import type { GameConnection } from './connection.js';
import { useConnection } from './useConnection.js';
import { StatusStrip } from './components/StatusStrip.js';
import { Board } from './components/Board.js';
import { PlayerPanel } from './components/PlayerPanel.js';
import { ActionBar } from './components/ActionBar.js';
import { EnvCardView, Ladder } from './components/Sidebar.js';

export function App(props: { conn: GameConnection }): JSX.Element {
  const { conn } = props;
  const s = useConnection(conn);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ marginTop: 0 }}>Primordial Soup</h1>
      <StatusStrip you={s.you} game={s.game} status={s.status} />
      {s.lastError && <p style={{ color: 'crimson' }}>Rejected: {s.lastError}</p>}

      {!s.game ? (
        <p>Loading game…</p>
      ) : (
        <div style={{ display: 'flex', gap: 16, marginTop: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Board game={s.game} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 240 }}>
            <EnvCardView game={s.game} />
            <Ladder game={s.game} />
            <PlayerPanel game={s.game} you={s.you} />
          </div>
          <div style={{ flexBasis: '100%' }}>
            <ActionBar game={s.game} you={s.you} legalActions={s.legalActions} onAct={(a) => conn.sendIntent(a)} />
          </div>
        </div>
      )}
    </div>
  );
}
