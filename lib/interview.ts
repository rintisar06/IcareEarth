/**
 * IcareEarth — the interview wire format.
 *
 * Shared by the route (which asks Claude for the next question) and the page
 * (which renders it). The model chooses *which question to ask*. It never
 * produces an emission number — that is lib/engine.ts's job, always.
 */

import {
  PROVINCES,
  PROVINCE_NAMES,
  type Province,
  type UserProfile,
} from "./types";

// ---------------------------------------------------------------------------
// Wire format
// ---------------------------------------------------------------------------

export type QuestionType = "choice" | "number" | "boolean";

export interface InterviewQuestion {
  id: string;
  text: string;
  type: QuestionType;
  options?: string[];
  unit?: string;
  /** Dotted path into UserProfile, e.g. "transport.weeklyKm". */
  profileField: string;
}

export interface InterviewResponse {
  complete: boolean;
  question?: InterviewQuestion;
  profileUpdates?: DeepPartialProfile;
}

export interface HistoryEntry {
  question: string;
  answer: string;
}

export interface InterviewRequestBody {
  profile: DeepPartialProfile;
  history: HistoryEntry[];
}

export type DeepPartialProfile = {
  [K in keyof UserProfile]?: Partial<UserProfile[K]>;
};

/** What the client gets back when the agent path has given up. */
export interface InterviewFallback {
  fallback: true;
  reason: string;
}

export type InterviewResult = InterviewResponse | InterviewFallback;

export function isFallback(r: InterviewResult): r is InterviewFallback {
  return "fallback" in r && r.fallback === true;
}

// ---------------------------------------------------------------------------
// Defensive parsing
// ---------------------------------------------------------------------------

/**
 * Strip markdown fences a model may wrap JSON in, then take the outermost
 * object. Models are told to return bare JSON; this is for when they don't.
 */
export function extractJson(raw: string): string {
  let text = raw.trim();

  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenced) text = fenced[1].trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) text = text.slice(start, end + 1);

  return text;
}

const QUESTION_TYPES: QuestionType[] = ["choice", "number", "boolean"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse and validate. Returns null on anything malformed so the caller can
 * retry or fall back — never a half-built question the UI would crash on.
 */
export function parseInterviewResponse(raw: string): InterviewResponse | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.complete !== "boolean") return null;

  const result: InterviewResponse = { complete: parsed.complete };

  if (parsed.profileUpdates !== undefined) {
    if (!isRecord(parsed.profileUpdates)) return null;
    result.profileUpdates = parsed.profileUpdates as DeepPartialProfile;
  }

  if (!parsed.complete) {
    const q = parsed.question;
    if (!isRecord(q)) return null;
    if (typeof q.id !== "string" || !q.id) return null;
    if (typeof q.text !== "string" || !q.text) return null;
    if (typeof q.profileField !== "string" || !q.profileField) return null;
    if (typeof q.type !== "string" || !QUESTION_TYPES.includes(q.type as QuestionType)) {
      return null;
    }

    const question: InterviewQuestion = {
      id: q.id,
      text: q.text,
      type: q.type as QuestionType,
      profileField: q.profileField,
    };

    if (Array.isArray(q.options)) {
      const options = q.options.filter((o): o is string => typeof o === "string");
      if (options.length > 0) question.options = options;
    }
    if (typeof q.unit === "string" && q.unit) question.unit = q.unit;

    // A choice question with no options is unanswerable.
    if (question.type === "choice" && !question.options) return null;

    result.question = question;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Answer options
// ---------------------------------------------------------------------------

export interface FieldOption {
  /** The legal value stored on the profile. */
  value: string;
  /** What the person reads. */
  label: string;
}

/**
 * We own the options for every enum field; the model only chooses which
 * question to ask.
 *
 * This exists because the model, told to prefer "3 to 5 options", offered
 * "Other (Saskatchewan, Manitoba, Nova Scotia, ...)" for province — collapsing
 * a 631 g/kWh grid and a 2.5 g/kWh grid into one answer. Letting a language
 * model enumerate a closed set is how illegal values reach the engine.
 */
export const FIELD_OPTIONS: Record<string, FieldOption[]> = {
  "transport.mode": [
    { value: "car", label: "Mostly driving" },
    { value: "transit", label: "Mostly transit" },
    { value: "mixed", label: "A mix of both" },
    { value: "none", label: "Neither — I walk or cycle" },
  ],
  "transport.vehicleType": [
    { value: "gas", label: "Petrol or diesel" },
    { value: "hybrid", label: "Hybrid" },
    { value: "ev", label: "Fully electric" },
    { value: "none", label: "No vehicle" },
  ],
  "diet.pattern": [
    { value: "omnivore", label: "I eat meat" },
    { value: "vegetarian", label: "Vegetarian" },
    { value: "vegan", label: "Vegan" },
  ],
  "diet.dairyLevel": [
    { value: "low", label: "Rarely" },
    { value: "medium", label: "Most days" },
    { value: "high", label: "Every day, a lot" },
  ],
  "home.heatingType": [
    { value: "gas", label: "Natural gas" },
    { value: "electric", label: "Electric" },
    { value: "oil", label: "Heating oil" },
    { value: "none", label: "None of these" },
  ],
  "home.province": PROVINCES.map((p) => ({ value: p, label: PROVINCE_NAMES[p] })),
  "flights.typicalDistance": [
    { value: "short", label: "Short-haul (within North America)" },
    { value: "long", label: "Long-haul (overseas)" },
  ],
};

/**
 * Options to render for a question: ours when the field is a known closed set,
 * otherwise whatever the model supplied.
 */
export function optionsFor(question: InterviewQuestion): FieldOption[] {
  const known = FIELD_OPTIONS[question.profileField];
  if (known) return known;
  return (question.options ?? []).map((o) => ({ value: o, label: o }));
}

/** Numbers we will accept for a field, so a stray answer cannot poison the engine. */
const NUMBER_BOUNDS: Record<string, { min: number; max: number }> = {
  "transport.weeklyKm": { min: 0, max: 5000 },
  "diet.redMeatMealsPerWeek": { min: 0, max: 14 },
  "flights.perYear": { min: 0, max: 100 },
};

export function clampNumber(profileField: string, value: number): number {
  const bounds = NUMBER_BOUNDS[profileField];
  if (!Number.isFinite(value)) return 0;
  if (!bounds) return value;
  return Math.min(Math.max(value, bounds.min), bounds.max);
}

// ---------------------------------------------------------------------------
// Profile assembly
// ---------------------------------------------------------------------------

export function mergeProfile(
  base: DeepPartialProfile,
  updates: DeepPartialProfile | undefined,
): DeepPartialProfile {
  if (!updates) return base;
  return {
    transport: { ...base.transport, ...updates.transport },
    diet: { ...base.diet, ...updates.diet },
    home: { ...base.home, ...updates.home },
    flights: { ...base.flights, ...updates.flights },
  };
}

/** Apply a single answer at a dotted path, e.g. "transport.weeklyKm". */
export function applyAnswer(
  profile: DeepPartialProfile,
  profileField: string,
  value: string | number | boolean,
): DeepPartialProfile {
  const [section, key] = profileField.split(".");
  if (!section || !key) return profile;
  if (!["transport", "diet", "home", "flights"].includes(section)) return profile;

  const next = { ...profile } as Record<string, Record<string, unknown>>;
  next[section] = { ...(next[section] ?? {}), [key]: value };
  return next as DeepPartialProfile;
}

const isProvince = (v: unknown): v is Province =>
  typeof v === "string" && (PROVINCES as readonly string[]).includes(v);

/**
 * True only when all four categories can actually be computed. The interview
 * ends on this, not on a question count.
 */
export function isProfileComplete(p: DeepPartialProfile): p is UserProfile {
  const t = p.transport;
  const d = p.diet;
  const h = p.home;
  const f = p.flights;

  if (!t || !d || !h || !f) return false;

  const transportOk =
    t.mode === "none"
      ? true
      : typeof t.weeklyKm === "number" && typeof t.vehicleType === "string";
  if (!t.mode || !transportOk) return false;

  if (!d.pattern || !d.dairyLevel) return false;
  if (d.pattern === "omnivore" && typeof d.redMeatMealsPerWeek !== "number") return false;

  if (!h.heatingType || !isProvince(h.province)) return false;
  if (typeof h.thermostatSetback !== "boolean") return false;

  if (typeof f.perYear !== "number") return false;
  if (f.perYear > 0 && !f.typicalDistance) return false;

  return true;
}

/**
 * Fill the gaps a complete-enough profile can leave, so the engine always gets
 * a fully-formed UserProfile.
 */
export function normalizeProfile(p: DeepPartialProfile): UserProfile {
  return {
    transport: {
      mode: p.transport?.mode ?? "none",
      weeklyKm: p.transport?.weeklyKm ?? 0,
      vehicleType: p.transport?.vehicleType ?? "none",
    },
    diet: {
      pattern: p.diet?.pattern ?? "omnivore",
      redMeatMealsPerWeek: p.diet?.redMeatMealsPerWeek ?? 0,
      dairyLevel: p.diet?.dairyLevel ?? "medium",
    },
    home: {
      heatingType: p.home?.heatingType ?? "none",
      province: isProvince(p.home?.province) ? p.home.province : "ON",
      thermostatSetback: p.home?.thermostatSetback ?? false,
    },
    flights: {
      perYear: p.flights?.perYear ?? 0,
      typicalDistance: p.flights?.typicalDistance ?? "short",
    },
  };
}
