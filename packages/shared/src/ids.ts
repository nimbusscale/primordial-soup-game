// Identifiers and enums. Mirrors docs/state-model-and-protocol.md §2.

export type PlayerId = string; // stable seat id, e.g. "seat-0" … "seat-3"
export type Color = 'red' | 'green' | 'blue' | 'yellow';
export type CellId = string; // "col,row", e.g. "1,3"; the island "2,2" is never a CellId
export type AmoebaId = number; // 1..7, unique within a player
export type GeneId = string; // matches gene names in the rules spec, e.g. "DEFENSE", "MOVEMENT_I"
export type EnvCardId = string; // "env-01" … "env-11"
export type Direction = 'N' | 'S' | 'E' | 'W';

export type Phase =
  | 'setup'
  | 'phase1_movement_feeding'
  | 'phase2_environment'
  | 'phase3_genes'
  | 'phase4_division'
  | 'phase5_deaths'
  | 'phase6_scoring'
  | 'game_over';

export const ALL_COLORS: readonly Color[] = ['red', 'green', 'blue', 'yellow'];
export const ALL_DIRECTIONS: readonly Direction[] = ['N', 'S', 'E', 'W'];
