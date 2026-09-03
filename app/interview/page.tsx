"use client";

/**
 * IcareEarth — the interview.
 *
 * One question at a time, chosen by the agent. If the agent path breaks in any
 * way — an unparseable reply, a missing key, two failed requests — this page
 * hands the person to /form with everything they have already answered. Nobody
 * gets stranded because a model had a bad turn.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { useRouter } from "next/navigation";
import {
  applyAnswer,
  clampNumber,
  isFallback,
  isProfileComplete,
  mergeProfile,
  optionsFor,
  profileProgress,
  type DeepPartialProfile,
  type HistoryEntry,
  type InterviewQuestion,
} from "@/lib/interview";
import { setProfile as storeProfile } from "@/lib/store";

/** Enough state to restore one step back without asking the model again. */
interface Snapshot {
  profile: DeepPartialProfile;
  history: HistoryEntry[];
  question: InterviewQuestion;
}

export default function InterviewPage() {
  const router = useRouter();

  const [profile, setProfileState] = useState<DeepPartialProfile>({});
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [question, setQuestion] = useState<InterviewQuestion | null>(null);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [numberInput, setNumberInput] = useState("");

  const [retrying, setRetrying] = useState(false);

  const started = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const goToForm = useCallback(
    (carry: DeepPartialProfile) => {
      storeProfile(carry);
      router.replace("/form");
    },
    [router],
  );

  /**
   * Two attempts, then the form. The retry lives inside this call on purpose:
   * a failed request leaves no question on screen, so if we returned here
   * waiting for the person to act, they would sit on "Thinking..." forever
   * with nothing to press.
   */
  const advance = useCallback(
    async (nextProfile: DeepPartialProfile, nextHistory: HistoryEntry[]) => {
      setLoading(true);
      setRetrying(false);

      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) setRetrying(true);

        try {
          const res = await fetch("/api/interview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profile: nextProfile, history: nextHistory }),
          });

          if (!res.ok) continue;

          const data = await res.json();

          // A fallback is the route telling us the agent path is done. Retrying
          // a missing API key just wastes the person's time.
          if (isFallback(data)) break;

          const merged = mergeProfile(nextProfile, data.profileUpdates);
          setProfileState(merged);

          // The data decides this, not the model. If it claims complete while
          // categories are still missing, believing it would hand the engine
          // defaults the person never chose and present the result as theirs.
          // Via /review, not straight to results: these answers came out of a
          // model, so the person confirms we heard them right before we compute
          // anything on them. (The form goes straight through — someone who
          // just filled it in has already seen every answer.)
          if (isProfileComplete(merged)) {
            storeProfile(merged);
            router.replace("/review");
            return;
          }

          // Model says done, profile says otherwise: let the form collect the
          // remainder rather than guessing on their behalf.
          if (data.complete) {
            goToForm(merged);
            return;
          }

          if (!data.question) break;

          setQuestion(data.question);
          setNumberInput("");
          setLoading(false);
          setRetrying(false);
          return;
        } catch {
          // Network died. Fall through to the next attempt.
        }
      }

      goToForm(nextProfile);
    },
    [goToForm, router],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void advance({}, []);
  }, [advance]);

  /**
   * Move focus to each new question. Without this, a keyboard or screen-reader
   * user answers one question and focus collapses to the top of the document,
   * with no signal that anything replaced it.
   */
  useEffect(() => {
    if (question) headingRef.current?.focus();
  }, [question]);

  function submit(rawValue: string | number | boolean, answerLabel: string) {
    if (!question || loading) return;

    setPast((p) => [...p, { profile, history, question }]);

    const value =
      typeof rawValue === "number"
        ? clampNumber(question.profileField, rawValue)
        : rawValue;

    const nextProfile = applyAnswer(profile, question.profileField, value);
    const nextHistory = [...history, { question: question.text, answer: answerLabel }];

    setProfileState(nextProfile);
    setHistory(nextHistory);
    setQuestion(null);
    void advance(nextProfile, nextHistory);
  }

  function back() {
    const previous = past[past.length - 1];
    if (!previous || loading) return;
    setPast((p) => p.slice(0, -1));
    setProfileState(previous.profile);
    setHistory(previous.history);
    setQuestion(previous.question);
    setNumberInput("");
  }

  // Progress reflects what is actually still missing, not a question count.
  // Answering "no car" removes two questions, and the bar should show that.
  const progress = Math.min(profileProgress(profile), 0.97);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-8 sm:py-12">
      <header className="mb-8">
        <Logo />

        <div className="mt-5 flex items-center gap-3">
          <div
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-border"
            role="progressbar"
            aria-valuenow={Math.round(progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="How much of your profile is complete"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-muted">
            {Math.round(progress * 100)}%
          </span>
        </div>
      </header>

      {history.length > 0 && (
        <ol className="mb-6 space-y-2">
          {history.slice(-2).map((entry, i) => (
            <li key={`${entry.question}-${i}`} className="text-sm text-muted">
              <span className="block">{entry.question}</span>
              <span className="block font-medium text-foreground">{entry.answer}</span>
            </li>
          ))}
        </ol>
      )}

      <section className="flex-1" aria-live="polite">
        {loading || !question ? (
          <div className="space-y-3">
            <p className="text-lg text-muted">
              {retrying ? "That didn't go through. Trying once more…" : "Thinking…"}
            </p>
            <div className="h-11 animate-pulse rounded-xl bg-border/60" />
            <div className="h-11 animate-pulse rounded-xl bg-border/40" />
          </div>
        ) : (
          <>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="text-2xl font-semibold leading-snug tracking-tight outline-none sm:text-3xl"
            >
              {question.text}
            </h1>

            <div className="mt-6 space-y-2.5">
              {question.type === "choice" &&
                optionsFor(question).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="btn-choice"
                    onClick={() => submit(option.value, option.label)}
                  >
                    {option.label}
                  </button>
                ))}

              {question.type === "boolean" && (
                <>
                  <button
                    type="button"
                    className="btn-choice"
                    onClick={() => submit(true, "Yes")}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="btn-choice"
                    onClick={() => submit(false, "No")}
                  >
                    No
                  </button>
                </>
              )}

              {question.type === "number" && (
                <form
                  className="flex flex-col gap-3 sm:flex-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const parsed = Number(numberInput);
                    if (numberInput.trim() === "" || !Number.isFinite(parsed)) return;
                    submit(
                      parsed,
                      `${parsed}${question.unit ? ` ${question.unit}` : ""}`,
                    );
                  }}
                >
                  <label className="flex-1">
                    <span className="sr-only">{question.text}</span>
                    <input
                      autoFocus
                      inputMode="numeric"
                      value={numberInput}
                      onChange={(event) => setNumberInput(event.target.value)}
                      placeholder={question.unit ?? "0"}
                      className="w-full rounded-xl border border-border bg-surface px-4 py-3.5 text-base outline-none focus:border-accent"
                    />
                  </label>
                  <button type="submit" className="btn-primary">
                    Continue
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </section>

      <footer className="mt-8 flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          disabled={past.length === 0 || loading}
          className="text-sm text-muted underline underline-offset-4 disabled:invisible"
        >
          Back
        </button>
        <Link
          href="/form"
          className="text-sm text-muted underline underline-offset-4"
        >
          Fill a form instead
        </Link>
      </footer>
    </main>
  );
}
