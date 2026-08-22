# IcareEarth

**Find your biggest lever.**

A carbon calculator hands you a number and leaves. IcareEarth interviews you,
does the arithmetic to decide which single change cuts the most for *your* life,
and shows you the decade you'd be choosing.

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

The model does **not** get to enumerate closed sets. Asked to "prefer 3 to 5
options", it once offered *"Other (Saskatchewan, Manitoba, Nova Scotia, …)"* for
province — collapsing a 631 g/kWh grid and a 2.5 g/kWh grid into one answer.
Every enum's options now live in `lib/interview.ts`, and numeric answers are
clamped before they reach the engine.

**2. Deterministic engine** — `lib/engine.ts` + `lib/factors.json`
Pure functions, no network, no randomness. Computes the footprint across
transport, diet, home energy, and flights; prices all ten interventions; filters
by a strict `feasible()` predicate; ranks by saving. The same profile always
produces the same ranking.

Feasibility is strict on purpose. Telling a carless vegan to drive less is how a
tool loses trust — which is why Sam sees one card, not a padded three.

**3. Presentation** — `app/results`, `components/TwinChart.tsx`, `app/api/plan`
The twin chart draws two cumulative futures from engine numbers. The plan route
(`claude-sonnet-4-6`) writes prose around figures it is handed and instructed not
to exceed. If it fails, the numbers are unaffected — they never came from it.

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
water, and everything outside the four categories.

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

Other commands:

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

## Deployment

Render, build `npm install && npm run build`, start `npm start`, with
`ANTHROPIC_API_KEY` set in the dashboard. The key is read server-side only and
never reaches the browser.

> **Free-tier note:** the instance spins down after ~15 minutes idle and takes
> ~50 seconds to wake. Load the URL a few minutes before showing it to anyone.

---

Built for Ignition Hacks V.7, environmental track.
