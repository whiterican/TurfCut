import { redirect } from "next/navigation";
import { requireAuth, requireRole, type Role, type SessionProfile } from "@/lib/auth";
import { canUse, type AccessLevel, type Area } from "@/lib/access";
import { db } from "@/lib/db";

/**
 * Signed-in member who works with applicants (the hiring area: owners and
 * recruiters, or a custom role granted it), plus whether Turfcut has
 * approved their org. A removed member has no organization: no access.
 */
export async function requireEmployer(area: Area = "hiring"): Promise<SessionProfile & { orgId: string; orgApproved: boolean }> {
  const session = await requireArea(area);
  const org = await db().organization.findUnique({ where: { id: session.orgId }, select: { approved: true } });
  return { ...session, orgApproved: org?.approved ?? false };
}

/** The same, for creating, editing and publishing jobs (the jobsEdit area, M10.6). */
export const requireJobEditor = () => requireEmployer("jobsEdit");

/** Signed-in member of an organization in one of `roles`, or a redirect. */
export async function requireOrgMember(roles: Role[]): Promise<SessionProfile & { orgId: string }> {
  const session = await requireRole(roles);
  if (!session.orgId) redirect("/dashboard");
  return { ...session, orgId: session.orgId };
}

/**
 * Signed-in organization member who reaches `area` at `level`: through the
 * access map for a built-in role, through the grants of their custom role
 * (M10.6) otherwise. Everyone else, a removed member included, is sent home.
 */
export async function requireArea(area: Area, level: AccessLevel = "full"): Promise<SessionProfile & { orgId: string }> {
  const session = await requireAuth();
  if (!session.orgId || !canUse(session, area, level)) redirect("/dashboard");
  return { ...session, orgId: session.orgId };
}
