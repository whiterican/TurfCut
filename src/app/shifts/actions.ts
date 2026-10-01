"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { FIELD_ROLES, SCHEDULING_ROLES } from "@/lib/access";
import { requireWorker } from "@/lib/worker-session";
import { formToObject } from "@/lib/jobs";
import { scheduleShift, supervisorShiftAction, workerShiftAction, workerTurfAction, type WorkerRequest } from "@/lib/field-day-data";
import type { SupervisorAction } from "@/lib/field-day";
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

/** One entry point for the worker's field-day buttons; `kind` picks the action. */
export async function workerStep(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const shiftId = str(fd, "shiftId");
  const kind = str(fd, "kind");
  let req: WorkerRequest;
  switch (kind) {
    case "check_in": {
      // Used once, for the at-staging comparison; never stored.
      const [lat, lng] = [Number(str(fd, "lat")), Number(str(fd, "lng"))];
      req = { kind, device: str(fd, "lat") && str(fd, "lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null };
      break;
    }
    case "pause":
    case "resume":
    case "check_out":
      req = { kind };
      break;
    case "log": {
      const unit = str(fd, "unit");
      if (unit !== "signatures" && unit !== "doors" && unit !== "contacts") return { ok: false, message: "Unknown unit." };
      req = { kind, unit, count: int(fd, "count") };
      break;
    }
    case "return_packet":
      req = { kind, packetId: str(fd, "packetId"), sheetsReturned: int(fd, "sheetsReturned"), signatures: int(fd, "signatures") };
      break;
    case "cancel":
      req = { kind, reason: str(fd, "reason") };
      break;
    default:
      return { ok: false, message: "Unknown action." };
  }
  const r = await workerShiftAction({ workerId, profileId: userId }, shiftId, req);
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
  const action = req.kind === "pin" ? { ...req, pinId: crypto.randomUUID() } : req;
  const r = await workerTurfAction({ workerId, profileId: userId }, shiftId, action);
  refresh(shiftId);
  revalidatePath("/shifts/turf");
  const done = { pin: "Pin dropped.", unpin: "Pin removed.", day_turf: req.kind === "day_turf" && req.polygon === null ? "Turf cleared." : "Turf saved." }[req.kind];
  return r.ok ? { ok: true, message: done } : { ok: false, message: r.reason };
}
