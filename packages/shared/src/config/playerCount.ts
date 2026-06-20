// Player-count config table (protocol §3, spec §11). The 3p/4p differences the rules call
// out, read by the engine via playerCount so player count is data, not branching logic.

export interface PlayerCountConfig {
  playerCount: number;
  /** Ladder start spaces players choose markers on at setup (1..3 for 3p, 1..4 for 4p). */
  startSpaces: number[];
  /** Number of colors in play (one per seat). */
  colorCount: number;
  /** DP granted to each player's FIRST starting amoeba (0 in 3p, 1 in 4p — spec §4 / §11). */
  setupFirstAmoebaDp: number;
  /** DP granted to each player's SECOND starting amoeba (always 0). */
  setupSecondAmoebaDp: number;
  /** Max cubes a TENTACLE amoeba may carry while moving (2 in 3p, 3 in 4p). */
  tentacleCapacity: number;
  /** Cubes of EACH in-play color placed when an amoeba dies (2 each ⇒ 6 in 3p, 8 in 4p). */
  deathCubesPerColor: number;
}

export const PLAYER_COUNT_CONFIG: Readonly<Record<number, PlayerCountConfig>> = {
  3: {
    playerCount: 3,
    startSpaces: [1, 2, 3],
    colorCount: 3,
    setupFirstAmoebaDp: 0,
    setupSecondAmoebaDp: 0,
    tentacleCapacity: 2,
    deathCubesPerColor: 2,
  },
  4: {
    playerCount: 4,
    startSpaces: [1, 2, 3, 4],
    colorCount: 4,
    setupFirstAmoebaDp: 1,
    setupSecondAmoebaDp: 0,
    tentacleCapacity: 3,
    deathCubesPerColor: 2,
  },
};

export function playerCountConfig(playerCount: number): PlayerCountConfig {
  const cfg = PLAYER_COUNT_CONFIG[playerCount];
  if (!cfg) throw new Error(`unsupported player count: ${playerCount}`);
  return cfg;
}
