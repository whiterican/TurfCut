"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { FIELD_ROLES, SCHEDULING_ROLES } from "@/lib/access";
import { requireWorker } from "@/lib/worker-session";
import { formToObject } from "@/lib/jobs";
import { scheduleShift, supervisorCorrection, supervisorShiftAction, workerShiftAction, workerTurfAction } from "@/lib/field-day-data";
import { ENTERABLE, type CorrectionAction, type EnterableType, type SupervisorAction, type TurfAction } from "@/lib/field-day";
import type { ActionState } from "@/app/jobs/actions";

export interface ScheduleState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (fd: FormData, k: string) => (/^\d+$/.test(str(fd, k)) ? Number(str(fd, k)) : NaN);
const refresh = (shiftId: string) => {
  revalidatePath(`/shifts/${shiftId}`);
  revalidatePath("/shifts");
  revalidatePath("/dashboard");
};

export async function schedule(_prev: ScheduleState, fd: FormData): Promise<ScheduleState> {
  const s = await requireRole(SCHEDULING_ROLES);
  if (!s.orgId) return { ok: false, message: "No organization on this account.", errors: {} };
  const r = await scheduleShift({ profileId: s.userId, orgId: s.orgId }, str(fd, "engagementId"), formToObject(fd));
  revalidatePath(`/jobs/${str(fd, "jobId")}`);
  return r.ok ? { ok: true, message: "Shift scheduled.", errors: {} } : { ok: false, message: r.reason, errors: r.errors ?? {} };
}

/**
 * The worker's one server-action step: cancelling a shift (it needs a
 * connection). Every other field action goes through the phone's queue
 * (components/FieldDayLive → /api/shifts/:id/sync).
 */
export async function workerStep(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const shiftId = str(fd, "shiftId");
  const kind = str(fd, "kind");
  if (kind !== "cancel") return { ok: false, message: "Use the field controls on the shift page." };
  const r = await workerShiftAction({ workerId, profileId: userId }, shiftId, { kind, reason: str(fd, "reason") });
  refresh(shiftId);
  return r.ok ? { ok: true, message: DONE[kind] ?? "Saved." } : { ok: false, message: r.reason };
}

const DONE: Record<string, string> = {
  check_in: "Checked in.",
  pause: "Break started.",
  resume: "Back on shift.",
  log: "Logged.",
  return_packet: "Packet returned.",
  check_out: "Checked out. Your supervisor will review the shift.",
  cancel: "Shift cancelled.",
  packet_pickup: "Packet recorded.",
  batch_count: "Batch count recorded.",
  closeout: "Review saved.",
};

export async function supervisorStep(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireRole(FIELD_ROLES);
  if (!s.orgId) return { ok: false, message: "No organization on this account." };
  const shiftId = str(fd, "shiftId");
  const kind = str(fd, "kind");
  let action: SupervisorAction;
  switch (kind) {
    case "packet_pickup":
      action = { kind, packetId: str(fd, "packetId"), sheets: int(fd, "sheets") };
      break;
    case "batch_count":
      action = { kind, reviewed: int(fd, "reviewed"), accepted: int(fd, "accepted"), rejected: int(fd, "rejected"), exceptions: str(fd, "exceptions") || null };
      break;
    case "closeout": {
      const status = str(fd, "status");
      if (status !== "APPROVED" && status !== "REJECTED") return { ok: false, message: "Pick approve or not approved." };
      action = { kind, status, reason: str(fd, "reason") || null };
      break;
    }
    case "cancel":
      action = { kind, reason: str(fd, "reason") };
      break;
    default:
      return { ok: false, message: "Unknown action." };
  }
  const r = await supervisorShiftAction({ profileId: s.userId, orgId: s.orgId }, shiftId, action);
  refresh(shiftId);
  return r.ok ? { ok: true, message: DONE[kind] ?? "Saved." } : { ok: false, message: r.reason };
}

/**
 * Worker turf marks: drop or remove a pin, or set/clear their own turf for
 * the day. Called from the map (not a form), so arguments are plain values.
 */
export async function turfStep(
  shiftId: string,
  req: { kind: "pin"; lat: number; lng: number; category: string; label: string | null } | { kind: "unpin"; pinId: string } | { kind: "day_turf"; polygon: unknown }
): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  // A server action is a public endpoint: re-check every argument's type.
  const r0 = req as Record<string, unknown> | null;
  let action: TurfAction;
  if (typeof shiftId !== "string" || !r0 || typeof r0 !== "object") return { ok: false, message: "Bad request." };
  if (r0.kind === "pin") {
    if (typeof r0.lat !== "number" || typeof r0.lng !== "number" || typeof r0.category !== "string" || (r0.label !== null && typeof r0.label !== "string")) {
      return { ok: false, message: "Bad request." };
    }
    action = { kind: "pin", pinId: crypto.randomUUID(), lat: r0.lat, lng: r0.lng, category: r0.category, label: r0.label as string | null };
  } else if (r0.kind === "unpin") {
    if (typeof r0.pinId !== "string" || r0.pinId.length > 64) return { ok: false, message: "Bad request." };
    action = { kind: "unpin", pinId: r0.pinId };
  } else if (r0.kind === "day_turf") {
    action = { kind: "day_turf", polygon: r0.polygon ?? null };
  } else {
    return { ok: false, message: "Bad request." };
  }
  const r = await workerTurfAction({ workerId, profileId: userId }, shiftId, action);
  if (r.ok) {
    refresh(shiftId);
    revalidatePath("/shifts/turf");
  }
  const done = { pin: "Pin dropped.", unpin: "Pin removed.", day_turf: req.kind === "day_turf" && req.polygon === null ? "Turf cleared." : "Turf saved." }[req.kind];
  return r.ok ? { ok: true, message: done } : { ok: false, message: r.reason };
}

/** A supervisor corrects an entry or enters a missing one (M7). */
export async function correctionStep(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireRole(FIELD_ROLES);
  if (!s.orgId) return { ok: false, message: "No organization on this account." };
  const shiftId = str(fd, "shiftId");
  const kind = str(fd, "kind");
  const reason = str(fd, "reason");
  const atIso = str(fd, "at");
  const at = atIso ? new Date(atIso) : undefined;
  if (atIso && (!at || Number.isNaN(at.getTime()))) return { ok: false, message: "Enter a valid time." };
  const opt = (k: string) => (str(fd, k) ? int(fd, k) : undefined);
  let action: CorrectionAction;
  if (kind === "correct_event") {
    action = { kind, eventId: str(fd, "eventId"), at, count: opt("count"), sheetsReturned: opt("sheetsReturned"), signatures: opt("signatures"), reason };
  } else if (kind === "enter_event") {
    const type = str(fd, "type");
    if (!(ENTERABLE as readonly string[]).includes(type)) return { ok: false, message: "Pick what to enter." };
    if (!at) return { ok: false, message: "Enter when it happened." };
    action = { kind, type: type as EnterableType, at, count: opt("count"), packetId: str(fd, "packetId") || undefined, sheetsReturned: opt("sheetsReturned"), signatures: opt("signatures"), reason };
  } else {
    return { ok: false, message: "Unknown action." };
  }
  const r = await supervisorCorrection({ profileId: s.userId, orgId: s.orgId }, shiftId, action);
  refresh(shiftId);
  revalidatePath("/earnings");
  return r.ok ? { ok: true, message: kind === "correct_event" ? "Corrected. The worker sees the reason." : "Entered. The worker sees the reason." } : { ok: false, message: r.reason };
}
