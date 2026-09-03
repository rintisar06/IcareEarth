/**
 * IcareEarth — the deterministic engine.
 *
 * Every number the product shows originates here. Pure functions, no network,
 * no randomness, no LLM. The same profile always yields the same ranking.
 *
 * The engine's job is not to report a footprint. It is to decide which single
 * change matters most for one specific person, which is why `feasible` is
 * strict and why the EV lever reads the provincial grid rather than a national
 * average.
 */

import type {
  DairyLevel,
  Factors,
  Intervention,
  Province,
  UserProfile,
} from "./types";

// ---------------------------------------------------------------------------
// Modelling assumptions
// ---------------------------------------------------------------------------

const WEEKS_PER_YEAR = 52;

/** Lunch + dinner. Breakfast is not modelled. */
const MEALS_PER_WEEK = 14;

/** How many of the week's main meals are cheese-heavy, by stated dairy level. */
const CHEESE_MEALS_BY_DAIRY: Record<DairyLevel, number> = {
  low: 1,
  medium: 3,
  high: 5,
};

/** For mode "mixed", the share of weekly km driven rather than taken by transit. */
const MIXED_MODE_CAR_SHARE = 0.5;

/**
 * "Transit two days a week" assumes weekly driving is concentrated in five
 * commuting days, so two days displaces two fifths of it.
 */
const TRANSIT_TWO_DAY_SHARE = 2 / 5;

/** How many beef meals the two "swap 2 meals" levers actually move. */
const SWAP_MEALS_PER_WEEK = 2;

// ---------------------------------------------------------------------------
// Footprint
// ---------------------------------------------------------------------------

export interface Footprint {
  transport: number;
  diet: number;
  homeEnergy: number;
  flights: number;
  total: number;
}

export type FootprintCategory = "transport" | "diet" | "homeEnergy" | "flights";

/** Grid intensity converted from g/kWh to kg/kWh. */
function gridKgPerKwh(province: Province, factors: Factors): number {
  return factors.gridGPerKwh[province] / 1000;
}

/**
 * An EV's emissions per km are a property of the province, not the car. This
 * single line is why Quebec and Alberta get different recommendations.
 */
function evKgPerKm(province: Province, factors: Factors): number {
  return gridKgPerKwh(province, factors) * factors.transportPerKm.evKwhPerKm;
}

/** Emissions per km of the vehicle this person actually drives. */
function vehicleKgPerKm(profile: UserProfile, factors: Factors): number {
  switch (profile.transport.vehicleType) {
    case "gas":
      return factors.transportPerKm.gasCar;
    case "hybrid":
      return factors.transportPerKm.hybridCar;
    case "ev":
      return evKgPerKm(profile.home.province, factors);
    case "none":
      return 0;
  }
}

/** Kilometres per year covered by car. */
export function carKmPerYear(profile: UserProfile): number {
  const { mode, weeklyKm } = profile.transport;
  const share = mode === "car" ? 1 : mode === "mixed" ? MIXED_MODE_CAR_SHARE : 0;
  return weeklyKm * share * WEEKS_PER_YEAR;
}

/** Kilometres per year covered by public transit. */
function transitKmPerYear(profile: UserProfile): number {
  const { mode, weeklyKm } = profile.transport;
  const share =
    mode === "transit" ? 1 : mode === "mixed" ? 1 - MIXED_MODE_CAR_SHARE : 0;
  return weeklyKm * share * WEEKS_PER_YEAR;
}

function transportKgPerYear(profile: UserProfile, factors: Factors): number {
  const car = carKmPerYear(profile) * vehicleKgPerKm(profile, factors);
  const transit =
    transitKmPerYear(profile) * factors.transportPerKm.busPerPassenger;
  return car + transit;
}

/** Meals per week of each type. Fractional values are fine — these are averages. */
interface MealMix {
  beef: number;
  chicken: number;
  plant: number;
  cheese: number;
}

/**
 * Split the week's 14 main meals. Red meat only counts for omnivores; dairy
 * level sets the cheese-heavy count unless the person is vegan; whatever
 * remains is chicken and plant for omnivores, plant for everyone else.
 */
function mealMix(profile: UserProfile): MealMix {
  const { pattern, redMeatMealsPerWeek, dairyLevel } = profile.diet;

  const beef =
    pattern === "omnivore"
      ? Math.min(Math.max(redMeatMealsPerWeek, 0), MEALS_PER_WEEK)
      : 0;

  const cheese =
    pattern === "vegan"
      ? 0
      : Math.min(CHEESE_MEALS_BY_DAIRY[dairyLevel], MEALS_PER_WEEK - beef);

  const remaining = Math.max(MEALS_PER_WEEK - beef - cheese, 0);

  if (pattern === "omnivore") {
    return { beef, chicken: remaining / 2, plant: remaining / 2, cheese };
  }
  return { beef, chicken: 0, plant: remaining, cheese };
}

function dietKgPerYear(profile: UserProfile, factors: Factors): number {
  const mix = mealMix(profile);
  const perWeek =
    mix.beef * factors.foodPerMealKg.beefMeal +
    mix.chicken * factors.foodPerMealKg.chickenMeal +
    mix.plant * factors.foodPerMealKg.plantMeal +
    mix.cheese * factors.foodPerMealKg.cheeseHeavyMeal;
  return perWeek * WEEKS_PER_YEAR;
}

/**
 * Annual heating emissions. Someone who already sets their thermostat back is
 * modelled as using proportionally less — otherwise two people who answered
 * that question differently would get identical footprints.
 */
function homeEnergyKgPerYear(profile: UserProfile, factors: Factors): number {
  const { heatingType, province, thermostatSetback } = profile.home;
  const e = factors.homeEnergy;

  let gross: number;
  switch (heatingType) {
    case "gas":
      gross = e.avgAnnualHeatingM3 * e.gasKgPerM3;
      break;
    case "oil":
      gross = e.avgAnnualHeatingLitres * e.oilKgPerLitre;
      break;
    case "electric":
      gross = e.avgAnnualHeatingKwhElectric * gridKgPerKwh(province, factors);
      break;
    case "none":
      return 0;
  }

  return thermostatSetback ? gross * (1 - e.thermostatSetbackSavingsPct) : gross;
}

/** Emissions of one round trip of the person's typical haul type. */
function perRoundTripKg(profile: UserProfile, factors: Factors): number {
  const f = factors.flightPerPassengerKm;
  return profile.flights.typicalDistance === "short"
    ? f.shortHaul * f.shortHaulTripKm
    : f.longHaul * f.longHaulTripKm;
}

function flightsKgPerYear(profile: UserProfile, factors: Factors): number {
  return Math.max(profile.flights.perYear, 0) * perRoundTripKg(profile, factors);
}

/** Annual kg CO2e by category, plus the total. */
export function computeFootprint(
  profile: UserProfile,
  factors: Factors,
): Footprint {
  const transport = transportKgPerYear(profile, factors);
  const diet = dietKgPerYear(profile, factors);
  const homeEnergy = homeEnergyKgPerYear(profile, factors);
  const flights = flightsKgPerYear(profile, factors);

  return {
    transport,
    diet,
    homeEnergy,
    flights,
    total: transport + diet + homeEnergy + flights,
  };
}

/** The category contributing the most, used for the twin chart caption. */
export function dominantCategory(footprint: Footprint): FootprintCategory {
  const entries: [FootprintCategory, number][] = [
    ["transport", footprint.transport],
    ["diet", footprint.diet],
    ["homeEnergy", footprint.homeEnergy],
    ["flights", footprint.flights],
  ];
  return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

export const CATEGORY_LABELS: Record<FootprintCategory, string> = {
  transport: "driving",
  diet: "food",
  homeEnergy: "home heating",
  flights: "flying",
};

// ---------------------------------------------------------------------------
// Interventions
// ---------------------------------------------------------------------------

/** A profile with one thing changed, used to price a lever by re-running the engine. */
function withDiet(
  profile: UserProfile,
  diet: Partial<UserProfile["diet"]>,
): UserProfile {
  return { ...profile, diet: { ...profile.diet, ...diet } };
}

const drivesACar = (p: UserProfile) =>
  (p.transport.mode === "car" || p.transport.mode === "mixed") &&
  p.transport.weeklyKm > 0;

/**
 * The ten candidate changes. Every `feasible` predicate is strict: an
 * intervention that cannot apply to this person must never reach their ranking.
 */
export function buildInterventions(): Intervention[] {
  return [
    {
      id: "swap-beef-chicken",
      label: "Swap 2 beef meals a week for chicken",
      description:
        "Keep eating meat. Move two of your weekly beef meals to chicken.",
      assumptions:
        "2 meals per week, 52 weeks, at a 100 g portion. Beef is roughly ten times chicken per kilogram.",
      sourceCitation: "Poore & Nemecek (2018), Science, via Our World in Data",
      feasible: (p) => p.diet.pattern === "omnivore" && p.diet.redMeatMealsPerWeek >= 2,
      savingsKgPerYear: (_p, f) =>
        (f.foodPerMealKg.beefMeal - f.foodPerMealKg.chickenMeal) *
        SWAP_MEALS_PER_WEEK *
        WEEKS_PER_YEAR,
    },
    {
      id: "swap-beef-plant",
      label: "Swap 2 beef meals a week for plants",
      description:
        "Move two of your weekly beef meals to beans, lentils, or tofu.",
      assumptions:
        "2 meals per week, 52 weeks. A 150 g pulse portion against a 100 g beef portion.",
      sourceCitation: "Poore & Nemecek (2018), Science, via Our World in Data",
      feasible: (p) => p.diet.pattern === "omnivore" && p.diet.redMeatMealsPerWeek >= 2,
      savingsKgPerYear: (_p, f) =>
        (f.foodPerMealKg.beefMeal - f.foodPerMealKg.plantMeal) *
        SWAP_MEALS_PER_WEEK *
        WEEKS_PER_YEAR,
    },
    {
      id: "go-vegetarian",
      label: "Go fully vegetarian",
      description: "Drop meat entirely, keeping dairy at your current level.",
      assumptions:
        "Your whole week of main meals repriced with no meat, dairy unchanged.",
      sourceCitation: "Poore & Nemecek (2018), Science, via Our World in Data",
      feasible: (p) => p.diet.pattern === "omnivore",
      savingsKgPerYear: (p, f) =>
        dietKgPerYear(p, f) -
        dietKgPerYear(
          withDiet(p, { pattern: "vegetarian", redMeatMealsPerWeek: 0 }),
          f,
        ),
    },
    {
      id: "transit-two-days",
      label: "Take transit two days a week",
      description: "Leave the car home two days out of five and take the bus.",
      assumptions:
        "Two fifths of your driving replaced by bus at average occupancy. Priced as bus rather than rail on purpose: bus emits about three times as much per passenger-kilometre, so if you take a train instead the real saving is larger than this.",
      sourceCitation: "UK DESNZ/DEFRA GHG Conversion Factors 2025",
      feasible: drivesACar,
      savingsKgPerYear: (p, f) =>
        carKmPerYear(p) *
        TRANSIT_TWO_DAY_SHARE *
        (vehicleKgPerKm(p, f) - f.transportPerKm.busPerPassenger),
    },
    {
      id: "transit-full",
      label: "Switch to transit entirely",
      description: "Give up driving and take the bus for all of it.",
      assumptions:
        "All of your driving replaced by bus at average occupancy. Priced as bus rather than rail on purpose: bus emits about three times as much per passenger-kilometre, so if you take a train instead the real saving is larger than this.",
      sourceCitation: "UK DESNZ/DEFRA GHG Conversion Factors 2025",
      feasible: drivesACar,
      savingsKgPerYear: (p, f) =>
        carKmPerYear(p) *
        (vehicleKgPerKm(p, f) - f.transportPerKm.busPerPassenger),
    },
    {
      id: "next-car-hybrid",
      label: "Make your next car a hybrid",
      description: "Same driving, a hybrid instead of a petrol car.",
      assumptions:
        "Your current annual distance at the average hybrid factor. Manufacturing emissions are not counted.",
      sourceCitation: "UK DESNZ/DEFRA GHG Conversion Factors 2025",
      feasible: (p) => drivesACar(p) && p.transport.vehicleType === "gas",
      savingsKgPerYear: (p, f) =>
        carKmPerYear(p) * (f.transportPerKm.gasCar - f.transportPerKm.hybridCar),
    },
    {
      id: "next-car-ev",
      label: "Make your next car electric",
      description:
        "Same driving, an EV charged on your province's grid.",
      assumptions:
        "Your current annual distance at 20 kWh/100 km, priced at your province's grid intensity. Manufacturing emissions are not counted.",
      sourceCitation:
        "NRCan EnerGuide; ECCC Emission factors and reference values v3.0, Table 5.3",
      feasible: (p) =>
        drivesACar(p) &&
        (p.transport.vehicleType === "gas" || p.transport.vehicleType === "hybrid"),
      savingsKgPerYear: (p, f) =>
        carKmPerYear(p) * (vehicleKgPerKm(p, f) - evKgPerKm(p.home.province, f)),
    },
    {
      id: "thermostat-setback",
      label: "Set the thermostat back 2 degrees",
      description:
        "Drop the heat two degrees overnight and when the place is empty.",
      assumptions: "A 2 degree setback held about eight hours a day.",
      sourceCitation: "NRCan and US DOE setback guidance",
      feasible: (p) =>
        (p.home.heatingType === "gas" || p.home.heatingType === "oil") &&
        !p.home.thermostatSetback,
      savingsKgPerYear: (p, f) =>
        homeEnergyKgPerYear(p, f) * f.homeEnergy.thermostatSetbackSavingsPct,
    },
    {
      id: "one-fewer-short-haul",
      label: "Take one fewer short-haul trip a year",
      description: "Drop a single short-haul return flight from your year.",
      assumptions:
        "One 2,500 km return trip in economy. No radiative forcing multiplier, so this is the conservative figure.",
      sourceCitation: "UK DESNZ/DEFRA GHG Conversion Factors 2025",
      feasible: (p) => p.flights.perYear >= 1 && p.flights.typicalDistance === "short",
      savingsKgPerYear: (_p, f) =>
        f.flightPerPassengerKm.shortHaul * f.flightPerPassengerKm.shortHaulTripKm,
    },
    {
      id: "one-fewer-long-haul",
      label: "Take one fewer long-haul trip a year",
      description: "Drop a single long-haul return flight from your year.",
      assumptions:
        "One 11,000 km return trip in economy. No radiative forcing multiplier, so this is the conservative figure.",
      sourceCitation: "UK DESNZ/DEFRA GHG Conversion Factors 2025",
      feasible: (p) => p.flights.perYear >= 1 && p.flights.typicalDistance === "long",
      savingsKgPerYear: (_p, f) =>
        f.flightPerPassengerKm.longHaul * f.flightPerPassengerKm.longHaulTripKm,
    },
  ];
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

export interface RankedLever {
  intervention: Intervention;
  /** Annual kg CO2e this person would avoid. */
  savingsKgPerYear: number;
  /** Share of their current total, 0..1. */
  shareOfTotal: number;
}

/**
 * Feasible interventions, largest saving first, with the saving attached so
 * callers never recompute it.
 */
export function rankLevers(
  profile: UserProfile,
  factors: Factors,
): RankedLever[] {
  const { total } = computeFootprint(profile, factors);

  return buildInterventions()
    .filter((i) => i.feasible(profile))
    .map((intervention) => {
      const savings = Math.max(intervention.savingsKgPerYear(profile, factors), 0);
      return {
        intervention,
        savingsKgPerYear: savings,
        shareOfTotal: total > 0 ? savings / total : 0,
      };
    })
    .filter((lever) => lever.savingsKgPerYear > 0)
    .sort((a, b) => b.savingsKgPerYear - a.savingsKgPerYear);
}

/**
 * Cumulative emissions with and without a lever, for the twin chart.
 * Year 0 is today, so both lines start at zero and diverge linearly.
 */
export function cumulativeSeries(
  footprint: Footprint,
  savingsKgPerYear: number,
  years: number,
): { year: number; now: number; withLever: number }[] {
  return Array.from({ length: years + 1 }, (_, year) => ({
    year,
    now: footprint.total * year,
    withLever: Math.max(footprint.total - savingsKgPerYear, 0) * year,
  }));
}
