// M12 bare client: proves link → seat binding and snapshot rendering. The full board /
// panel UI lands in M13 (this file is expanded there); the status strip and intent sender
// are reused.

import type { GameConnection } from './connection.js';
import { useConnection } from './useConnection.js';
import { StatusStrip } from './components/StatusStrip.js';

export function App(props: { conn: GameConnection }): JSX.Element {
  const { conn } = props;
  const s = useConnection(conn);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>Primordial Soup</h1>
      <StatusStrip you={s.you} game={s.game} status={s.status} />
      {s.lastError && <p style={{ color: 'crimson' }}>Rejected: {s.lastError}</p>}
      {s.game && (
        <p>
          You are <strong>{s.you}</strong> (<span style={{ color: s.color ?? undefined }}>{s.color}</span>).
        </p>
      )}
      {s.legalActions.length > 0 && (
        <div>
          <h3>Your move</h3>
          {s.legalActions.map((action, i) => (
            <button key={i} style={{ marginRight: 6, marginBottom: 6 }} onClick={() => conn.sendIntent(action)}>
              {JSON.stringify(action)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
