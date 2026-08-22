"use client";

import Link from "next/link";

export default function ResultsError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something broke working out your results
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        This is on us, not your answers. Try again, or go back and adjust what
        you told us.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/form" className="btn-choice w-auto! text-sm">
          Change my answers
        </Link>
      </div>
    </main>
  );
}
