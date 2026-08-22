/**
 * IcareEarth — engine sanity check.
 *
 * Run three deliberately different people through the engine and print their
 * rankings. The acceptance bar for Phase 2 is that their top levers differ:
 * if three lives this distinct produce the same advice, the engine is just a
 * calculator wearing a recommendation as a hat.
 *
 *   node scripts/sanity.ts
 */

import { readFileSync } from "node:fs";
import {
  CATEGORY_LABELS,
  computeFootprint,
  dominantCategory,
  rankLevers,
} from "../lib/engine.ts";
import { describeEquivalent } from "../lib/equivalents.ts";
import type { Factors, UserProfile } from "../lib/types.ts";

const factors = JSON.parse(
  readFileSync(new URL("../lib/factors.json", import.meta.url), "utf8"),
) as Factors;

const PEOPLE: { name: string; blurb: string; profile: UserProfile }[] = [
  {
    name: "Heavy driver, omnivore, Ontario, gas heat",
    blurb: "400 km a week in a petrol car, 5 red meat meals, no setback",
    profile: {
      transport: { mode: "car", weeklyKm: 400, vehicleType: "gas" },
      diet: { pattern: "omnivore", redMeatMealsPerWeek: 5, dairyLevel: "medium" },
      home: { heatingType: "gas", province: "ON", thermostatSetback: false },
      flights: { perYear: 0, typicalDistance: "short" },
    },
  },
  {
    name: "Carless vegetarian, Ontario, electric heat, 6 flights",
    blurb: "No car, vegetarian, 6 long-haul return trips a year",
    profile: {
      transport: { mode: "none", weeklyKm: 0, vehicleType: "none" },
      diet: { pattern: "vegetarian", redMeatMealsPerWeek: 0, dairyLevel: "medium" },
      home: { heatingType: "electric", province: "ON", thermostatSetback: false },
      flights: { perYear: 6, typicalDistance: "long" },
    },
  },
  {
    name: "Alberta driver, omnivore, electric heat",
    blurb: "250 km a week, 4 red meat meals, electric heat on Alberta's grid",
    profile: {
      transport: { mode: "car", weeklyKm: 250, vehicleType: "gas" },
      diet: { pattern: "omnivore", redMeatMealsPerWeek: 4, dairyLevel: "medium" },
      home: { heatingType: "electric", province: "AB", thermostatSetback: false },
      flights: { perYear: 1, typicalDistance: "short" },
    },
  },
];

const kg = (n: number) => `${Math.round(n).toLocaleString("en-CA").padStart(7)} kg`;

const topLevers: string[] = [];

for (const { name, blurb, profile } of PEOPLE) {
  const footprint = computeFootprint(profile, factors);
  const levers = rankLevers(profile, factors);

  console.log("\n" + "=".repeat(74));
  console.log(name);
  console.log(blurb);
  console.log("=".repeat(74));

  console.log("\n  Footprint");
  console.log(`    transport   ${kg(footprint.transport)}`);
  console.log(`    diet        ${kg(footprint.diet)}`);
  console.log(`    home        ${kg(footprint.homeEnergy)}`);
  console.log(`    flights     ${kg(footprint.flights)}`);
  console.log(`    TOTAL       ${kg(footprint.total)}   (mostly ${CATEGORY_LABELS[dominantCategory(footprint)]})`);

  console.log(`\n  Ranked levers (${levers.length} feasible of 10)`);
  if (levers.length === 0) {
    console.log("    none");
  }
  levers.forEach((lever, i) => {
    const pct = (lever.shareOfTotal * 100).toFixed(1).padStart(4);
    console.log(
      `    ${i + 1}. ${kg(lever.savingsKgPerYear)}  ${pct}%  ${lever.intervention.label}`,
    );
    if (i === 0) {
      console.log(`               = ${describeEquivalent(lever.savingsKgPerYear, factors)}`);
    }
  });

  topLevers.push(levers[0]?.intervention.id ?? "NONE");
}

console.log("\n" + "=".repeat(74));
console.log("ACCEPTANCE CHECK — do the three top levers differ?");
console.log("=".repeat(74));
PEOPLE.forEach((p, i) => console.log(`  ${p.name.split(",")[0].padEnd(28)} -> ${topLevers[i]}`));

const distinct = new Set(topLevers);
const passed = distinct.size === PEOPLE.length && !distinct.has("NONE");
console.log(`\n  ${distinct.size} distinct top levers across ${PEOPLE.length} people`);
console.log(`  ${passed ? "PASS" : "FAIL"}\n`);

if (!passed) process.exitCode = 1;
