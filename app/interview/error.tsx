"use client";

import Link from "next/link";

export default function InterviewError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-5 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        The interview stopped working
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Rather than restart it, you can answer the same questions on one page.
        Anything you already told us is carried over.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link href="/form" className="btn-primary inline-block">
          Switch to the form
        </Link>
        <button type="button" onClick={reset} className="btn-choice w-auto! text-sm">
          Try the interview again
        </button>
      </div>
    </main>
  );
}
