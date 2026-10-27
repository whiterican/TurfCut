import Link from "next/link";
import { readLaunch } from "@/lib/job-launch";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { canUse } from "@/lib/access";
import { ACCEPTED_STATUSES, inviteLapsed, offerLapsed, stageOf, workerStage, type EngagementStatus, type HiringSnapshot } from "@/lib/engagements";
import { loadPipelineFacts } from "@/lib/engagements-data";
import { EngagementHistory } from "@/components/EngagementHistory";
import { HiringActions, timeLeft } from "@/components/HiringActions";
import { ENGAGEMENT_LABELS, JOB_STATUS_LABELS, jobPageBadge } from "@/lib/engagement-labels";
import { UUID_RE, exclusionReasons, fitReasons, jobCardAnswers, jobCredentials, jobFreezeReasons, jurisdictionLabel, payText, publishBlockers, readDisclosure, readHiringModes } from "@/lib/jobs";
import { loadScorecard } from "@/lib/scorecard-data";
import { loadSharing } from "@/lib/sharing-data";
import { PART_DETAILS, RELATIONSHIP_PHRASE, SHARE_PARTS, visibleParts, type SharePart, type SharingChoices } from "@/lib/sharing";

import { effectivePreference } from "@/lib/political-fit";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { JobCard } from "@/components/JobCard";
import { SnapshotView } from "@/components/SnapshotView";
import { ActionButton } from "@/components/ActionButton";
import { Sheet } from "@/components/Sheet";
import { Masthead } from "@/components/Masthead";

import { acceptInvitation, apply, claim, closeJobAction, declineAsWorker, leaveChangedJob, publish, withdrawApplication } from "../actions";
import { openRelease } from "@/lib/job-changes-data";
import { loadJobChanges } from "@/lib/jobs-data";
import { listText as andList, materialText, RELEASE_HOURS } from "@/lib/job-changes";
import { JobChangedNotice } from "@/components/JobChangedNotice";
import { shiftState, shiftStatusLabel } from "@/lib/field-day";
import { listSupervisors } from "@/lib/field-day-data";
import { LocalTime } from "@/components/LocalTime";
import { ScheduleShiftForm } from "@/components/ScheduleShiftForm";
import { OpenShifts } from "@/components/staff/OpenShifts";
import { loadJobSlots, seatsOnOffer } from "@/lib/shift-slots-data";
import { loadSharedAvailabilities } from "@/lib/availability-data";
import { orgAvailabilityView, withoutPastDates } from "@/lib/availability";
import { DateRangeChip } from "@/components/DateRangeChip";
import { followState } from "@/lib/campaign-follow-data";
import { CampaignCard } from "@/components/campaign/CampaignCard";
import { ChevronLeft, CircleCheck, Info } from "lucide-react";

/** A view-transition name and class as inline style (React knows the name; the class property isn't in its CSS types yet). */
const shareStyle = (name: string) => ({ viewTransitionName: name, viewTransitionClass: "job-share" }) as React.CSSProperties;

// An invitation's deadline, as a day (the job's own dates are a DateRangeChip).
const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const dayTime = (d: Date) => d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" }) + " MT";

/**
 * The record of edits to a live job (C4.3), newest first. The organization
 * sees who made each; a worker sees when and what parts changed (the words
 * their notice points them to), never the staff member's name.
 */
async function ChangeList({ jobId, viewer, changes: loaded }: { jobId: string; viewer: "org" | "worker"; changes?: Awaited<ReturnType<typeof loadJobChanges>> }) {
  const changes = loaded ?? (await loadJobChanges(jobId));
  if (!changes.length) return null;
  return (
    <Sheet label={viewer === "org" ? "Changes since publishing" : "What changed on this job"} trigger={`${viewer === "org" ? "Changes since publishing" : "What changed on this job"} (${changes.length})`} triggerClassName="btn-secondary w-full sm:w-auto" closeOnSubmit={false}>
      <ul className="divide-y divide-border">
        {changes.map((c) => (
          <li key={c.id} className="px-4 py-2.5 text-sm">
            <span className="text-fg">{dayTime(c.createdAt)}</span> · {viewer === "org" ? `${c.by ?? "a member"} changed` : "changed"} {andList(c.labels)}
            {c.material.length > 0 && (
              <span className="text-muted"> · material: {andList(c.material)}; {viewer === "org" ? "hired workers could" : "if you were hired before it, you could"} leave until {dayTime(new Date(c.createdAt.getTime() + RELEASE_HOURS * 3_600_000))}</span>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

const loadJob = (id: string) =>
  db().job.findUnique({ where: { id }, include: { org: true, jurisdiction: true, campaignProfile: { select: { id: true, handle: true, displayName: true, avatarKey: true, publishedAt: true, verifiedAt: true } } } });
type JobWithRefs = NonNullable<Awaited<ReturnType<typeof loadJob>>>;

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const session = await requireAuth();
  const job = await loadJob(jobId);
  if (!job) notFound();

  const isWorker = session.role === "WORKER" && !!session.workerId;
  const isOwnOrg = canUse(session, "jobs", "read") && session.orgId === job.orgId;
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
      {/* The record head (F03b): the title and pay are shared with the feed card that was tapped (P1.6), so they grow into place. */}
      <Masthead
        eyebrow={`${job.type === "PETITION" ? "Petition circulation" : "Door-to-door canvass"} · ${jurisdictionLabel(job.jurisdiction)}`}
        title={job.title}
        titleClassName="w-fit"
        titleStyle={shareStyle(`job-${job.id}`)}
        meta={job.org.name}
        figure={<span className="block w-fit" style={shareStyle(`pay-${job.id}`)}>{payText(job.compensationMethod, job.payRateCents)}</span>}
        chips={
          <>
            {isOwnOrg && <span className={jobPageBadge(status.badge)}>{status.label}</span>}
            {/* The dates carry a calendar so their lavender never reads as a party. */}
            <DateRangeChip startsAt={job.startsAt} endsAt={job.endsAt} />
            <span className="badge-neutral">{acceptedCount} of {job.headcount ?? "—"} spots filled</span>
          </>
        }
        back={
          <Link transitionTypes={["nav-back"]} href="/jobs" className="btn-ghost btn-sm -ms-3"><ChevronLeft aria-hidden className="size-4 shrink-0" />Jobs</Link>
        }
      />

      {job.description && <p className="lead">{job.description}</p>}

      {/* The campaign this job works for (S2): its page and a Follow control, while the campaign is public. */}
      {isWorker && job.campaignProfile?.publishedAt && job.org.approved && (
        <CampaignCard campaign={job.campaignProfile} follow={await followState(session.workerId!, job.campaignProfile.id)} viewer="worker" back={`/jobs/${job.id}`} />
      )}

      {isWorker && <WorkerPanel job={job} engagement={engagement} modes={modes} workerId={session.workerId!} acceptedCount={acceptedCount} />}
      {isOwnOrg && (
        <OrgPanel job={job} canHire={canUse(session, "hiring")} canEdit={canUse(session, "jobsEdit")} canSchedule={canUse(session, "scheduling")} userId={session.userId} />
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
  engagement: { id: string; jobId: string; status: EngagementStatus; createdAt: Date; applicationSnapshot: unknown; inviteNote: string | null; inviteExpiresAt: Date | null } | null;
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
    const facts = (await loadPipelineFacts([engagement.id])).get(engagement.id) ?? { events: [], inReview: false, offerExpiresAt: null };
    const offerDeadline = engagement.status === "OFFERED" ? facts.offerExpiresAt : null;
    const offerExpired = offerLapsed(engagement.status, offerDeadline, new Date());
    const closed = job.status === "CLOSED";
    const inviteExpired = inviteLapsed(engagement.status, engagement.inviteExpiresAt, new Date());
    const fields = { jobId: job.id, engagementId: engagement.id };
    // A material change since they were hired, while the release window is open (C4.3).
    const release = await openRelease(engagement);
    // Declining and withdrawing end this job for good: no second application or invitation (C3 decision).
    const final = "You can't apply to or be invited to this job again afterwards.";
    return (
      <section className="card space-y-3">
        <p className="flex items-center gap-2 font-medium text-fg">
          Your status <span className={s.badge}>{workerStage(engagement.status, facts.events, offerExpired, inviteExpired)}</span>
        </p>
        {engagement.status === "INVITED" && (
          <>
            {closed ? (
              <p className="text-muted-sm">This job has closed.</p>
            ) : inviteExpired ? (
              <p className="text-muted-sm">This invitation expired before you answered.</p>
            ) : (
              engagement.inviteExpiresAt && <p className="text-muted-sm">Answer by {day(engagement.inviteExpiresAt)}. The organization&apos;s note, if any, is in the history below.</p>
            )}
            <div className="flex flex-wrap items-start gap-2">
              {!closed && !inviteExpired && <ActionButton action={acceptInvitation} fields={fields} label="Accept invitation" />}
              <ActionButton action={declineAsWorker} fields={fields} label="Decline" pendingLabel="Declining…" variant="btn-ghost" confirm={{ text: `Decline this invitation? ${final}`, label: "Yes, decline" }} />
            </div>
            <WillSee sharing={(await loadSharing(workerId)).choices} approved={job.org.approved} invited kept={engagement.applicationSnapshot != null} />
          </>
        )}
        {engagement.status === "OFFERED" && (
          <div className="space-y-2">
            <p className="text-sm text-fg">
              {closed
                ? "This job closed before you answered the offer."
                : offerExpired || !offerDeadline
                  ? "This offer expired before you answered. The organization can send a new one."
                  : `The organization offered you a spot. Nothing starts until you accept (${timeLeft(offerDeadline)}). Any note it sent is in the history below.`}
            </p>
            <div className="flex flex-wrap items-start gap-2">
              {!offerExpired && offerDeadline && !closed && <ActionButton action={acceptInvitation} fields={fields} label="Accept offer" pendingLabel="Accepting…" />}
              <ActionButton action={declineAsWorker} fields={fields} label="Decline offer" pendingLabel="Declining…" variant="btn-ghost" confirm={{ text: `Decline this offer? ${final}`, label: "Yes, decline the offer" }} />
            </div>
          </div>
        )}
        {release && (
          <div className="alert-warning space-y-2">
            <p className="font-medium">This job&apos;s terms changed on {dayTime(release.createdAt)}: {andList(release.material)}.</p>
            <p className="text-sm">
              You were hired under the earlier terms, so you can leave until {dayTime(release.deadline)} with no effect on your reliability: your upcoming
              shifts would be cancelled as excused. Staying means the new terms apply. If a shift is under way, check out of it first.
            </p>
            <ActionButton
              action={leaveChangedJob}
              fields={fields}
              label="Leave this job (no penalty)"
              pendingLabel="Leaving…"
              variant="btn-secondary btn-sm"
              confirm={{ text: `Leave ${job.title}? Your upcoming shifts are cancelled as excused. ${final}`, label: "Yes, leave" }}
            />
          </div>
        )}
        {engagement.status === "APPLIED" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-sm">The organization will review your application.</p>
            <ActionButton action={withdrawApplication} fields={fields} label="Withdraw application" pendingLabel="Withdrawing…" variant="btn-ghost btn-sm" confirm={{ text: `Withdraw your application? ${final}`, label: "Yes, withdraw" }} />
          </div>
        )}
        {(engagement.status === "ACTIVE" || engagement.status === "CLAIMED") && <WorkerShifts engagementId={engagement.id} workerId={workerId} jobId={job.id} />}
        <ChangeList jobId={job.id} viewer="worker" />
        <EngagementHistory events={facts.events} />
      </section>
    );
  }

  if (reasons.length) return excluded;

  // Why it fits: the worker's own verified record against the job's rules.
  const [card, sharing] = await Promise.all([loadScorecard(workerId), loadSharing(workerId)]);
  const answers = jobCardAnswers({ ...job, orgName: job.org.name, jurisdictionRules: job.jurisdiction.rules });
  const reasons2 = fitReasons({
    canJoin: modes.includes("application") || modes.includes("instant_claim"),
    type: job.type,
    state: job.jurisdiction.state,
    verifiedShiftsOfType: card.segments.filter((x) => x.workType === job.type).reduce((n, x) => n + x.shiftsCount, 0),
    statesWorked: [...new Set(card.segments.flatMap((x) => x.statesWorked))],
    credentials: answers.credentials,
    // The same check as the feed's "No credentials" filter.
    noExtraCredentials: jobCredentials({ type: job.type, requirements: job.requirements, jurisdictionRules: job.jurisdiction.rules }).length === 0,
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
          <li key={r.title} className="flex items-start gap-3 py-3">
            {r.kind === "yes" ? (
              <CircleCheck aria-hidden className="size-5 shrink-0 text-fg" />
            ) : (
              <Info aria-hidden className="size-5 shrink-0 text-muted" />
            )}
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
      <WillSee sharing={sharing.choices} approved={job.org.approved} join={joinText(modes)} />
    </section>
    </>
  );
}

/** What a worker can do on an open job, in words; null when it hires by invitation only. */
const joinText = (modes: string[]) => {
  const apply = modes.includes("application");
  const claim = modes.includes("instant_claim");
  return apply && claim ? "apply or claim a spot" : apply ? "apply" : claim ? "claim a spot" : null;
};

/** "a, b and c" */
const listText = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/**
 * Before the worker applies, claims or accepts an invitation: what this
 * organization will see once they do (they become a related organization).
 * The same rules as orgProfileView: name, the parts shared with it (with
 * experience as part of hours and history), and the fit answers shared.
 * `kept`: the invitation holds a copy of what was shared when it was sent
 * (invitations from before hiring copies don't).
 */
function WillSee({
  sharing,
  approved,
  invited = false,
  kept = false,
  join = "apply or claim a spot",
}: {
  sharing: SharingChoices;
  approved: boolean;
  invited?: boolean;
  kept?: boolean;
  /** What the worker can do here ("apply", "claim a spot", both), or null for an invitation-only job. */
  join?: string | null;
}) {
  if (!approved) {
    // Its hiring pages still list your name (and any copy it already kept), so say exactly that.
    const now = invited
      ? "Turfcut hasn't approved this organization (or no longer does), so it sees only your name, none of your profile."
      : join
        ? `Turfcut hasn't approved this organization, so if you ${join} it sees only your name, none of your profile.`
        : "Turfcut hasn't approved this organization, so it sees none of your profile.";
    return (
      <p className="text-hint">
        {now} If Turfcut approves it, it sees what you share with organizations you {RELATIONSHIP_PHRASE}.
        {invited && kept ? " The copy it kept when it invited you stays on its record." : ""}{" "}
        <Link href="/profile/sharing" className="link">Who sees what</Link>
      </p>
    );
  }
  const parts = visibleParts(sharing, { kind: "org", approved: true, relationship: true });
  // Experience goes with hours and history, so it's named right there.
  const name = (p: SharePart) => (p === "history" ? "hours and history (with your experience)" : PART_DETAILS[p].label.toLowerCase());
  const seen = SHARE_PARTS.filter((p) => parts[p]).map(name);
  const hidden = SHARE_PARTS.filter((p) => !parts[p]).map(name);
  return (
    <div className="space-y-1.5 text-sm">
      <p className="font-medium text-fg">This organization will see</p>
      <p className="text-muted">
        Your name{seen.length ? `, your ${listText(seen)}` : ""}, and only the political-fit answers you chose to share.
        {hidden.length > 0 && ` Not your ${listText(hidden)}: it sees "not shared" there.`}{" "}
        {invited
          ? kept && "It also kept a copy of what you shared when it invited you; accepting doesn't change that copy."
          : join && `If you ${join}, it keeps a copy of what you share at that moment.`}
      </p>
      <p className="flex flex-wrap gap-x-4">
        <Link href="/profile/sharing" className="link">Change who sees what</Link>
        <Link href="/profile/preview" className="link">See what organizations see</Link>
        <Link href="/profile/preferences" className="link">Political-fit answers</Link>
      </p>
    </div>
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
        <span className={jobPageBadge(b.badge)}>{b.label}</span>
      </Link>
    </li>
  );
}

async function WorkerShifts({ engagementId, workerId, jobId }: { engagementId: string; workerId: string; jobId: string }) {
  const [shifts, offer] = await Promise.all([
    db().shift.findMany({ where: { engagementId }, include: SHIFT_LIST, orderBy: { startsAt: "asc" } }),
    seatsOnOffer(workerId, new Date(), jobId),
  ]);
  const open = offer.get(jobId) ?? 0;
  const seats = open > 0 && (
    <p className="text-sm">
      <Link transitionTypes={["nav-forward"]} href="/shifts#open-shifts" className="link">{open === 1 ? "1 open shift" : `${open} open shifts`} on this job</Link>
      <span className="text-muted"> · take a seat, first come, first served.</span>
    </p>
  );
  return shifts.length ? (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-fg">Your shifts</p>
      <ShiftList shifts={shifts} showWorker={false} />
      {seats}
    </div>
  ) : (
    <div className="space-y-2">
      <p className="text-muted-sm">You&apos;re hired. The organization will schedule your shifts or post open ones to take — they&apos;ll appear here and under Shifts.</p>
      {seats}
    </div>
  );
}

async function OrgPanel({ job, canHire, canEdit, canSchedule, userId }: { job: JobWithRefs; canHire: boolean; canEdit: boolean; canSchedule: boolean; userId: string }) {
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
  const facts = await loadPipelineFacts(engagements.map((e) => e.id));
  const now = new Date();
  const changes = canEdit && job.status !== "DRAFT" ? await loadJobChanges(job.id) : [];
  // A live job can freeze under it without anyone editing it (M10.3): a newer version of its place's rules, or a withdrawn approval.
  const live = job.status === "PUBLISHED" || job.status === "PAUSED";
  const current = live ? await db().jurisdictionProfile.findFirst({ where: { state: job.jurisdiction.state, locality: job.jurisdiction.locality, isCurrent: true }, select: { id: true, rules: true } }) : null;
  const frozen = live ? jobFreezeReasons(job, job.jurisdiction, current, now) : [];

  return (
    <>
      {job.status !== "DRAFT" && canEdit && (job.status !== "CLOSED" || changes.length > 0) && (
        <section className="section">
          <h2 className="section-title">Terms</h2>
          {job.status !== "CLOSED" && (
            <>
              <JobChangedNotice />
              <p className="text-muted-sm">
                Edits to a live job are recorded and everyone on it is told. After a change to the {materialText()}, hired workers may leave within{" "}
                {RELEASE_HOURS} hours with no penalty.
              </p>
              <Link transitionTypes={["nav-forward"]} href={`/jobs/${job.id}/edit`} className="btn-secondary">Edit job</Link>
            </>
          )}
          <ChangeList jobId={job.id} viewer="org" changes={changes} />
        </section>
      )}
      {frozen.length > 0 && (
        <section className="section">
          <h2 className="section-title">Frozen</h2>
          <div className="alert-warning space-y-2">
            <p className="font-medium">No new shifts or seats until this job fits the current rules</p>
            <ul className="list-disc space-y-0.5 pl-5">{frozen.map((f) => <li key={f}>{f}</li>)}</ul>
            {canEdit && <Link transitionTypes={["nav-forward"]} href={`/jobs/${job.id}/edit`} className="link">Edit the job to file it under the current rules</Link>}
          </div>
        </section>
      )}
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
          {canEdit && (
            <div className="flex flex-wrap items-start gap-3">
              <ActionButton action={publish} fields={{ jobId: job.id }} label="Publish" pendingLabel="Publishing…" disabled={blockers.length > 0} />
              {job.status === "DRAFT" && <Link transitionTypes={["nav-forward"]} href={`/jobs/${job.id}/edit`} className="btn-secondary">Edit draft</Link>}
            </div>
          )}
        </section>
      )}

      {canEdit && (job.status === "PUBLISHED" || job.status === "PAUSED") && (
        <section className="section">
          <h2 className="section-title">Close this job</h2>
          <p className="text-muted-sm">
            When you&apos;re done hiring. Nobody can apply or be invited afterwards. Open applications, offers and invitations end, and
            each worker is told the job closed. People already hired stay hired, and you can keep scheduling their shifts.
          </p>
          <ActionButton
            action={closeJobAction}
            fields={{ jobId: job.id }}
            label="Close job"
            pendingLabel="Closing…"
            variant="btn-secondary"
            confirm={{ text: "Close this job? Open applications, offers and invitations end now, and it can't be reopened.", label: "Yes, close it" }}
          />
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
                const f = facts.get(e.id) ?? { events: [], inReview: false, offerExpiresAt: null };
                return (
                  <li key={e.id} className="card space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="flex items-center gap-2 font-medium text-fg">
                        {/* The applicant page (C3.2) shows the live profile only while the worker has a relationship with you (C1). */}
                        <Link transitionTypes={["nav-forward"]} href={`/hiring/${job.id}/people/${e.id}`} className="link">{e.worker.displayName}</Link>
                        <span className={s.badge}>{stageOf(e, f, now)}</span>
                      </p>
                    </div>
                    <HiringActions
                      jobId={job.id}
                      jobStatus={job.status}
                      engagementId={e.id}
                      status={e.status}
                      inReview={f.inReview}
                      offerExpiresAt={f.offerExpiresAt}
                      inviteExpiresAt={e.inviteExpiresAt}
                    />
                    <EngagementHistory events={f.events} />
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

      {canSchedule && (job.status === "PUBLISHED" || job.status === "CLOSED") && <ShiftsSection job={job} userId={userId} />}
    </>
  );
}

async function ShiftsSection({ job, userId }: { job: JobWithRefs; userId: string }) {
  const [shifts, hired, supervisors, slots] = await Promise.all([
    db().shift.findMany({ where: { engagement: { jobId: job.id } }, include: SHIFT_LIST, orderBy: { startsAt: "asc" } }),
    db().engagement.findMany({
      where: { jobId: job.id, status: { in: ["ACTIVE", "CLAIMED"] }, worker: { closedAt: null } },
      select: { id: true, worker: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    listSupervisors(job.orgId),
    loadJobSlots(job.orgId, job.id),
  ]);
  const hiredList = hired.map((e) => ({ engagementId: e.id, name: e.worker.displayName }));
  // Each worker's availability, only where they share it with this organization (C2): a hint, never a gate.
  const shared = await loadSharedAvailabilities(hired.map((e) => e.worker.id), job.orgId);
  const today = new Date().toISOString().slice(0, 10);
  const schedulable = hired.map((e) => {
    const a = shared.get(e.worker.id) ?? "withheld";
    // The browser gets only what the outside-hours hint needs: the usual week and dates still to come (the note shows in the statement).
    const hint = a === "withheld" ? null : { ...withoutPastDates(a, today), note: null };
    return { engagementId: e.id, name: e.worker.displayName, availability: hint, view: a === "withheld" ? ("withheld" as const) : orgAvailabilityView(a, true, today) };
  });
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
        <ScheduleShiftForm jobId={job.id} workers={schedulable} supervisors={labels} launch={readLaunch(job.launch)} />
      ) : (
        <p className="text-hint">Accept a worker first — only hired workers can be scheduled.</p>
      )}
      <h3 className="pt-4 text-base font-bold text-fg">Open shifts</h3>
      <p className="text-muted-sm">Post a shift with a number of seats; people hired on this job take one, first come, first served. Each seat becomes a shift on their calendar.</p>
      <OpenShifts slots={slots} hired={hiredList} now={new Date()} />
      <details className="group">
        <summary className="btn-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden">Post an open shift</summary>
        <div className="mt-3">
          <ScheduleShiftForm jobId={job.id} workers={[]} supervisors={labels} launch={readLaunch(job.launch)} variant="slot" />
        </div>
      </details>
    </section>
  );
}
