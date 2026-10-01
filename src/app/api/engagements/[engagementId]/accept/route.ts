import { getSessionProfile } from "@/lib/auth";
import { HIRING_ROLES } from "@/lib/access";
import { badId, engagementResponse } from "@/lib/api-session";
import { acceptEngagement } from "@/lib/engagements-data";

/**
 * POST /api/engagements/:engagementId/accept
 * Owners and recruiters accept applications; workers accept invitations.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ engagementId: string }> }) {
  const { engagementId } = await params;
  const bad = badId(engagementId);
  if (bad) return bad;
  const session = await getSessionProfile();
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (session.role === "WORKER" && session.workerId) {
    return engagementResponse(
      await acceptEngagement(engagementId, { kind: "worker", profileId: session.userId, workerId: session.workerId }),
      false
    );
  }
  if (HIRING_ROLES.includes(session.role) && session.orgId) {
    return engagementResponse(await acceptEngagement(engagementId, { kind: "org", profileId: session.userId, orgId: session.orgId }), false);
  }
  return Response.json({ error: "Only the worker or the hiring organization can accept." }, { status: 403 });
}
