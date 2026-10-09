import type { Role, SessionProfile } from "@/lib/auth";

/** Every role that acts for an organization (everything except WORKER). */
export type OrgRole = Exclude<Role, "WORKER">;
const ORG_ROLE_LIST: OrgRole[] = ["OWNER", "RECRUITER", "COMPLIANCE", "SUPERVISOR", "FINANCE", "PUBLISHER"];
export const ORG_ROLES: Role[] = ORG_ROLE_LIST;

/** How each role is named in the app, and what an owner is told it can do. */
export const ROLE_LABELS: Record<Role, string> = {
  WORKER: "Field worker",
  OWNER: "Owner",
  RECRUITER: "Recruiter",
  COMPLIANCE: "Compliance",
  SUPERVISOR: "Supervisor",
  FINANCE: "Finance",
  PUBLISHER: "Publisher",
};
export const ROLE_HELP: Record<OrgRole, string> = {
  OWNER: "Everything, including members and settings.",
  RECRUITER: "Jobs, applicants and invitations; reads field days.",
  COMPLIANCE: "Classification review and compliance records.",
  SUPERVISOR: "Schedules shifts and runs field days.",
  FINANCE: "Pay: approvals, holds and exports.",
  PUBLISHER: "Campaign communications (coming soon).",
};
/** Roles an owner can invite or assign (C1 plan). Compliance is not offered: M10 decides it; existing compliance members keep it. */
export const INVITE_ROLES: OrgRole[] = ["OWNER", "RECRUITER", "SUPERVISOR", "FINANCE", "PUBLISHER"];

/**
 * C1 access map: the one table that says which organization role reaches
 * which area of the client side, with full access or view only. Pages,
 * server actions and API routes check it (through the role lists below or
 * requireArea), and the nav is built from it, so a tab never appears for a
 * route that would refuse you. A role missing from an area has no access.
 *
 * Areas that land in later C1 slices or milestones (desk, hiring, field,
 * campaigns) are listed now so every slice reads the same table.
 */
export type Area =
  | "desk" // home for org roles (today /dashboard; /desk in C1.3)
  | "hiring" // worker hiring profiles, applicants, accepting applications
  | "jobs" // the job list and job pages
  | "jobsEdit" // create, edit, publish jobs
  | "scheduling" // schedule shifts for hired workers
  | "field" // run the field: shift pages, packets, batch counts, closeout review
  | "pay" // approve and send pay, disputes, pay exports
  | "messages" // in-app chat
  | "orgSettings" // the organization's settings page
  | "compliance" // record the classification review and credential checks
  | "orgMembers" // invite, change and remove members
  | "campaigns"; // campaign profiles (C6)
export type AccessLevel = "full" | "read";

export const ACCESS: Record<Area, Partial<Record<OrgRole, AccessLevel>>> = {
  desk: { OWNER: "full", RECRUITER: "full", COMPLIANCE: "full", SUPERVISOR: "full", FINANCE: "full", PUBLISHER: "full" },
  hiring: { OWNER: "full", RECRUITER: "full" },
  jobs: { OWNER: "full", RECRUITER: "full", COMPLIANCE: "read", SUPERVISOR: "read", FINANCE: "read", PUBLISHER: "read" },
  jobsEdit: { OWNER: "full", RECRUITER: "full" },
  scheduling: { OWNER: "full", RECRUITER: "full", SUPERVISOR: "full" },
  field: { OWNER: "full", RECRUITER: "read", SUPERVISOR: "full" },
  pay: { OWNER: "full", FINANCE: "full" },
  messages: { OWNER: "full", RECRUITER: "full", SUPERVISOR: "full" },
  orgSettings: { OWNER: "full", RECRUITER: "read", COMPLIANCE: "read", SUPERVISOR: "read", FINANCE: "read", PUBLISHER: "read" },
  compliance: { OWNER: "full", COMPLIANCE: "full" },
  orgMembers: { OWNER: "full" },
  campaigns: { OWNER: "full", PUBLISHER: "full" },
};

const isOrgRole = (role: Role): role is OrgRole => role !== "WORKER";

/** A role's access to an area, or null when it has none. Workers have no org areas. */
export function accessTo(role: Role, area: Area): AccessLevel | null {
  return isOrgRole(role) ? (ACCESS[area][role] ?? null) : null;
}

/** Whether a role may use an area at the given level ("read" also admits "full"). */
export function can(role: Role, area: Area, level: AccessLevel = "full"): boolean {
  const a = accessTo(role, area);
  return a === "full" || (level === "read" && a === "read");
}

/** The roles that may use an area at the given level. */
export function rolesFor(area: Area, level: AccessLevel = "full"): OrgRole[] {
  return ORG_ROLE_LIST.filter((r) => can(r, area, level));
}

/**
 * Roles that see a worker's hiring profile (spec p.11: "Recruiters see the
 * hiring profile; supervisors see assignment data; finance sees pay
 * records"). Owners administer the org and can recruit.
 */
export const HIRING_ROLES: Role[] = rolesFor("hiring");

/** Who schedules shifts for hired workers. */
export const SCHEDULING_ROLES: Role[] = rolesFor("scheduling");

/**
 * Who approves pay, resolves pay disputes, pays workers and exports the pay
 * ledger (spec p.11 "finance sees pay records"). Supervisors approve the
 * work itself on the shift page.
 */
export const PAY_ROLES: Role[] = rolesFor("pay");

/** Who runs the field: hands out packets, counts batches, reviews shifts. */
export const FIELD_ROLES: Role[] = rolesFor("field");

/** Who records the classification review on the organization's settings. */
export const COMPLIANCE_ROLES: Role[] = rolesFor("compliance");

/** Who invites, changes and removes members (owners only in C1; M10 widens it). */
export const MEMBER_ADMIN_ROLES: Role[] = rolesFor("orgMembers");

export type WorkerAccess =
  | { kind: "self" }
  | { kind: "employer"; orgId: string }
  | { kind: "denied"; reason: string };

/**
 * Who may view a worker's hiring profile (profile, experience, scorecard).
 * - The worker themselves.
 * - Owners and recruiters of an organization Turfcut has approved.
 * Everyone else — other workers, compliance/supervisor/finance seats,
 * unapproved orgs — is denied.
 *
 * Political-fit answers have their own, stricter gate (lib/political-fit.ts);
 * passing this check never exposes them on its own.
 */
export function workerAccess(
  session: Pick<SessionProfile, "role" | "workerId" | "orgId">,
  workerId: string,
  orgApproved: boolean
): WorkerAccess {
  if (session.role === "WORKER") {
    return session.workerId === workerId
      ? { kind: "self" }
      : { kind: "denied", reason: "Workers can only view their own profile." };
  }
  if (!ORG_ROLES.includes(session.role) || !session.orgId) {
    return { kind: "denied", reason: "No organization on this account." };
  }
  if (!HIRING_ROLES.includes(session.role)) {
    return { kind: "denied", reason: "Worker hiring profiles are available to owners and recruiters." };
  }
  if (!orgApproved) {
    return { kind: "denied", reason: "Your organization is awaiting approval." };
  }
  return { kind: "employer", orgId: session.orgId };
}
