/**
 * IcareEarth — turning kilograms into things people can picture.
 *
 * These are presentation helpers, not new science. Each one divides an engine
 * number by a constant, so an equivalent can never disagree with the ranking
 * it sits next to.
 */

import type { Factors } from "./types.ts";

/**
 * CO2e a single tree sequesters over ten years of growth. A round number by
 * convention; real sequestration varies hugely by species, climate, and age.
 */
const KG_PER_TREE_DECADE = 60;

/** CO2e of charging one smartphone once. */
const KG_PER_PHONE_CHARGE = 0.012;

/** Trees that would need ten years of growth to absorb this much. */
export function treesGrownTenYears(kg: number): number {
  return kg / KG_PER_TREE_DECADE;
}

/** Distance an average petrol car would cover emitting this much. */
export function gasCarKm(kg: number, factors: Factors): number {
  return kg / factors.transportPerKm.gasCar;
}

/** Smartphone charges worth the same emissions. */
export function smartphoneCharges(kg: number): number {
  return kg / KG_PER_PHONE_CHARGE;
}

function round(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function commas(value: number): string {
  return Math.round(value).toLocaleString("en-CA");
}

/**
 * One readable equivalent for a results card.
 *
 * Picks by magnitude: trees read well for the big levers, driving distance for
 * mid-sized ones, phone charges only for savings too small to picture as either.
 */
export function describeEquivalent(kg: number, factors: Factors): string {
  const trees = treesGrownTenYears(kg);
  if (trees >= 1) {
    const n = trees >= 10 ? round(trees, 1) : Math.round(trees);
    return `${commas(n)} ${n === 1 ? "tree" : "trees"} growing for ten years`;
  }

  const km = gasCarKm(kg, factors);
  if (km >= 50) {
    return `${commas(round(km, 10))} km of driving`;
  }

  return `${commas(round(smartphoneCharges(kg), 100))} phone charges`;
}

/** Kilograms rendered as tonnes for the twin chart, e.g. "12.4". */
export function toTonnes(kg: number, decimals = 1): string {
  return (kg / 1000).toFixed(decimals);
}
