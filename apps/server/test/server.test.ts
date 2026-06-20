import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { CreateGameResponse, GameAction, ServerMessage } from '@ps/shared';
import { createServer, type RunningServer } from '../src/index.js';
import type { GameStore } from '../src/gameStore.js';

let running: RunningServer;
let store: GameStore;
let port: number;

beforeAll(async () => {
  running = createServer();
  store = running.store;
  await new Promise<void>((resolve) => running.httpServer.listen(0, resolve));
  port = (running.httpServer.address() as AddressInfo).port;
});

afterAll(() => {
  running.httpServer.close();
});

function base(): string {
  return `http://localhost:${port}`;
}

async function postCreate(playerCount: number, seed?: number): Promise<CreateGameResponse> {
  const res = await fetch(`${base()}/api/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerCount, seed }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as CreateGameResponse;
}

interface Client {
  send(msg: unknown): void;
  next(): Promise<ServerMessage>;
  close(): void;
}

function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('t')!;
}

function openClient(): Promise<Client> {
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const queue: ServerMessage[] = [];
  const waiters: Array<(m: ServerMessage) => void> = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d)) as ServerMessage;
    const w = waiters.shift();
    if (w) w(m);
    else queue.push(m);
  });
  return new Promise<Client>((resolve, reject) => {
    ws.on('open', () =>
      resolve({
        send: (msg) => ws.send(JSON.stringify(msg)),
        next: () =>
          new Promise<ServerMessage>((res) => {
            const m = queue.shift();
            if (m) res(m);
            else waiters.push(res);
          }),
        close: () => ws.close(),
      }),
    );
    ws.on('error', reject);
  });
}

describe('M11 — server loop', () => {
  it('POST /api/games returns a gameId and one link per seat; game is active', async () => {
    const created = await postCreate(3, 7);
    expect(typeof created.gameId).toBe('string');
    expect(created.seats).toHaveLength(3);
    for (const seat of created.seats) {
      expect(seat.link).toContain(`g=${created.gameId}`);
      expect(seat.link).toContain('t=');
    }
    const record = await store.get(created.gameId);
    expect(record).toBeDefined();
    expect(record!.state.phase).toBe('setup');
    expect(record!.state.currentDecision?.kind).toBe('place_starting_amoeba');
  });

  it('rejects a bad playerCount', async () => {
    const res = await fetch(`${base()}/api/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerCount: 2 }),
    });
    expect(res.status).toBe(400);
  });

  it('join handshake: valid token → welcome+snapshot; invalid token → error', async () => {
    const created = await postCreate(3, 11);
    const seat0 = created.seats[0]!;

    const good = await openClient();
    good.send({ type: 'join', gameId: created.gameId, token: tokenFromLink(seat0.link) });
    const welcome = await good.next();
    expect(welcome.type).toBe('welcome');
    const snap = await good.next();
    expect(snap.type).toBe('snapshot');
    good.close();

    const bad = await openClient();
    bad.send({ type: 'join', gameId: created.gameId, token: 'not-a-real-token' });
    const err = await bad.next();
    expect(err.type).toBe('error');
    if (err.type === 'error') expect(err.code).toBe('bad_token');
    bad.close();
  });

  it('intent loop: out-of-turn and illegal rejected; legal broadcasts a snapshot', async () => {
    const created = await postCreate(3, 11);
    const clients: Client[] = [];
    const seatOf = new Map<Client, string>();
    const snapOf = new Map<Client, Extract<ServerMessage, { type: 'snapshot' }>>();

    for (const seat of created.seats) {
      const c = await openClient();
      c.send({ type: 'join', gameId: created.gameId, token: tokenFromLink(seat.link) });
      const welcome = await c.next();
      if (welcome.type === 'welcome') seatOf.set(c, welcome.you);
      const snap = await c.next();
      if (snap.type === 'snapshot') snapOf.set(c, snap);
      clients.push(c);
    }

    // The current actor is the client whose snapshot carries a non-empty legalActions.
    const current = clients.find((c) => (snapOf.get(c)!.legalActions.length ?? 0) > 0)!;
    const other = clients.find((c) => c !== current)!;
    expect(current).toBeDefined();

    // Out-of-turn intent from a non-current seat → reject to that sender only.
    const otherSnap = snapOf.get(other)!;
    expect(otherSnap.legalActions).toHaveLength(0);
    other.send({ type: 'intent', action: { type: 'place_starting_amoeba', amoebaId: 1, cellId: '0,0' } });
    const otherReply = await other.next();
    expect(otherReply.type).toBe('reject');

    // Illegal intent from the current seat (placing on the island) → reject.
    current.send({ type: 'intent', action: { type: 'place_starting_amoeba', amoebaId: 1, cellId: '2,2' } });
    const illegalReply = await current.next();
    expect(illegalReply.type).toBe('reject');

    // Legal placement → every connected client receives a broadcast snapshot.
    const legal = snapOf.get(current)!.legalActions[0] as GameAction;
    current.send({ type: 'intent', action: legal });
    const broadcasts = await Promise.all(clients.map((c) => c.next()));
    for (const b of broadcasts) expect(b.type).toBe('snapshot');
    // Exactly one client (the new current actor) has non-empty legalActions.
    const withMoves = broadcasts.filter((b) => b.type === 'snapshot' && b.legalActions.length > 0);
    expect(withMoves).toHaveLength(1);

    for (const c of clients) c.close();
  });
});
