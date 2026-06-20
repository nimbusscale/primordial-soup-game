// The injected randomness source (architecture §13). The engine NEVER uses Math.random
// or Date.now; all randomness flows through an Rng. Two implementations:
//   - makeSeededRng:   a deterministic PRNG for production and integration scenarios.
//   - makeScriptedRng: returns scripted die faces, for human-readable golden scenarios.
// The seed and draw cursor live in the server-side GameRecord, never in GameState.

export interface Rng {
  /** Uniform die face 1..6. */
  rollDie(): number;
  /** Uniform integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
  /** Number of raw draws taken so far (for server-side persistence/replay). */
  readonly cursor: number;
}

// mulberry32 — a small, fast, deterministic PRNG. Math.imul is pure arithmetic
// (not Math.random), so this keeps the engine deterministic and reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic seeded RNG. Pass `startCursor` to fast-forward past draws already
 * consumed (so the server can reconstruct an RNG from persisted seed + cursor).
 */
export function makeSeededRng(seed: number, startCursor = 0): Rng {
  const next = mulberry32(seed);
  let cursor = 0;
  // Fast-forward to the persisted cursor.
  for (let i = 0; i < startCursor; i++) next();
  cursor = startCursor;
  const draw = (): number => {
    cursor++;
    return next();
  };
  return {
    rollDie: () => 1 + Math.floor(draw() * 6),
    nextInt: (maxExclusive: number) => {
      if (maxExclusive <= 0) throw new Error('nextInt requires maxExclusive > 0');
      return Math.floor(draw() * maxExclusive);
    },
    get cursor() {
      return cursor;
    },
  };
}

/**
 * An RNG that returns scripted die faces in order (validation-scenarios.md `{rolls}`).
 * `nextInt` is not scripted (scenarios that need ordering use a seed instead).
 */
export function makeScriptedRng(rolls: readonly number[]): Rng {
  const queue = [...rolls];
  let cursor = 0;
  return {
    rollDie: () => {
      const r = queue.shift();
      if (r === undefined) throw new Error('scripted RNG exhausted: no more rolls');
      if (r < 1 || r > 6) throw new Error(`scripted roll out of range: ${r}`);
      cursor++;
      return r;
    },
    nextInt: () => {
      throw new Error('scripted RNG does not support nextInt; use a seeded RNG');
    },
    get cursor() {
      return cursor;
    },
  };
}
