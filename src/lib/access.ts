import type { Role, SessionProfile } from "@/lib/auth";

/** Every role that acts for an organization (everything except WORKER). */
export type OrgRole = Exclude<Role, "WORKER">;
/** The built-in roles: fixed rows of the access map, and the presets a custom role starts from (M10.6). */
export type BuiltInRole = Exclude<OrgRole, "CUSTOM">;
export const BUILT_IN_ROLES: BuiltInRole[] = ["OWNER", "RECRUITER", "COMPLIANCE", "SUPERVISOR", "FINANCE", "PUBLISHER"];
const ORG_ROLE_LIST: OrgRole[] = [...BUILT_IN_ROLES, "CUSTOM"];
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
  CUSTOM: "Custom role",
};
export const ROLE_HELP: Record<OrgRole, string> = {
  OWNER: "Everything, including members and settings.",
  RECRUITER: "Jobs, applicants and invitations; reads field days.",
  COMPLIANCE: "Classification review and compliance records.",
  SUPERVISOR: "Schedules shifts and runs field days.",
  FINANCE: "Pay: approvals, holds and exports.",
  PUBLISHER: "Campaign communications (coming soon).",
  CUSTOM: "Whatever your organization gave it.",
};
/** Built-in roles an owner can invite or assign. Compliance is not offered as a role of its own: it is a preset for a custom role (M10.6); existing compliance members keep it. Custom roles are offered alongside, by name. */
export const INVITE_ROLES: BuiltInRole[] = ["OWNER", "RECRUITER", "SUPERVISOR", "FINANCE", "PUBLISHER"];

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
export const AREAS = [
  "desk", // home for org roles (today /dashboard; /desk in C1.3)
  "hiring", // worker hiring profiles, applicants, accepting applications
  "jobs", // the job list and job pages
  "jobsEdit", // create, edit, publish jobs
  "scheduling", // schedule shifts for hired workers
  "field", // run the field: shift pages, packets, batch counts, closeout review
  "pay", // approve and send pay, disputes, pay exports
  "messages", // in-app chat
  "moderation", // M10.6: review and resolve chat reports, mute and block in an organization's conversations
  "orgSettings", // the organization's settings page
  "compliance", // record the classification review and credential checks
  "orgMembers", // invite, change and remove members
  "campaigns", // campaign profiles: the profile, its handle and bio, publishing, pins (S1)
  "campaignPosting", // write and manage a campaign's posts, including hiring posts (S1)
] as const;
export type Area = (typeof AREAS)[number];
export type AccessLevel = "full" | "read";

export const ACCESS: Record<Area, Partial<Record<BuiltInRole, AccessLevel>>> = {
  desk: { OWNER: "full", RECRUITER: "full", COMPLIANCE: "full", SUPERVISOR: "full", FINANCE: "full", PUBLISHER: "full" },
  hiring: { OWNER: "full", RECRUITER: "full" },
  jobs: { OWNER: "full", RECRUITER: "full", COMPLIANCE: "read", SUPERVISOR: "read", FINANCE: "read", PUBLISHER: "read" },
  jobsEdit: { OWNER: "full", RECRUITER: "full" },
  scheduling: { OWNER: "full", RECRUITER: "full", SUPERVISOR: "full" },
  field: { OWNER: "full", RECRUITER: "read", SUPERVISOR: "full" },
  pay: { OWNER: "full", FINANCE: "full" },
  messages: { OWNER: "full", RECRUITER: "full", SUPERVISOR: "full" },
  moderation: { OWNER: "full" },
  orgSettings: { OWNER: "full", RECRUITER: "read", COMPLIANCE: "read", SUPERVISOR: "read", FINANCE: "read", PUBLISHER: "read" },
  compliance: { OWNER: "full", COMPLIANCE: "full" },
  orgMembers: { OWNER: "full" },
  campaigns: { OWNER: "full", PUBLISHER: "full" },
  // Recruiters write hiring posts too (S1 decision 2); pins and the profile stay with owners and publishers.
  campaignPosting: { OWNER: "full", PUBLISHER: "full", RECRUITER: "full" },
};

const isOrgRole = (role: Role): role is OrgRole => role !== "WORKER";

/** Grants on areas: a custom role's reach, and a built-in role's row of the map read the other way round (M10.6). */
export type Grants = Partial<Record<Area, AccessLevel>>;
/** What a check needs: a role and, for a custom role, its grants. A SessionProfile is one. */
export type AccessSubject = { role: Role; grants?: Grants | null };

/** The levels an area can be granted at: the ones the built-in roles use there (an area only owners reach in full is never offered at "read"). */
export function levelsFor(area: Area): AccessLevel[] {
  const used = new Set(Object.values(ACCESS[area]));
  return (["read", "full"] as const).filter((l) => used.has(l));
}

/** A built-in role's row of the map as grants: the preset a custom role starts from. */
export function presetGrants(role: BuiltInRole): Grants {
  const out: Grants = {};
  for (const area of AREAS) {
    const level = ACCESS[area][role];
    if (level) out[area] = level;
  }
  return out;
}

/** Grants read from stored rows; an unknown area or a level the area isn't offered at is dropped, so a stale row can only reach less. */
export function parseGrants(rows: Array<{ area: string; level: string }>): Grants {
  const out: Grants = {};
  for (const r of rows) {
    const area = (AREAS as readonly string[]).includes(r.area) ? (r.area as Area) : null;
    const level = r.level === "FULL" ? "full" : r.level === "READ" ? "read" : null;
    if (area && level && levelsFor(area).includes(level)) out[area] = level;
  }
  return out;
}

/**
 * A member's access to an area: a built-in role's row of the map, or a
 * custom role's grant. A custom-role member without grants (an archived or
 * missing role) has none, and so does any check that still asks by role
 * alone (accessTo): a missed site fails closed.
 */
export function accessFor(subject: AccessSubject, area: Area): AccessLevel | null {
  if (subject.role === "CUSTOM") return subject.grants?.[area] ?? null;
  return accessTo(subject.role, area);
}

/** Whether a member may use an area at the given level ("read" also admits "full"). */
export function canUse(subject: AccessSubject, area: Area, level: AccessLevel = "full"): boolean {
  const a = accessFor(subject, area);
  return a === "full" || (level === "read" && a === "read");
}

/** A role's access to an area, or null when it has none. Workers have no org areas; a custom role has none here (it has grants: use accessFor). */
export function accessTo(role: Role, area: Area): AccessLevel | null {
  return isOrgRole(role) ? (ACCESS[area][role as BuiltInRole] ?? null) : null;
}

/**
 * Whether a role, or a member (a role with its custom grants), may use an
 * area at the given level ("read" also admits "full"). Given a bare role
 * it answers for the built-in roles only: a custom role needs its grants.
 */
export function can(subject: Role | AccessSubject, area: Area, level: AccessLevel = "full"): boolean {
  return canUse(typeof subject === "string" ? { role: subject } : subject, area, level);
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
