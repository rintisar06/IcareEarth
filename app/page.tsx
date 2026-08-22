"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-14 sm:py-20">
      <p className="text-sm font-semibold tracking-tight text-accent">IcareEarth</p>

      <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
        Find your biggest lever
      </h1>

      <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
        A carbon calculator hands you a number and leaves. IcareEarth interviews
        you, then does the arithmetic to decide which single change cuts the most
        for <em>your</em> life — and shows you the decade you&apos;d be choosing.
      </p>

      <div className="mt-9">
        <Link href="/interview" className="btn-primary inline-block">
          Start my interview
        </Link>
        <p className="mt-3 text-sm text-muted">
          Six to ten questions.{" "}
          <Link href="/form" className="underline underline-offset-4">
            Or fill a form instead
          </Link>
          .
        </p>
      </div>

      <div className="mt-14 border-t border-border pt-8">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">
          Or see it decide, right now
        </h2>
        <p className="mt-2 text-sm text-muted">
          Two people, the same arithmetic, structurally different answers. No
          network needed.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => loadPreset(preset.id)}
              className="btn-choice"
            >
              <span className="block font-semibold">{preset.name}</span>
              <span className="mt-1 block text-sm text-muted">{preset.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-14 text-xs leading-relaxed text-muted">
        Emission factors from Poore &amp; Nemecek (2018), UK DEFRA 2025, and
        Environment and Climate Change Canada. Flights exclude radiative forcing,
        so those figures are the conservative ones.
      </p>
    </main>
  );
}
