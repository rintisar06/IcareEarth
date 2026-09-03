"use client";

/**
 * IcareEarth — the client-side profile store.
 *
 * A module, not a context: the landing page presets, the interview, the form,
 * and the results page all need the same profile, and a plain module keeps
 * that from becoming a provider wrapped around the whole app.
 *
 * Backed by sessionStorage so refreshing /results doesn't throw away an
 * interview someone just sat through.
 */

import { useSyncExternalStore } from "react";
import type { DeepPartialProfile } from "./interview.ts";

const KEY = "icareearth.profile";

const listeners = new Set<() => void>();

/** Cached so getSnapshot returns a stable reference between renders. */
let snapshot: DeepPartialProfile | null = null;
let hydrated = false;

function emit() {
  for (const listener of listeners) listener();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    snapshot = raw ? (JSON.parse(raw) as DeepPartialProfile) : null;
  } catch {
    snapshot = null;
  }
}

/**
 * Store a profile.
 *
 * Clears any preset marker first. A stored profile belongs to a real person
 * unless a preset immediately claims it — without this, someone who viewed a
 * demo character and then ran their own interview was served that character's
 * committed plan, complete with the character's numbers.
 */
export function setProfile(profile: DeepPartialProfile) {
  hydrated = true;
  snapshot = profile;
  setPresetId(null);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Private browsing or a full quota. The in-memory copy still works for
    // this navigation, which is all the flow actually needs.
  }
  emit();
}

export function clearProfile() {
  hydrated = true;
  snapshot = null;
  setPresetId(null);
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // See above.
  }
  emit();
}

export function getProfile(): DeepPartialProfile | null {
  hydrate();
  return snapshot;
}

const PRESET_KEY = "icareearth.preset";

/** Which demo preset (if any) produced the current profile, so results can use
 *  the committed plan text instead of calling the API. */
export function setPresetId(id: string | null) {
  try {
    if (id) window.sessionStorage.setItem(PRESET_KEY, id);
    else window.sessionStorage.removeItem(PRESET_KEY);
  } catch {
    // Non-fatal: the demo just falls back to generating the plan live.
  }
}

export function getPresetId(): string | null {
  try {
    return window.sessionStorage.getItem(PRESET_KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** null during SSR and on the first client render, so pages must handle it. */
export function useProfile(): DeepPartialProfile | null {
  return useSyncExternalStore(
    subscribe,
    () => getProfile(),
    () => null,
  );
}
