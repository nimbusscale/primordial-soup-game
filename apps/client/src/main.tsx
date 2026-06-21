// Entry point. Reads g (gameId) and t (token) from /play?g=…&t=…, opens the WebSocket,
// and renders. Reopening the link simply re-runs this and reloads the current snapshot.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameConnection, wsUrlForLocation } from './connection.js';
import { App } from './App.js';

const params = new URLSearchParams(window.location.search);
const gameId = params.get('g');
const token = params.get('t');
const root = createRoot(document.getElementById('root')!);

if (!gameId || !token) {
  root.render(
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h1>Primordial Soup</h1>
      <p>Missing game link. Open your seat link: <code>/play?g=&lt;gameId&gt;&amp;t=&lt;token&gt;</code>.</p>
    </div>,
  );
} else {
  const conn = new GameConnection(gameId, token, wsUrlForLocation(window.location));
  conn.connect();
  root.render(
    <StrictMode>
      <App conn={conn} />
    </StrictMode>,
  );
}
