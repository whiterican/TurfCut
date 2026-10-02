import { getSessionProfile } from "@/lib/auth";
import { FIELD_ROLES } from "@/lib/access";
import { badId, resultResponse } from "@/lib/api-session";
import { supervisorCorrection } from "@/lib/field-day-data";
import { ENTERABLE, type CorrectionAction, type EnterableType } from "@/lib/field-day";

const n = (v: unknown) => (v === undefined || v === null ? undefined : typeof v === "number" ? v : NaN);
const s = (v: unknown) => (typeof v === "string" ? v : "");
const when = (v: unknown) => {
  if (v === undefined || v === null) return undefined;
  const d = new Date(s(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * POST /api/shifts/:shiftId/corrections (owners and supervisors of the job's org)
 * { kind: "correct_event", eventId, at?, count?, sheetsReturned?, signatures?, reason }
 * { kind: "enter_event", type, at, count?, packetId?, sheetsReturned?, signatures?, reason }
 * Writes a CORRECTION event (or the missing entry, marked as entered by the
 * supervisor). Nothing is edited. Refused once pay is approved for payment.
 */
export async function POST(req: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const bad = badId(shiftId);
  if (bad) return bad;
  const session = await getSessionProfile();
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!FIELD_ROLES.includes(session.role) || !session.orgId) return Response.json({ error: "Only the organization's owners and supervisors can correct a shift." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.kind !== "string") return Response.json({ error: "Send { kind, … }." }, { status: 400 });
  const at = when(b.at);
  if (at === null) return Response.json({ error: "at must be an ISO time." }, { status: 400 });
  let a: CorrectionAction;
  if (b.kind === "correct_event") {
    a = { kind: "correct_event", eventId: s(b.eventId), at, count: n(b.count), sheetsReturned: n(b.sheetsReturned), signatures: n(b.signatures), reason: s(b.reason) };
  } else if (b.kind === "enter_event") {
    if (!(ENTERABLE as readonly string[]).includes(s(b.type))) return Response.json({ error: `type must be one of ${ENTERABLE.join(", ")}.` }, { status: 400 });
    if (!at) return Response.json({ error: "at is required." }, { status: 400 });
    a = { kind: "enter_event", type: s(b.type) as EnterableType, at, count: n(b.count), packetId: b.packetId === undefined ? undefined : s(b.packetId), sheetsReturned: n(b.sheetsReturned), signatures: n(b.signatures), reason: s(b.reason) };
  } else {
    return Response.json({ error: "kind must be correct_event or enter_event." }, { status: 400 });
  }
  return resultResponse(await supervisorCorrection({ profileId: session.userId, orgId: session.orgId }, shiftId, a));
}
