/**
 * IcareEarth — demo presets.
 *
 * Two people whose top levers are structurally different. Both write straight
 * to the store with zero network, so the landing page demo works on a dead
 * wifi connection in a judging room.
 */

import type { UserProfile } from "./types";
// The attribute is required by Node's ESM loader (scripts/cache-preset-plans.ts
// imports this file directly); Turbopack accepts it too.
import presetPlans from "./preset-plans.json" with { type: "json" };

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  profile: UserProfile;
}

export const PRESETS: Preset[] = [
  {
    id: "casey",
    name: "Commuter Casey",
    blurb: "Drives 320 km a week, eats beef five nights, gas-heated place in Ontario",
    profile: {
      transport: { mode: "car", weeklyKm: 320, vehicleType: "gas" },
      diet: { pattern: "omnivore", redMeatMealsPerWeek: 5, dairyLevel: "medium" },
      home: { heatingType: "gas", province: "ON", thermostatSetback: false },
      flights: { perYear: 2, typicalDistance: "short" },
    },
  },
  {
    id: "sam",
    name: "Frequent Flyer Sam",
    blurb: "No car, vegetarian, electric heat in Ontario, six long-haul trips a year",
    profile: {
      transport: { mode: "none", weeklyKm: 0, vehicleType: "none" },
      diet: { pattern: "vegetarian", redMeatMealsPerWeek: 0, dairyLevel: "medium" },
      home: { heatingType: "electric", province: "ON", thermostatSetback: false },
      flights: { perYear: 6, typicalDistance: "long" },
    },
  },
];

/**
 * Plans generated once and committed, keyed by "<presetId>:<leverId>". The demo
 * never has to reach the API.
 */
const CACHED_PLANS = presetPlans as Record<string, string>;

export function cachedPlan(
  presetId: string | null,
  leverId: string,
): string | null {
  if (!presetId) return null;
  return CACHED_PLANS[`${presetId}:${leverId}`] ?? null;
}
