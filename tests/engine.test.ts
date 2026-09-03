/**
 * Engine tests.
 *
 * Every expected number here was computed by hand from lib/factors.json, not
 * captured from the engine's own output. A test that just records what the code
 * currently does would have happily blessed the 2x-too-high flight factors.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildInterventions,
  computeFootprint,
  cumulativeSeries,
  dominantCategory,
  rankLevers,
} from "../lib/engine.ts";
import { factors, near, person } from "./helpers.ts";

const W = 52;

describe("computeFootprint — transport", () => {
  it("prices a petrol car at distance x factor", () => {
    // 400 km/wk x 52 x 0.163
    const f = computeFootprint(person(), factors);
    assert.ok(near(f.transport, 400 * W * 0.163), `got ${f.transport}`);
  });

  it("splits mixed mode evenly between car and bus", () => {
    const f = computeFootprint(person({ transport: { mode: "mixed" } }), factors);
    const expected = 200 * W * 0.163 + 200 * W * 0.104;
    assert.ok(near(f.transport, expected), `got ${f.transport}`);
  });

  it("prices transit-only riders as bus", () => {
    const f = computeFootprint(person({ transport: { mode: "transit" } }), factors);
    assert.ok(near(f.transport, 400 * W * 0.104), `got ${f.transport}`);
  });

  it("charges nothing to someone who walks", () => {
    const f = computeFootprint(
      person({ transport: { mode: "none", weeklyKm: 0, vehicleType: "none" } }),
      factors,
    );
    assert.equal(f.transport, 0);
  });

  it("prices an EV against the provincial grid, not a national average", () => {
    const on = computeFootprint(
      person({ transport: { vehicleType: "ev" }, home: { province: "ON" } }),
      factors,
    );
    const ab = computeFootprint(
      person({ transport: { vehicleType: "ev" }, home: { province: "AB" } }),
      factors,
    );
    assert.ok(near(on.transport, 400 * W * (59 / 1000) * 0.2), `ON got ${on.transport}`);
    assert.ok(near(ab.transport, 400 * W * (438 / 1000) * 0.2), `AB got ${ab.transport}`);
    assert.ok(ab.transport > on.transport * 7, "Alberta EV must cost far more than Ontario");
  });
});

describe("computeFootprint — diet", () => {
  it("splits 14 meals: 5 beef, 3 cheese, then chicken and plant evenly", () => {
    const f = computeFootprint(person(), factors);
    const perWeek = 5 * 9.9 + 3 * 1.0 + 3 * 0.3 + 3 * 2.4;
    assert.ok(near(f.diet, perWeek * W), `got ${f.diet}, expected ${perWeek * W}`);
  });

  it("gives a vegan no cheese even at dairyLevel high", () => {
    const f = computeFootprint(
      person({ diet: { pattern: "vegan", redMeatMealsPerWeek: 0, dairyLevel: "high" } }),
      factors,
    );
    assert.ok(near(f.diet, 14 * 0.3 * W), `got ${f.diet}`);
  });

  it("gives a vegetarian cheese but never chicken", () => {
    const f = computeFootprint(
      person({ diet: { pattern: "vegetarian", redMeatMealsPerWeek: 0, dairyLevel: "high" } }),
      factors,
    );
    // 5 cheese + 9 plant, no poultry
    assert.ok(near(f.diet, (5 * 2.4 + 9 * 0.3) * W), `got ${f.diet}`);
  });

  it("ignores red meat entirely for a non-omnivore", () => {
    const veg = computeFootprint(
      person({ diet: { pattern: "vegetarian", redMeatMealsPerWeek: 9, dairyLevel: "low" } }),
      factors,
    );
    const none = computeFootprint(
      person({ diet: { pattern: "vegetarian", redMeatMealsPerWeek: 0, dairyLevel: "low" } }),
      factors,
    );
    assert.equal(veg.diet, none.diet);
  });

  it("squeezes cheese out when red meat fills the week", () => {
    const f = computeFootprint(
      person({ diet: { redMeatMealsPerWeek: 14, dairyLevel: "high" } }),
      factors,
    );
    assert.ok(near(f.diet, 14 * 9.9 * W), `got ${f.diet}`);
  });

  it("clamps red meat above a full week", () => {
    const over = computeFootprint(person({ diet: { redMeatMealsPerWeek: 40 } }), factors);
    const full = computeFootprint(person({ diet: { redMeatMealsPerWeek: 14 } }), factors);
    assert.equal(over.diet, full.diet);
  });
});

describe("computeFootprint — home energy", () => {
  it("prices gas heating", () => {
    const f = computeFootprint(person(), factors);
    assert.ok(near(f.homeEnergy, 2216 * 1.93), `got ${f.homeEnergy}`);
  });

  it("discounts someone who already sets the thermostat back", () => {
    const f = computeFootprint(person({ home: { thermostatSetback: true } }), factors);
    assert.ok(near(f.homeEnergy, 2216 * 1.93 * (1 - 0.083)), `got ${f.homeEnergy}`);
  });

  it("prices oil heating", () => {
    const f = computeFootprint(person({ home: { heatingType: "oil" } }), factors);
    assert.ok(near(f.homeEnergy, 1350 * 2.76), `got ${f.homeEnergy}`);
  });

  it("prices electric heat against the province — the Quebec/Alberta gap", () => {
    const qc = computeFootprint(
      person({ home: { heatingType: "electric", province: "QC" } }),
      factors,
    );
    const ab = computeFootprint(
      person({ home: { heatingType: "electric", province: "AB" } }),
      factors,
    );
    assert.ok(near(qc.homeEnergy, 9000 * 0.0019), `QC got ${qc.homeEnergy}`);
    assert.ok(near(ab.homeEnergy, 9000 * 0.438), `AB got ${ab.homeEnergy}`);
  });

  it("charges nothing when there is no heating", () => {
    const f = computeFootprint(person({ home: { heatingType: "none" } }), factors);
    assert.equal(f.homeEnergy, 0);
  });
});

describe("computeFootprint — flights", () => {
  it("prices short-haul round trips", () => {
    const f = computeFootprint(person({ flights: { perYear: 2 } }), factors);
    assert.ok(near(f.flights, 2 * 0.074 * 2500), `got ${f.flights}`);
  });

  it("prices long-haul round trips", () => {
    const f = computeFootprint(
      person({ flights: { perYear: 6, typicalDistance: "long" } }),
      factors,
    );
    assert.ok(near(f.flights, 6 * 0.069 * 11000), `got ${f.flights}`);
  });

  it("treats a negative flight count as zero", () => {
    const f = computeFootprint(person({ flights: { perYear: -3 } }), factors);
    assert.equal(f.flights, 0);
  });
});

describe("computeFootprint — total", () => {
  it("is the sum of its four categories", () => {
    const f = computeFootprint(person({ flights: { perYear: 2 } }), factors);
    assert.ok(near(f.total, f.transport + f.diet + f.homeEnergy + f.flights));
  });

  it("names the dominant category", () => {
    assert.equal(
      dominantCategory(
        computeFootprint(
          person({
            transport: { mode: "none", weeklyKm: 0, vehicleType: "none" },
            home: { heatingType: "none" },
            diet: { pattern: "vegetarian", redMeatMealsPerWeek: 0, dairyLevel: "low" },
            flights: { perYear: 6, typicalDistance: "long" },
          }),
          factors,
        ),
      ),
      "flights",
    );
  });
});

describe("intervention feasibility — strict by design", () => {
  const ids = () => buildInterventions().map((i) => i.id);

  function feasibleIds(p: ReturnType<typeof person>): string[] {
    return buildInterventions()
      .filter((i) => i.feasible(p))
      .map((i) => i.id);
  }

  it("ships exactly ten interventions with unique ids", () => {
    assert.equal(ids().length, 10);
    assert.equal(new Set(ids()).size, 10);
  });

  it("never offers vehicle or transit changes to someone with no car", () => {
    const f = feasibleIds(
      person({ transport: { mode: "none", weeklyKm: 0, vehicleType: "none" } }),
    );
    for (const id of ["transit-two-days", "transit-full", "next-car-hybrid", "next-car-ev"]) {
      assert.ok(!f.includes(id), `${id} must not be offered to a carless person`);
    }
  });

  it("never offers transit to someone who reports zero distance", () => {
    const f = feasibleIds(person({ transport: { weeklyKm: 0 } }));
    assert.ok(!f.includes("transit-full"));
  });

  it("never offers diet-meat changes to a vegan or vegetarian", () => {
    for (const pattern of ["vegan", "vegetarian"] as const) {
      const f = feasibleIds(person({ diet: { pattern, redMeatMealsPerWeek: 0 } }));
      for (const id of ["swap-beef-chicken", "swap-beef-plant", "go-vegetarian"]) {
        assert.ok(!f.includes(id), `${id} must not be offered to a ${pattern}`);
      }
    }
  });

  it("requires at least two red meat meals before offering to swap two", () => {
    assert.ok(!feasibleIds(person({ diet: { redMeatMealsPerWeek: 1 } })).includes("swap-beef-plant"));
    assert.ok(feasibleIds(person({ diet: { redMeatMealsPerWeek: 2 } })).includes("swap-beef-plant"));
  });

  it("does not offer an EV to someone who already drives one", () => {
    assert.ok(!feasibleIds(person({ transport: { vehicleType: "ev" } })).includes("next-car-ev"));
  });

  it("offers an EV, but not a hybrid, to a hybrid driver", () => {
    const f = feasibleIds(person({ transport: { vehicleType: "hybrid" } }));
    assert.ok(f.includes("next-car-ev"));
    assert.ok(!f.includes("next-car-hybrid"));
  });

  it("only offers a setback to fuel heating that lacks one", () => {
    assert.ok(feasibleIds(person()).includes("thermostat-setback"));
    assert.ok(!feasibleIds(person({ home: { thermostatSetback: true } })).includes("thermostat-setback"));
    assert.ok(!feasibleIds(person({ home: { heatingType: "electric" } })).includes("thermostat-setback"));
    assert.ok(!feasibleIds(person({ home: { heatingType: "none" } })).includes("thermostat-setback"));
  });

  it("matches the flight lever to the haul the person actually flies", () => {
    const shortFlyer = feasibleIds(person({ flights: { perYear: 2, typicalDistance: "short" } }));
    assert.ok(shortFlyer.includes("one-fewer-short-haul"));
    assert.ok(!shortFlyer.includes("one-fewer-long-haul"));

    const longFlyer = feasibleIds(person({ flights: { perYear: 2, typicalDistance: "long" } }));
    assert.ok(longFlyer.includes("one-fewer-long-haul"));
    assert.ok(!longFlyer.includes("one-fewer-short-haul"));
  });

  it("offers no flight lever to a non-flyer", () => {
    const f = feasibleIds(person({ flights: { perYear: 0 } }));
    assert.ok(!f.includes("one-fewer-short-haul") && !f.includes("one-fewer-long-haul"));
  });

  it("offers nothing at all to someone who has already changed everything", () => {
    const f = feasibleIds(
      person({
        transport: { mode: "none", weeklyKm: 0, vehicleType: "none" },
        diet: { pattern: "vegan", redMeatMealsPerWeek: 0, dairyLevel: "low" },
        home: { heatingType: "none" },
        flights: { perYear: 0 },
      }),
    );
    assert.deepEqual(f, []);
  });
});

describe("intervention savings — closed form", () => {
  function saving(id: string, p: ReturnType<typeof person>): number {
    const i = buildInterventions().find((x) => x.id === id);
    assert.ok(i, `no intervention ${id}`);
    return i.savingsKgPerYear(p, factors);
  }

  it("swap 2 beef to chicken", () => {
    assert.ok(near(saving("swap-beef-chicken", person()), (9.9 - 1.0) * 2 * W));
  });

  it("swap 2 beef to plants", () => {
    assert.ok(near(saving("swap-beef-plant", person()), (9.9 - 0.3) * 2 * W));
  });

  it("go vegetarian equals the whole meat portion of the diet", () => {
    const p = person();
    const before = computeFootprint(p, factors).diet;
    const after = computeFootprint(
      { ...p, diet: { ...p.diet, pattern: "vegetarian", redMeatMealsPerWeek: 0 } },
      factors,
    ).diet;
    assert.ok(near(saving("go-vegetarian", p), before - after));
  });

  it("full transit is the car/bus gap over the year", () => {
    assert.ok(near(saving("transit-full", person()), 400 * W * (0.163 - 0.104)));
  });

  it("two transit days is two fifths of full transit", () => {
    assert.ok(near(saving("transit-two-days", person()), 400 * W * (0.163 - 0.104) * (2 / 5)));
  });

  it("hybrid swap is the petrol/hybrid gap", () => {
    assert.ok(near(saving("next-car-hybrid", person()), 400 * W * (0.163 - 0.128)));
  });

  it("thermostat setback is a share of heating", () => {
    assert.ok(near(saving("thermostat-setback", person()), 2216 * 1.93 * 0.083));
  });

  it("one fewer flight is exactly one round trip", () => {
    assert.ok(near(saving("one-fewer-short-haul", person()), 0.074 * 2500));
    assert.ok(near(saving("one-fewer-long-haul", person()), 0.069 * 11000));
  });

  it("never returns a negative saving for any feasible lever", () => {
    const people = [
      person(),
      person({ transport: { mode: "mixed" } }),
      person({ transport: { vehicleType: "hybrid" } }),
      person({ home: { heatingType: "electric", province: "AB" } }),
      person({ flights: { perYear: 4, typicalDistance: "long" } }),
      person({ diet: { pattern: "vegetarian", redMeatMealsPerWeek: 0, dairyLevel: "high" } }),
    ];
    for (const p of people) {
      for (const i of buildInterventions()) {
        if (!i.feasible(p)) continue;
        assert.ok(
          i.savingsKgPerYear(p, factors) >= 0,
          `${i.id} produced a negative saving`,
        );
      }
    }
  });
});

describe("rankLevers", () => {
  it("sorts by saving, descending", () => {
    const levers = rankLevers(person(), factors);
    for (let i = 1; i < levers.length; i++) {
      assert.ok(levers[i - 1].savingsKgPerYear >= levers[i].savingsKgPerYear);
    }
  });

  it("drops infeasible and zero-saving levers", () => {
    const levers = rankLevers(person(), factors);
    assert.ok(levers.every((l) => l.savingsKgPerYear > 0));
    assert.ok(levers.every((l) => l.intervention.feasible(person())));
  });

  it("reports each saving as a share of that person's own total", () => {
    const p = person();
    const total = computeFootprint(p, factors).total;
    for (const l of rankLevers(p, factors)) {
      assert.ok(near(l.shareOfTotal, l.savingsKgPerYear / total, 1e-9));
    }
  });

  it("returns an empty list rather than throwing when nothing applies", () => {
    const levers = rankLevers(
      person({
        transport: { mode: "none", weeklyKm: 0, vehicleType: "none" },
        diet: { pattern: "vegan", redMeatMealsPerWeek: 0, dairyLevel: "low" },
        home: { heatingType: "none" },
        flights: { perYear: 0 },
      }),
      factors,
    );
    assert.deepEqual(levers, []);
  });
});

describe("the project's central claim", () => {
  /**
   * If this test ever fails, IcareEarth's whole argument has broken: the same
   * intervention must rank differently for two people who differ only by
   * province, because the engine prices it against the local grid.
   */
  it("ranks an EV first in Ontario and lower in Alberta, all else equal", () => {
    const ontario = person({ home: { province: "ON" } });
    const alberta = person({ home: { province: "AB" } });

    const onRank = rankLevers(ontario, factors);
    const abRank = rankLevers(alberta, factors);

    const onPos = onRank.findIndex((l) => l.intervention.id === "next-car-ev");
    const abPos = abRank.findIndex((l) => l.intervention.id === "next-car-ev");

    assert.equal(onPos, 0, "EV should be the top lever in Ontario");
    assert.ok(abPos > 0, `EV should not be top in Alberta (was position ${abPos})`);
    assert.ok(
      onRank[onPos].savingsKgPerYear > abRank[abPos].savingsKgPerYear * 1.9,
      "the Ontario EV saving should be far larger than Alberta's",
    );
  });

  it("gives three different people three different top levers", () => {
    const tops = [
      person(),
      person({
        transport: { mode: "none", weeklyKm: 0, vehicleType: "none" },
        diet: { pattern: "vegetarian", redMeatMealsPerWeek: 0, dairyLevel: "medium" },
        home: { heatingType: "electric" },
        flights: { perYear: 6, typicalDistance: "long" },
      }),
      person({
        transport: { weeklyKm: 250 },
        diet: { redMeatMealsPerWeek: 4 },
        home: { heatingType: "electric", province: "AB" },
        flights: { perYear: 1 },
      }),
    ].map((p) => rankLevers(p, factors)[0]?.intervention.id);

    assert.equal(new Set(tops).size, 3, `top levers were ${tops.join(", ")}`);
  });
});

describe("cumulativeSeries", () => {
  it("starts both futures at zero and diverges linearly", () => {
    const f = computeFootprint(person(), factors);
    const series = cumulativeSeries(f, 1000, 10);

    assert.equal(series.length, 11);
    assert.equal(series[0].now, 0);
    assert.equal(series[0].withLever, 0);
    assert.ok(near(series[10].now - series[10].withLever, 10_000));
  });

  it("never lets a lever push a footprint below zero", () => {
    const f = computeFootprint(person(), factors);
    const series = cumulativeSeries(f, f.total * 5, 10);
    assert.ok(series.every((p) => p.withLever === 0));
  });
});
