import { useSyncExternalStore } from 'react';
import type { ClientState, GameConnection } from './connection.js';

export function useConnection(conn: GameConnection): ClientState {
  return useSyncExternalStore(conn.subscribe, conn.getState);
}
