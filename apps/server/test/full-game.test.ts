// M14 — a complete non-combat 3-player game played through the REAL server transport
// (HTTP create + three WebSocket seats), driven purely from the legalActions the client
// renders. Proves the engine + server + client-affordance loop reaches a winner with full
// round coverage (buy, division, death, scoring) — the MVP definition of done.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { CreateGameResponse, GameAction, GameState, PlayerId, ServerMessage } from '@ps/shared';
import { createServer, type RunningServer } from '../src/index.js';

let running: RunningServer;
let port: number;

beforeAll(async () => {
  running = createServer();
  await new Promise<void>((resolve) => running.httpServer.listen(0, resolve));
  port = (running.httpServer.address() as AddressInfo).port;
});
afterAll(() => {
  running.httpServer.close();
});

interface Client {
  you: PlayerId;
  latest: Extract<ServerMessage, { type: 'snapshot' }>;
  send(msg: unknown): void;
  next(): Promise<ServerMessage>;
  close(): void;
}

function open(): Promise<Omit<Client, 'you' | 'latest'>> {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const queue: ServerMessage[] = [];
  const waiters: Array<(m: ServerMessage) => void> = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d)) as ServerMessage;
    const w = waiters.shift();
    if (w) w(m);
    else queue.push(m);
  });
  return new Promise((resolve, reject) => {
    ws.on('open', () =>
      resolve({
        send: (m) => ws.send(JSON.stringify(m)),
        next: () => new Promise<ServerMessage>((res) => { const m = queue.shift(); if (m) res(m); else waiters.push(res); }),
        close: () => ws.close(),
      }),
    );
    ws.on('error', reject);
  });
}

// The same affordance-driven policy the React client would follow, over snapshot data only.
function choose(state: GameState, legal: GameAction[], you: PlayerId): GameAction {
  const d = state.currentDecision!;
  const player = state.players[you]!;
  const find = (t: GameAction['type']) => legal.find((a) => a.type === t);
  switch (d.kind) {
    case 'amoeba_action': {
      const move = find('move');
      return move && player.bp >= 2 ? move : (find('drift') ?? legal[0]!);
    }
    case 'balance_gene_defect':
      return legal.find((a) => a.type === 'balance_defect' && a.giveUp.length === 0) ?? legal[0]!;
    case 'buy_genes': {
      const bought = (d.context as { boughtThisRound?: string[] }).boughtThisRound ?? [];
      if (bought.length === 0 && player.bp >= 6) { const buy = find('buy_gene'); if (buy) return buy; }
      return find('pass_buying') ?? legal[0]!;
    }
    case 'divide_amoebas': {
      const onBoard = player.amoebas.filter((a) => a.location !== null).length;
      if (onBoard < 4) { const div = find('divide'); if (div) return div; }
      return find('pass_division') ?? legal[0]!;
    }
    default:
      return legal[0]!;
  }
}

describe('M14 — playable full 3-player game over WS', () => {
  it('reaches game_over with a winner and full round coverage', async () => {
    const res = await fetch(`http://localhost:${port}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerCount: 3, seed: 4242 }),
    });
    const created = (await res.json()) as CreateGameResponse;

    const clients: Client[] = [];
    for (const seat of created.seats) {
      const raw = await open();
      raw.send({ type: 'join', gameId: created.gameId, token: new URL(seat.link).searchParams.get('t') });
      const welcome = await raw.next();
      const snap = await raw.next();
      if (welcome.type !== 'welcome' || snap.type !== 'snapshot') throw new Error('bad handshake');
      clients.push({ ...raw, you: welcome.you, latest: snap });
    }

    const checkpoints = { buy: false, division: false, death: false, scored: false };
    let steps = 0;
    while (!clients.some((c) => c.latest.state.phase === 'game_over')) {
      if (steps++ > 5000) throw new Error('game did not terminate');
      const current = clients.find((c) => c.latest.state.currentDecision?.seat === c.you && c.latest.legalActions.length > 0);
      if (!current) throw new Error('no actor with legal actions (stuck)');
      current.send({ type: 'intent', action: choose(current.latest.state, current.latest.legalActions, current.you) });
      const broadcasts = await Promise.all(clients.map((c) => c.next()));
      broadcasts.forEach((b, i) => {
        if (b.type === 'snapshot') clients[i]!.latest = b;
      });
      const events = broadcasts.find((b) => b.type === 'snapshot')?.type === 'snapshot' ? (broadcasts[0] as Extract<ServerMessage, { type: 'snapshot' }>).events : [];
      for (const e of events) {
        if (e.type === 'gene_bought') checkpoints.buy = true;
        if (e.type === 'divided') checkpoints.division = true;
        if (e.type === 'died' && e.cause === 'natural') checkpoints.death = true;
        if (e.type === 'scored') checkpoints.scored = true;
      }
    }

    const final = clients[0]!.latest.state;
    expect(final.phase).toBe('game_over');
    expect(final.winner).not.toBeNull();
    expect(final.seatOrder).toContain(final.winner);
    expect(checkpoints.buy).toBe(true);
    expect(checkpoints.division).toBe(true);
    expect(checkpoints.death).toBe(true);
    expect(checkpoints.scored).toBe(true);

    for (const c of clients) c.close();
  }, 20000);
});
