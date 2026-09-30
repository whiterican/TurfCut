import type { Role, SessionProfile } from "@/lib/auth";

/** Roles that act for a hiring organization (everything except WORKER). */
export const ORG_ROLES: Role[] = [
  "OWNER",
  "RECRUITER",
  "COMPLIANCE",
  "SUPERVISOR",
  "FINANCE",
];

export type WorkerAccess =
  | { kind: "self" }
  | { kind: "employer"; orgId: string }
  | { kind: "denied"; reason: string };

/**
 * Who may view a worker's profile and scorecard.
 * - The worker themselves.
 * - Staff of an organization that Turfcut has approved (private pilot).
 * Everyone else — other workers, unapproved orgs — is denied.
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
  if (!orgApproved) {
    return { kind: "denied", reason: "Your organization is awaiting approval." };
  }
  return { kind: "employer", orgId: session.orgId };
}
