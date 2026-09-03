/**
 * IcareEarth — turning a profile back into sentences.
 *
 * The interview extracts values through a model; this reads them back so a
 * person can check we understood them before we compute anything. Pure and
 * testable, with no React in it.
 */

import { PROVINCE_NAMES, type UserProfile } from "./types.ts";

export interface ProfileLine {
  /** Stable id, handy as a React key and in tests. */
  id: string;
  label: string;
  value: string;
}

function transportLine(p: UserProfile): string {
  const { mode, weeklyKm, vehicleType } = p.transport;
  if (mode === "none") return "You walk or cycle — no car, no transit";

  const vehicle =
    vehicleType === "gas"
      ? "a petrol or diesel car"
      : vehicleType === "hybrid"
        ? "a hybrid"
        : vehicleType === "ev"
          ? "an electric car"
          : "no vehicle";

  const distance = `${weeklyKm.toLocaleString("en-CA")} km a week`;

  if (mode === "car") return `You drive ${distance} in ${vehicle}`;
  if (mode === "transit") return `You take transit, ${distance}`;
  return `You split ${distance} between ${vehicle} and transit`;
}

function dietLine(p: UserProfile): string {
  const { pattern, redMeatMealsPerWeek, dairyLevel } = p.diet;
  const dairy =
    dairyLevel === "low"
      ? "rarely eat cheese or dairy"
      : dairyLevel === "medium"
        ? "eat dairy most days"
        : "eat a lot of dairy";

  if (pattern === "vegan") return "You eat vegan";
  if (pattern === "vegetarian") return `You are vegetarian and ${dairy}`;

  const meat =
    redMeatMealsPerWeek === 0
      ? "never centre a meal on red meat"
      : redMeatMealsPerWeek === 1
        ? "have red meat once a week"
        : `have red meat ${redMeatMealsPerWeek} times a week`;
  return `You ${meat}, and ${dairy}`;
}

function homeLine(p: UserProfile): string {
  const { heatingType, province, thermostatSetback } = p.home;
  const where = PROVINCE_NAMES[province];

  if (heatingType === "none") return `You live in ${where} and don't heat your home`;

  const heat =
    heatingType === "gas"
      ? "heat with natural gas"
      : heatingType === "oil"
        ? "heat with oil"
        : "heat with electricity";

  const setback =
    heatingType === "electric"
      ? ""
      : thermostatSetback
        ? ", and already turn it down overnight"
        : ", and don't turn it down overnight";

  return `You live in ${where}, ${heat}${setback}`;
}

function flightsLine(p: UserProfile): string {
  const { perYear, typicalDistance } = p.flights;
  if (perYear === 0) return "You don't fly";

  const haul = typicalDistance === "short" ? "short-haul" : "long-haul";
  const trips = perYear === 1 ? "one return trip" : `${perYear} return trips`;
  return `You take ${trips} a year, mostly ${haul}`;
}

/** The whole profile as four plain sentences, in the order we ask about them. */
export function describeProfileLines(p: UserProfile): ProfileLine[] {
  return [
    { id: "transport", label: "Getting around", value: transportLine(p) },
    { id: "diet", label: "Food", value: dietLine(p) },
    { id: "home", label: "Home", value: homeLine(p) },
    { id: "flights", label: "Flying", value: flightsLine(p) },
  ];
}
