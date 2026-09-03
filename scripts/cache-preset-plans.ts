/**
 * IcareEarth — bake the demo plans.
 *
 * Calls the real /api/plan route for every lever the two presets can surface,
 * and writes the results to lib/preset-plans.json. Committed output means the
 * landing-page demo never touches the network in a judging room.
 *
 *   npm run dev            (in one terminal)
 *   node scripts/cache-preset-plans.ts
 *
 * If another project already holds port 3000, Next dev moves to 3001 and you
 * need to say so:
 *
 *   BASE_URL=http://localhost:3001 node scripts/cache-preset-plans.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { computeFootprint, rankLevers } from "../lib/engine.ts";
import { describeEquivalent } from "../lib/equivalents.ts";
import { PRESETS } from "../lib/presets.ts";
import type { Factors } from "../lib/types.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../lib/preset-plans.json", import.meta.url);

const factors = JSON.parse(
  readFileSync(new URL("../lib/factors.json", import.meta.url), "utf8"),
) as Factors;

/**
 * Confirm BASE is actually this app before posting anything at it. Port 3000
 * is a popular address; without this the script would happily send preset
 * profiles to whatever stranger is listening.
 */
async function servingIcareEarth(): Promise<boolean> {
  const res = await fetch(BASE).catch(() => null);
  if (!res || !res.ok) return false;
  return (await res.text()).includes("IcareEarth");
}

async function main(): Promise<number> {
  if (!(await servingIcareEarth())) {
    console.error(
      `${BASE} is not serving IcareEarth (is another dev server on that port?).\n` +
        `Start this project's dev server, then re-run with the right port, e.g.:\n` +
        `  BASE_URL=http://localhost:3001 node scripts/cache-preset-plans.ts`,
    );
    return 1;
  }

  const cache: Record<string, string> = {};
  let failures = 0;

  for (const preset of PRESETS) {
    const footprint = computeFootprint(preset.profile, factors);
    const levers = rankLevers(preset.profile, factors).slice(0, 3);

    console.log(`\n${preset.name} — ${Math.round(footprint.total)} kg/yr`);

    for (const lever of levers) {
      const res = await fetch(`${BASE}/api/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: preset.profile,
          lever: {
            label: lever.intervention.label,
            description: lever.intervention.description,
            assumptions: lever.intervention.assumptions,
          },
          numbers: {
            totalKgPerYear: footprint.total,
            savingsKgPerYear: lever.savingsKgPerYear,
            shareOfTotalPct: lever.shareOfTotal * 100,
            equivalent: describeEquivalent(lever.savingsKgPerYear, factors),
          },
        }),
      }).catch(() => null);

      if (!res || !res.ok) {
        console.log(`  FAILED ${lever.intervention.id} (${res ? res.status : "no response"})`);
        failures++;
        continue;
      }

      const { plan } = (await res.json()) as { plan: string };
      cache[`${preset.id}:${lever.intervention.id}`] = plan;
      console.log(
        `  cached ${lever.intervention.id} (${Math.round(lever.savingsKgPerYear)} kg) — ${plan.length} chars`,
      );
    }
  }

  // Never half-write the cache: a partial file would silently serve some
  // levers from disk and fetch the rest, which is the confusing state.
  if (failures > 0) {
    console.error(`\n${failures} plan(s) failed — leaving preset-plans.json untouched.`);
    return 1;
  }

  writeFileSync(OUT, JSON.stringify(cache, null, 2) + "\n");
  console.log(`\nWrote ${Object.keys(cache).length} plans to lib/preset-plans.json`);
  return 0;
}

process.exitCode = await main();
