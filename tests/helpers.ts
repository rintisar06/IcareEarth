/**
 * Shared test fixtures.
 *
 * Factors are read from the real lib/factors.json rather than a stub: these
 * tests are meant to fail if someone edits a published emission factor without
 * meaning to, which is exactly what happened to the flight numbers during the
 * hackathon.
 */

import { readFileSync } from "node:fs";
import type { Factors, UserProfile } from "../lib/types.ts";

export const factors = JSON.parse(
  readFileSync(new URL("../lib/factors.json", import.meta.url), "utf8"),
) as Factors;

/** Deep-merge a partial over the base person, for one-thing-changed cases. */
export function person(overrides: {
  transport?: Partial<UserProfile["transport"]>;
  diet?: Partial<UserProfile["diet"]>;
  home?: Partial<UserProfile["home"]>;
  flights?: Partial<UserProfile["flights"]>;
} = {}): UserProfile {
  return {
    transport: { mode: "car", weeklyKm: 400, vehicleType: "gas", ...overrides.transport },
    diet: {
      pattern: "omnivore",
      redMeatMealsPerWeek: 5,
      dairyLevel: "medium",
      ...overrides.diet,
    },
    home: {
      heatingType: "gas",
      province: "ON",
      thermostatSetback: false,
      ...overrides.home,
    },
    flights: { perYear: 0, typicalDistance: "short", ...overrides.flights },
  };
}

/** Floating-point tolerant equality, in kg. */
export function near(actual: number, expected: number, tolerance = 0.01): boolean {
  return Math.abs(actual - expected) <= tolerance;
}
