// The 11 Environment cards (spec §2: "11 cards … Ozone Layer Thickness and Direction of
// Drift"). The rules spec does NOT enumerate each card's exact ozone/drift values, so the
// values below are a reasonable spread chosen by the implementer (a spread of ozone
// thicknesses, all four drift directions, and two no-drift cards). Validation scenarios
// that assert specific ozone/drift values construct the environment state directly rather
// than relying on these numbers (see docs/validation-scenarios.md DEFECT-*).

import type { EnvCard } from '../state.js';

export const ENV_CARDS: readonly EnvCard[] = [
  { id: 'env-01', ozoneThickness: 10, drift: 'none' },
  { id: 'env-02', ozoneThickness: 12, drift: 'E' },
  { id: 'env-03', ozoneThickness: 8, drift: 'S' },
  { id: 'env-04', ozoneThickness: 14, drift: 'W' },
  { id: 'env-05', ozoneThickness: 9, drift: 'N' },
  { id: 'env-06', ozoneThickness: 11, drift: 'E' },
  { id: 'env-07', ozoneThickness: 7, drift: 'S' },
  { id: 'env-08', ozoneThickness: 13, drift: 'none' },
  { id: 'env-09', ozoneThickness: 10, drift: 'W' },
  { id: 'env-10', ozoneThickness: 6, drift: 'N' },
  { id: 'env-11', ozoneThickness: 15, drift: 'E' },
];

export const ENV_CARD_COUNT = ENV_CARDS.length;

const ENV_BY_ID: Readonly<Record<string, EnvCard>> = Object.fromEntries(
  ENV_CARDS.map((c) => [c.id, c]),
);

export function envCard(id: string): EnvCard {
  const card = ENV_BY_ID[id];
  if (!card) throw new Error(`unknown environment card: ${id}`);
  return card;
}
