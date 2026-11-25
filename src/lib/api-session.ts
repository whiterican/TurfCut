import { getSessionProfile, type SessionProfile } from "@/lib/auth";
import { canUse, type AccessLevel, type Area } from "@/lib/access";
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
export async function apiEmployer(area: Area = "hiring"): Promise<{ session: SessionProfile & { orgId: string; orgApproved: boolean } } | Denied> {
  const session = await getSessionProfile();
  if (!session) return deny(401, "Sign in required.");
  if (!canUse(session, area) || !session.orgId) return deny(403, "Your role can't do this.");
  const org = await db().organization.findUnique({ where: { id: session.orgId }, select: { approved: true } });
  return { session: { ...session, orgId: session.orgId, orgApproved: org?.approved ?? false } };
}

/** Engagement result → HTTP. Rule refusals are 409 (conflict with current state). */
export function engagementResponse(r: { ok: true; engagementId: string; status: string } | { ok: false; reason: string }, created = true) {
  if (r.ok) return Response.json({ engagementId: r.engagementId, status: r.status }, { status: created ? 201 : 200 });
  // "…belongs to another organization" comes from opening an engagement on a job that isn't the caller's.
  const status = /not found/i.test(r.reason)
    ? 404
    : /another organization/i.test(r.reason)
      ? 403
      : /invitations this week/i.test(r.reason)
        ? 429
        : /characters or fewer/i.test(r.reason)
          ? 400
          : 409;
  return Response.json({ error: r.reason }, { status });
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

/**
 * Whether a request that changes something came from another site's page. A server action gets this check from Next;
 * a route does not, and the session cookie's SameSite=Lax still lets a same-site page on another origin through.
 * The browser's own word is taken first (Sec-Fetch-Site), then Origin against the host. A request with neither header
 * is not from a page at all (a script, a test), so it is not this attack: the session check decides.
 */
export function fromAnotherSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = req.headers.get("origin");
  if (!origin) return false;
  // `||`, not `??`: an empty forwarded host falls back to the host, as Next's own check does.
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").split(",")[0].trim().toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() !== host;
  } catch {
    return true;
  }
}

/** Shift action result → HTTP. Rule refusals are 409. */
export function resultResponse(r: { ok: true } | { ok: false; reason: string }) {
  if (r.ok) return Response.json({ ok: true });
  return Response.json({ error: r.reason }, { status: /not found/i.test(r.reason) ? 404 : 409 });
}
