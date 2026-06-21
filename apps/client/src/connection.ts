// Client ↔ server WebSocket connection (architecture §10, §12). Intents up, state down: the
// client renders whatever snapshot the server sends and sends player intents. Reopening the
// link (refresh / new tab / dropped socket) re-presents the token and reloads the snapshot.

import type { Color, GameAction, GameState, PlayerId, ServerMessage } from '@ps/shared';

export interface ClientState {
  status: 'connecting' | 'open' | 'closed' | 'error';
  you: PlayerId | null;
  color: Color | null;
  game: GameState | null;
  legalActions: GameAction[];
  lastError: string | null;
}

const INITIAL: ClientState = {
  status: 'connecting',
  you: null,
  color: null,
  game: null,
  legalActions: [],
  lastError: null,
};

/** Build the WS URL for the current origin (works behind the dev proxy and in the container). */
export function wsUrlForLocation(loc: Location): string {
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${loc.host}/ws`;
}

export class GameConnection {
  private listeners = new Set<() => void>();
  private current: ClientState = INITIAL;
  private ws: WebSocket | null = null;

  constructor(
    private readonly gameId: string,
    private readonly token: string,
    private readonly wsUrl: string,
  ) {}

  connect(): void {
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      this.set({ status: 'open' });
      ws.send(JSON.stringify({ type: 'join', gameId: this.gameId, token: this.token }));
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)) as ServerMessage);
    ws.onclose = () => this.set({ status: 'closed' });
    ws.onerror = () => this.set({ status: 'error' });
  }

  private onMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'welcome':
        this.set({ you: msg.you, color: msg.color });
        break;
      case 'snapshot':
        this.set({ game: msg.state, legalActions: msg.legalActions, lastError: null });
        break;
      case 'reject':
        this.set({ lastError: msg.reason });
        break;
      case 'error':
        this.set({ status: 'error', lastError: msg.message });
        break;
    }
  }

  sendIntent(action: GameAction): void {
    this.ws?.send(JSON.stringify({ type: 'intent', action }));
  }

  // ── External store API (for useSyncExternalStore) ──
  getState = (): ClientState => this.current;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(partial: Partial<ClientState>): void {
    this.current = { ...this.current, ...partial };
    for (const l of this.listeners) l();
  }
}
