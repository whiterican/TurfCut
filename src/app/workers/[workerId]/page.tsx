import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { workerAccessFor } from "@/lib/worker-access-data";
import { requireEmployer } from "@/lib/employer-session";
import { loadOrgProfile } from "@/lib/org-profile-data";
import { OrgProfileSections } from "@/components/OrgProfileSections";
import { ActionButton } from "@/components/ActionButton";
import { readHiringModes } from "@/lib/jobs";
import { invite } from "@/app/jobs/actions";

/** A worker as an organization sees them: only what the worker authorized. */
export default async function EmployerWorkerPage({
  params,
}: {
  params: Promise<{ workerId: string }>;
}) {
  const { workerId } = await params;
  const session = await requireEmployer();
  const access = await workerAccessFor(session, workerId, session.orgApproved);
  if (access.kind !== "employer") {
    return (
      <main className="page max-w-2xl">
        <div className="empty-state">
          <p className="empty-state-title">This profile isn&apos;t available</p>
          <p className="empty-state-body">{access.kind === "denied" ? access.reason : "Not available."}</p>
        </div>
      </main>
    );
  }

  const [view, openJobs, engagedOn] = await Promise.all([
    // The same view the worker previews (C2.6): only what they share with this organization, right now.
    loadOrgProfile(workerId, access.orgId),
    db().job.findMany({
      where: { orgId: access.orgId, status: "PUBLISHED" },
      select: { id: true, title: true, hiringMethod: true },
      orderBy: { startsAt: "asc" },
    }),
    db().engagement.findMany({ where: { workerId, job: { orgId: access.orgId } }, select: { jobId: true } }),
  ]);
  if (!view) notFound();
  const engaged = new Set(engagedOn.map((e) => e.jobId));
  const invitable = openJobs.filter((j) => readHiringModes(j.hiringMethod).includes("invite") && !engaged.has(j.id));

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Worker profile</p>
          {/* Only the display name — no phone or other contact details. (No name for an unapproved viewer, which can't reach here today.) */}
          <h1 className="page-title">{view.displayName ?? "Name not shared"}</h1>
        </div>
        <Link transitionTypes={["nav-back"]} href="/jobs" className="btn-ghost">← Jobs</Link>
      </header>

      <section className="section">
        <h2 className="section-title">Invite to a job</h2>
        {invitable.length === 0 ? (
          <p className="text-muted-sm">No published job of yours is open to invitations for this worker.</p>
        ) : (
          <ActionButton action={invite} fields={{ workerId }} label="Send invitation" pendingLabel="Sending…">
            <label className="min-w-56 flex-1 space-y-1.5">
              <span className="label">Job</span>
              <select name="jobId" className="field" required>
                {invitable.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </label>
          </ActionButton>
        )}
      </section>

      <OrgProfileSections view={view} />
    </main>
  );
}
