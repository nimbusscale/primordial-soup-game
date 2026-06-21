// Build-tier flags. The MVP loop (M2–M14) must never OFFER a gene whose effect is not yet
// implemented (build-plan invariant). Combat genes (combatOnly in the catalog) are excluded
// from the offered buy options until M15 flips this flag to true.

export const COMBAT_GENES_ENABLED = true;
