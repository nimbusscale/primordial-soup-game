// Per-game connection management and the validate → reduce → broadcast loop
// (architecture §8). The server holds no rules logic: it orchestrates the engine.

import type { WebSocket } from 'ws';
import type { ClientMessage, GameEvent, GameState, PlayerId, ServerMessage } from '@ps/shared';
import { legalActions, makeSeededRng, reduce } from '@ps/engine';
import type { GameRecord, GameStore } from './gameStore.js';

interface Binding {
  gameId: string;
  seat: PlayerId;
}

export class SessionManager {
  private readonly sockets = new Map<string, Set<WebSocket>>(); // gameId → connected sockets
  private readonly bindings = new WeakMap<WebSocket, Binding>();

  constructor(private readonly store: GameStore) {}

  /** Attach message/close handlers to a freshly connected socket. */
  register(ws: WebSocket): void {
    ws.on('message', (data: unknown) => {
      void this.onMessage(ws, String(data));
    });
    ws.on('close', () => {
      void this.onClose(ws);
    });
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    ws.send(JSON.stringify(msg));
  }

  private snapshotFor(state: GameState, seat: PlayerId, events: GameEvent[]): ServerMessage {
    const yourTurn = state.currentDecision?.seat === seat;
    return { type: 'snapshot', state, you: seat, legalActions: yourTurn ? legalActions(state) : [], events };
  }

  private async onMessage(ws: WebSocket, raw: string): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      this.send(ws, { type: 'error', code: 'bad_json', message: 'message was not valid JSON' });
      return;
    }
    if (msg.type === 'join') await this.onJoin(ws, msg);
    else if (msg.type === 'intent') await this.onIntent(ws, msg);
    else this.send(ws, { type: 'error', code: 'bad_message', message: 'unknown message type' });
  }

  private async onJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>): Promise<void> {
    const record = await this.store.get(msg.gameId);
    if (!record) {
      this.send(ws, { type: 'error', code: 'no_game', message: `no such game: ${msg.gameId}` });
      return;
    }
    const seat = Object.keys(record.tokens).find((s) => record.tokens[s] === msg.token);
    if (!seat) {
      this.send(ws, { type: 'error', code: 'bad_token', message: 'invalid seat token' });
      return;
    }
    this.bindings.set(ws, { gameId: msg.gameId, seat });
    let set = this.sockets.get(msg.gameId);
    if (!set) {
      set = new Set();
      this.sockets.set(msg.gameId, set);
    }
    set.add(ws);

    record.state.players[seat]!.connected = true;
    await this.store.set(msg.gameId, record);

    this.send(ws, { type: 'welcome', you: seat, color: record.state.players[seat]!.color, gameId: msg.gameId });
    this.send(ws, this.snapshotFor(record.state, seat, []));
  }

  private async onIntent(ws: WebSocket, msg: Extract<ClientMessage, { type: 'intent' }>): Promise<void> {
    const binding = this.bindings.get(ws);
    if (!binding) {
      this.send(ws, { type: 'error', code: 'not_joined', message: 'send join before intent' });
      return;
    }
    const record = await this.store.get(binding.gameId);
    if (!record) {
      this.send(ws, { type: 'error', code: 'no_game', message: 'game no longer exists' });
      return;
    }

    // Confirm it is this seat's current decision before touching the engine.
    if (record.state.currentDecision?.seat !== binding.seat) {
      this.send(ws, { type: 'reject', reason: 'it is not your turn', action: msg.action });
      return;
    }

    const rng = makeSeededRng(record.rngSeed, record.rngCursor);
    const result = reduce(record.state, msg.action, rng);
    if (!result.ok) {
      this.send(ws, { type: 'reject', reason: result.reason, action: msg.action });
      return;
    }

    record.state = result.state;
    record.rngCursor = rng.cursor;
    await this.store.set(binding.gameId, record);
    this.broadcast(binding.gameId, result.state, result.events);
  }

  private broadcast(gameId: string, state: GameState, events: GameEvent[]): void {
    const set = this.sockets.get(gameId);
    if (!set) return;
    for (const ws of set) {
      const binding = this.bindings.get(ws);
      if (binding) this.send(ws, this.snapshotFor(state, binding.seat, events));
    }
  }

  private async onClose(ws: WebSocket): Promise<void> {
    const binding = this.bindings.get(ws);
    if (!binding) return;
    this.sockets.get(binding.gameId)?.delete(ws);
    const record = await this.store.get(binding.gameId);
    if (record && record.state.players[binding.seat]) {
      record.state.players[binding.seat]!.connected = false;
      await this.store.set(binding.gameId, record);
    }
  }
}
