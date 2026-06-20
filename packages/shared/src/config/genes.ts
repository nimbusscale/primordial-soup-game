// Gene catalog (spec §7 Basic Genes, §8 Advanced Genes). Values come straight from
// the spec tables. Ownership and availability are dynamic (derived in the engine from
// this catalog + current ownership); this file is static data only.

import type { GeneId } from '../ids.js';

/** Coarse capability tags a gene grants. Used as documentation and engine dispatch hints. */
export type GeneEffectTag =
  | 'scoring_only' // INTELLIGENCE — no in-game effect
  | 'move_two_dice' // MOVEMENT I
  | 'move_choose_direction' // MOVEMENT II
  | 'second_move' // SPEED / PERSISTENCE
  | 'free_movement' // STREAMLINING
  | 'carry_cubes' // TENTACLE
  | 'hold_stay' // HOLDING fn1
  | 'hold_follow' // HOLDING fn2
  | 'feed_substitution' // SUBSTITUTION
  | 'feed_frugality' // FRUGALITY (4p)
  | 'feed_parasitism' // PARASITISM (4p)
  | 'ray_protection' // RAY PROTECTION
  | 'division_discount' // DIVISION RATE
  | 'spores' // SPORES
  | 'longevity' // LONGEVITY
  | 'struggle' // STRUGGLE FOR SURVIVAL
  | 'defense' // DEFENSE
  | 'escape' // ESCAPE
  | 'armor' // ARMOR
  | 'aggression' // AGGRESSION
  | 'persistence_retry'; // PERSISTENCE second-attempt

export interface GeneDef {
  id: GeneId;
  displayName: string;
  price: number; // BP to buy
  mutationPoints: number; // MP (RAY PROTECTION is −2)
  copies: { 3: number; 4: number }; // copies available per player-count (0 ⇒ unavailable)
  isAdvanced: boolean;
  /** Basic gene(s) that may be given up to upgrade into this advanced gene. */
  prerequisite: GeneId[] | null;
  /** Whether this gene introduces a cross-seat (reactive) decision — the M15 combat group. */
  reactive: boolean;
  /**
   * True for genes whose ONLY effects are combat (M15) and therefore have no reachable
   * effect during the MVP loop (M2–M14). Such genes are excluded from the offered buy
   * options until combat lands. (PERSISTENCE/MOVEMENT_II are NOT combat-only: they carry an
   * implemented movement effect, so they remain available.)
   */
  combatOnly: boolean;
  /** Value on the Phase 6 gene-card advance table (advanced = 2, RAY PROTECTION = 0, else 1). */
  advancementCardValue: 0 | 1 | 2;
  effects: GeneEffectTag[];
}

// Helper to keep the table terse; combatOnly defaults to false.
function gene(def: Omit<GeneDef, 'combatOnly'> & { combatOnly?: boolean }): GeneDef {
  return { ...def, combatOnly: def.combatOnly ?? false };
}

export const GENES: Readonly<Record<GeneId, GeneDef>> = {
  // ── Basic genes (spec §7) ──────────────────────────────────────────────────
  INTELLIGENCE: gene({
    id: 'INTELLIGENCE', displayName: 'Intelligence', price: 2, mutationPoints: 3,
    copies: { 3: 1, 4: 2 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['scoring_only'],
  }),
  MOVEMENT_I: gene({
    id: 'MOVEMENT_I', displayName: 'Movement I', price: 3, mutationPoints: 2,
    copies: { 3: 2, 4: 2 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['move_two_dice'],
  }),
  SPORES: gene({
    id: 'SPORES', displayName: 'Spores', price: 3, mutationPoints: 3,
    copies: { 3: 1, 4: 1 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['spores'],
  }),
  SPEED: gene({
    id: 'SPEED', displayName: 'Speed', price: 4, mutationPoints: 3,
    copies: { 3: 1, 4: 2 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['second_move'],
  }),
  DEFENSE: gene({
    id: 'DEFENSE', displayName: 'Defense', price: 4, mutationPoints: 4,
    copies: { 3: 1, 4: 1 }, isAdvanced: false, prerequisite: null, reactive: true, combatOnly: true,
    advancementCardValue: 1, effects: ['defense'],
  }),
  ESCAPE: gene({
    id: 'ESCAPE', displayName: 'Escape', price: 4, mutationPoints: 4,
    copies: { 3: 1, 4: 2 }, isAdvanced: false, prerequisite: null, reactive: true, combatOnly: true,
    advancementCardValue: 1, effects: ['escape'],
  }),
  SUBSTITUTION: gene({
    id: 'SUBSTITUTION', displayName: 'Substitution', price: 4, mutationPoints: 4,
    copies: { 3: 1, 4: 1 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['feed_substitution'],
  }),
  RAY_PROTECTION: gene({
    id: 'RAY_PROTECTION', displayName: 'Ray Protection', price: 5, mutationPoints: -2,
    copies: { 3: 1, 4: 2 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 0, effects: ['ray_protection'],
  }),
  STREAMLINING: gene({
    id: 'STREAMLINING', displayName: 'Streamlining', price: 5, mutationPoints: 4,
    copies: { 3: 1, 4: 1 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['free_movement'],
  }),
  TENTACLE: gene({
    id: 'TENTACLE', displayName: 'Tentacle', price: 5, mutationPoints: 4,
    copies: { 3: 1, 4: 2 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['carry_cubes'],
  }),
  HOLDING: gene({
    id: 'HOLDING', displayName: 'Holding', price: 5, mutationPoints: 4,
    copies: { 3: 1, 4: 1 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['hold_stay', 'hold_follow'],
  }),
  LONGEVITY: gene({
    id: 'LONGEVITY', displayName: 'Longevity', price: 5, mutationPoints: 5,
    copies: { 3: 1, 4: 2 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['longevity'],
  }),
  FRUGALITY: gene({
    id: 'FRUGALITY', displayName: 'Frugality', price: 6, mutationPoints: 5,
    copies: { 3: 0, 4: 1 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['feed_frugality'],
  }),
  STRUGGLE_FOR_SURVIVAL: gene({
    id: 'STRUGGLE_FOR_SURVIVAL', displayName: 'Struggle for Survival', price: 6, mutationPoints: 4,
    copies: { 3: 2, 4: 2 }, isAdvanced: false, prerequisite: null, reactive: true, combatOnly: true,
    advancementCardValue: 1, effects: ['struggle'],
  }),
  PARASITISM: gene({
    id: 'PARASITISM', displayName: 'Parasitism', price: 6, mutationPoints: 5,
    copies: { 3: 0, 4: 1 }, isAdvanced: false, prerequisite: null, reactive: true, combatOnly: true,
    advancementCardValue: 1, effects: ['feed_parasitism'],
  }),
  DIVISION_RATE: gene({
    id: 'DIVISION_RATE', displayName: 'Division Rate', price: 6, mutationPoints: 5,
    copies: { 3: 1, 4: 2 }, isAdvanced: false, prerequisite: null, reactive: false,
    advancementCardValue: 1, effects: ['division_discount'],
  }),

  // ── Advanced genes (spec §8) ─────────────────────────────────────────────────
  PERSISTENCE: gene({
    id: 'PERSISTENCE', displayName: 'Persistence', price: 4, mutationPoints: 4,
    copies: { 3: 1, 4: 1 }, isAdvanced: true, prerequisite: ['SPEED'], reactive: true,
    advancementCardValue: 2, effects: ['second_move', 'persistence_retry'],
  }),
  MOVEMENT_II: gene({
    id: 'MOVEMENT_II', displayName: 'Movement II', price: 5, mutationPoints: 5,
    copies: { 3: 1, 4: 2 }, isAdvanced: true, prerequisite: ['MOVEMENT_I'], reactive: false,
    advancementCardValue: 2, effects: ['move_choose_direction'],
  }),
  AGGRESSION: gene({
    id: 'AGGRESSION', displayName: 'Aggression', price: 5, mutationPoints: 5,
    copies: { 3: 1, 4: 1 }, isAdvanced: true, prerequisite: ['STRUGGLE_FOR_SURVIVAL'], reactive: true, combatOnly: true,
    advancementCardValue: 2, effects: ['struggle', 'aggression'],
  }),
  ARMOR: gene({
    id: 'ARMOR', displayName: 'Armor', price: 6, mutationPoints: 6,
    copies: { 3: 1, 4: 1 }, isAdvanced: true, prerequisite: ['DEFENSE', 'ESCAPE'], reactive: true, combatOnly: true,
    advancementCardValue: 2, effects: ['armor'],
  }),
};

export const GENE_IDS: readonly GeneId[] = Object.keys(GENES);

export function geneDef(id: GeneId): GeneDef {
  const def = GENES[id];
  if (!def) throw new Error(`unknown gene: ${id}`);
  return def;
}

/** Copies of a gene available at a given player count. */
export function geneCopies(id: GeneId, playerCount: number): number {
  const def = geneDef(id);
  return playerCount >= 4 ? def.copies[4] : def.copies[3];
}
