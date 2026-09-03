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
} from "./types.ts";

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

/**
 * The bounds for a field, so inputs can advertise them rather than silently
 * rewriting what someone typed. A number that changes under your fingers with
 * no explanation reads as a bug.
 */
export function numberBounds(
  profileField: string,
): { min: number; max: number } | null {
  return NUMBER_BOUNDS[profileField] ?? null;
}

// ---------------------------------------------------------------------------
// Profile assembly
// ---------------------------------------------------------------------------

/** Values a field will accept from the model, beyond the enum lists above. */
const BOOLEAN_FIELDS = new Set(["home.thermostatSetback"]);
const NUMBER_FIELDS = new Set(Object.keys(NUMBER_BOUNDS));

/**
 * Clean one model-supplied value, or reject it.
 *
 * `profileUpdates` is raw model output and used to be merged verbatim, which
 * quietly defeated every guard on the answer path: a production run typed 150
 * flights, clampNumber correctly capped it at 100, and then the model's own
 * update wrote 150 straight back over it. Anything arriving here is checked the
 * same way an answer is.
 */
function sanitizeValue(field: string, value: unknown): unknown | undefined {
  if (!isProfileField(field)) return undefined;

  if (NUMBER_FIELDS.has(field)) {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? clampNumber(field, n) : undefined;
  }

  if (BOOLEAN_FIELDS.has(field)) {
    return typeof value === "boolean" ? value : undefined;
  }

  const allowed = FIELD_OPTIONS[field];
  if (allowed) {
    return allowed.some((o) => o.value === value) ? value : undefined;
  }

  return undefined;
}

/** Drop anything the model invented, clamp anything it exaggerated. */
export function sanitizeProfileUpdates(
  updates: DeepPartialProfile | undefined,
): DeepPartialProfile {
  if (!updates || typeof updates !== "object") return {};

  const clean: Record<string, Record<string, unknown>> = {};

  for (const [section, patch] of Object.entries(updates)) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) continue;

    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
      const cleaned = sanitizeValue(`${section}.${key}`, value);
      if (cleaned === undefined) continue;
      clean[section] ??= {};
      clean[section][key] = cleaned;
    }
  }

  return clean as DeepPartialProfile;
}

export function mergeProfile(
  base: DeepPartialProfile,
  updates: DeepPartialProfile | undefined,
): DeepPartialProfile {
  if (!updates) return base;
  const safe = sanitizeProfileUpdates(updates);
  return {
    transport: { ...base.transport, ...safe.transport },
    diet: { ...base.diet, ...safe.diet },
    home: { ...base.home, ...safe.home },
    flights: { ...base.flights, ...safe.flights },
  };
}

/**
 * Every dotted path the profile actually has. The model proposes a
 * profileField, so anything outside this list is dropped rather than written:
 * an invented key like "transport.parkingSpots" would otherwise sit in the
 * stored profile forever, invisible until someone extended the type onto it.
 */
export const PROFILE_FIELDS = [
  "transport.mode",
  "transport.weeklyKm",
  "transport.vehicleType",
  "diet.pattern",
  "diet.redMeatMealsPerWeek",
  "diet.dairyLevel",
  "home.heatingType",
  "home.province",
  "home.thermostatSetback",
  "flights.perYear",
  "flights.typicalDistance",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

export function isProfileField(field: string): field is ProfileField {
  return (PROFILE_FIELDS as readonly string[]).includes(field);
}

/** Apply a single answer at a dotted path, e.g. "transport.weeklyKm". */
export function applyAnswer(
  profile: DeepPartialProfile,
  profileField: string,
  value: string | number | boolean,
): DeepPartialProfile {
  if (!isProfileField(profileField)) return profile;

  const [section, key] = profileField.split(".");
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
 * How far through the interview this profile actually is, 0..1.
 *
 * Counted from the facts still outstanding rather than a fixed question count,
 * because what is outstanding depends on the answers: saying you have no car
 * genuinely removes two questions, and a bar that ignored that would keep
 * promising work that is never coming.
 */
export function profileProgress(p: DeepPartialProfile): number {
  const required: boolean[] = [
    p.transport?.mode !== undefined,
    p.diet?.pattern !== undefined,
    p.home?.heatingType !== undefined,
    isProvince(p.home?.province),
    typeof p.home?.thermostatSetback === "boolean",
    typeof p.flights?.perYear === "number",
  ];

  if (p.transport?.mode !== undefined && p.transport.mode !== "none") {
    required.push(typeof p.transport.weeklyKm === "number");
    required.push(p.transport.vehicleType !== undefined);
  }
  if (p.diet?.pattern === "omnivore") {
    required.push(typeof p.diet.redMeatMealsPerWeek === "number");
  }
  if (p.diet?.pattern !== undefined && p.diet.pattern !== "vegan") {
    required.push(p.diet.dairyLevel !== undefined);
  }
  if (typeof p.flights?.perYear === "number" && p.flights.perYear > 0) {
    required.push(p.flights.typicalDistance !== undefined);
  }

  const filled = required.filter(Boolean).length;
  return required.length === 0 ? 0 : filled / required.length;
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
