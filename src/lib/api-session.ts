import { getSessionProfile, type SessionProfile } from "@/lib/auth";
import { canUse, type AccessLevel, type Area } from "@/lib/access";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { STATUS_OF, codeOf, type ErrorCode } from "@/lib/result-codes";

type Denied = { error: Response };
const deny = (status: number, error: string): Denied => ({ error: Response.json({ error }, { status }) });

/** API guard: signed-in worker with a linked worker profile. */
export async function apiWorker(): Promise<{ session: SessionProfile & { workerId: string } } | Denied> {
  const session = await getSessionProfile();
  if (!session) return deny(401, "Sign in required.");
  if (session.role !== "WORKER" || !session.workerId) return deny(403, "Only workers can do this.");
  return { session: { ...session, workerId: session.workerId } };
}

/** API guard: owner or recruiter of an organization. */
export async function apiEmployer(area: Area = "hiring"): Promise<{ session: SessionProfile & { orgId: string; orgApproved: boolean } } | Denied> {
  const session = await getSessionProfile();
  if (!session) return deny(401, "Sign in required.");
  if (!canUse(session, area) || !session.orgId) return deny(403, "Your role can't do this.");
  const org = await db().organization.findUnique({ where: { id: session.orgId }, select: { approved: true } });
  return { session: { ...session, orgId: session.orgId, orgApproved: org?.approved ?? false } };
}

type Failure = { ok: false; reason: string; code?: ErrorCode };

/**
 * Engagement result → HTTP. The status comes from the result's explicit code
 * (lib/result-codes.ts), never from its wording; an uncoded refusal is 409.
 */
export function engagementResponse(r: { ok: true; engagementId: string; status: string } | Failure, created = true) {
  if (r.ok) return Response.json({ engagementId: r.engagementId, status: r.status }, { status: created ? 201 : 200 });
  return Response.json({ error: r.reason }, { status: STATUS_OF[codeOf(r)] });
}

/** Route ids must be UUIDs; anything else is simply not found. */
export function badId(...ids: string[]): Response | null {
  return ids.every((id) => UUID_RE.test(id)) ? null : Response.json({ error: "Not found." }, { status: 404 });
}

/** API guard: a member of an organization who reaches `area` at `level`: the access map for a built-in role, the grants of a custom one (M10.6). */
export async function apiArea(area: Area, level: AccessLevel = "full"): Promise<{ session: SessionProfile & { orgId: string } } | Denied> {
  const session = await getSessionProfile();
  if (!session) return deny(401, "Sign in required.");
  if (!canUse(session, area, level) || !session.orgId) return deny(403, "Your role can't do this.");
  return { session: { ...session, orgId: session.orgId } };
}

/** Shift action result → HTTP, by the result's explicit code; uncoded refusals are 409. */
export function resultResponse(r: { ok: true } | Failure) {
  if (r.ok) return Response.json({ ok: true });
  return Response.json({ error: r.reason }, { status: STATUS_OF[codeOf(r)] });
}
