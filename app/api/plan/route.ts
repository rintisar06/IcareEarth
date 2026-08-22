/**
 * IcareEarth — plan narration.
 *
 * The model writes prose around numbers the engine already computed. It is
 * told, and structurally only able, to reuse the figures handed to it.
 */

import Anthropic from "@anthropic-ai/sdk";
import { PROVINCE_NAMES } from "@/lib/types";
import type { UserProfile } from "@/lib/types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 600;

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

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Plan writing is unavailable." }, { status: 503 });
  }

  let body: PlanRequestBody;
  try {
    body = await request.json();
    if (!body?.profile || !body?.lever || !body?.numbers) throw new Error("shape");
  } catch {
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
