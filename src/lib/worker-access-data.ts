import { db } from "@/lib/db";
import { workerAccess, type WorkerAccess } from "@/lib/access";
import type { SessionProfile } from "@/lib/auth";
import { UUID_RE } from "@/lib/jobs";

const NOT_YOURS = "You can see a worker's profile once they've applied to, been invited to or worked one of your jobs.";

/**
 * workerAccess plus the C1 rule: there is no worker directory, so an
 * organization sees a worker only through its own jobs — an application,
 * invitation or engagement of any status. Browsing by id gets nothing.
 */
export async function workerAccessFor(
  session: Pick<SessionProfile, "role" | "workerId" | "orgId">,
  workerId: string,
  orgApproved: boolean
): Promise<WorkerAccess> {
  if (!UUID_RE.test(workerId)) return { kind: "denied", reason: "Not found." };
  const access = workerAccess(session, workerId, orgApproved);
  if (access.kind !== "employer") return access;
  const linked = await db().engagement.count({ where: { workerId, job: { orgId: access.orgId } } });
  return linked ? access : { kind: "denied", reason: NOT_YOURS };
}
