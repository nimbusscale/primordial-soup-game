// Game creation & join-link flow (architecture §9). Creating a game IS starting it: the
// active initial state is built, colors are assigned, first-round play order is resolved
// with the seeded RNG, and one unguessable token (a join link) is issued per seat.

import { randomBytes, randomInt } from 'node:crypto';
import type { CreateGameResponse, SeatInfo } from '@ps/shared';
import { createInitialState, makeSeededRng } from '@ps/engine';
import type { GameRecord, GameStore } from './gameStore.js';

function randomToken(): string {
  return randomBytes(24).toString('hex'); // long, unguessable bearer token for a seat
}

function randomGameId(): string {
  return randomBytes(8).toString('hex');
}

export interface CreateGameOptions {
  playerCount: number;
  variant?: 'standard';
  baseUrl: string; // PUBLIC_BASE_URL, used to build join links
  seed?: number; // optional override for debugging/tests
}

export async function createGame(
  store: GameStore,
  opts: CreateGameOptions,
): Promise<CreateGameResponse> {
  const seed = opts.seed ?? randomInt(0, 2 ** 31);
  const rng = makeSeededRng(seed);
  const state = createInitialState({ playerCount: opts.playerCount, variant: opts.variant ?? 'standard' }, rng);

  const gameId = randomGameId();
  const tokens: Record<string, string> = {};
  const seats: SeatInfo[] = [];
  for (const seat of state.seatOrder) {
    const token = randomToken();
    tokens[seat] = token;
    seats.push({
      playerId: seat,
      color: state.players[seat]!.color,
      link: `${opts.baseUrl}/play?g=${gameId}&t=${token}`,
    });
  }

  const record: GameRecord = {
    gameId,
    state,
    tokens,
    rngSeed: seed,
    rngCursor: rng.cursor,
    createdAt: Date.now(),
    playerCount: opts.playerCount,
    variant: opts.variant ?? 'standard',
  };
  await store.create(record);
  return { gameId, seats };
}
