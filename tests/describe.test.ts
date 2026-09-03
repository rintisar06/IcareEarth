/**
 * Description tests.
 *
 * This is what a person reads back to check we understood them, so the failure
 * that matters is a sentence that is grammatical but wrong — telling a carless
 * vegan we heard something else entirely.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeProfileLines } from "../lib/describe.ts";
import { person } from "./helpers.ts";

const lines = (overrides?: Parameters<typeof person>[0]) =>
  Object.fromEntries(describeProfileLines(person(overrides)).map((l) => [l.id, l.value]));

describe("describeProfileLines", () => {
  it("always returns the four categories in interview order", () => {
    assert.deepEqual(
      describeProfileLines(person()).map((l) => l.id),
      ["transport", "diet", "home", "flights"],
    );
  });

  it("describes a driver with their real distance and vehicle", () => {
    const t = lines().transport;
    assert.match(t, /drive/);
    assert.match(t, /400 km a week/);
    assert.match(t, /petrol or diesel/);
  });

  it("never attributes a vehicle to someone who has none", () => {
    const t = lines({ transport: { mode: "none", weeklyKm: 0, vehicleType: "none" } }).transport;
    assert.match(t, /walk or cycle/);
    // Denying a car ("no car") is fine; claiming a vehicle type or driving is not.
    assert.ok(!/petrol|diesel|hybrid|electric/i.test(t), `attributed a vehicle: ${t}`);
    assert.ok(!/\bdrives?\b|\bdriving\b/i.test(t), `claimed they drive: ${t}`);
    assert.ok(!/\d/.test(t), `quoted a distance to someone with none: ${t}`);
  });

  it("distinguishes transit from mixed", () => {
    assert.match(lines({ transport: { mode: "transit" } }).transport, /transit/);
    assert.match(lines({ transport: { mode: "mixed" } }).transport, /split/);
  });

  it("never mentions meat or dairy to a vegan", () => {
    const d = lines({
      diet: { pattern: "vegan", redMeatMealsPerWeek: 0, dairyLevel: "high" },
    }).diet;
    assert.equal(d, "You eat vegan");
  });

  it("never mentions red meat to a vegetarian", () => {
    const d = lines({
      diet: { pattern: "vegetarian", redMeatMealsPerWeek: 0, dairyLevel: "low" },
    }).diet;
    assert.match(d, /vegetarian/);
    assert.ok(!/red meat/i.test(d), `leaked red meat: ${d}`);
  });

  it("counts red meat in natural English", () => {
    assert.match(lines({ diet: { redMeatMealsPerWeek: 0 } }).diet, /never centre/);
    assert.match(lines({ diet: { redMeatMealsPerWeek: 1 } }).diet, /once a week/);
    assert.match(lines({ diet: { redMeatMealsPerWeek: 5 } }).diet, /5 times a week/);
  });

  it("names the province in full, not as a code", () => {
    const h = lines({ home: { province: "AB" } }).home;
    assert.match(h, /Alberta/);
    assert.ok(!/\bAB\b/.test(h), `leaked a code: ${h}`);
  });

  it("only mentions the thermostat where it applies", () => {
    assert.match(lines({ home: { heatingType: "gas", thermostatSetback: true } }).home, /already turn it down/);
    assert.match(lines({ home: { heatingType: "gas", thermostatSetback: false } }).home, /don't turn it down/);
    // Electric heating has no setback lever, so raising it would confuse.
    assert.ok(!/turn it down/.test(lines({ home: { heatingType: "electric" } }).home));
  });

  it("handles a home with no heating", () => {
    assert.match(lines({ home: { heatingType: "none" } }).home, /don't heat/);
  });

  it("never mentions haul length to someone who doesn't fly", () => {
    const f = lines({ flights: { perYear: 0 } }).flights;
    assert.equal(f, "You don't fly");
  });

  it("says one trip in the singular", () => {
    assert.match(lines({ flights: { perYear: 1 } }).flights, /one return trip/);
    assert.match(lines({ flights: { perYear: 4 } }).flights, /4 return trips/);
  });

  it("produces a non-empty sentence for every category, whatever the profile", () => {
    const shapes: Parameters<typeof person>[0][] = [
      {},
      { transport: { mode: "none", weeklyKm: 0, vehicleType: "none" } },
      { diet: { pattern: "vegan", redMeatMealsPerWeek: 0, dairyLevel: "low" } },
      { home: { heatingType: "none" } },
      { flights: { perYear: 0 } },
      { transport: { vehicleType: "ev" }, home: { heatingType: "oil" } },
    ];
    for (const shape of shapes) {
      for (const line of describeProfileLines(person(shape))) {
        assert.ok(line.value.length > 5, `empty ${line.id} for ${JSON.stringify(shape)}`);
        assert.ok(!line.value.includes("undefined"), `undefined in ${line.id}: ${line.value}`);
      }
    }
  });
});
