"use client";

/**
 * IcareEarth — the review step.
 *
 * The interview extracts answers through a model, so before anything is
 * computed the person gets to see what we think they said. A misheard answer
 * caught here costs one tap; the same answer caught nowhere produces a
 * confident, wrong recommendation.
 */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { describeProfileLines } from "@/lib/describe";
import { isProfileComplete, normalizeProfile } from "@/lib/interview";
import { getProfile, useProfile } from "@/lib/store";
import type { UserProfile } from "@/lib/types";

export default function ReviewPage() {
  const router = useRouter();
  const stored = useProfile();

  useEffect(() => {
    if (!getProfile()) router.replace("/");
  }, [router]);

  const profile: UserProfile | null = useMemo(() => {
    if (!stored) return null;
    return isProfileComplete(stored) ? stored : normalizeProfile(stored);
  }, [stored]);

  if (!profile) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-8 sm:py-12" aria-busy="true">
        <Logo />
        <div className="mt-10 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-border/50" />
          ))}
        </div>
      </main>
    );
  }

  const lines = describeProfileLines(profile);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-8 sm:py-12">
      <Logo />

      <h1 className="mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">
        Here&apos;s what we heard
      </h1>
      <p className="mt-2.5 text-sm leading-relaxed text-muted">
        We worked this out from your answers. If any of it is wrong, the
        recommendation will be wrong too — so it&apos;s worth ten seconds.
      </p>

      <ul className="mt-8 space-y-3">
        {lines.map((line) => (
          <li key={line.id} className="card p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted">
              {line.label}
            </p>
            <p className="mt-1.5 text-[0.975rem] leading-relaxed">{line.value}</p>
          </li>
        ))}
      </ul>

      <div className="mt-9 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => router.push("/results")}
          className="btn-primary"
        >
          That&apos;s right — show my lever
        </button>
        <Link
          href="/form"
          className="inline-flex min-h-11 items-center text-sm text-muted underline underline-offset-4 hover:text-foreground"
        >
          Something&apos;s wrong, let me fix it
        </Link>
      </div>
    </main>
  );
}
