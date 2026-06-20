// Global numeric constants derived from the rules spec (docs/game-spec.md).

export const GRID_SIZE = 5; // 5×5
export const ISLAND_CELL = '2,2'; // center island/Compass — out of bounds
export const PLAYABLE_CELL_COUNT = 24; // 25 cells minus the island

export const CUBES_PER_COLOR_TOTAL = 55; // global supply per color
export const SETUP_CUBES_PER_CELL_PER_COLOR = 2; // every cell starts with 2 of each in-play color

export const STARTING_BP = 4; // each player starts with 4 BP (spec §4)
export const DIVISION_BP_GRANT = 10; // +10 BP at the start of Phase 4 (spec §6 Phase 4)
export const DIVISION_COST = 6; // BP per new amoeba
export const DIVISION_COST_DISCOUNTED = 4; // with DIVISION RATE
export const MOVE_COST_BP = 1; // uncoordinated move (spec §6 Phase 1)

export const FEED_FOOD_COUNT = 3; // an amoeba eats 3 cubes per turn (spec §6 Phase 1)
export const EXCRETION_CUBES = 2; // +2 of the eater's own color on a successful feed
export const STARVE_DP = 1; // 1 DP gained on starvation

export const DEATH_DP_DEFAULT = 2; // unmutated amoeba dies at 2+ DP
export const DEATH_DP_LONGEVITY = 3; // LONGEVITY raises the threshold to 3
export const DEATH_CUBES_PER_COLOR = 2; // a dead amoeba is replaced by 2 cubes of each in-play color

export const LADDER_MAX = 50;
export const FINISH_ZONE_START = 41; // the final 10 spaces (41..50)

export const MAX_AMOEBAS_PER_PLAYER = 7;
