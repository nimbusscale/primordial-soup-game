// @ps/engine — the pure, deterministic rules engine. Depends only on @ps/shared.

export { reduce } from './reduce.js';
export { legalActions } from './legal-actions.js';
export { createInitialState, setupPlacer } from './setup.js';
export { ascendingOrder, descendingOrder } from './turn-order.js';
export type { Rng } from './rng.js';
export { makeSeededRng, makeScriptedRng } from './rng.js';
export type { ReduceResult, SetupOptions } from './types.js';
