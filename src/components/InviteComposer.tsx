import { db } from "@/lib/db";
import { readHiringModes } from "@/lib/jobs";
import { INVITE_DAYS, INVITES_PER_WEEK, NOTE_MAX } from "@/lib/engagements";
import { invitesLeft } from "@/lib/invitations-data";
import { ActionButton } from "@/components/ActionButton";
import { invite } from "@/app/jobs/actions";

/**
 * Invite a worker to one of the organization's open jobs (C3.3), with a
 * note they read, and the invitations left this week for this worker.
 * Call it only where the organization may see the worker (C1 relationship).
 */
export async function InviteComposer({ workerId, orgId }: { workerId: string; orgId: string }) {
  const [openJobs, engagedOn, left] = await Promise.all([
    db().job.findMany({ where: { orgId, status: "PUBLISHED" }, select: { id: true, title: true, hiringMethod: true }, orderBy: { startsAt: "asc" } }),
    db().engagement.findMany({ where: { workerId, job: { orgId } }, select: { jobId: true } }),
    invitesLeft(workerId, orgId),
  ]);
  const engaged = new Set(engagedOn.map((e) => e.jobId));
  const invitable = openJobs.filter((j) => readHiringModes(j.hiringMethod).includes("invite") && !engaged.has(j.id));

  return (
    <section className="section">
      <h2 className="section-title">Invite to a job</h2>
      {invitable.length === 0 ? (
        <p className="text-muted-sm">No published job of yours is open to invitations for this worker.</p>
      ) : left === 0 ? (
        <p className="text-muted-sm">You&apos;ve sent this worker the most invitations allowed this week ({INVITES_PER_WEEK}). Try again in a few days.</p>
      ) : (
        <div className="card space-y-2">
          <ActionButton action={invite} fields={{ workerId }} label="Send invitation" pendingLabel="Sending…">
            <div className="w-full space-y-3">
              <label className="block space-y-1.5">
                <span className="label">Job</span>
                <select name="jobId" className="field" required>
                  {invitable.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="label">Note to the worker (optional)</span>
                <textarea name="note" className="field min-h-20" maxLength={NOTE_MAX} />
                <span className="text-hint block">They read this with the invitation. Keep it about the job.</span>
              </label>
            </div>
          </ActionButton>
          <p className="text-hint">
            {left} of {INVITES_PER_WEEK} invitations left this week for this worker. It lasts {INVITE_DAYS} days; you aren&apos;t told whether they open it.
          </p>
        </div>
      )}
    </section>
  );
}
