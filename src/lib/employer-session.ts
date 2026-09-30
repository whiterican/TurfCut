import { requireRole, type SessionProfile } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/access";
import { db } from "@/lib/db";

/** Signed-in org staff, plus whether Turfcut has approved their org. */
export async function requireEmployer(): Promise<SessionProfile & { orgApproved: boolean }> {
  const session = await requireRole(ORG_ROLES);
  const org = session.orgId
    ? await db().organization.findUnique({ where: { id: session.orgId }, select: { approved: true } })
    : null;
  return { ...session, orgApproved: org?.approved ?? false };
}
