"use server";

import { revalidatePath } from "next/cache";
import { requireArea } from "@/lib/employer-session";
import { assignShiftTurf } from "@/lib/field-day-data";
import { readAssignment } from "@/lib/turf-assign";

export interface AssignTurfResult {
  ok: boolean;
  message: string;
}

/**
 * Give a drawn turf to the workers on the chosen shifts, from the Field map. Whoever may schedule shifts
 * may set their turf; seeing the Field map alone is not enough. Everything is checked again here: the
 * page's choices are only a request.
 */
export async function assignTurfAction(shiftIds: unknown, polygon: unknown): Promise<AssignTurfResult> {
  const s = await requireArea("scheduling");
  const req = readAssignment(shiftIds, polygon);
  if (!req.ok) return { ok: false, message: req.reason };
  let r;
  try {
    r = await assignShiftTurf({ profileId: s.userId, orgId: s.orgId }, req.shiftIds, req.turf);
  } catch (e) {
    console.error("[turfcut] assign turf failed", e);
    return { ok: false, message: "Couldn't save the turf. Nothing was changed. Try again." };
  }
  if (!r.ok) return { ok: false, message: r.reason };
  revalidatePath("/field");
  for (const id of req.shiftIds) revalidatePath(`/shifts/${id}`);
  const n = r.count;
  const who = `${n} ${n === 1 ? "worker's shift" : "workers' shifts"}`;
  return { ok: true, message: req.turf ? `Turf given to ${who}.` : `Turf cleared on ${who}.` };
}
