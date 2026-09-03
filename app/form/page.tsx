"use client";

/**
 * IcareEarth — the form.
 *
 * Everything the interview collects, on one page, with no model in the loop.
 * This is where people land when the agent path fails, so it has to work with
 * the network on fire. It preloads whatever the interview already got out of
 * them — nobody should answer the same question twice because a model timed out.
 */

import { useMemo, useState } from "react";
import Logo from "@/components/Logo";
import { useRouter } from "next/navigation";
import {
  FIELD_OPTIONS,
  clampNumber,
  numberBounds,
  normalizeProfile,
  type DeepPartialProfile,
} from "@/lib/interview";
import { getProfile, setProfile as storeProfile } from "@/lib/store";
import { PROVINCE_NAMES, PROVINCES } from "@/lib/types";

function ChoiceGroup({
  legend,
  hint,
  field,
  value,
  onChange,
  columns = 2,
}: {
  legend: string;
  hint?: string;
  field: string;
  value: string | undefined;
  onChange: (value: string) => void;
  columns?: number;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div
        className="mt-2.5 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {FIELD_OPTIONS[field].map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={`btn-choice text-sm ${
                selected ? "border-accent! bg-accent-soft! font-medium" : ""
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function NumberField({
  label,
  hint,
  field,
  unit,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  field: string;
  unit: string;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const bounds = numberBounds(field);
  // Say so when a value was rewritten. A number that silently changes under
  // your fingers reads as a bug, not a guard rail.
  const [clamped, setClamped] = useState(false);

  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-2.5 flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={bounds?.min}
          max={bounds?.max}
          value={value ?? ""}
          placeholder="0"
          onChange={(event) => {
            const raw = event.target.value;
            if (raw.trim() === "") {
              setClamped(false);
              onChange(0);
              return;
            }
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) return;
            const next = clampNumber(field, parsed);
            setClamped(next !== parsed);
            onChange(next);
          }}
          className="w-32 rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />
        <span className="text-sm text-muted">{unit}</span>
      </div>
      {clamped && bounds && (
        <p className="mt-1.5 text-sm text-warm" role="status">
          We keep this between {bounds.min} and {bounds.max}.
        </p>
      )}
    </label>
  );
}

export default function FormPage() {
  const router = useRouter();

  // Read once: this is a starting point to edit, not live state to track.
  const [draft, setDraft] = useState<DeepPartialProfile>(() => getProfile() ?? {});

  const set = <S extends keyof DeepPartialProfile>(
    section: S,
    patch: Partial<DeepPartialProfile[S]>,
  ) =>
    setDraft((d) => ({ ...d, [section]: { ...(d[section] ?? {}), ...patch } }));

  const { transport, diet, home, flights } = draft;

  const drives = transport?.mode === "car" || transport?.mode === "mixed";
  const movesAtAll = transport?.mode !== undefined && transport.mode !== "none";
  const eatsMeat = diet?.pattern === "omnivore";
  const usesDairy = diet?.pattern !== "vegan";
  const burnsFuel = home?.heatingType === "gas" || home?.heatingType === "oil";
  const heatsWithElectricity = home?.heatingType === "electric";
  const flies = (flights?.perYear ?? 0) > 0;

  const missing = useMemo(() => {
    const gaps: string[] = [];
    if (!transport?.mode) gaps.push("how you get around");
    if (!diet?.pattern) gaps.push("your diet");
    if (usesDairy && !diet?.dairyLevel) gaps.push("dairy");
    if (!home?.heatingType) gaps.push("heating");
    if (!home?.province) gaps.push("province");
    return gaps;
  }, [transport?.mode, diet?.pattern, diet?.dairyLevel, home?.heatingType, home?.province, usesDairy]);

  function submit() {
    if (missing.length > 0) return;
    storeProfile(normalizeProfile(draft));
    router.push("/results");
  }

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-8 sm:py-12">
      <Logo />

      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
        Tell us about your life
      </h1>
      <p className="mt-2 text-sm text-muted">
        Rough answers are fine. We only need enough to work out which single
        change matters most for you.
      </p>

      <div className="mt-9 space-y-9">
        <section className="space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
            Getting around
          </h2>

          <ChoiceGroup
            legend="How do you usually travel?"
            field="transport.mode"
            value={transport?.mode}
            onChange={(mode) =>
              set(
                "transport",
                mode === "none"
                  ? { mode: "none", weeklyKm: 0, vehicleType: "none" }
                  : { mode: mode as never },
              )
            }
          />

          {/* Asking a carless person about their engine is how a tool loses trust. */}
          {movesAtAll && (
            <NumberField
              label="How far do you travel in a week?"
              hint="Everything: commute, errands, weekends."
              field="transport.weeklyKm"
              unit="km per week"
              value={transport?.weeklyKm}
              onChange={(weeklyKm) => set("transport", { weeklyKm })}
            />
          )}

          {drives && (
            <ChoiceGroup
              legend="What do you drive?"
              field="transport.vehicleType"
              value={transport?.vehicleType}
              onChange={(vehicleType) => set("transport", { vehicleType: vehicleType as never })}
            />
          )}
        </section>

        <section className="space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
            Food
          </h2>

          <ChoiceGroup
            legend="How do you eat?"
            field="diet.pattern"
            columns={3}
            value={diet?.pattern}
            onChange={(pattern) =>
              set(
                "diet",
                pattern === "omnivore"
                  ? { pattern: "omnivore" }
                  : pattern === "vegan"
                    ? { pattern: "vegan", redMeatMealsPerWeek: 0, dairyLevel: "low" }
                    : { pattern: "vegetarian", redMeatMealsPerWeek: 0 },
              )
            }
          />

          {eatsMeat && (
            <NumberField
              label="How many meals a week centre on red meat?"
              hint="Beef, lamb, pork. Out of roughly 14 main meals."
              field="diet.redMeatMealsPerWeek"
              unit="meals per week"
              value={diet?.redMeatMealsPerWeek}
              onChange={(redMeatMealsPerWeek) => set("diet", { redMeatMealsPerWeek })}
            />
          )}

          {usesDairy && (
            <ChoiceGroup
              legend="How much cheese and dairy?"
              field="diet.dairyLevel"
              columns={3}
              value={diet?.dairyLevel}
              onChange={(dairyLevel) => set("diet", { dairyLevel: dairyLevel as never })}
            />
          )}
        </section>

        <section className="space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
            Home
          </h2>

          <ChoiceGroup
            legend="How is your place heated?"
            field="home.heatingType"
            value={home?.heatingType}
            onChange={(heatingType) => set("home", { heatingType: heatingType as never })}
          />

          <div>
            <label className="block">
              <span className="text-sm font-medium">Where do you live?</span>
              {heatsWithElectricity ? (
                <p className="mt-1 text-sm text-warm">
                  This matters more than any other answer you give us. Electric
                  heat in Quebec is close to carbon-free; the same heat in
                  Alberta emits roughly 230 times as much.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  Your province decides how clean your electricity is.
                </p>
              )}
              <select
                value={home?.province ?? ""}
                onChange={(event) =>
                  set("home", { province: event.target.value as never })
                }
                className={`mt-2.5 w-full rounded-xl border bg-surface px-4 py-3 text-base outline-none focus:border-accent ${
                  heatsWithElectricity && !home?.province
                    ? "border-warm"
                    : "border-border"
                }`}
              >
                <option value="" disabled>
                  Choose a province or territory
                </option>
                {PROVINCES.map((code) => (
                  <option key={code} value={code}>
                    {PROVINCE_NAMES[code]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {burnsFuel && (
            <fieldset>
              <legend className="text-sm font-medium">
                Do you already turn the heat down overnight?
              </legend>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {[
                  { value: true, label: "Yes, already do" },
                  { value: false, label: "No, not really" },
                ].map((option) => {
                  const selected = home?.thermostatSetback === option.value;
                  return (
                    <button
                      key={String(option.value)}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => set("home", { thermostatSetback: option.value })}
                      className={`btn-choice text-sm ${
                        selected ? "border-accent! bg-accent-soft! font-medium" : ""
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </section>

        <section className="space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
            Flying
          </h2>

          <NumberField
            label="Return flights in a typical year?"
            hint="Count round trips, not individual take-offs."
            field="flights.perYear"
            unit="round trips"
            value={flights?.perYear}
            onChange={(perYear) => set("flights", { perYear })}
          />

          {flies && (
            <ChoiceGroup
              legend="Mostly how far?"
              field="flights.typicalDistance"
              value={flights?.typicalDistance}
              onChange={(typicalDistance) =>
                set("flights", { typicalDistance: typicalDistance as never })
              }
            />
          )}
        </section>
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <button
          type="button"
          onClick={submit}
          disabled={missing.length > 0}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          Find my biggest lever
        </button>
        {missing.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            Still need: {missing.join(", ")}.
          </p>
        )}
      </div>
    </main>
  );
}
