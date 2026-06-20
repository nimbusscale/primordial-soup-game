// Wire protocol message envelopes. Mirrors docs/state-model-and-protocol.md §8.

import type { GameAction } from './actions.js';
import type { GameEvent } from './events.js';
import type { Color, PlayerId } from './ids.js';
import type { GameState } from './state.js';

// ── HTTP creation ─────────────────────────────────────────────────────────────

export interface CreateGameRequest {
  playerCount: number;
  variant?: 'standard';
}

export interface SeatInfo {
  playerId: PlayerId;
  color: Color;
  link: string; // <PUBLIC_BASE_URL>/play?g=<gameId>&t=<seatToken>
}

export interface CreateGameResponse {
  gameId: string;
  seats: SeatInfo[]; // one link per seat, incl. the creator's
}

// ── Client → Server ───────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'join'; gameId: string; token: string } // first message after connecting
  | { type: 'intent'; action: GameAction }; // resolves the current decision

// ── Server → Client ───────────────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'welcome'; you: PlayerId; color: Color; gameId: string }
  | { type: 'snapshot'; state: GameState; you: PlayerId; legalActions: GameAction[]; events: GameEvent[] }
  | { type: 'reject'; reason: string; action: GameAction } // your intent was illegal; state unchanged
  | { type: 'error'; code: string; message: string }; // protocol error (bad token, no such game)
