import { getSessionProfile } from "@/lib/auth";
import { FIELD_ROLES } from "@/lib/access";
import { badId, resultResponse } from "@/lib/api-session";
import { supervisorShiftAction, workerShiftAction, type WorkerRequest } from "@/lib/field-day-data";
import type { SupervisorAction } from "@/lib/field-day";

const n = (v: unknown) => (typeof v === "number" ? v : NaN);
const s = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * POST /api/shifts/:shiftId/events { kind, … }
 * Workers: pause · resume · log {unit, count} · return_packet {packetId,
 * sheetsReturned, signatures} · check_out · cancel {reason}.
 * Owners/supervisors: packet_pickup {packetId, sheets} · batch_count
 * {reviewed, accepted, rejected, exceptions?} · cancel {reason}.
 * Every accepted request appends one work event; nothing is edited.
 */
export async function POST(req: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const bad = badId(shiftId);
  if (bad) return bad;
  const session = await getSessionProfile();
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.kind !== "string") return Response.json({ error: "Send { kind, … }." }, { status: 400 });

  if (session.role === "WORKER" && session.workerId) {
    let r: WorkerRequest;
    switch (b.kind) {
      case "pause":
      case "resume":
      case "check_out":
        r = { kind: b.kind };
        break;
      case "log":
        if (b.unit !== "signatures" && b.unit !== "doors" && b.unit !== "contacts") return Response.json({ error: "unit must be signatures, doors or contacts." }, { status: 400 });
        r = { kind: "log", unit: b.unit, count: n(b.count) };
        break;
      case "return_packet":
        r = { kind: "return_packet", packetId: s(b.packetId), sheetsReturned: n(b.sheetsReturned), signatures: n(b.signatures) };
        break;
      case "cancel":
        r = { kind: "cancel", reason: s(b.reason) };
        break;
      default:
        return Response.json({ error: "Unknown kind for a worker." }, { status: 400 });
    }
    return resultResponse(await workerShiftAction({ workerId: session.workerId, profileId: session.userId }, shiftId, r));
  }

  if (FIELD_ROLES.includes(session.role) && session.orgId) {
    let a: SupervisorAction;
    switch (b.kind) {
      case "packet_pickup":
        a = { kind: "packet_pickup", packetId: s(b.packetId), sheets: n(b.sheets) };
        break;
      case "batch_count":
        a = { kind: "batch_count", reviewed: n(b.reviewed), accepted: n(b.accepted), rejected: n(b.rejected), exceptions: s(b.exceptions) || null };
        break;
      case "cancel":
        a = { kind: "cancel", reason: s(b.reason) };
        break;
      default:
        return Response.json({ error: "Unknown kind for a supervisor." }, { status: 400 });
    }
    return resultResponse(await supervisorShiftAction({ profileId: session.userId, orgId: session.orgId }, shiftId, a));
  }
  return Response.json({ error: "Only the worker or the organization's owners and supervisors can record shift events." }, { status: 403 });
}
