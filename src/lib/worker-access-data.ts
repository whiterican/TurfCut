import { orgHasRelationship } from "@/lib/political-fit-data";
import { workerAccess, type WorkerAccess } from "@/lib/access";
import type { SessionProfile } from "@/lib/auth";
import { UUID_RE } from "@/lib/jobs";

const NOT_YOURS = "You can see a worker's profile once they've applied to, claimed or been hired on one of your jobs.";

/**
 * workerAccess plus the C1 rule: there is no worker directory, so an
 * organization sees a worker only once the worker has engaged with one of
 * its jobs (applied, claimed, hired — RELATIONSHIP_STATUSES). An invitation
 * is the organization's own act, so it never counts. Browsing by id gets
 * nothing.
 */
export async function workerAccessFor(
  session: Pick<SessionProfile, "role" | "workerId" | "orgId">,
  workerId: string,
  orgApproved: boolean
): Promise<WorkerAccess> {
  if (!UUID_RE.test(workerId)) return { kind: "denied", reason: "Not found." };
  const access = workerAccess(session, workerId, orgApproved);
  if (access.kind !== "employer") return access;
  return (await orgHasRelationship(workerId, access.orgId)) ? access : { kind: "denied", reason: NOT_YOURS };
}
