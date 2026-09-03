/**
 * IcareEarth — plan narration.
 *
 * The model writes prose around numbers the engine already computed. It is
 * told, and structurally only able, to reuse the figures handed to it.
 *
 * This endpoint is public and unauthenticated, so nothing from the request is
 * trusted: every field is validated against the real unions before any of it
 * reaches a prompt.
 */

import Anthropic from "@anthropic-ai/sdk";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { PROVINCES, PROVINCE_NAMES } from "@/lib/types";
import type {
  DairyLevel,
  DietPattern,
  FlightDistance,
  HeatingType,
  Province,
  TransportMode,
  UserProfile,
  VehicleType,
} from "@/lib/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 600;

/** Rejects a body big enough to be an attack rather than a profile. */
const MAX_BODY_BYTES = 32_000;
const MAX_TEXT_LEN = 400;

const SYSTEM_PROMPT = `Write a 4 to 6 sentence action plan for this specific person. Reference at least two of their actual answers. Use ONLY the numbers provided in the input, never introduce new figures. Concrete first steps, plain language, no hype.`;

export interface PlanRequestBody {
  profile: UserProfile;
  lever: { label: string; description: string; assumptions: string };
  numbers: {
    totalKgPerYear: number;
    savingsKgPerYear: number;
    shareOfTotalPct: number;
    equivalent: string;
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const TRANSPORT_MODES: TransportMode[] = ["none", "car", "transit", "mixed"];
const VEHICLE_TYPES: VehicleType[] = ["gas", "hybrid", "ev", "none"];
const DIET_PATTERNS: DietPattern[] = ["omnivore", "vegetarian", "vegan"];
const DAIRY_LEVELS: DairyLevel[] = ["low", "medium", "high"];
const HEATING_TYPES: HeatingType[] = ["gas", "electric", "oil", "none"];
const FLIGHT_DISTANCES: FlightDistance[] = ["short", "long"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function oneOf<T extends string>(value: unknown, allowed: T[]): T | null {
  return typeof value === "string" && (allowed as string[]).includes(value)
    ? (value as T)
    : null;
}

/** Finite, in range, and not NaN dressed up as a number. */
function num(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LEN) return null;
  return trimmed;
}

function validate(raw: unknown): PlanRequestBody | null {
  if (!isRecord(raw)) return null;
  const { profile: p, lever: l, numbers: n } = raw;
  if (!isRecord(p) || !isRecord(l) || !isRecord(n)) return null;

  const transport = p.transport;
  const diet = p.diet;
  const home = p.home;
  const flights = p.flights;
  if (!isRecord(transport) || !isRecord(diet) || !isRecord(home) || !isRecord(flights)) {
    return null;
  }

  const mode = oneOf(transport.mode, TRANSPORT_MODES);
  const vehicleType = oneOf(transport.vehicleType, VEHICLE_TYPES);
  const weeklyKm = num(transport.weeklyKm, 0, 5000);
  const pattern = oneOf(diet.pattern, DIET_PATTERNS);
  const dairyLevel = oneOf(diet.dairyLevel, DAIRY_LEVELS);
  const redMeatMealsPerWeek = num(diet.redMeatMealsPerWeek, 0, 14);
  const heatingType = oneOf(home.heatingType, HEATING_TYPES);
  const province = oneOf<Province>(home.province, [...PROVINCES]);
  const perYear = num(flights.perYear, 0, 100);
  const typicalDistance = oneOf(flights.typicalDistance, FLIGHT_DISTANCES);

  if (
    !mode ||
    !vehicleType ||
    weeklyKm === null ||
    !pattern ||
    !dairyLevel ||
    redMeatMealsPerWeek === null ||
    !heatingType ||
    !province ||
    perYear === null ||
    !typicalDistance ||
    typeof home.thermostatSetback !== "boolean"
  ) {
    return null;
  }

  const label = text(l.label);
  const description = text(l.description);
  const assumptions = text(l.assumptions);
  const equivalent = text(n.equivalent);
  const totalKgPerYear = num(n.totalKgPerYear, 0, 1_000_000);
  const savingsKgPerYear = num(n.savingsKgPerYear, 0, 1_000_000);
  const shareOfTotalPct = num(n.shareOfTotalPct, 0, 100);

  if (
    !label ||
    !description ||
    !assumptions ||
    !equivalent ||
    totalKgPerYear === null ||
    savingsKgPerYear === null ||
    shareOfTotalPct === null
  ) {
    return null;
  }

  return {
    profile: {
      transport: { mode, weeklyKm, vehicleType },
      diet: { pattern, redMeatMealsPerWeek, dairyLevel },
      home: { heatingType, province, thermostatSetback: home.thermostatSetback },
      flights: { perYear, typicalDistance },
    },
    lever: { label, description, assumptions },
    numbers: { totalKgPerYear, savingsKgPerYear, shareOfTotalPct, equivalent },
  };
}

// ---------------------------------------------------------------------------

function describeProfile(p: UserProfile): string {
  const lines = [
    `Lives in: ${PROVINCE_NAMES[p.home.province]}`,
    `Heating: ${p.home.heatingType}${
      p.home.heatingType === "gas" || p.home.heatingType === "oil"
        ? p.home.thermostatSetback
          ? ", already sets the thermostat back"
          : ", does not set the thermostat back"
        : ""
    }`,
    `Travel: ${p.transport.mode}${
      p.transport.mode === "none"
        ? " (no car at all)"
        : `, ${p.transport.weeklyKm} km a week, vehicle: ${p.transport.vehicleType}`
    }`,
    `Diet: ${p.diet.pattern}${
      p.diet.pattern === "omnivore"
        ? `, ${p.diet.redMeatMealsPerWeek} red meat meals a week`
        : ""
    }${p.diet.pattern === "vegan" ? "" : `, dairy: ${p.diet.dairyLevel}`}`,
    `Flights: ${p.flights.perYear} return trips a year${
      p.flights.perYear > 0 ? ` (${p.flights.typicalDistance}-haul)` : ""
    }`,
  ];
  return lines.join("\n");
}

const RATE_LIMIT = 6;
const RATE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  // A plan is a Sonnet call. Cap it harder than the interview.
  const limit = rateLimit(callerKey(request, "plan"), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Plan writing is unavailable." }, { status: 503 });
  }

  let body: PlanRequestBody | null;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Request body too large." }, { status: 413 });
    }
    body = validate(JSON.parse(raw));
  } catch {
    body = null;
  }

  if (!body) {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const { profile, lever, numbers } = body;

  const userMessage = `This person:
${describeProfile(profile)}

The single change we are recommending:
${lever.label} — ${lever.description}
What the estimate assumes: ${lever.assumptions}

The only numbers you may use:
- Their current footprint: ${Math.round(numbers.totalKgPerYear)} kg CO2e per year
- What this change saves: ${Math.round(numbers.savingsKgPerYear)} kg CO2e per year
- That is ${numbers.shareOfTotalPct.toFixed(0)}% of their footprint
- Equivalent to: ${numbers.equivalent}

Write their plan. Address them as "you".`;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    const plan = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!plan) {
      return Response.json({ error: "The plan came back empty." }, { status: 502 });
    }

    return Response.json({ plan });
  } catch (error) {
    const status =
      error instanceof Anthropic.APIError && error.status ? error.status : 502;
    return Response.json(
      { error: "Could not write the plan." },
      { status: status === 401 || status === 403 ? 502 : status },
    );
  }
}
