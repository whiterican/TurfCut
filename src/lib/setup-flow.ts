/**
 * The first-run sharing setup (C2.6): its steps, and the two values it
 * carries in the URL. Pure.
 */
export const SETUP_STEPS = ["Who sees your scorecard", "Availability", "Credentials", "Being found"] as const;

/** ?step= as a step number: only a whole number from 1 to the last step, else 1. */
export function setupStep(raw: unknown): number {
  const n = typeof raw === "string" && /^\d{1,2}$/.test(raw) ? Number(raw) : NaN;
  return n >= 1 && n <= SETUP_STEPS.length ? n : 1;
}

export type SetupOrigin = "profile" | "dashboard";

/** Where the setup was opened from, so Skip goes back there (Today unless it was Profile). */
export function setupOrigin(raw: unknown): SetupOrigin {
  return raw === "profile" ? "profile" : "dashboard";
}

/**
 * The sharing version the Done step showed: null for "never saved" (an empty
 * field), a version number, or undefined when the field is malformed (which
 * never matches, so the confirm is refused rather than guessed at).
 */
export function shownVersion(raw: unknown): number | null | undefined {
  if (raw === "") return null;
  return typeof raw === "string" && /^\d{1,9}$/.test(raw) ? Number(raw) : undefined;
}
