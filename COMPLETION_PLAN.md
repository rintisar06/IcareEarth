# IcareEarth — Completion Plan

Written 2026-08-23, after the hackathon. The 12-hour build shipped all nine phases, but
phases 4–9 went out in one compressed batch under time pressure. This plan takes the
project from "demo that survived judging" to "finished piece of work": every rushed
decision re-examined, every path tested, known bugs fixed, and the codebase left in a
state someone else could read and trust.

**Ground rules carry over unchanged:** the LLM never computes emission numbers; no `.env`
in git; no dependencies beyond Next.js, TypeScript, Tailwind, Recharts, and the Anthropic
SDK; every page works at phone width; a failing check gets fixed before moving on.

**Process for every tier:** work → `npx tsc --noEmit` → `npx eslint` → `npm run build` →
`npm run sanity` (later `npm test`) → commit → push. Each tier is one or more commits;
nothing lands broken.

---

## Tier 0 — Real bugs found in the audit (fix first)

These are correctness defects confirmed by re-reading the code on 2026-08-23, not
hypotheticals.

### 0.1 Stale preset plan served to real users ⚠ worst bug
`setPresetId("casey")` is set when a demo preset is clicked and **never cleared**. If
someone views Commuter Casey, then completes their own interview or form, the preset id
survives in sessionStorage. On results, `cachedPlan(getPresetId(), leverId)` matches —
so a real user whose top lever happens to be `go-vegetarian` is shown **Casey's canned
plan, containing Casey's numbers** (10,510 kg total, 2,605 kg saved) instead of their own.
- Fix: `setProfile()` in `lib/store.ts` clears the preset id by default; the landing
  page's `loadPreset` sets it explicitly after. One-line semantics: "a stored profile is
  a real person unless a preset immediately claims otherwise."
- Test: preset → interview → results must show the live-generated plan, not the cache.

### 0.2 "Complete" from the model is trusted even when the profile isn't
`app/interview/page.tsx`: `if (data.complete || isProfileComplete(merged))` routes to
results. If the model wrongly says `complete: true` with categories missing,
`normalizeProfile` silently fills defaults (Ontario, omnivore, no flights…) and the
person gets **results computed from answers they never gave**.
- Fix: route to results only when `isProfileComplete(merged)` actually holds; when the
  model claims complete but the profile has gaps, hand off to `/form` carrying the
  partial profile (the form already names what's missing).

### 0.3 Empty-levers state renders nonsense
A profile with nothing to improve (walks everywhere, vegan, no heat, no flights) produces
zero feasible levers. The results heading then reads "Your 0 biggest levers" and the page
just… stops. It's a legitimate outcome and deserves a real answer.
- Fix: dedicated empty state — "We have nothing to tell you. Your lifestyle already sits
  below every change we know how to price. 10 of 10 don't apply." That is the honest
  version of Sam's single card, taken to its limit.

### 0.4 `/api/plan` trusts its input shape
`describeProfile` will happily render `Lives in: undefined` from a malformed body, and
non-finite numbers would flow into the prompt. Public endpoint, so harden it: validate
enums against the real unions, require finite numbers, bound string lengths, reject
otherwise with 400. (Same defensive posture the interview route already has.)

### 0.5 `trainPerPassenger` is verified, loaded, and never used
The factor exists in `factors.json` with a citation, but both transit levers price
replacement travel as bus only. Decide and document rather than leave dangling:
- **Chosen resolution:** keep bus-only (it's the *conservative* choice — bus at 0.104 is
  ~3x train at 0.035, so we understate transit savings rather than overstate), and say so
  in each transit lever's `assumptions` string. The factor stays in the file for the
  RF-style toggle future and for honesty about what was verified.

### 0.6 Interview allowlist for `profileField`
`applyAnswer` validates the section but not the key — a model-invented field like
`transport.parkingSpots` writes junk into the stored profile. Harmless today (only known
keys are ever read) but it's a landmine for anyone extending the type. Add a full
dotted-path allowlist so unknown fields are dropped at the door.

**Tier 0 acceptance:** all six fixed; `npm run sanity` still passes; a scripted
preset→interview→results run shows a live plan; build clean.

---

## Tier 1 — Re-verify everything the rush skipped

Phase 8's "polish pass" was real but thin: mobile was verified via DOM text checks, dark
mode was styled but never once *looked at*, and production was only smoke-tested.

- [ ] **Visual QA, every page × two widths × two themes.** 375px and desktop, light and
      dark (`resize_window` with `colorScheme`), screenshots kept as proof: landing,
      interview (loading, question, retry states), form (all conditional branches),
      results (Casey, Sam, empty state, error boundary).
- [ ] **Dark-mode specifics:** the two hardcoded hexes in `CATEGORY_COLORS`
      (`#5b7fb4`, `#8a6bb0`) were never contrast-checked against the dark surface; the
      stacked bar and chart tooltips need a look; favicon legibility on dark tabs.
- [ ] **Full interview E2E on production** (icareearth.onrender.com, not localhost),
      including one run answering "no car" and one hitting the number clamps.
- [ ] **Hand-audit the arithmetic** for one persona end to end: recompute Casey's
      10,510 kg on paper from `factors.json` and match every category. The engine has a
      sanity script but no human has ever checked a single number by hand.
- [ ] **Keyboard and focus pass:** focus moves to each new interview question
      (`aria-live` exists, focus management doesn't); tab order on the form; visible
      focus rings on `btn-choice`; Escape/Enter behaviour on the number form.
- [ ] **Copy pass** over every string on every page, reading them aloud once.

**Acceptance:** a QA checklist with pass marks per page/width/theme, and any fix found
along the way committed with the finding named.

---

## Tier 2 — Tests (the biggest thing the hackathon cut)

The engine is pure functions — the ideal test target — and has zero tests. Node 24 runs
TypeScript natively and ships `node:test`, so this costs **no new dependencies**.

New `tests/` directory, `npm test` script (`node --test tests/`):

- [ ] `engine.test.ts` — footprint per category for hand-computed profiles; the
      feasibility matrix (all 10 interventions × ~6 personas: carless, vegan, EV owner,
      electric-heat, non-flyer, already-setback — each must exclude exactly the right
      levers); savings are non-negative and match closed-form arithmetic; `mealMix`
      edge cases (beef=14, vegan+high dairy, beef > 14 clamped); the Ontario-vs-Alberta
      EV ordering asserted explicitly so the project's central claim is a regression test.
- [ ] `interview.test.ts` — `extractJson` (fenced, prose-wrapped, bare), 
      `parseInterviewResponse` (valid, missing fields, wrong types, choice-without-
      options → null), `clampNumber` bounds, `applyAnswer` allowlist, `mergeProfile`,
      `isProfileComplete` truth table (incl. "transit rider needs no vehicleType",
      "flyer needs typicalDistance, non-flyer doesn't"), `normalizeProfile` fills.
- [ ] `equivalents.test.ts` — magnitude thresholds pick the right unit; rounding.
- [ ] Convert `scripts/sanity.ts`'s three-persona distinctness check into a proper test
      as well, keeping the script for its readable output.
- [ ] Wire `npm test` into the pre-push habit alongside build.

**Acceptance:** `npm test` green; deliberately breaking a factor (e.g. beef 9.9 → 0.9)
makes tests fail — proving they'd catch a bad future edit.

---

## Tier 3 — Robustness on the open endpoints

The API routes are public, unauthenticated, and spend real credits. That was correct for
judging and is sloppy to leave forever.

- [ ] **In-memory rate limiting** on `/api/interview` and `/api/plan` — a plain `Map`
      keyed by IP (`x-forwarded-for`, Render sits behind Cloudflare) with a sliding
      window (~20 req/min interview, ~6/min plan). No new deps. 429 with a friendly body;
      the interview UI's existing retry→form path already handles a 429 gracefully.
- [ ] **Request body size guard** on both routes (reject > ~50 KB before JSON.parse).
- [ ] **Missing error boundaries:** `app/error.tsx` (global) and `app/not-found.tsx`
      exist for neither; interview has no `error.tsx`. Add all three in the results
      boundary's voice.
- [ ] **Results hydration flash:** the "Loading your results…" frame flashes even when
      the profile is present. Smooth it (render skeleton until first store read).
- [ ] **`max_tokens` sanity:** plan route at 600 has never truncated in practice —
      verify against the longest cached plan (1,143 chars) and leave documented headroom.

**Acceptance:** hammering an endpoint in a loop gets 429s while the site stays usable;
navigating to a junk URL and throwing inside results/interview both land on styled pages.

---

## Tier 4 — UX completeness (small, high-value)

- [ ] **Review step before results.** The interview currently teleports you to results
      the moment the profile completes. Insert one screen: "Here's what we heard" —
      the assembled profile in plain language with an *Edit* link into the form (which
      already preloads partial answers). Kills silent-misunderstanding errors and makes
      the handoff feel deliberate. *(Enhancement beyond the original spec — flagged.)*
- [ ] **Show all levers.** Results caps at top 3 per the spec; an expander ("Show the
      other N that apply to you") costs nothing and answers the natural next question.
      *(Enhancement — flagged.)*
- [ ] **Progress honesty:** the interview's "N of ~8" is a guess against a fixed
      constant. Derive progress from profile completeness (categories filled / needed)
      so the bar reflects reality.
- [ ] **Number input niceties:** min/max hints shown when a clamp would fire, block
      negatives at the input, keep the keyboard numeric on mobile (already done).
- [ ] **Landing page presets should say what they'll show** — they do; verify the
      "See their lever →" affordance reads at phone width.

**Acceptance:** interview → review → results flow works; back from review returns to the
form with everything carried; all-levers expander renders for Casey (8 levers).

---

## Tier 5 — Docs, ops, and the ledger

- [ ] **README screenshots** (landing + Casey results, light mode) and a short
      "architecture decisions" section absorbing the three war stories: the province
      dropdown collapse, the with-RF flight factor catch, the stale-preset bug.
- [ ] **Ops note in README:** free-tier cold start; the API routes are rate-limited but
      unauthenticated; how to rotate the key.
- [ ] **Post-event hygiene (user tasks, not code):** confirm the GitHub PAT from the
      hackathon chat is revoked; decide whether the Render service stays up long-term;
      if it comes down, rotate the Anthropic key out of habit.
- [ ] **Update `lastSessionContext.md`** (local-only) to reflect the finished state.

---

## Deliberately NOT doing without your explicit go-ahead

| Item | Why it waits |
|---|---|
| **ElevenLabs TTS** (`app/api/speak`) | The original stretch goal. Needs an ELEVENLABS_API_KEY you'd have to create, and adds a paid dependency to a finished demo. Say the word and it's a small job. |
| **New interventions** (heat pump, insulation, food waste) | Each needs the same factor-verification rigor as Phase 1 — real research, not an afternoon. Heat pumps are the glaring gap and the one I'd pick first. |
| **Cost-alongside-carbon** | Genuinely valuable, genuinely a second data pack (provincial energy prices, vehicle costs). A project in itself. |
| **Radiative-forcing toggle** | Small code, but it doubles the flight numbers on screen and changes the product's stated convention — your call, not mine. |
| **Any new npm dependency** | Hard rule 3 stands until you lift it. |
| **Committing this plan file** | It's currently untracked and local. It's harmless to publish (no secrets), and committing it is normal practice — but you said "for now, just outline," so nothing moves to GitHub until you say so. |

## Execution order and rough weight

| Order | Tier | Weight |
|---|---|---|
| 1 | Tier 0 — bugs | ~1 session, small diffs, biggest correctness gain |
| 2 | Tier 2 — tests | medium; locks the engine before anything else touches it |
| 3 | Tier 1 — verification | medium; screenshots + fixes as found |
| 4 | Tier 3 — robustness | small-medium |
| 5 | Tier 4 — UX | small-medium |
| 6 | Tier 5 — docs | small |

Tests deliberately come *before* the big verification pass: once the engine is pinned by
tests, every later fix can be made without fear of quietly changing a number.

## Decisions — resolved 2026-08-23

1. **Tiers 0–3 and 5:** approved as written.
2. **Tier 4 enhancements:** both in — review step and show-all-levers expander.
3. **Deferred list:** stays deferred. No TTS, RF toggle, or new interventions this pass.
4. **This file:** committed to the public repo. `lastSessionContext.md` stays local.
