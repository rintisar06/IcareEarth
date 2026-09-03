/**
 * IcareEarth — a small in-memory rate limiter.
 *
 * The API routes are public and unauthenticated, which is correct for a demo
 * anyone should be able to try, and careless to leave uncapped when every call
 * spends real credits.
 *
 * Deliberately boring: a Map and a sliding window, no dependency, no store.
 * The tradeoffs are real and worth naming —
 *   - state is per-instance, so it resets on deploy and would not coordinate
 *     across replicas (this app runs as one instance),
 *   - it is a spend guard and a politeness rail, not a defence against a
 *     determined attacker, who would simply rotate addresses.
 * For the actual threat here — one script hammering one endpoint — it is
 * exactly enough.
 */

interface Window {
  hits: number[];
}

const windows = new Map<string, Window>();

/** Stop the Map growing without bound on a long-running instance. */
const SWEEP_EVERY = 500;
let sinceSweep = 0;

function sweep(now: number, windowMs: number) {
  for (const [key, window] of windows) {
    window.hits = window.hits.filter((t) => now - t < windowMs);
    if (window.hits.length === 0) windows.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry. Only meaningful when ok is false. */
  retryAfter: number;
  remaining: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  if (++sinceSweep >= SWEEP_EVERY) {
    sinceSweep = 0;
    sweep(now, windowMs);
  }

  const window = windows.get(key) ?? { hits: [] };
  window.hits = window.hits.filter((t) => now - t < windowMs);

  if (window.hits.length >= limit) {
    windows.set(key, window);
    const oldest = window.hits[0];
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
      remaining: 0,
    };
  }

  window.hits.push(now);
  windows.set(key, window);
  return { ok: true, retryAfter: 0, remaining: limit - window.hits.length };
}

/**
 * Best-effort caller identity. Render sits behind Cloudflare, so the client
 * address arrives in a forwarding header rather than on the socket. Spoofable,
 * which is fine for a spend guard.
 */
export function callerKey(request: Request, bucket: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return `${bucket}:${ip}`;
}

/** The 429 every limited route returns, with a header a client can act on. */
export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    {
      error: "Too many requests. Give it a moment.",
      retryAfter,
    },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/** Testing seam: forget everything this process has counted. */
export function resetRateLimits() {
  windows.clear();
  sinceSweep = 0;
}
