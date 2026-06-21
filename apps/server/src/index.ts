// Server bootstrap: HTTP lobby (POST /api/games), static client serving, and the WS
// endpoint (GET /ws upgrade). Serves the built client + WebSocket on one port (architecture
// §4, §15). The server holds no rules logic; it orchestrates the engine via SessionManager.

import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import type { CreateGameRequest } from '@ps/shared';
import { InMemoryGameStore, type GameStore } from './gameStore.js';
import { createGame } from './lobby.js';
import { SessionManager } from './session.js';

export interface ServerOptions {
  store?: GameStore;
  baseUrl?: string;
  clientDist?: string; // directory of built client assets (M16); optional in dev
}

export interface RunningServer {
  httpServer: Server;
  store: GameStore;
  sessions: SessionManager;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(json);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const PLACEHOLDER_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Primordial Soup</title></head>
<body><h1>Primordial Soup server</h1><p>The React client is served here once built (M13/M16).</p></body></html>`;

export function createServer(opts: ServerOptions = {}): RunningServer {
  const store = opts.store ?? new InMemoryGameStore();
  const sessions = new SessionManager(store);
  const clientDist = opts.clientDist;

  const httpServer = createHttpServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      sendJson(res, 500, { error: String(err) });
    });
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const baseUrl = opts.baseUrl ?? `http://${req.headers.host ?? 'localhost'}`;

    if (req.method === 'POST' && url.pathname === '/api/games') {
      const raw = await readBody(req);
      let body: CreateGameRequest & { seed?: number };
      try {
        body = raw ? (JSON.parse(raw) as CreateGameRequest & { seed?: number }) : ({} as never);
      } catch {
        sendJson(res, 400, { error: 'invalid JSON body' });
        return;
      }
      if (body.playerCount !== 3 && body.playerCount !== 4) {
        sendJson(res, 400, { error: 'playerCount must be 3 or 4' });
        return;
      }
      const response = await createGame(store, {
        playerCount: body.playerCount,
        variant: body.variant,
        baseUrl,
        ...(body.seed !== undefined ? { seed: body.seed } : {}),
      });
      sendJson(res, 201, response);
      return;
    }

    // Static client (built assets in M16) or a placeholder in dev.
    if (req.method === 'GET') {
      if (clientDist) {
        const path = url.pathname === '/' || url.pathname === '/play' ? '/index.html' : url.pathname;
        const file = join(clientDist, path);
        if (existsSync(file)) {
          const ext = file.split('.').pop() ?? '';
          const type =
            ext === 'html' ? 'text/html' : ext === 'js' ? 'text/javascript' : ext === 'css' ? 'text/css' : 'application/octet-stream';
          res.writeHead(200, { 'content-type': type });
          res.end(readFileSync(file));
          return;
        }
        // SPA fallback to index.html
        const index = join(clientDist, 'index.html');
        if (existsSync(index)) {
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(readFileSync(index));
          return;
        }
      }
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(PLACEHOLDER_HTML);
      return;
    }

    res.writeHead(404);
    res.end('not found');
  }

  // WebSocket endpoint at /ws.
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sessions.register(ws);
    });
  });

  return { httpServer, store, sessions };
}

// Entry point when run directly (tsx/node).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  const baseUrl = process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`;
  const clientDist = process.env.CLIENT_DIST;
  const { httpServer } = createServer({ baseUrl, ...(clientDist ? { clientDist } : {}) });
  httpServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Primordial Soup server listening on ${baseUrl} (ws at ${baseUrl.replace(/^http/, 'ws')}/ws)`);
  });
}
