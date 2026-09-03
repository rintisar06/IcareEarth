"use client";

import Link from "next/link";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        That one is on us. Nothing you typed caused it, and nothing you told us
        has been lost.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-choice w-auto! text-sm">
          Start over
        </Link>
      </div>
    </main>
  );
}
