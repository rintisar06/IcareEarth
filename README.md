# IcareEarth

**Find your biggest lever.**

A carbon calculator hands you a number and leaves. IcareEarth interviews you,
does the arithmetic to decide which single change cuts the most for *your* life,
and shows you the decade you'd be choosing.

Live at **[icareearth.onrender.com](https://icareearth.onrender.com)**.

The test it's built to pass: **two different people must get structurally
different top recommendations from the same math.** They do, and not because
anything is special-cased.

| | Commuter Casey | Frequent Flyer Sam |
| --- | --- | --- |
| | Drives 320 km/wk, beef 5 nights, gas heat, Ontario | No car, vegetarian, electric heat, 6 long-haul trips |
| Footprint | 10,510 kg CO₂e/yr | 5,631 kg CO₂e/yr |
| **Top lever** | **Go fully vegetarian** — 2,605 kg | **One fewer long-haul trip** — 759 kg |
| Levers ruled out | 1 of 10 | 9 of 10 |

The sharpest example is the EV lever. For a driver in **Ontario** (59 g CO₂e/kWh)
switching to electric saves 3,145 kg/yr and ranks **first**. For a driver in
**Alberta** (438 g/kWh) the identical change saves 980 kg and ranks **third**,
beaten by eating less beef. Same code path, same intervention — the engine
prices it against the provincial grid, so geography changes the advice.

That claim is pinned by a test. If it ever stops being true, `npm test` fails.

---

## Three layers

The architecture exists to keep one promise: **the language model never computes
an emission number.**

**1. Interview agent** — `app/api/interview/route.ts` (`claude-haiku-4-5`)
Decides which question to ask next, given the profile so far. Never asks about a
topic the profile rules out — tell it you have no car and it never mentions
vehicles again. It returns JSON only; the route strips markdown fences,
validates the whole shape, gives the model one corrective turn, then gives up
and sends you to the form.

**2. Deterministic engine** — `lib/engine.ts` + `lib/factors.json`
Pure functions, no network, no randomness. Computes the footprint across
transport, diet, home energy, and flights; prices all ten interventions; filters
by a strict `feasible()` predicate; ranks by saving. The same profile always
produces the same ranking.

**3. Presentation** — `app/review`, `app/results`, `components/TwinChart.tsx`, `app/api/plan`
A review step reads the profile back in plain English before anything is
computed. The twin chart draws two cumulative futures from engine numbers. The
plan route (`claude-sonnet-4-6`) writes prose around figures it is handed and
instructed not to exceed. If it fails, the numbers are unaffected — they never
came from it.

## Decisions worth explaining

**The model doesn't get to enumerate a closed set.** Told to "prefer 3 to 5
options", the interviewer once offered *"Other (Saskatchewan, Manitoba, Nova
Scotia, …)"* for province — collapsing a 631 g/kWh grid and a 2.5 g/kWh grid
into one answer, which would have destroyed the personalisation the whole
project rests on. Every enum's options now live in `lib/interview.ts`, numeric
answers are clamped, and unknown field names are dropped at the door. The model
picks *which* question to ask; that's the judgement call worth giving it.

**Completion is decided by the data, not the model.** A wrongly-confident
`complete: true` used to let defaults fill the gaps — Ontario, omnivore, no
flights — and present that result as the person's own. Now `isProfileComplete`
decides, and a model that claims done on a partial profile hands off to the
form.

**A preset marker has to be cleared.** Viewing a demo character and then running
your own interview used to serve you that character's committed plan, with their
numbers. Storing a profile now clears the marker by default; the landing page
re-claims it immediately after.

**Nothing feasible is a real answer.** Someone who walks, eats plants, and
doesn't heat or fly gets told we have nothing to tell them, rather than an
invented eleventh change. Same instinct as Sam's single card.

**Flights are priced without radiative forcing** — see below. It makes flying
look *less* bad, and it is the number that's harder to attack.

## Data sources

Every factor in `lib/factors.json` carries its unit, its basis, and its citation
in `_meta.verification`.

| Domain | Source |
| --- | --- |
| Food, per kg | Poore & Nemecek (2018), *Science*, via Our World in Data |
| Road transport, aviation | UK DESNZ/DEFRA GHG Conversion Factors 2025 |
| Fuel combustion, provincial grid | ECCC, *Emission factors and reference values* v3.0 (Oct 2025), Tables 1.3, 4.3, 5.3 |
| EV consumption, household energy | NRCan EnerGuide; Survey of Household Energy Use |

### Flights exclude radiative forcing

DEFRA publishes aviation factors both with and without a radiative-forcing
uplift. **We use the without-RF figures** (0.074 / 0.069 kg CO₂e per
passenger-km) rather than the with-RF ones (0.126 / 0.117). This understates the
real warming impact of flying by roughly 70%, and it is the conservative choice:
it makes flying look *less* bad, so the flight lever has to earn its ranking.

Getting this wrong is not hypothetical. The first draft used the with-RF numbers
under a stated without-RF convention, inflating every flight lever by about 2x.
There is now a test that fails if those values drift back.

## Limitations

**These are population averages, not measurements of you.** The engine knows
what an average gas-heated Canadian home consumes; it does not know about your
draughty windows or your two-hour commute in traffic. A person's real footprint
can differ from this estimate by a wide margin, and the two flight trip
distances (2,500 km and 11,000 km round trip) are stated assumptions rather than
measurements at all.

What the tool is actually good at is **ranking** — the relative size of changes
available to one person. That ordering is far more robust than any absolute
total, because errors shared across categories largely cancel when comparing
levers. Read the number as a starting point for a decision, not as a
measurement, and argue with the assumptions shown under every recommendation.

Also unmodelled: manufacturing emissions of vehicles, food waste, consumer goods,
water, and everything outside the four categories. Transit levers are priced as
bus even if you'd take a train, which understates the saving by roughly 3x.

## Running locally

```bash
npm install
```

Add your key to `.env.local` (never committed — `.gitignore` holds a plain `.env*`):

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

### Commands

```bash
npm test
```

137 tests over the engine, the interview layer, the description layer, the
equivalents, and the rate limiter. No test framework dependency — `node:test`
plus Node's native TypeScript stripping. Every expected emission number was
computed by hand from `factors.json` rather than captured from the engine, so
the suite fails when a factor is edited by mistake.

```bash
npm run sanity
```

Runs three personas through the engine and fails if their top levers aren't
distinct — the check that the product's whole premise still holds.

```bash
node scripts/cache-preset-plans.ts
```

Regenerates `lib/preset-plans.json` (requires the dev server). The two landing
page presets ship with their plans committed, so the demo works with no network.
If another project holds port 3000, pass `BASE_URL=http://localhost:3001`.

## Deployment and operations

Render, build `npm install && npm run build`, start `npm start`, with
`ANTHROPIC_API_KEY` set in the dashboard. The key is read server-side only and
never reaches the browser.

**The API routes are rate-limited but unauthenticated.** `/api/plan` allows 6
requests per minute per address, `/api/interview` 20. The limiter is in-memory,
so it resets on deploy and would not coordinate across replicas — it is a spend
guard for one script hammering one endpoint, not a defence against a determined
attacker. Anyone with the URL can use the app and spend your credits; the two
demo presets cost nothing, since their plans are committed.

To rotate the key: create a new one in the Anthropic Console, update the Render
environment variable, redeploy, then delete the old key.

> **Free-tier note:** the instance spins down after ~15 minutes idle and takes
> ~50 seconds to wake. Load the URL a few minutes before showing it to anyone.

---

Built for Ignition Hacks V.7, environmental track, then finished properly
afterwards. `COMPLETION_PLAN.md` records what that second pass covered and why.
