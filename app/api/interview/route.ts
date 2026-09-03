/**
 * IcareEarth — interview agent.
 *
 * The model's only job here is deciding what to ask next. It never computes an
 * emission number. Runs server-side; ANTHROPIC_API_KEY never reaches the client.
 */

import Anthropic from "@anthropic-ai/sdk";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { PROVINCES } from "@/lib/types";
import {
  parseInterviewResponse,
  type InterviewRequestBody,
  type InterviewResult,
} from "@/lib/interview";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 400;

const SYSTEM_PROMPT = `You are the interviewer for IcareEarth, a tool that finds the single highest impact climate lever for one specific person. You ask ONE question per turn. You receive the profile collected so far and the question history. Rules: 1. Never ask about a topic the profile already rules out. If transport.mode is none, never ask about vehicles or commute distance. If diet.pattern is vegan, never ask about red meat or dairy. 2. Ask 6 to 10 questions total, covering transport, diet, home energy, and flights. 3. Prefer choice questions with 3 to 5 options; weeklyKm and flights per year are number inputs. 4. When the profile can compute all four categories, return complete true with final profileUpdates. 5. Respond with ONLY the JSON object matching the schema. No prose, no markdown.`;

const SCHEMA_BRIEF = `The profile you are filling has exactly this shape. Only these values are legal:

transport.mode: "none" | "car" | "transit" | "mixed"
transport.weeklyKm: number
transport.vehicleType: "gas" | "hybrid" | "ev" | "none"
diet.pattern: "omnivore" | "vegetarian" | "vegan"
diet.redMeatMealsPerWeek: number (0-14)
diet.dairyLevel: "low" | "medium" | "high"
home.heatingType: "gas" | "electric" | "oil" | "none"
home.province: ${PROVINCES.join(" | ")}
home.thermostatSetback: boolean
flights.perYear: number (ROUND TRIPS per year, not segments)
flights.typicalDistance: "short" | "long"

Reply with ONLY this JSON object:

{
  "complete": boolean,
  "question": {
    "id": "short-slug",
    "text": "The question as you would say it to a person",
    "type": "choice" | "number" | "boolean",
    "options": ["only for type choice, 3 to 5 plain-language labels"],
    "unit": "only for type number, e.g. km",
    "profileField": "dotted path from the list above, e.g. transport.weeklyKm"
  },
  "profileUpdates": { "section": { "key": value } }
}

Omit "question" when complete is true. Use profileUpdates to record anything the
last answer lets you infer, using the exact legal values above — never the
option label you showed the person. Ask about province early; it changes the
answer more than anything else.`;

function userMessage(body: InterviewRequestBody): string {
  const historyText = body.history.length
    ? body.history.map((h, i) => `${i + 1}. Q: ${h.question}\n   A: ${h.answer}`).join("\n")
    : "(none yet — this is the first question)";

  return `${SCHEMA_BRIEF}

Profile so far:
${JSON.stringify(body.profile, null, 2)}

Questions already asked (${body.history.length} so far):
${historyText}`;
}

function fallback(reason: string): Response {
  return Response.json({ fallback: true, reason } satisfies InterviewResult);
}

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 32_000;

export async function POST(request: Request) {
  // An interview is many small Haiku calls, so this is looser than /api/plan.
  const limit = rateLimit(callerKey(request, "interview"), RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  if (!process.env.ANTHROPIC_API_KEY) {
    // Retrying will not conjure a key. Send them to the form immediately.
    return fallback("no-api-key");
  }

  let body: InterviewRequestBody;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Request body too large." }, { status: 413 });
    }
    const raw = JSON.parse(text);
    body = {
      profile: raw?.profile ?? {},
      history: Array.isArray(raw?.history) ? raw.history : [],
    };
  } catch {
    return Response.json({ error: "Malformed request body." }, { status: 400 });
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage(body) },
  ];

  // Two attempts: the model gets one chance to correct malformed output.
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
      });
      text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
    } catch (error) {
      const status =
        error instanceof Anthropic.APIError && error.status ? error.status : 502;
      return Response.json(
        { error: "The interviewer is unavailable." },
        { status: status === 401 || status === 403 ? 502 : status },
      );
    }

    const parsed = parseInterviewResponse(text);
    if (parsed) return Response.json(parsed satisfies InterviewResult);

    messages.push(
      { role: "assistant", content: text || "(empty)" },
      {
        role: "user",
        content:
          "That was not valid JSON matching the schema. Reply with ONLY the JSON object, no prose and no markdown fences.",
      },
    );
  }

  return fallback("unparseable-response");
}
