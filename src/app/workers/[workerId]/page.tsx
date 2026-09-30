import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { workerAccess } from "@/lib/access";
import { requireEmployer } from "@/lib/employer-session";
import { loadScorecardPeriods } from "@/lib/scorecard-data";
import { effectivePreference, employerFitView } from "@/lib/political-fit";
import { loadLatestPreference, orgHasRelationship } from "@/lib/political-fit-data";
import { ScorecardPanel } from "@/components/ScorecardPanel";
import { ExperienceList } from "@/components/ExperienceList";
import { FitSignals } from "@/components/FitSignals";

/** A worker as an organization sees them: only what the worker authorized. */
export default async function EmployerWorkerPage({
  params,
}: {
  params: Promise<{ workerId: string }>;
}) {
  const { workerId } = await params;
  const session = await requireEmployer();
  const access = workerAccess(session, workerId, session.orgApproved);
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
  const worker = await db().worker.findUnique({ where: { id: workerId }, select: { displayName: true } });
  if (!worker) notFound();

  const [rawRecords, scorecard, pref, related] = await Promise.all([
    db().experienceRecord.findMany({ where: { workerId }, orderBy: { startDate: "desc" } }),
    loadScorecardPeriods(workerId),
    loadLatestPreference(workerId),
    orgHasRelationship(workerId, access.orgId),
  ]);
  // Jobs don't disclose campaign positions until M2, so issue overlap is
  // always "not shared" for now; the full questionnaire is never shown.
  // Expired or outdated consent authorizes nothing (effectivePreference → null).
  // References are third-party contact details: employers learn only that one exists.
  const records = rawRecords.map(({ referenceContact, ...r }) => ({ ...r, hasReference: referenceContact !== null }));
  const fit = employerFitView(effectivePreference(pref), { orgHasRelationship: related, campaign: null });

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1">
          <p className="text-muted-sm">Worker profile</p>
          <h1 className="page-title">{worker.displayName}</h1>
        </div>
        <Link href="/workers" className="btn-ghost">← All workers</Link>
      </header>

      <section className="section">
        <h2 className="section-title">Scorecard</h2>
        <ScorecardPanel periods={scorecard} />
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
