import { redirect } from "next/navigation";
import { requireRole, type Role, type SessionProfile } from "@/lib/auth";
import { HIRING_ROLES, rolesFor, type AccessLevel, type Area } from "@/lib/access";
import { db } from "@/lib/db";

/** Signed-in owner/recruiter, plus whether Turfcut has approved their org. */
export async function requireEmployer(): Promise<SessionProfile & { orgId: string; orgApproved: boolean }> {
  // A removed member keeps their role but has no organization: no access.
  const session = await requireOrgMember(HIRING_ROLES);
  const org = await db().organization.findUnique({ where: { id: session.orgId }, select: { approved: true } });
  return { ...session, orgApproved: org?.approved ?? false };
}

/** Signed-in member of an organization in one of `roles`, or a redirect. */
export async function requireOrgMember(roles: Role[]): Promise<SessionProfile & { orgId: string }> {
  const session = await requireRole(roles);
  if (!session.orgId) redirect("/dashboard");
  return { ...session, orgId: session.orgId };
}

/** Signed-in organization member whose role reaches `area` at `level` (C1 access map). */
export function requireArea(area: Area, level: AccessLevel = "full"): Promise<SessionProfile & { orgId: string }> {
  return requireOrgMember(rolesFor(area, level));
}
