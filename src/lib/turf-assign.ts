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
export function assignProblem(s: { cancelled: boolean; status: string; checkedOutAt: Date | null }): string | null {
  if (s.cancelled || s.status === "CANCELLED") return "is cancelled";
  if (s.checkedOutAt || s.status === "COMPLETED") return "has already finished";
  return null;
}
