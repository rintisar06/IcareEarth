"use client";

/**
 * IcareEarth — results.
 *
 * A footprint, then a decision. Every figure on this page comes from
 * lib/engine.ts; the only thing the model contributes is the prose in the plan.
 */

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Logo from "@/components/Logo";
import { useRouter } from "next/navigation";
import factorsJson from "@/lib/factors.json";
import {
  CATEGORY_LABELS,
  computeFootprint,
  rankLevers,
  type Footprint,
  type FootprintCategory,
  type RankedLever,
} from "@/lib/engine";
import { describeEquivalent } from "@/lib/equivalents";
import { isProfileComplete, normalizeProfile } from "@/lib/interview";
import { cachedPlan } from "@/lib/presets";
import { getPresetId, getProfile, useProfile } from "@/lib/store";
import type { Factors, UserProfile } from "@/lib/types";

const factors = factorsJson as Factors;

// Recharts is heavy and only matters once a lever is on screen.
const TwinChart = dynamic(() => import("@/components/TwinChart"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-border/40" />,
});

const CATEGORY_COLORS: Record<FootprintCategory, string> = {
  transport: "var(--accent)",
  diet: "var(--warm)",
  homeEnergy: "#5b7fb4",
  flights: "#8a6bb0",
};

const kg = (n: number) => Math.round(n).toLocaleString("en-CA");

function StackedBar({ footprint }: { footprint: Footprint }) {
  const parts = (["transport", "diet", "homeEnergy", "flights"] as const)
    .map((key) => ({ key, value: footprint[key] }))
    .filter((p) => p.value > 0);

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-border">
        {parts.map((p) => (
          <div
            key={p.key}
            style={{
              width: `${(p.value / footprint.total) * 100}%`,
              background: CATEGORY_COLORS[p.key],
            }}
            title={`${CATEGORY_LABELS[p.key]}: ${kg(p.value)} kg`}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5 text-xs text-muted">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: CATEGORY_COLORS[p.key] }}
            />
            {CATEGORY_LABELS[p.key]} {kg(p.value)} kg
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Mounted with key={leverId}, so switching lever remounts this and every piece
 * of plan state resets without an effect having to reach in and clear it.
 */
function PlanSection({
  profile,
  lever,
  totalKgPerYear,
}: {
  profile: UserProfile;
  lever: RankedLever;
  totalKgPerYear: number;
}) {
  // The two demo presets ship with their plans committed, so a judging room
  // with dead wifi still shows the whole product.
  const [cached] = useState(() => cachedPlan(getPresetId(), lever.intervention.id));

  const [remote, setRemote] = useState<{
    plan: string | null;
    error: string | null;
    loading: boolean;
  }>(() => ({ plan: null, error: null, loading: !cached }));

  const [copied, setCopied] = useState(false);

  const plan = cached ?? remote.plan;
  const equivalent = describeEquivalent(lever.savingsKgPerYear, factors);

  useEffect(() => {
    if (cached) return;

    let cancelled = false;
    const controller = new AbortController();

    fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        profile,
        lever: {
          label: lever.intervention.label,
          description: lever.intervention.description,
          assumptions: lever.intervention.assumptions,
        },
        numbers: {
          totalKgPerYear,
          savingsKgPerYear: lever.savingsKgPerYear,
          shareOfTotalPct: lever.shareOfTotal * 100,
          equivalent,
        },
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("plan-failed");
        const data = await res.json();
        if (!cancelled) setRemote({ plan: data.plan, error: null, loading: false });
      })
      .catch(() => {
        if (!cancelled) {
          setRemote({
            plan: null,
            error: "Couldn't write your plan just now.",
            loading: false,
          });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-8 border-t border-border pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Your plan</h3>
        {plan && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(plan).then(() => setCopied(true));
            }}
            className="min-h-11 rounded-lg border border-border px-3.5 text-xs font-medium text-muted"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>

      {remote.loading && (
        <div className="mt-4 space-y-2" aria-live="polite">
          <div className="h-4 w-full animate-pulse rounded bg-border/70" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-border/60" />
          <div className="h-4 w-9/12 animate-pulse rounded bg-border/50" />
          <p className="pt-1 text-xs text-muted">Writing your plan…</p>
        </div>
      )}

      {remote.error && (
        <p className="mt-4 text-sm text-muted">
          {remote.error} The numbers above are unaffected — they come from the
          engine, not the model.
        </p>
      )}

      {plan && (
        <p className="mt-4 whitespace-pre-line text-[0.95rem] leading-relaxed">
          {plan}
        </p>
      )}
    </div>
  );
}

export default function ResultsPage() {
  const router = useRouter();
  const stored = useProfile();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // No profile means someone typed the URL straight in. Send them to the start.
  useEffect(() => {
    if (!getProfile()) router.replace("/");
  }, [router]);

  const profile: UserProfile | null = useMemo(() => {
    if (!stored) return null;
    return isProfileComplete(stored) ? stored : normalizeProfile(stored);
  }, [stored]);

  const computed = useMemo(() => {
    if (!profile) return null;
    return {
      footprint: computeFootprint(profile, factors),
      levers: rankLevers(profile, factors),
    };
  }, [profile]);

  if (!profile || !computed) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
        <p className="text-muted">Loading your results…</p>
      </main>
    );
  }

  const { footprint, levers } = computed;
  const top = levers.slice(0, 3);
  const ruledOut = 10 - levers.length;
  // Defaults to the biggest lever without an effect having to select it.
  const selected =
    levers.find((l) => l.intervention.id === selectedId) ?? top[0];

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 sm:py-12">
      <Logo />

      <section className="mt-7">
        <h1 className="text-sm font-medium text-muted">Your footprint</h1>
        <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
          {kg(footprint.total)}
          <span className="ml-2 text-lg font-normal text-muted">
            kg CO₂e / year
          </span>
        </p>
        <div className="mt-5">
          <StackedBar footprint={footprint} />
        </div>
      </section>

      {/* Nothing feasible is a real answer, not an error. Someone who walks
          everywhere, eats plants, and doesn't heat or fly has already made
          every change we know how to price. */}
      {top.length === 0 ? (
        <section className="card mt-11 p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight">
            We have nothing to tell you
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            All 10 of the changes we know how to price already don&apos;t apply
            to your life. That is a genuinely unusual result, and the honest
            response is to say so rather than invent an eleventh.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Your remaining {kg(footprint.total)} kg comes from the parts of a
            footprint this tool doesn&apos;t model — the goods you buy, the food
            system behind your plate, public infrastructure. Those are real, and
            they are mostly not decided one person at a time.
          </p>
        </section>
      ) : (
      <section className="mt-11">
        <h2 className="text-lg font-semibold tracking-tight">
          {top.length === 1
            ? "There is one thing that matters for you"
            : `Your ${top.length} biggest levers`}
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          {ruledOut > 0 && (
            <>
              {ruledOut} of our 10 changes don&apos;t apply to your life, so we
              didn&apos;t pad the list with them.{" "}
            </>
          )}
          {top.length > 1 && "Tap one to see how it plays out."}
        </p>

        <ul className="mt-5 space-y-3">
          {top.map((lever, index) => {
            const isSelected =
              lever.intervention.id === selected?.intervention.id;
            return (
              <li key={lever.intervention.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(lever.intervention.id)}
                  aria-pressed={isSelected}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors sm:p-5 ${
                    isSelected
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-muted">
                        #{index + 1}
                      </span>
                      <h3 className="mt-0.5 text-base font-semibold leading-snug">
                        {lever.intervention.label}
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {lever.intervention.description}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xl font-semibold tabular-nums">
                        {kg(lever.savingsKgPerYear)}
                      </p>
                      <p className="text-xs text-muted">kg / year</p>
                      <p className="mt-0.5 text-xs font-medium text-accent">
                        {(lever.shareOfTotal * 100).toFixed(0)}% of yours
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 border-t border-border/70 pt-2.5 text-xs text-muted">
                    ≈ {describeEquivalent(lever.savingsKgPerYear, factors)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      )}

      {selected && (
        <section className="mt-11 rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <TwinChart
            footprint={footprint}
            savingsKgPerYear={selected.savingsKgPerYear}
            leverLabel={selected.intervention.label}
          />
          <PlanSection
            key={selected.intervention.id}
            profile={profile}
            lever={selected}
            totalKgPerYear={footprint.total}
          />
          <p className="mt-6 border-t border-border pt-4 text-xs leading-relaxed text-muted">
            <strong className="font-medium">How we got this:</strong>{" "}
            {selected.intervention.assumptions}
            <span className="mt-1 block">
              Source: {selected.intervention.sourceCitation}
            </span>
          </p>
        </section>
      )}

      <div className="mt-9">
        <Link
          href="/form"
          className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4"
        >
          Change my answers
        </Link>
      </div>
    </main>
  );
}
