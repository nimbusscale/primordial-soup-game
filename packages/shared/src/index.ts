// @ps/shared — the contract package. Types and static config only (no behavior).
// Mirrors docs/state-model-and-protocol.md. Imported by the engine and both apps.

// Types (use `export type` for verbatimModuleSyntax).
export type {
  PlayerId,
  Color,
  CellId,
  AmoebaId,
  GeneId,
  EnvCardId,
  Direction,
  Phase,
} from './ids.js';
export { ALL_COLORS, ALL_DIRECTIONS } from './ids.js';

export type {
  Cell,
  Amoeba,
  PlayerState,
  EnvCard,
  GameState,
  CurrentDecision,
  DecisionKind,
  DecisionContext,
  PlaceStartingAmoebaContext,
  AmoebaActionContext,
  FeedContext,
  MoveDirectionContext,
  StruggleTargetContext,
  AttackResponseContext,
  DefectContext,
  BuyGenesContext,
  DivideAmoebasContext,
  AggressionTargetContext,
  AggressionResponseContext,
} from './state.js';
export { SCHEMA_VERSION } from './state.js';

export type { GameAction, GameActionType } from './actions.js';
export type { GameEvent, GameEventType } from './events.js';
export type {
  CreateGameRequest,
  CreateGameResponse,
  SeatInfo,
  ClientMessage,
  ServerMessage,
} from './messages.js';

// Static config (values, helper fns, and their types — GeneDef, PlayerCountConfig,
// CellCoord, CompassResult, etc. — all flow through these star re-exports).
export * from './config/index.js';
