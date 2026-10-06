import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { workerAccessFor } from "@/lib/worker-access-data";
import { requireEmployer } from "@/lib/employer-session";
import { effectivePreference, employerFitView } from "@/lib/political-fit";
import { loadLatestPreference, orgHasRelationship } from "@/lib/political-fit-data";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { loadOrgScorecardPeriods } from "@/lib/shared-scorecard-data";
import { ExperienceList } from "@/components/ExperienceList";
import { FitSignals } from "@/components/FitSignals";
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

  // Only the display name — no phone or other contact details.
  const worker = await db().worker.findUnique({ where: { id: workerId }, select: { displayName: true, closedAt: true } });
  if (!worker || worker.closedAt) notFound();

  const [rawRecords, shared, pref, related, openJobs, engagedOn] = await Promise.all([
    db().experienceRecord.findMany({ where: { workerId }, orderBy: { startDate: "desc" } }),
    // Only the groups the worker shares with this organization, right now (C2.3).
    loadOrgScorecardPeriods(workerId, access.orgId),
    loadLatestPreference(workerId),
    orgHasRelationship(workerId, access.orgId),
    db().job.findMany({
      where: { orgId: access.orgId, status: "PUBLISHED" },
      select: { id: true, title: true, hiringMethod: true },
      orderBy: { startsAt: "asc" },
    }),
    db().engagement.findMany({ where: { workerId, job: { orgId: access.orgId } }, select: { jobId: true } }),
  ]);
  const engaged = new Set(engagedOn.map((e) => e.jobId));
  const invitable = openJobs.filter((j) => readHiringModes(j.hiringMethod).includes("invite") && !engaged.has(j.id));
  // Issue overlap is per campaign, so this job-independent view never shows
  // it; it appears on each applicant's hiring snapshot. The full
  // questionnaire is never shown.
  // Expired or outdated consent authorizes nothing (effectivePreference → null).
  // References are third-party contact details: employers learn only that one exists.
  const records = rawRecords.map(({ referenceContact, ...r }) => ({ ...r, hasReference: referenceContact !== null }));
  const fit = employerFitView(effectivePreference(pref), { orgHasRelationship: related, campaign: null });

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Worker profile</p>
          <h1 className="page-title">{worker.displayName}</h1>
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

      <section className="section">
        <h2 className="section-title">Scorecard</h2>
        <ScorecardPanel periods={shared} />
      </section>

      <section className="section">
        <h2 className="section-title">Experience</h2>
        <ExperienceList records={records} />
      </section>

      <section className="section">
        <h2 className="section-title">Political fit</h2>
        <FitSignals view={fit} />
      </section>
    </main>
  );
}
