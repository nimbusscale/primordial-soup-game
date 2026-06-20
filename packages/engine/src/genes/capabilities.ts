// Per-player gene capability checks. The engine dispatches on these rather than scanning
// gene-id strings inline, so adding or renaming genes stays localized. A capability is true
// if the player owns any gene granting it.

import type { PlayerState } from '@ps/shared';

export function hasGene(player: PlayerState, gene: string): boolean {
  return player.genes.includes(gene);
}

// Movement genes (M3).
export const hasMovementI = (p: PlayerState): boolean => hasGene(p, 'MOVEMENT_I');
export const hasMovementII = (p: PlayerState): boolean => hasGene(p, 'MOVEMENT_II');
export const hasSpeed = (p: PlayerState): boolean => hasGene(p, 'SPEED') || hasGene(p, 'PERSISTENCE');
export const hasStreamlining = (p: PlayerState): boolean => hasGene(p, 'STREAMLINING');
export const hasTentacle = (p: PlayerState): boolean => hasGene(p, 'TENTACLE');
export const hasHolding = (p: PlayerState): boolean => hasGene(p, 'HOLDING');

// Feeding genes (M4+).
export const hasSubstitution = (p: PlayerState): boolean => hasGene(p, 'SUBSTITUTION');
export const hasFrugality = (p: PlayerState): boolean => hasGene(p, 'FRUGALITY');

// Other phase genes.
export const hasDivisionRate = (p: PlayerState): boolean => hasGene(p, 'DIVISION_RATE');
export const hasSpores = (p: PlayerState): boolean => hasGene(p, 'SPORES');
export const hasLongevity = (p: PlayerState): boolean => hasGene(p, 'LONGEVITY');
export const hasRayProtection = (p: PlayerState): boolean => hasGene(p, 'RAY_PROTECTION');
