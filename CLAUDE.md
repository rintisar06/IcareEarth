@AGENTS.md

# IcareEarth — project rules

An AI advisor that interviews a person about their lifestyle, computes which single
change cuts the most carbon **for them specifically**, and shows two versions of their
future diverging. Carbon trackers report a number; IcareEarth decides something.

Two different people must get structurally different top recommendations from the same math.

## Hard rules — never violate these

1. **The LLM never computes emission numbers.** All math lives in `lib/engine.ts` using
   `lib/factors.json`. Anthropic API calls do exactly two jobs:
   - pick the next interview question
   - write the plan prose from numbers supplied by the engine

2. **Never commit `.env` files.** `.gitignore` contains a plain `.env*` line (with
   `!.env.example` so the empty template can be committed). If a key ever appears in a
   tracked file, stop and tell the human immediately.

3. **Prefer boring, working code over clever code.** No extra libraries beyond:
   Next.js (App Router), TypeScript, Tailwind, Recharts, and the Anthropic SDK.

4. **Every page must work at phone width.**

5. **When a phase's acceptance check fails, fix it before moving on**, even if it costs
   the schedule.

## Stack

- Next.js (App Router) + TypeScript + Tailwind, Recharts for charts, deployed on Render.
- Anthropic API: `claude-haiku-4-5` for the interview route (cheap, structured output),
  `claude-sonnet-4-6` for the plan route.
- `ANTHROPIC_API_KEY` is read from `process.env` **server side only**, never exposed to
  the client.

## Architecture — three layers

| Layer | Location | Job |
| --- | --- | --- |
| Interview agent | `app/api/interview` | Decides the next question. No math. |
| Deterministic engine | `lib/engine.ts`, `lib/factors.json` | All numbers. Pure, no network. |
| Presentation | `app/results`, `components/` | Ranking, twin chart, plan narration. |
