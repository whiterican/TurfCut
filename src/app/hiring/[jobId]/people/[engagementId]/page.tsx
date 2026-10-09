import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireArea } from "@/lib/employer-session";
import { readDisclosure, readRequirements, UUID_RE } from "@/lib/jobs";
import { expiryToday } from "@/lib/credentials";
import { offerLapsed, workerStage, type HiringSnapshot } from "@/lib/engagements";
import { loadPipelineFacts } from "@/lib/engagements-data";
import { ENGAGEMENT_LABELS } from "@/lib/engagement-labels";
import { freeDays, heldCredentials, requiredKinds, type ApplicantJob } from "@/lib/applicants";
import { loadOrgProfile } from "@/lib/org-profile-data";
import { workerAccessFor } from "@/lib/worker-access-data";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { effectivePreference, employerFitView } from "@/lib/political-fit";
import { loadAvailability } from "@/lib/availability-data";
import { loadOrgCredentials } from "@/lib/credentials-data";
import { Masthead } from "@/components/staff/Masthead";
import { HiringActions } from "@/components/HiringActions";
import { EngagementHistory } from "@/components/EngagementHistory";
import { OrgProfileSections } from "@/components/OrgProfileSections";
import { SnapshotView } from "@/components/SnapshotView";
import { NotSharedChip } from "@/components/staff/NotSharedChip";
import { startDirect } from "@/app/messages/actions";

/**
 * One person in the context of one job (C3.2): where they stand, what they
 * share with this organization now — including political-fit answers,
 * display only, where the worker shares them — and the copy taken when they
 * applied. Once an application has closed (not selected, withdrawn), the
 * live profile closes with it (C3.1 decision) and the copy stays.
 */
export default async function ApplicantPage({ params }: { params: Promise<{ jobId: string; engagementId: string }> }) {
  const { jobId, engagementId } = await params;
  if (!UUID_RE.test(jobId) || !UUID_RE.test(engagementId)) notFound();
  const session = await requireArea("hiring");
  const e = await db().engagement.findFirst({
    where: { id: engagementId, jobId, job: { orgId: session.orgId } },
    select: {
      id: true, status: true, createdAt: true, applicationSnapshot: true,
      worker: { select: { id: true, displayName: true, closedAt: true } },
      job: { select: { id: true, title: true, status: true, type: true, startsAt: true, endsAt: true, requirements: true, campaignDisclosure: true, org: { select: { approved: true } }, jurisdiction: { select: { state: true } } } },
    },
  });
  if (!e) notFound();
  const now = new Date();
  const job = e.job;
  const facts = (await loadPipelineFacts([e.id])).get(e.id) ?? { events: [], inReview: false, offerExpiresAt: null };
  const stage = workerStage(e.status, facts.events, offerLapsed(e.status, facts.offerExpiresAt, now));
  const access = e.worker.closedAt ? null : await workerAccessFor(session, e.worker.id, job.org.approved);
  const open = access?.kind === "employer";

  const appJob: ApplicantJob = { type: job.type, startsAt: job.startsAt, endsAt: job.endsAt, requirements: readRequirements(job.requirements), state: job.jurisdiction.state };
  const [view, latest, avail, creds] = open
    ? await Promise.all([loadOrgProfile(e.worker.id, session.orgId, now), loadLatestPreference(e.worker.id), loadAvailability(e.worker.id), loadOrgCredentials(e.worker.id, session.orgId)])
    : [null, null, null, null];
  // Issue overlap needs a campaign: on this page it's this job's.
  const withFit = view && {
    ...view,
    fit: employerFitView(effectivePreference(latest, now), { orgHasRelationship: open && job.org.approved, campaign: readDisclosure(job.campaignDisclosure) }),
  };
  const free = view && view.availability !== "withheld" && avail && job.startsAt && job.endsAt ? freeDays(avail.availability, job.startsAt, job.endsAt) : null;
  const hired = e.status === "ACTIVE" || e.status === "CLAIMED";
  const s = ENGAGEMENT_LABELS[e.status];

  return (
    <main className="page max-w-3xl">
      <Masthead eyebrow={`Applicant · ${job.title}`} title={e.worker.displayName} meta={`Since ${e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`}>
        <Link href={`/hiring/${job.id}/applicants`} className="btn-ghost btn-sm">← Applicants</Link>
        <Link href={`/jobs/${job.id}`} className="btn-secondary btn-sm">Job page</Link>
      </Masthead>

      <section className="card space-y-3">
        <p className="flex items-center gap-2 font-medium text-fg">Stage <span className={s.badge}>{stage}</span></p>
        <HiringActions jobId={job.id} jobStatus={job.status} engagementId={e.id} status={e.status} inReview={facts.inReview} offerExpiresAt={facts.offerExpiresAt} />
        {hired && (
          <form action={startDirect}>
            <input type="hidden" name="engagementId" value={e.id} />
            <button className="btn-secondary btn-sm">Message</button>
          </form>
        )}
        <EngagementHistory events={facts.events} />
      </section>

      {open && view ? (
        <>
          <section className="section">
            <h2 className="section-title">For this job</h2>
            <dl className="list-card">
              {job.startsAt && job.endsAt && (
                <div className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-muted">Free on the job&apos;s dates</dt>
                  <dd className="text-fg sm:text-right">
                    {view.availability === "withheld" ? <NotSharedChip what="availability" /> : !free || !view.availability ? "No availability set" : `${free.free} of ${free.total}${free.capped ? "+" : ""} days`}
                  </dd>
                </div>
              )}
              {requiredKinds(appJob).length > 0 && (
                <div className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-muted">Required credentials</dt>
                  <dd className="text-fg sm:text-right">
                    {creds === "withheld" || !creds ? <NotSharedChip what="credentials" /> : heldCredentials(creds, appJob, expiryToday(now)).map((h) => <span key={h.kind} className="block">{h.text}</span>)}
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <OrgProfileSections view={withFit!} />
        </>
      ) : (
        <section className="alert-info">
          {e.worker.closedAt
            ? "This worker closed their account. The history and the copy below stay."
            : e.status === "INVITED"
              ? "They haven't answered your invitation, so their profile opens only once they do (or if they apply to one of your jobs)."
              : access?.kind === "denied" && !job.org.approved
                ? "Profiles open once Turfcut approves your organization."
                : "This application has closed, so their live profile isn't open to you. The history and the copy below stay."}
        </section>
      )}

      <section className="section">
        <h2 className="section-title">{(e.applicationSnapshot as { kind?: unknown } | null)?.kind === "invitation" ? "When you invited them" : "When they applied"}</h2>
        <p className="text-muted-sm">Exactly what you could see then. It never changes, even if they share less later.</p>
        {e.applicationSnapshot ? <SnapshotView snapshot={e.applicationSnapshot as unknown as HiringSnapshot} /> : <p className="text-hint">No copy was kept for this engagement.</p>}
      </section>
    </main>
  );
}
