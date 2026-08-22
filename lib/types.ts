/**
 * IcareEarth — shared domain types.
 *
 * Nothing here computes anything. lib/engine.ts owns all math; these are the
 * shapes it reads and writes. The LLM never produces a number that lands in
 * this file's `savingsKgPerYear` — it only picks questions and writes prose.
 */

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export type TransportMode = "none" | "car" | "transit" | "mixed";
export type VehicleType = "gas" | "hybrid" | "ev" | "none";

export type DietPattern = "omnivore" | "vegetarian" | "vegan";
export type DairyLevel = "low" | "medium" | "high";

export type HeatingType = "gas" | "electric" | "oil" | "none";

export type FlightDistance = "short" | "long";

/** Canada's 10 provinces + 3 territories — the keys of factors.gridGPerKwh. */
export const PROVINCES = [
  "ON", "QC", "BC", "AB", "SK", "MB",
  "NS", "NB", "NL", "PE", "YT", "NT", "NU",
] as const;

export type Province = (typeof PROVINCES)[number];

export const PROVINCE_NAMES: Record<Province, string> = {
  ON: "Ontario",
  QC: "Quebec",
  BC: "British Columbia",
  AB: "Alberta",
  SK: "Saskatchewan",
  MB: "Manitoba",
  NS: "Nova Scotia",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  PE: "Prince Edward Island",
  YT: "Yukon",
  NT: "Northwest Territories",
  NU: "Nunavut",
};

export interface UserProfile {
  transport: {
    mode: TransportMode;
    /** Kilometres travelled per week, all personal transport. */
    weeklyKm: number;
    vehicleType: VehicleType;
  };
  diet: {
    pattern: DietPattern;
    /** Of 14 main meals per week, how many centre on red meat. */
    redMeatMealsPerWeek: number;
    dairyLevel: DairyLevel;
  };
  home: {
    heatingType: HeatingType;
    province: Province;
    /** True if they already set the thermostat back at night / when out. */
    thermostatSetback: boolean;
  };
  flights: {
    perYear: number;
    typicalDistance: FlightDistance;
  };
}

// ---------------------------------------------------------------------------
// Emission factors (the shape of lib/factors.json)
// ---------------------------------------------------------------------------

export interface Factors {
  /** kg CO2e attributable to one main meal of each type. */
  foodPerMealKg: {
    beefMeal: number;
    chickenMeal: number;
    plantMeal: number;
    cheeseHeavyMeal: number;
  };
  /** kg CO2e per passenger-kilometre, except evKwhPerKm. */
  transportPerKm: {
    gasCar: number;
    hybridCar: number;
    busPerPassenger: number;
    trainPerPassenger: number;
    /**
     * Electricity drawn per km by an EV, in kWh. Not an emission factor:
     * the engine multiplies this by the province's grid intensity, which is
     * why an EV is a different recommendation in Quebec than in Alberta.
     */
    evKwhPerKm: number;
  };
  /**
   * kg CO2e per passenger-kilometre flown, and the assumed round-trip
   * distance of each haul type. No radiative forcing multiplier is applied
   * — see README. This understates real flight warming impact.
   */
  flightPerPassengerKm: {
    shortHaul: number;
    longHaul: number;
    shortHaulTripKm: number;
    longHaulTripKm: number;
  };
  homeEnergy: {
    gasKgPerM3: number;
    avgAnnualHeatingM3: number;
    oilKgPerLitre: number;
    avgAnnualHeatingLitres: number;
    /** Fraction of heating energy saved by a 2 degree setback, 0..1. */
    thermostatSetbackSavingsPct: number;
    avgAnnualHeatingKwhElectric: number;
  };
  /** Grams CO2e per kWh of grid electricity, by province. */
  gridGPerKwh: Record<Province, number>;
}

// ---------------------------------------------------------------------------
// Interventions
// ---------------------------------------------------------------------------

/**
 * One candidate change a person could make.
 *
 * `feasible` is strict on purpose: an intervention that cannot apply to this
 * person must never appear in their ranking. Telling a carless vegan to drive
 * less is how a tool loses trust.
 */
export interface Intervention {
  id: string;
  /** Plain-language name shown on the results card. */
  label: string;
  /** One sentence on what the person actually does. */
  description: string;
  /** What the number assumes — shown so the estimate can be argued with. */
  assumptions: string;
  sourceCitation: string;
  feasible: (profile: UserProfile) => boolean;
  savingsKgPerYear: (profile: UserProfile, factors: Factors) => number;
}
