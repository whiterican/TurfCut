import { redirect } from "next/navigation";
import { requireRole, type Role, type SessionProfile } from "@/lib/auth";
import { HIRING_ROLES } from "@/lib/access";
import { db } from "@/lib/db";

/** Signed-in owner/recruiter, plus whether Turfcut has approved their org. */
export async function requireEmployer(): Promise<SessionProfile & { orgApproved: boolean }> {
  const session = await requireRole(HIRING_ROLES);
  const org = session.orgId
    ? await db().organization.findUnique({ where: { id: session.orgId }, select: { approved: true } })
    : null;
  return { ...session, orgApproved: org?.approved ?? false };
}

/** Signed-in member of an organization in one of `roles`, or a redirect. */
export async function requireOrgMember(roles: Role[]): Promise<SessionProfile & { orgId: string }> {
  const session = await requireRole(roles);
  if (!session.orgId) redirect("/dashboard");
  return { ...session, orgId: session.orgId };
}
