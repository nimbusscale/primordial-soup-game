// State ownership behind a persistence seam (architecture §11). v1 is an in-memory Map;
// Redis/SQL can drop in behind the same async interface with no engine/server changes.

import type { GameState, PlayerId } from '@ps/shared';

/** Server-side wrapper: the GameState plus lobby metadata (protocol §11). Never sent to clients. */
export interface GameRecord {
  gameId: string;
  state: GameState;
  tokens: Record<PlayerId, string>; // per-seat bearer tokens
  rngSeed: number;
  rngCursor: number; // draws consumed so far; lets us reconstruct the RNG deterministically
  createdAt: number;
  playerCount: number;
  variant: 'standard' | 'two_player_bots';
}

export interface GameStore {
  create(game: GameRecord): Promise<void>;
  get(gameId: string): Promise<GameRecord | undefined>;
  set(gameId: string, game: GameRecord): Promise<void>;
  delete(gameId: string): Promise<void>;
}

export class InMemoryGameStore implements GameStore {
  private readonly games = new Map<string, GameRecord>();

  async create(game: GameRecord): Promise<void> {
    this.games.set(game.gameId, game);
  }

  async get(gameId: string): Promise<GameRecord | undefined> {
    return this.games.get(gameId);
  }

  async set(gameId: string, game: GameRecord): Promise<void> {
    this.games.set(gameId, game);
  }

  async delete(gameId: string): Promise<void> {
    this.games.delete(gameId);
  }
}
