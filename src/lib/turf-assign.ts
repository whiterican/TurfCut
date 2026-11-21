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

/**
 * What the Assign panel does with a save's answer. `moved` is whether the panel changed turf (or closed on a picked
 * one) while the save was on its way; `result` is null when the call itself failed.
 * - A failure is always told, and brings a closed panel back: an untold one reads as a save that worked.
 * - A success for the turf still on the panel clears the ticks. A late one does not (they were made since, for
 *   another turf) and says which save it was, so "Turf given" is not read as the new turf's.
 */
export function saveOutcome(moved: boolean, result: { ok: boolean; message: string } | null): { msg: { ok: boolean; text: string }; clearTicks: boolean; reopen: boolean } {
  if (!result) {
    const text = moved ? "The save you sent before changing turf did not go through. Nothing was changed." : "Couldn't save the turf. Nothing was changed. Try again.";
    return { msg: { ok: false, text }, clearTicks: false, reopen: true };
  }
  if (!moved) return { msg: { ok: result.ok, text: result.message }, clearTicks: result.ok, reopen: !result.ok };
  if (result.ok) return { msg: { ok: true, text: "The save you sent before changing turf went through." }, clearTicks: false, reopen: false };
  return { msg: { ok: false, text: `The save you sent before changing turf did not go through. ${result.message}` }, clearTicks: false, reopen: true };
}
