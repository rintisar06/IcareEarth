"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo, { LogoMark } from "@/components/Logo";
import { PRESETS } from "@/lib/presets";
import { setPresetId, setProfile } from "@/lib/store";

export default function LandingPage() {
  const router = useRouter();

  function loadPreset(id: string) {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setProfile(preset.profile);
    setPresetId(id);
    router.push("/results");
  }

  return (
    <main className="hero-wash mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-10 sm:py-16">
      <Logo size="lg" />

      <div className="mt-14 sm:mt-20">
        <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          <LogoMark className="h-3.5 w-4 text-accent" />
          Ignition Hacks V.7 · Environmental
        </p>

        <h1 className="mt-6 text-[2.6rem] font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Find your
          <br />
          <span className="text-accent">biggest lever</span>
        </h1>

        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted">
          A carbon calculator hands you a number and leaves. IcareEarth
          interviews you, then does the arithmetic to decide which single change
          cuts the most for <em>your</em> life — and shows you the decade
          you&apos;d be choosing.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link href="/interview" className="btn-primary inline-block">
            Start my interview
          </Link>
          <Link
            href="/form"
            className="text-sm text-muted underline underline-offset-4 hover:text-foreground"
          >
            Or fill a form instead
          </Link>
        </div>
        <p className="mt-3 text-sm text-muted">Six to ten questions.</p>
      </div>

      <div className="mt-16 border-t border-border pt-9">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          Or watch it decide, right now
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
          Two people, the same arithmetic, structurally different answers. Works
          with the wifi off.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => loadPreset(preset.id)}
              className="btn-choice group"
            >
              <span className="block font-display font-semibold">
                {preset.name}
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">
                {preset.blurb}
              </span>
              <span className="mt-2.5 inline-block text-xs font-medium text-accent">
                See their lever →
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-16 grid gap-6 border-t border-border pt-9 sm:grid-cols-3">
        {[
          {
            k: "Asks, then decides",
            v: "An agent picks each question from what it already knows, and skips whatever your life rules out.",
          },
          {
            k: "The model never does the math",
            v: "Every number comes from a deterministic engine over sourced emission factors.",
          },
          {
            k: "Geography changes the answer",
            v: "An EV ranks first in Ontario and third in Alberta, because the grid underneath it is different.",
          },
        ].map((item) => (
          <div key={item.k}>
            <h3 className="font-display text-sm font-semibold">{item.k}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{item.v}</p>
          </div>
        ))}
      </div>

      <p className="mt-14 text-xs leading-relaxed text-muted">
        Emission factors from Poore &amp; Nemecek (2018), UK DEFRA 2025, and
        Environment and Climate Change Canada. Flights exclude radiative forcing,
        so those figures are the conservative ones.
      </p>
    </main>
  );
}
