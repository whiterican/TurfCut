import { readTurf, type TurfPolygon } from "@/lib/field-day";

/**
 * Assigning turf from the Field map (Caden, Nov 17): an organizer draws a zone and gives it to the
 * workers on chosen shifts. Pure rules; lib/field-day-data does the writing. The turf is the shift's
 * own turf field (the one scheduling sets), so nobody's position is involved.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** One assignment covers at most this many shifts, so a mistake stays small and the lock set stays short. */
export const MAX_SHIFTS_PER_ASSIGNMENT = 50;

export type Assignment = { ok: true; shiftIds: string[]; turf: TurfPolygon | null } | { ok: false; reason: string };

/** The request as the page sends it: shift ids and a drawn zone, or `null` to clear the turf. */
export function readAssignment(shiftIds: unknown, polygon: unknown): Assignment {
  if (!Array.isArray(shiftIds) || shiftIds.length === 0) return { ok: false, reason: "Pick at least one shift." };
  if (!shiftIds.every((id) => typeof id === "string" && UUID.test(id))) return { ok: false, reason: "Shift not found." };
  const ids = [...new Set(shiftIds.map((id: string) => id.toLowerCase()))];
  if (ids.length > MAX_SHIFTS_PER_ASSIGNMENT) return { ok: false, reason: `Pick at most ${MAX_SHIFTS_PER_ASSIGNMENT} shifts at a time.` };
  if (polygon === null) return { ok: true, shiftIds: ids, turf: null };
  const turf = readTurf(polygon);
  if (!turf) return { ok: false, reason: "Draw the turf: at least three corners." };
  return { ok: true, shiftIds: ids, turf };
}

/** Why a shift can't take new turf, or null when it can: a closed shift's turf is part of its record. */
export function assignProblem(s: { status: string; checkInAt: Date | null; checkOutAt: Date | null; endsAt: Date }, now: Date): string | null {
  if (s.status === "CANCELLED") return "is cancelled";
  if (s.checkOutAt || s.status === "COMPLETED") return "has already finished";
  // A shift nobody started and whose time is past is over; one still being worked past its end is not.
  if (!s.checkInAt && s.endsAt < now) return "has already ended";
  return null;
}

const UNKNOWN = "It may or may not have saved: check the map before sending it again.";

/**
 * What the Assign panel does with a save's answer. `moved` is whether the panel changed turf (or closed on a picked
 * one) while the save was on its way; `result` is null when the save got no answer (see sendTurf). The panel holds its turf while it
 * saves, so `moved` should not happen; if it does (the page swapped the panel under a save), this is what is safe.
 * - A failure is always told, and brings a closed panel back: an untold one reads as a save that worked.
 * - `refresh`: whether to ask the server for the page again. Only after an answer.
 * - A success for the turf still on the panel clears the ticks. A late one does not (they were made since, for
 *   another turf) and says which save it was, so "Turf given" is not read as the new turf's.
 */
export function saveOutcome(moved: boolean, result: { ok: boolean; message: string } | null): { msg: { ok: boolean; text: string }; clearTicks: boolean; reopen: boolean; refresh: boolean } {
  if (!result) {
    // No answer: the request or its answer was lost on the way, or it ran out of time. Which is not known here, so
    // this does not say "nothing was changed" (the server says that itself when it knows).
    // No refresh either: with no signal a refresh fails too, and Next then reloads the whole page, taking the drawing,
    // the ticks and this message with it. The Field page's own poll shows a save that went through after all.
    const text = `${moved ? "The save you sent a moment ago" : "The save"} got no answer. ${UNKNOWN}`;
    return { msg: { ok: false, text }, clearTicks: false, reopen: true, refresh: false };
  }
  // The server answered, so it can be reached: show the page as it has it now (the new turf, or a shift that ended).
  if (!moved) return { msg: { ok: result.ok, text: result.message }, clearTicks: result.ok, reopen: !result.ok, refresh: true };
  if (result.ok) return { msg: { ok: true, text: "The save you sent a moment ago went through." }, clearTicks: false, reopen: false, refresh: true };
  return { msg: { ok: false, text: `The save you sent a moment ago did not go through. ${result.message}` }, clearTicks: false, reopen: true, refresh: true };
}

/**
 * Whether a shift's stored turf is already what an assignment asks for: the same corners in the same order, or no
 * turf on both sides. Such a shift is left alone. Writing it again changed nothing but still added a "turf assigned"
 * audit entry whose before and after were equal, a record of a change that never happened.
 * A stored value that can't be read as a turf is never "the same": it gets replaced.
 */
export function sameTurf(stored: unknown, wanted: TurfPolygon | null): boolean {
  if (stored === null || stored === undefined) return wanted === null;
  if (wanted === null) return false;
  const have = readTurf(stored);
  return have !== null && JSON.stringify(have.coordinates) === JSON.stringify(wanted.coordinates);
}

/** What the organizer is told after a save: how many shifts changed, and how many were already as asked. */
export function assignMessage(giving: boolean, changed: number, unchanged: number): string {
  const shifts = (n: number) => `${n} ${n === 1 ? "worker's shift" : "workers' shifts"}`;
  const already = giving ? "already had this turf" : "had no turf";
  if (changed === 0) return `${unchanged === 1 ? "That shift" : unchanged === 2 ? "Both shifts" : `All ${unchanged} shifts`} ${already}. Nothing was changed.`;
  const done = giving ? `Turf given to ${shifts(changed)}.` : `Turf cleared on ${shifts(changed)}.`;
  return unchanged === 0 ? done : `${done} ${unchanged} more ${already}.`;
}

/** The server's limits for one assignment's transaction: this long to get a connection, this long to run. */
export const ASSIGN_TX = { maxWait: 10_000, timeout: 15_000 } as const;

/**
 * How long the Assign panel waits for a save before it gives the request up. Longer than the transaction's own limits
 * together, so a save that is only slow in the database still answers. (Signing in, a cold start and the rest are not
 * counted: a save can be given up that then goes through, which is why the panel never says it did not.)
 */
export const SAVE_PATIENCE_MS = 30_000;

/**
 * What the turf route answered, or null when the body says nothing we can rely on (a gateway's error page, say):
 * `{ ok: true, message }` for a save, `{ error }` for anything the server itself refused or failed, which it words.
 */
export function readSaveAnswer(body: unknown): { ok: boolean; message: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { ok?: unknown; message?: unknown; error?: unknown };
  if (b.ok === true && typeof b.message === "string") return { ok: true, message: b.message };
  if (typeof b.error === "string" && b.error) return { ok: false, message: b.error };
  return null;
}

/**
 * Send an assignment to the turf route (POST /api/field/turf) and wait at most `patienceMs` for the answer. Null
 * means no answer: the network failed, the time ran out and the request was given up, or what came back was not the
 * route's. A plain request with its own time limit, not a server action: an action still in flight holds up the
 * page's refreshes and every other action behind it, and nothing ends it but the browser.
 */
export async function sendTurf(shiftIds: string[], polygon: unknown, patienceMs: number = SAVE_PATIENCE_MS, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; message: string } | null> {
  const giveUp = new AbortController();
  const timer = setTimeout(() => giveUp.abort(), patienceMs);
  try {
    const res = await fetcher("/api/field/turf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftIds, polygon }), signal: giveUp.signal });
    return readSaveAnswer(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
