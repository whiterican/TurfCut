import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { HIRING_ROLES, ORG_ROLES } from "@/lib/access";
import { ACCEPTED_STATUSES, type EngagementStatus, type HiringSnapshot } from "@/lib/engagements";
import { ENGAGEMENT_LABELS, JOB_STATUS_LABELS } from "@/lib/engagement-labels";
import { UUID_RE, exclusionReasons, jurisdictionLabel, publishBlockers, readDisclosure, readHiringModes } from "@/lib/jobs";
import { effectivePreference } from "@/lib/political-fit";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { JobCard } from "@/components/JobCard";
import { SnapshotView } from "@/components/SnapshotView";
import { ActionButton } from "@/components/ActionButton";
import { acceptApplication, acceptInvitation, apply, claim, publish } from "../actions";

const loadJob = (id: string) => db().job.findUnique({ where: { id }, include: { org: true, jurisdiction: true } });
type JobWithRefs = NonNullable<Awaited<ReturnType<typeof loadJob>>>;

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const session = await requireAuth();
  const job = await loadJob(jobId);
  if (!job) notFound();

  const isWorker = session.role === "WORKER" && !!session.workerId;
  const isOwnOrg = ORG_ROLES.includes(session.role) && session.orgId === job.orgId;
  const engagement = isWorker
    ? await db().engagement.findUnique({ where: { jobId_workerId: { jobId, workerId: session.workerId! } } })
    : null;
  // Workers see published jobs and any job they're already engaged on; orgs see their own.
  if (!isOwnOrg && !(isWorker && (job.status === "PUBLISHED" || engagement))) notFound();

  const acceptedCount = await db().engagement.count({ where: { jobId, status: { in: ACCEPTED_STATUSES } } });
  const modes = readHiringModes(job.hiringMethod);
  const status = JOB_STATUS_LABELS[job.status];

  return (
    <main className="page max-w-3xl">
      <header className="page-header">
        <div className="space-y-2">
          <p className="flex flex-wrap items-center gap-2 text-muted-sm">
            {job.type === "PETITION" ? "Petition circulation" : "Door-to-door canvass"} · {jurisdictionLabel(job.jurisdiction)}
            {isOwnOrg && <span className={status.badge}>{status.label}</span>}
          </p>
          <h1 className="page-title">{job.title}</h1>
          <p className="text-muted-sm">
            {acceptedCount} of {job.headcount ?? "—"} spot(s) filled
          </p>
        </div>
        <Link href="/jobs" className="btn-ghost">← Jobs</Link>
      </header>

      {job.description && <p className="lead">{job.description}</p>}

      {isWorker && <WorkerPanel job={job} engagement={engagement} modes={modes} workerId={session.workerId!} />}
      {isOwnOrg && <OrgPanel job={job} canHire={HIRING_ROLES.includes(session.role)} />}

      <section className="section">
        <h2 className="section-title">Job card</h2>
        <JobCard job={{ ...job, orgName: job.org.name, jurisdictionRules: job.jurisdiction.rules }} />
      </section>
    </main>
  );
}

async function WorkerPanel({
  job,
  engagement,
  modes,
  workerId,
}: {
  job: JobWithRefs;
  engagement: { id: string; status: EngagementStatus } | null;
  modes: string[];
  workerId: string;
}) {
  if (engagement) {
    const s = ENGAGEMENT_LABELS[engagement.status];
    return (
      <section className="card space-y-3">
        <p className="flex items-center gap-2 font-medium text-fg">
          Your status <span className={s.badge}>{s.label}</span>
        </p>
        {engagement.status === "INVITED" && (
          <ActionButton action={acceptInvitation} fields={{ jobId: job.id, engagementId: engagement.id }} label="Accept invitation" />
        )}
        {engagement.status === "APPLIED" && <p className="text-muted-sm">The organization will review your application.</p>}
      </section>
    );
  }

  const pref = effectivePreference(await loadLatestPreference(workerId));
  const reasons = exclusionReasons(pref, { disclosure: readDisclosure(job.campaignDisclosure), orgName: job.org.name, measureIds: job.measureIds });
  if (reasons.length) {
    return (
      <section className="alert-info space-y-2">
        <p className="font-medium">Hidden from your feed by your own preferences</p>
        <ul className="list-disc pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <Link href="/profile/preferences" className="link">Change your preferences</Link>
      </section>
    );
  }

  return (
    <section className="card space-y-4">
      {modes.includes("application") && (
        <ActionButton action={apply} fields={{ jobId: job.id }} label="Apply" pendingLabel="Applying…" />
      )}
      {modes.includes("instant_claim") && (
        <ActionButton action={claim} fields={{ jobId: job.id }} label="Claim a spot" pendingLabel="Claiming…" variant={modes.includes("application") ? "btn-secondary" : "btn-primary"} />
      )}
      {!modes.includes("application") && !modes.includes("instant_claim") && (
        <p className="text-muted-sm">This job hires by invitation only.</p>
      )}
      <p className="text-hint">
        Applying shares your verified scorecard and only the political-fit answers you chose to share.{" "}
        <Link href="/profile/preferences" className="link">Review what you share</Link>
      </p>
    </section>
  );
}

async function OrgPanel({ job, canHire }: { job: JobWithRefs; canHire: boolean }) {
  const blockers = job.status === "DRAFT" || job.status === "PAUSED"
    ? publishBlockers({ job, jurisdiction: job.jurisdiction, org: job.org })
    : [];
  const engagements = canHire
    ? await db().engagement.findMany({
        where: { jobId: job.id },
        include: { worker: { select: { id: true, displayName: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <>
      {(job.status === "DRAFT" || job.status === "PAUSED") && (
        <section className="section">
          <h2 className="section-title">Publishing</h2>
          {blockers.length > 0 ? (
            <div className="alert-warning space-y-2">
              <p className="font-medium">This job can&apos;t publish yet</p>
              <ul className="list-disc space-y-0.5 pl-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              <Link href="/org/settings" className="link">Organization settings</Link>
            </div>
          ) : (
            <p className="text-muted-sm">Every check passes. Publishing re-runs them at that moment.</p>
          )}
          {canHire && (
            <div className="flex flex-wrap items-start gap-3">
              <ActionButton action={publish} fields={{ jobId: job.id }} label="Publish" pendingLabel="Publishing…" disabled={blockers.length > 0} />
              {job.status === "DRAFT" && <Link href={`/jobs/${job.id}/edit`} className="btn-secondary">Edit draft</Link>}
            </div>
          )}
        </section>
      )}

      {canHire && job.status !== "DRAFT" && (
        <section className="section">
          <h2 className="section-title">Workers</h2>
          <p className="text-muted-sm">In the order they arrived. Each shows exactly what you could see at that moment.</p>
          {engagements.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No one yet</p>
              <p className="empty-state-body">Applications, claims and invitations appear here.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {engagements.map((e) => {
                const s = ENGAGEMENT_LABELS[e.status];
                return (
                  <li key={e.id} className="card space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="flex items-center gap-2 font-medium text-fg">
                        <Link href={`/workers/${e.worker.id}`} className="link">{e.worker.displayName}</Link>
                        <span className={s.badge}>{s.label}</span>
                      </p>
                      {e.status === "APPLIED" && (
                        <ActionButton action={acceptApplication} fields={{ jobId: job.id, engagementId: e.id }} label="Accept" variant="btn-primary btn-sm" />
                      )}
                    </div>
                    {e.applicationSnapshot ? (
                      <SnapshotView snapshot={e.applicationSnapshot as unknown as HiringSnapshot} />
                    ) : (
                      <p className="text-hint">No snapshot — this engagement predates hiring snapshots.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
