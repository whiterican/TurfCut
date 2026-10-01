import type { Role, SessionProfile } from "@/lib/auth";

/** Roles that act for a hiring organization (everything except WORKER). */
export const ORG_ROLES: Role[] = [
  "OWNER",
  "RECRUITER",
  "COMPLIANCE",
  "SUPERVISOR",
  "FINANCE",
];

/**
 * Roles that see a worker's hiring profile (spec p.11: "Recruiters see the
 * hiring profile; supervisors see assignment data; finance sees pay
 * records"). Owners administer the org and can recruit.
 */
export const HIRING_ROLES: Role[] = ["OWNER", "RECRUITER"];

/** Who schedules shifts for hired workers. */
export const SCHEDULING_ROLES: Role[] = ["OWNER", "RECRUITER", "SUPERVISOR"];

/** Who runs the field: hands out packets, counts batches, reviews shifts. */
export const FIELD_ROLES: Role[] = ["OWNER", "SUPERVISOR"];

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
