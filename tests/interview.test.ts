/**
 * Interview-layer tests.
 *
 * This is the boundary where model output becomes application data, so most of
 * these are about what happens when the model misbehaves — the province
 * dropdown that collapsed nine grids into one option was a real incident.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FIELD_OPTIONS,
  PROFILE_FIELDS,
  applyAnswer,
  clampNumber,
  extractJson,
  isFallback,
  isProfileComplete,
  isProfileField,
  mergeProfile,
  normalizeProfile,
  optionsFor,
  parseInterviewResponse,
  type DeepPartialProfile,
  type InterviewQuestion,
} from "../lib/interview.ts";
import { PROVINCES } from "../lib/types.ts";

const validQuestion = {
  id: "province",
  text: "Where do you live?",
  type: "choice",
  options: ["Ontario"],
  profileField: "home.province",
};

describe("extractJson", () => {
  it("passes bare JSON through", () => {
    assert.equal(extractJson('{"a":1}'), '{"a":1}');
  });

  it("strips ```json fences", () => {
    assert.equal(extractJson('```json\n{"a":1}\n```'), '{"a":1}');
  });

  it("strips bare ``` fences", () => {
    assert.equal(extractJson('```\n{"a":1}\n```'), '{"a":1}');
  });

  it("digs the object out of surrounding prose", () => {
    assert.equal(extractJson('Sure! Here you go:\n{"a":1}\nHope that helps.'), '{"a":1}');
  });

  it("keeps nested braces intact", () => {
    assert.equal(extractJson('{"a":{"b":2}}'), '{"a":{"b":2}}');
  });
});

describe("parseInterviewResponse", () => {
  it("accepts a well-formed question", () => {
    const r = parseInterviewResponse(
      JSON.stringify({ complete: false, question: validQuestion }),
    );
    assert.ok(r);
    assert.equal(r.complete, false);
    assert.equal(r.question?.profileField, "home.province");
  });

  it("accepts completion without a question", () => {
    const r = parseInterviewResponse(JSON.stringify({ complete: true }));
    assert.ok(r);
    assert.equal(r.complete, true);
    assert.equal(r.question, undefined);
  });

  it("survives fenced output", () => {
    const r = parseInterviewResponse(
      "```json\n" + JSON.stringify({ complete: false, question: validQuestion }) + "\n```",
    );
    assert.ok(r);
  });

  it("returns null on invalid JSON rather than throwing", () => {
    assert.equal(parseInterviewResponse("not json at all"), null);
    assert.equal(parseInterviewResponse(""), null);
  });

  it("rejects a missing or non-boolean complete flag", () => {
    assert.equal(parseInterviewResponse(JSON.stringify({ question: validQuestion })), null);
    assert.equal(parseInterviewResponse(JSON.stringify({ complete: "yes" })), null);
  });

  it("rejects an incomplete response with no question", () => {
    assert.equal(parseInterviewResponse(JSON.stringify({ complete: false })), null);
  });

  it("rejects a question missing any required field", () => {
    for (const key of ["id", "text", "type", "profileField"]) {
      const q: Record<string, unknown> = { ...validQuestion };
      delete q[key];
      assert.equal(
        parseInterviewResponse(JSON.stringify({ complete: false, question: q })),
        null,
        `should reject a question with no ${key}`,
      );
    }
  });

  it("rejects an unknown question type", () => {
    assert.equal(
      parseInterviewResponse(
        JSON.stringify({ complete: false, question: { ...validQuestion, type: "freeform" } }),
      ),
      null,
    );
  });

  it("rejects a choice question with no options — it would be unanswerable", () => {
    const q: Record<string, unknown> = { ...validQuestion };
    delete q.options;
    assert.equal(parseInterviewResponse(JSON.stringify({ complete: false, question: q })), null);
  });

  it("allows a number question with no options", () => {
    const r = parseInterviewResponse(
      JSON.stringify({
        complete: false,
        question: {
          id: "km",
          text: "How far?",
          type: "number",
          unit: "km",
          profileField: "transport.weeklyKm",
        },
      }),
    );
    assert.ok(r);
    assert.equal(r.question?.unit, "km");
  });

  it("rejects a non-object profileUpdates", () => {
    assert.equal(
      parseInterviewResponse(JSON.stringify({ complete: true, profileUpdates: "nope" })),
      null,
    );
  });
});

describe("isFallback", () => {
  it("recognises the route's give-up signal", () => {
    assert.equal(isFallback({ fallback: true, reason: "no-api-key" }), true);
    assert.equal(isFallback({ complete: true }), false);
  });
});

describe("applyAnswer — the allowlist", () => {
  it("writes a known field", () => {
    const p = applyAnswer({}, "transport.weeklyKm", 120);
    assert.equal(p.transport?.weeklyKm, 120);
  });

  it("ignores a field the model invented", () => {
    const p = applyAnswer({}, "transport.parkingSpots", 3);
    assert.deepEqual(p, {});
  });

  it("ignores an unknown section", () => {
    assert.deepEqual(applyAnswer({}, "finances.income", 50000), {});
  });

  it("ignores a malformed path", () => {
    assert.deepEqual(applyAnswer({}, "transport", "car"), {});
    assert.deepEqual(applyAnswer({}, "", "car"), {});
    assert.deepEqual(applyAnswer({}, "a.b.c", "x"), {});
  });

  it("does not mutate the profile it was given", () => {
    const before: DeepPartialProfile = { transport: { weeklyKm: 10 } };
    applyAnswer(before, "transport.weeklyKm", 999);
    assert.equal(before.transport?.weeklyKm, 10);
  });

  it("keeps every declared field writable", () => {
    for (const field of PROFILE_FIELDS) {
      assert.ok(isProfileField(field));
      const parts: string[] = field.split(".");
      const p = applyAnswer({}, field, "x") as Record<string, Record<string, unknown>>;
      assert.equal(p[parts[0]][parts[1]], "x", `${field} should be writable`);
    }
  });
});

describe("clampNumber", () => {
  it("bounds red meat to a week of main meals", () => {
    assert.equal(clampNumber("diet.redMeatMealsPerWeek", 150), 14);
    assert.equal(clampNumber("diet.redMeatMealsPerWeek", -5), 0);
    assert.equal(clampNumber("diet.redMeatMealsPerWeek", 7), 7);
  });

  it("bounds weekly distance and flights", () => {
    assert.equal(clampNumber("transport.weeklyKm", 99999), 5000);
    assert.equal(clampNumber("flights.perYear", 150), 100);
  });

  it("turns non-finite input into zero", () => {
    assert.equal(clampNumber("transport.weeklyKm", NaN), 0);
    assert.equal(clampNumber("transport.weeklyKm", Infinity), 0);
  });

  it("leaves unbounded fields alone", () => {
    assert.equal(clampNumber("home.province", 42), 42);
  });
});

describe("mergeProfile", () => {
  it("merges section by section without dropping siblings", () => {
    const merged = mergeProfile(
      { transport: { mode: "car" }, diet: { pattern: "omnivore" } },
      { transport: { weeklyKm: 100 } },
    );
    assert.equal(merged.transport?.mode, "car");
    assert.equal(merged.transport?.weeklyKm, 100);
    assert.equal(merged.diet?.pattern, "omnivore");
  });

  it("lets updates win on conflict", () => {
    const merged = mergeProfile({ transport: { mode: "car" } }, { transport: { mode: "none" } });
    assert.equal(merged.transport?.mode, "none");
  });

  it("returns the base untouched when there is nothing to merge", () => {
    const base = { transport: { mode: "car" as const } };
    assert.equal(mergeProfile(base, undefined), base);
  });
});

describe("isProfileComplete", () => {
  const full: DeepPartialProfile = {
    transport: { mode: "car", weeklyKm: 100, vehicleType: "gas" },
    diet: { pattern: "omnivore", redMeatMealsPerWeek: 3, dairyLevel: "low" },
    home: { heatingType: "gas", province: "ON", thermostatSetback: false },
    flights: { perYear: 1, typicalDistance: "short" },
  };

  it("accepts a fully answered profile", () => {
    assert.equal(isProfileComplete(full), true);
  });

  it("rejects an empty profile", () => {
    assert.equal(isProfileComplete({}), false);
  });

  it("rejects a missing section", () => {
    const withoutFlights = { transport: full.transport, diet: full.diet, home: full.home };
    assert.equal(isProfileComplete(withoutFlights), false);
  });

  it("does not require distance or vehicle from someone with no transport", () => {
    assert.equal(
      isProfileComplete({ ...full, transport: { mode: "none" } }),
      true,
    );
  });

  it("does require distance and vehicle from everyone else", () => {
    assert.equal(isProfileComplete({ ...full, transport: { mode: "car" } }), false);
    assert.equal(
      isProfileComplete({ ...full, transport: { mode: "car", weeklyKm: 10 } }),
      false,
    );
  });

  it("only demands red meat counts from omnivores", () => {
    assert.equal(
      isProfileComplete({
        ...full,
        diet: { pattern: "vegan", dairyLevel: "low" },
      }),
      true,
    );
    assert.equal(
      isProfileComplete({ ...full, diet: { pattern: "omnivore", dairyLevel: "low" } }),
      false,
    );
  });

  it("only demands haul length from people who actually fly", () => {
    assert.equal(isProfileComplete({ ...full, flights: { perYear: 0 } }), true);
    assert.equal(isProfileComplete({ ...full, flights: { perYear: 3 } }), false);
  });

  it("rejects a province that is not a real jurisdiction", () => {
    assert.equal(
      isProfileComplete({ ...full, home: { ...full.home, province: "NARNIA" as never } }),
      false,
    );
  });

  it("rejects a missing thermostat answer", () => {
    assert.equal(
      isProfileComplete({ ...full, home: { heatingType: "gas", province: "ON" } }),
      false,
    );
  });
});

describe("normalizeProfile", () => {
  it("fills every gap with a defensible default", () => {
    const p = normalizeProfile({});
    assert.equal(p.transport.mode, "none");
    assert.equal(p.transport.weeklyKm, 0);
    assert.equal(p.diet.pattern, "omnivore");
    assert.equal(p.home.province, "ON");
    assert.equal(p.flights.perYear, 0);
  });

  it("keeps whatever was actually answered", () => {
    const p = normalizeProfile({ home: { province: "AB" }, flights: { perYear: 4 } });
    assert.equal(p.home.province, "AB");
    assert.equal(p.flights.perYear, 4);
  });

  it("replaces a bogus province rather than passing it to the engine", () => {
    const p = normalizeProfile({ home: { province: "XX" as never } });
    assert.equal(p.home.province, "ON");
  });
});

describe("FIELD_OPTIONS — we own the closed sets, not the model", () => {
  it("lists every province, so nine grids can never collapse into 'Other'", () => {
    const values = FIELD_OPTIONS["home.province"].map((o) => o.value);
    assert.equal(values.length, PROVINCES.length);
    for (const code of PROVINCES) {
      assert.ok(values.includes(code), `${code} missing from the province options`);
    }
  });

  it("offers only values the profile can legally hold", () => {
    for (const [field, options] of Object.entries(FIELD_OPTIONS)) {
      assert.ok(isProfileField(field), `${field} is not a real profile field`);
      const parts: string[] = field.split(".");
      for (const option of options) {
        const applied = applyAnswer({}, field, option.value) as Record<
          string,
          Record<string, unknown>
        >;
        assert.equal(applied[parts[0]][parts[1]], option.value);
        assert.ok(option.label.trim().length > 0, `${field}/${option.value} has no label`);
      }
    }
  });

  it("overrides whatever the model suggested for a known field", () => {
    const q: InterviewQuestion = {
      id: "p",
      text: "Where?",
      type: "choice",
      options: ["Ontario", "Other (Saskatchewan, Manitoba, Nova Scotia)"],
      profileField: "home.province",
    };
    const options = optionsFor(q);
    assert.equal(options.length, PROVINCES.length);
    assert.ok(!options.some((o) => o.label.startsWith("Other")));
  });

  it("falls back to the model's options for a field we don't own", () => {
    const q: InterviewQuestion = {
      id: "x",
      text: "Anything?",
      type: "choice",
      options: ["Yes", "No"],
      profileField: "transport.weeklyKm",
    };
    assert.deepEqual(
      optionsFor(q).map((o) => o.value),
      ["Yes", "No"],
    );
  });
});
