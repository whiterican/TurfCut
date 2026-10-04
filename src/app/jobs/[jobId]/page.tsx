import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { HIRING_ROLES, ORG_ROLES, SCHEDULING_ROLES } from "@/lib/access";
import { ACCEPTED_STATUSES, RELATIONSHIP_STATUSES, type EngagementStatus, type HiringSnapshot } from "@/lib/engagements";
import { ENGAGEMENT_LABELS, JOB_STATUS_LABELS } from "@/lib/engagement-labels";
import { UUID_RE, exclusionReasons, fitReasons, jobCardAnswers, jurisdictionLabel, payText, publishBlockers, readDisclosure, readHiringModes } from "@/lib/jobs";
import { loadScorecard } from "@/lib/scorecard-data";
import { effectivePreference } from "@/lib/political-fit";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { JobCard } from "@/components/JobCard";
import { SnapshotView } from "@/components/SnapshotView";
import { ActionButton } from "@/components/ActionButton";
import { acceptApplication, acceptInvitation, apply, claim, publish } from "../actions";
import { shiftState, shiftStatusLabel } from "@/lib/field-day";
import { listSupervisors } from "@/lib/field-day-data";
import { LocalTime } from "@/components/LocalTime";
import { ScheduleShiftForm } from "@/components/ScheduleShiftForm";

const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";

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
          <p className="eyebrow">
            {job.type === "PETITION" ? "Petition circulation" : "Door-to-door canvass"} · {jurisdictionLabel(job.jurisdiction)}
          </p>
          <h1 className="page-title masthead">{job.title}</h1>
          <p className="text-muted-sm">{job.org.name}</p>
          <p className="pt-2 text-3xl font-bold tracking-[-0.03em] text-fg tabular-nums">{payText(job.compensationMethod, job.payRateCents)}</p>
          <p className="flex flex-wrap gap-1.5 pt-1">
            {isOwnOrg && <span className={status.badge}>{status.label}</span>}
            <span className="badge-sky">{day(job.startsAt)} – {day(job.endsAt)}</span>
            <span className={job.type === "PETITION" ? "badge-butter" : "badge-plum"}>{job.type === "PETITION" ? "Petition" : "Canvass"}</span>
            <span className="badge-neutral">{acceptedCount} of {job.headcount ?? "—"} spots filled</span>
          </p>
        </div>
        <Link transitionTypes={["nav-back"]} href="/jobs" className="btn-ghost">← Jobs</Link>
      </header>

      {job.description && <p className="lead">{job.description}</p>}

      {isWorker && <WorkerPanel job={job} engagement={engagement} modes={modes} workerId={session.workerId!} acceptedCount={acceptedCount} />}
      {isOwnOrg && (
        <OrgPanel job={job} canHire={HIRING_ROLES.includes(session.role)} canSchedule={SCHEDULING_ROLES.includes(session.role)} userId={session.userId} />
      )}

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
  acceptedCount,
}: {
  job: JobWithRefs;
  engagement: { id: string; status: EngagementStatus } | null;
  modes: string[];
  workerId: string;
  acceptedCount: number;
}) {
  const pref = effectivePreference(await loadLatestPreference(workerId));
  const reasons = exclusionReasons(pref, { disclosure: readDisclosure(job.campaignDisclosure), orgName: job.org.name, measureIds: job.measureIds });
  const excluded = (
    <section className="alert-info space-y-2">
      <p className="font-medium">Hidden from your feed by your own preferences</p>
      <ul className="list-disc pl-5">{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      <Link href="/profile/preferences" className="link">Change your preferences</Link>
    </section>
  );

  if (engagement) {
    const s = ENGAGEMENT_LABELS[engagement.status];
    // An invitation is the org's act: the worker's do-not-match answers
    // still keep them off the job (the org is never told why).
    if (engagement.status === "INVITED" && reasons.length) return excluded;
    return (
      <section className="card space-y-3">
        <p className="flex items-center gap-2 font-medium text-fg">
          Your status <span className={s.badge}>{s.label}</span>
        </p>
        {engagement.status === "INVITED" && (
          <ActionButton action={acceptInvitation} fields={{ jobId: job.id, engagementId: engagement.id }} label="Accept invitation" />
        )}
        {engagement.status === "APPLIED" && <p className="text-muted-sm">The organization will review your application.</p>}
        {(engagement.status === "ACTIVE" || engagement.status === "CLAIMED") && <WorkerShifts engagementId={engagement.id} />}
      </section>
    );
  }

  if (reasons.length) return excluded;

  // Why it fits: the worker's own verified record against the job's rules.
  const card = await loadScorecard(workerId);
  const answers = jobCardAnswers({ ...job, orgName: job.org.name, jurisdictionRules: job.jurisdiction.rules });
  const reasons2 = fitReasons({
    type: job.type,
    state: job.jurisdiction.state,
    verifiedShiftsOfType: card.segments.filter((x) => x.workType === job.type).reduce((n, x) => n + x.shiftsCount, 0),
    statesWorked: [...new Set(card.segments.flatMap((x) => x.statesWorked))],
    credentials: answers.credentials,
    noExtraCredentials: answers.credentials.length === 1 && answers.credentials[0].startsWith("None"),
    spotsLeft: job.headcount === null ? null : Math.max(0, job.headcount - acceptedCount),
    // Only claim "within your boundaries" when they were actually checked:
    // matching-mode answers, a disclosed campaign, at least one do-not-match.
    hasBoundaries:
      !!pref &&
      pref.visibilityMode !== "PRIVATE" &&
      !!readDisclosure(job.campaignDisclosure) &&
      (pref.campaignBoundaries ?? []).some((b) => b.stance === "do_not_match"),
  });

  return (
    <>
    <section className="section">
      <h2 className="section-title">Why it fits</h2>
      <ul className="divide-y divide-border">
        {reasons2.map((r) => (
          <li key={r.title} className="flex items-center gap-3 py-3">
            <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-xl font-bold ${r.kind === "yes" ? "bg-plum text-on-plum" : "bg-butter text-ink"}`}>
              {r.kind === "yes" ? "✓" : "i"}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-fg">{r.title}</span>
              <span className="block text-sm text-muted">{r.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-hint">From your verified record and this job&apos;s rules — no hidden score.</p>
    </section>
    <section className="card space-y-4">
      {modes.includes("application") && (
        <ActionButton action={apply} fields={{ jobId: job.id }} label="Apply with verified profile" pendingLabel="Applying…" />
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
    </>
  );
}

const SHIFT_LIST = { events: true, validations: true, engagement: { include: { worker: { select: { id: true, displayName: true, profileId: true } }, job: true } } } as const;

function ShiftList({ shifts, showWorker }: { shifts: Array<Parameters<typeof shiftRow>[0]>; showWorker: boolean }) {
  return (
    <ul className="list-card">
      {shifts.map((s) => shiftRow(s, showWorker))}
    </ul>
  );
}

function shiftRow(
  s: { id: string; startsAt: Date; endsAt: Date; status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED"; stagingLocation: string | null; events: Array<{ type: string; payload: unknown; actorId: string | null; createdAt: Date }>; validations: Array<{ workEventId: string | null; status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED"; reason: string | null; createdAt: Date }>; engagement: { worker: { displayName: string }; job: { type: "PETITION" | "CANVASS" } } },
  showWorker: boolean
) {
  const b = shiftStatusLabel(shiftState({ status: s.status, startsAt: s.startsAt, endsAt: s.endsAt, workType: s.engagement.job.type, events: s.events, validations: s.validations }));
  return (
    <li key={s.id}>
      <Link transitionTypes={["nav-forward"]} href={`/shifts/${s.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm transition hover:bg-surface-2">
        <span className="space-y-0.5">
          {showWorker && <span className="block font-semibold text-fg">{s.engagement.worker.displayName}</span>}
          <span className="block text-muted">
            <LocalTime iso={s.startsAt.toISOString()} /> – <LocalTime iso={s.endsAt.toISOString()} mode="time" />
            {s.stagingLocation ? ` · ${s.stagingLocation}` : ""}
          </span>
        </span>
        <span className={b.badge}>{b.label}</span>
      </Link>
    </li>
  );
}

async function WorkerShifts({ engagementId }: { engagementId: string }) {
  const shifts = await db().shift.findMany({ where: { engagementId }, include: SHIFT_LIST, orderBy: { startsAt: "asc" } });
  return shifts.length ? (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-fg">Your shifts</p>
      <ShiftList shifts={shifts} showWorker={false} />
    </div>
  ) : (
    <p className="text-muted-sm">You&apos;re hired. The organization will schedule your shifts — they&apos;ll appear here and under Shifts.</p>
  );
}

async function OrgPanel({ job, canHire, canSchedule, userId }: { job: JobWithRefs; canHire: boolean; canSchedule: boolean; userId: string }) {
  const blockers = job.status === "DRAFT" || job.status === "PAUSED"
    ? publishBlockers({ job, jurisdiction: job.jurisdiction, org: job.org })
    : [];
  const engagements = canHire
    ? await db().engagement.findMany({
        where: { jobId: job.id },
        include: { worker: { select: { id: true, displayName: true, closedAt: true } } },
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
              {job.status === "DRAFT" && <Link transitionTypes={["nav-forward"]} href={`/jobs/${job.id}/edit`} className="btn-secondary">Edit draft</Link>}
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
                        {/* Profiles open once the worker has engaged (C1); a bare invitation or a closed account shows the name only. */}
                        {e.worker.closedAt || !RELATIONSHIP_STATUSES.includes(e.status) ? (
                          <span>{e.worker.displayName}</span>
                        ) : (
                          <Link transitionTypes={["nav-forward"]} href={`/workers/${e.worker.id}`} className="link">{e.worker.displayName}</Link>
                        )}
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

      {canSchedule && job.status === "PUBLISHED" && <ShiftsSection job={job} userId={userId} />}
    </>
  );
}

async function ShiftsSection({ job, userId }: { job: JobWithRefs; userId: string }) {
  const [shifts, hired, supervisors] = await Promise.all([
    db().shift.findMany({ where: { engagement: { jobId: job.id } }, include: SHIFT_LIST, orderBy: { startsAt: "asc" } }),
    db().engagement.findMany({
      where: { jobId: job.id, status: { in: ["ACTIVE", "CLAIMED"] }, worker: { closedAt: null } },
      select: { id: true, worker: { select: { displayName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    listSupervisors(job.orgId),
  ]);
  const labels = supervisors.map((p) => ({
    id: p.id,
    label: p.id === userId ? "You" : `${p.role === "OWNER" ? "Owner" : "Supervisor"} · ${p.id.slice(0, 8)}`,
  }));
  return (
    <section className="section">
      <h2 className="section-title">Shifts</h2>
      {shifts.length > 0 ? (
        <ShiftList shifts={shifts} showWorker />
      ) : (
        <p className="text-muted-sm">No shifts yet.</p>
      )}
      {hired.length > 0 ? (
        <ScheduleShiftForm jobId={job.id} workers={hired.map((e) => ({ engagementId: e.id, name: e.worker.displayName }))} supervisors={labels} />
      ) : (
        <p className="text-hint">Accept a worker first — only hired workers can be scheduled.</p>
      )}
    </section>
  );
}
