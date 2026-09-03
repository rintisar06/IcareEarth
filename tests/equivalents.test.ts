/**
 * Equivalents tests.
 *
 * These only ever divide an engine number by a constant, so the thing worth
 * testing is that the unit chosen actually helps a reader picture the amount —
 * "0.2 trees" or "4,000,000 phone charges" would both be technically correct
 * and useless.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  describeEquivalent,
  gasCarKm,
  smartphoneCharges,
  toTonnes,
  treesGrownTenYears,
} from "../lib/equivalents.ts";
import { factors } from "./helpers.ts";

describe("raw conversions", () => {
  it("converts to trees at 60 kg each", () => {
    assert.equal(treesGrownTenYears(600), 10);
  });

  it("converts to driving distance using the real petrol factor", () => {
    assert.ok(Math.abs(gasCarKm(163, factors) - 1000) < 0.01);
  });

  it("converts to phone charges at 12 g each", () => {
    assert.equal(smartphoneCharges(1.2), 100);
  });
});

describe("describeEquivalent — picks a unit a person can picture", () => {
  it("uses trees for a big lever", () => {
    const text = describeEquivalent(2605, factors);
    assert.match(text, /tree/);
    assert.match(text, /43/);
  });

  it("says one tree, singular, at the boundary", () => {
    const text = describeEquivalent(60, factors);
    assert.match(text, /1 tree growing/);
    assert.ok(!text.includes("trees"), `should be singular, got: ${text}`);
  });

  it("drops to driving distance below one tree", () => {
    const text = describeEquivalent(30, factors);
    assert.match(text, /km of driving/);
  });

  it("drops to phone charges for a very small saving", () => {
    const text = describeEquivalent(1, factors);
    assert.match(text, /phone charges/);
  });

  it("never offers a fractional tree", () => {
    for (let kg = 55; kg <= 200; kg += 5) {
      const text = describeEquivalent(kg, factors);
      if (text.includes("tree")) {
        assert.ok(!/0\.\d+ tree/.test(text), `fractional tree at ${kg} kg: ${text}`);
      }
    }
  });

  it("groups thousands so long numbers stay readable", () => {
    assert.match(describeEquivalent(3145, factors), /52 trees/);
    assert.match(describeEquivalent(20, factors), /\d{3} km|1,\d{3} km/);
  });

  it("stays sensible across the whole plausible range", () => {
    for (const kg of [0.5, 5, 25, 59, 61, 500, 5000, 50000]) {
      const text = describeEquivalent(kg, factors);
      assert.ok(text.length > 0, `empty at ${kg}`);
      assert.ok(!text.includes("NaN"), `NaN at ${kg}: ${text}`);
      assert.ok(!text.includes("Infinity"), `Infinity at ${kg}: ${text}`);
    }
  });
});

describe("toTonnes", () => {
  it("renders kilograms as tonnes to one decimal", () => {
    assert.equal(toTonnes(26050), "26.1");
    assert.equal(toTonnes(759), "0.8");
  });

  it("honours a requested precision", () => {
    assert.equal(toTonnes(26050, 2), "26.05");
    assert.equal(toTonnes(26050, 0), "26");
  });
});
