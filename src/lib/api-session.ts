import { getSessionProfile, type Role, type SessionProfile } from "@/lib/auth";
import { HIRING_ROLES } from "@/lib/access";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";

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
export async function apiEmployer(): Promise<{ session: SessionProfile & { orgId: string; orgApproved: boolean } } | Denied> {
  const session = await getSessionProfile();
  if (!session) return deny(401, "Sign in required.");
  if (!HIRING_ROLES.includes(session.role) || !session.orgId) return deny(403, "Only owners and recruiters can do this.");
  const org = await db().organization.findUnique({ where: { id: session.orgId }, select: { approved: true } });
  return { session: { ...session, orgId: session.orgId, orgApproved: org?.approved ?? false } };
}

/** Engagement result → HTTP. Rule refusals are 409 (conflict with current state). */
export function engagementResponse(r: { ok: true; engagementId: string; status: string } | { ok: false; reason: string }, created = true) {
  if (r.ok) return Response.json({ engagementId: r.engagementId, status: r.status }, { status: created ? 201 : 200 });
  const status = /not found/i.test(r.reason) ? 404 : /another organization|isn't your/i.test(r.reason) ? 403 : 409;
  return Response.json({ error: r.reason }, { status });
}

/** Route ids must be UUIDs; anything else is simply not found. */
export function badId(...ids: string[]): Response | null {
  return ids.every((id) => UUID_RE.test(id)) ? null : Response.json({ error: "Not found." }, { status: 404 });
}

/** API guard: a member of an organization in one of `roles`. */
export async function apiOrgRole(roles: Role[]): Promise<{ session: SessionProfile & { orgId: string } } | Denied> {
  const session = await getSessionProfile();
  if (!session) return deny(401, "Sign in required.");
  if (!roles.includes(session.role) || !session.orgId) return deny(403, "Your role can't do this.");
  return { session: { ...session, orgId: session.orgId } };
}

/** Shift action result → HTTP. Rule refusals are 409. */
export function resultResponse(r: { ok: true } | { ok: false; reason: string }) {
  if (r.ok) return Response.json({ ok: true });
  return Response.json({ error: r.reason }, { status: /not found/i.test(r.reason) ? 404 : 409 });
}
