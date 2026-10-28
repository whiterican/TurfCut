import { StatusChip } from "@/components/StatusBadge";
import { getAuthUser, requireAuth } from "@/lib/auth";
import { pendingInvitesFor } from "@/lib/members-data";
import { ActionButton } from "@/components/ActionButton";
import { acceptOrgInvite } from "./actions";
import { db } from "@/lib/db";
import { shiftPriority } from "@/lib/priority";
import { ACCEPTED_STATUSES } from "@/lib/engagements";
import { openJobsEndAfter, payShort, payText } from "@/lib/jobs";
import { loadFeed } from "@/lib/jobs-data";
import { JobRow } from "@/components/JobRow";
import { LocalTime } from "@/components/LocalTime";
import { TodayDate } from "@/components/TodayDate";
import { ShiftDayList } from "@/components/ShiftDayList";
import Link from "next/link";
import { redirect } from "next/navigation";
import { workerPayTotals } from "@/lib/pay-data";
import { OfflineBrief } from "@/components/OfflineBrief";
import { briefPaths } from "@/lib/offline-brief-data";
import { approvedPhrase, money, payoutReadiness } from "@/lib/pay";
import { stripeProvider } from "@/lib/payout-provider";
import { cookies } from "next/headers";
import { loadSharing } from "@/lib/sharing-data";
import { noteDismissedBy, RELATIONSHIP_PHRASE, SHARING_NOTE_COOKIE } from "@/lib/sharing";
import { DismissibleNote } from "@/components/DismissibleNote";
import { loadCredentials } from "@/lib/credentials-data";
import { credentialName, expiryReminder, expiryState, expiryToday } from "@/lib/credentials";
import { dismissSharingNote } from "./actions";
import { campaignsOn, newFeedCount } from "@/lib/campaign-follow-data";
import { FEED_SEEN_COOKIE, feedBadge, feedSeenAt } from "@/lib/campaign-follow";
import { mediaUrl } from "@/lib/campaign-media";
import { VerifiedMark } from "@/components/campaign/VerifiedMark";
import { loadLatestPreference } from "@/lib/political-fit-data";
import type { VisibilityMode } from "@/lib/political-fit";
import { seatsOnOffer } from "@/lib/shift-slots-data";
import { landingFor } from "@/lib/nav";
import { roleName } from "@/lib/org-roles";
import type { Role } from "@/lib/auth";
import { Masthead } from "@/components/Masthead";
import { ListPage } from "@/components/layout/Page";
import { ChevronRight } from "lucide-react";
import { cache } from "react";
import { laterShifts, pickHero } from "@/lib/home-hero";

const ROLE_LABELS: Record<string, string> = {
  WORKER: "Field worker",
  OWNER: "Organization owner",
  RECRUITER: "Recruiter",
  COMPLIANCE: "Compliance",
  SUPERVISOR: "Supervisor",
  FINANCE: "Finance",
  PUBLISHER: "Publisher",
};

const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";

function NavCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="card group block transition hover:border-[var(--border-strong)]">
      <p className="flex items-center justify-between font-semibold text-fg">
        {title}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
      </p>
      <p className="text-muted-sm mt-1">{body}</p>
    </Link>
  );
}

/**
 * The worker's shifts as Home needs them, read once per request and shared by
 * the hero and "Coming up" (lib/home-hero decides which shows where): the
 * shift under way, the latest one still checked in after its end, and the
 * next four scheduled ones.
 */
const homeShifts = cache(async (workerId: string) => {
  const now = new Date();
  const mine = { engagement: { workerId } };
  const job = { engagement: { select: { job: { select: { title: true, type: true, compensationMethod: true, payRateCents: true, org: { select: { name: true } } } } } } };
  const [live, overdue, scheduled] = await Promise.all([
    db().shift.findFirst({
      where: { ...mine, status: { not: "CANCELLED" }, checkInAt: { not: null }, checkOutAt: null, endsAt: { gte: now } },
      select: { id: true, startsAt: true, endsAt: true, stagingLocation: true, status: true, checkInAt: true, checkOutAt: true, ...job },
      orderBy: [{ checkInAt: "desc" }, { id: "asc" }],
    }),
    // Still checked in after its end: the server has no check-out, so it is neither
    // live nor "next" (C2: the words say what the server has; a check-out queued on
    // the phone shows on the shift page).
    db().shift.findFirst({
      where: { ...mine, status: "ACTIVE", checkInAt: { not: null }, checkOutAt: null, endsAt: { lt: now } },
      select: { id: true, endsAt: true, engagement: { select: { job: { select: { title: true } } } } },
      orderBy: [{ endsAt: "desc" }, { id: "asc" }],
    }),
    db().shift.findMany({
      where: { ...mine, status: { not: "CANCELLED" }, endsAt: { gte: now }, checkOutAt: null, checkInAt: null },
      select: { id: true, startsAt: true, endsAt: true, stagingLocation: true, status: true, checkInAt: true, checkOutAt: true, ...job },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 4,
    }),
  ]);
  return { live, overdue, scheduled, hero: pickHero(live, overdue, scheduled[0] ?? null) };
});

/**
 * The next few real shifts after the one in the hero (Today, #78), up to
 * three. Not started yet, so each is "Scheduled"; cancelled shifts aren't
 * listed. Grouped by the viewer's day.
 */
async function LaterShifts({ workerId }: { workerId: string }) {
  const { scheduled, hero } = await homeShifts(workerId);
  const rest = laterShifts(scheduled, hero);
  if (rest.length === 0) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Coming up</h2>
        <Link transitionTypes={["nav-forward"]} href="/shifts" className="row-link">
          All shifts
          <ChevronRight aria-hidden className="size-4 shrink-0" />
        </Link>
      </div>
      <ShiftDayList
        shifts={rest.map((s) => ({
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          title: s.engagement.job.title,
          org: s.engagement.job.org.name,
          staging: s.stagingLocation,
          status: { label: "Scheduled", state: "pending" },
        }))}
      />
    </section>
  );
}

/** A shift still checked in after its end: the words and the way to fix it. */
function OverdueShift({ shift, compact }: { shift: { id: string; endsAt: Date; engagement: { job: { title: string } } }; compact?: boolean }) {
  const how = "Open the shift to check out, or ask your organizer to correct the end time. Pay counts verified time only.";
  if (compact) {
    return (
      <Link transitionTypes={["nav-forward"]} href={`/shifts/${shift.id}`} className="card block space-y-2 transition hover:border-[var(--border-strong)]">
        <StatusChip state="overdue" label="No check-out received" />
        <p className="font-semibold text-fg">{shift.engagement.job.title}</p>
        <p className="text-muted-sm">
          Was due to end <LocalTime iso={shift.endsAt.toISOString()} />. {how}
        </p>
      </Link>
    );
  }
  return (
    <Link transitionTypes={["nav-forward"]} href={`/shifts/${shift.id}`} className="hero-card block space-y-4">
      <StatusChip state="overdue" label="No check-out received" />
      <p className="hero-title">{shift.engagement.job.title}</p>
      <p className="hero-muted text-sm">
        Was due to end <LocalTime iso={shift.endsAt.toISOString()} />. {how}
      </p>
    </Link>
  );
}

async function WorkerHero({ workerId }: { workerId: string }) {
  const now = new Date();
  const { live, overdue, scheduled, hero } = await homeShifts(workerId);
  if (hero.kind === "overdue" && overdue) return <OverdueShift shift={overdue} />;
  const shift = hero.kind === "live" ? live : hero.kind === "next" ? scheduled[0] : null;
  if (shift) {
    const isLive = hero.kind === "live";
    return (
      <>
        {isLive && overdue && <OverdueShift shift={overdue} compact />}
        <Link transitionTypes={["nav-forward"]} href={`/shifts/${shift.id}`} className={`hero-card block space-y-4 ${isLive ? "hero-card-accent" : ""}`} data-priority={shiftPriority(shift)}>
          <p className="eyebrow">
            {isLive ? "Live shift" : "Next shift"} · <LocalTime iso={shift.startsAt.toISOString()} mode="date" />
          </p>
          <p className="hero-title">{shift.engagement.job.title}</p>
          {/* The card stays eggplant; the forest-ink chip is what says it's live. */}
          {isLive && <StatusChip state="live" label="On shift" />}
          <p className="flex flex-wrap gap-x-8 gap-y-2">
            <span>
              <span className="block text-lg font-bold"><LocalTime iso={shift.startsAt.toISOString()} mode="time" /></span>
              <span className="hero-muted text-sm">{isLive ? "Started" : "Check-in"}</span>
            </span>
            <span>
              <span className="block text-lg font-bold">{payShort(shift.engagement.job.compensationMethod, shift.engagement.job.payRateCents, shift.engagement.job.type)}</span>
              <span className="hero-muted text-sm">gross</span>
            </span>
          </p>
          {shift.stagingLocation && <p className="hero-muted text-sm">Staging · {shift.stagingLocation}</p>}
        </Link>
      </>
    );
  }
  const next = await db().engagement.findFirst({
    where: { workerId, status: { in: ACCEPTED_STATUSES }, job: { endsAt: { gt: openJobsEndAfter(now) } } },
    include: { job: { select: { id: true, title: true, startsAt: true, compensationMethod: true, payRateCents: true } } },
    orderBy: { job: { startsAt: "asc" } },
  });
  if (!next) {
    return (
      <Link transitionTypes={["nav-forward"]} href="/jobs" className="hero-card hero-card-quiet block space-y-3">
        <p className="eyebrow">Nothing scheduled</p>
        <p className="hero-title">Find your next field job</p>
        <p className="hero-muted text-sm">Open jobs show the gross rate, credentials and who to call before you apply.</p>
      </Link>
    );
  }
  return (
    <Link transitionTypes={["nav-forward"]} href={`/jobs/${next.job.id}`} className="hero-card block space-y-4">
      <p className="eyebrow">{next.job.startsAt && next.job.startsAt <= now ? `Your job · started ${day(next.job.startsAt)}` : `Your next job · starts ${day(next.job.startsAt)}`}</p>
      <p className="hero-title">{next.job.title}</p>
      <p className="text-sm font-semibold">{payText(next.job.compensationMethod, next.job.payRateCents)}</p>
    </Link>
  );
}

/** Open shifts on jobs the worker is hired on (M8.2): a pointer to Shifts, not a list. */
async function OpenSeats({ workerId }: { workerId: string }) {
  const n = [...(await seatsOnOffer(workerId)).values()].reduce((a, b) => a + b, 0);
  if (!n) return null;
  return (
    <Link transitionTypes={["nav-forward"]} href="/shifts#open-shifts" className="card flex items-center justify-between gap-3 transition hover:border-[var(--border-strong)]">
      <span className="min-w-0">
        <span className="block font-bold text-fg">{n === 1 ? "1 open shift" : `${n} open shifts`} on your jobs</span>
        <span className="text-muted-sm block">First come, first served. Take a seat under Jobs › My schedule.</span>
      </span>
      <span className="tag-accent">Open</span>
    </Link>
  );
}

/**
 * Note: workers choose who sees what. Gone once the worker saves a choice
 * under today's wording, or dismisses it for themselves on this device; a
 * new wording brings it back (SHARING_TEXT_VERSION).
 */
async function SharingNote({ workerId }: { workerId: string }) {
  if (noteDismissedBy((await cookies()).get(SHARING_NOTE_COOKIE)?.value, workerId)) return null;
  const sharing = await loadSharing(workerId);
  if (sharing.current) return null;
  const never = sharing.version === null;
  return (
    <DismissibleNote action={dismissSharingNote} title={never ? "You choose who sees what" : "Check who sees what"}>
      <p className="text-muted-sm">
        {never
          ? `Choose who sees each part of your scorecard, your availability and your credentials, and whether organizations can find you. Until you do, organizations you ${RELATIONSHIP_PHRASE} see your profile, and nobody can find you.`
          : "We've changed how Turfcut explains who sees what since you chose. Your choices stay as they are; take a look and confirm them. If you let organizations find you, they can't until you confirm."}
      </p>
      <Link transitionTypes={["nav-forward"]} href="/profile/setup" className="btn-secondary btn-sm">{never ? "Set it up (4 short steps)" : "Check your choices"}</Link>
    </DismissibleNote>
  );
}

/**
 * Credentials that expire within 30 days, or have expired (C2.5). From 30
 * days out it's a reminder; within 7 days, or once expired, it says so plainly.
 */
async function CredentialReminder({ workerId }: { workerId: string }) {
  const today = expiryToday();
  const due = (await loadCredentials(workerId))
    .map((c) => ({ c, when: expiryReminder(c.expiresOn, today), state: expiryState(c.expiresOn, today) }))
    .filter((x) => x.when !== null);
  if (!due.length) return null;
  return (
    <section className={`card space-y-2 ${due.some((x) => x.when !== "30") ? "border-[var(--danger)]" : ""}`} aria-label="Credentials to renew">
      <p className="font-semibold text-fg">
        {due.some((x) => x.when === "expired") ? "Expired: renew before you work" : due.some((x) => x.when === "7") ? "Renew this week" : due.length === 1 ? "A credential needs renewing soon" : "Credentials need renewing soon"}
      </p>
      <ul className="space-y-1 text-sm">
        {due.map(({ c, state }) => (
          <li key={c.id} className="text-fg">
            {credentialName(c)}:{" "}
            {state.kind === "expired"
              ? `expired ${state.days === 1 ? "yesterday" : `${state.days} days ago`}`
              : state.kind === "soon"
                ? state.days === 0 ? "expires today" : `expires in ${state.days} ${state.days === 1 ? "day" : "days"}`
                : ""}
            {/* The date itself too: "today" is counted in the furthest-west US time (expiryToday). */}
            {c.expiresOn && ` (${c.expiresOn.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })})`}
          </li>
        ))}
      </ul>
      <Link transitionTypes={["nav-forward"]} href="/profile/credentials" className="link text-sm">Update credentials</Link>
    </section>
  );
}

/** The campaigns the worker is on (S2): a strip of their pages, and the way to the feed. Nothing here ranks anything. (The "new" count keys on a cookie on this device, so it's per device, not per account.) */
async function CampaignsOn({ workerId }: { workerId: string }) {
  const seen = feedSeenAt((await cookies()).get(FEED_SEEN_COOKIE)?.value, new Date());
  const [campaigns, fresh] = await Promise.all([campaignsOn(workerId), newFeedCount(workerId, seen)]);
  if (campaigns.length === 0 && fresh === 0) return null;
  return (
    <section className="section" aria-labelledby="campaigns-on">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="campaigns-on" className="section-title">{campaigns.length ? "Campaigns you're on" : "Your campaigns"}</h2>
        <Link href="/feed" className="text-sm font-medium text-muted hover:text-fg">{feedBadge(fresh)}</Link>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {campaigns.map((c) => {
          const avatar = mediaUrl(c.avatarKey);
          return (
            <li key={c.id} className="shrink-0">
              <Link href={`/c/${c.handle}`} className="card flex items-center gap-2 px-3 py-2 text-sm font-medium text-fg">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a public storage URL; no optimizer route for it
                  <img src={avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="h-6 w-6 rounded-full bg-surface-2" />
                )}
                {c.displayName}
                {c.verifiedAt && <VerifiedMark compact />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Saves today's and the next two days' shift pages on the phone (offline brief). */
async function WorkerBrief({ workerId, userId }: { workerId: string; userId: string }) {
  return <OfflineBrief userId={userId} paths={await briefPaths(workerId)} />;
}

/** The worker's pay at a glance (their own totals only). */
async function EarningsCard({ workerId }: { workerId: string }) {
  const [t, me] = await Promise.all([workerPayTotals(workerId), db().worker.findUnique({ where: { id: workerId }, select: { payoutsEnabled: true } })]);
  // Approved money is "on the way" only once this worker can receive it (P0, same words as Earnings).
  const parts = [
    `${money(t.paid)} paid`,
    t.onTheWay ? `${money(t.onTheWay)} ${approvedPhrase(payoutReadiness(stripeProvider().configured(), me?.payoutsEnabled))}` : null,
    t.awaiting ? `${money(t.awaiting)} awaiting approval` : null,
    t.stopped ? `${money(t.stopped)} on hold or disputed` : null,
  ].filter(Boolean);
  const any = t.paid || t.onTheWay || t.awaiting || t.stopped;
  return <NavCard href="/earnings" title="Earnings" body={any ? parts.join(" · ") : "Your pay shows up here once a supervisor approves a shift."} />;
}

/** What's on hold until the worker reconfirms, by their own choice (Private never shows or uses anything). */
const PAUSED: Record<VisibilityMode, string> = {
  PRIVATE: "Your answers stay private either way; reconfirm to keep them on record.",
  MATCHING_ONLY: "Until you reconfirm, they aren't used to keep you out of work you've ruled out.",
  APPLIED_TO: "Until you reconfirm, they aren't shown to organizations or used to keep you out of work you've ruled out.",
  APPROVED_RECRUITERS: "Until you reconfirm, they aren't used to keep you out of work you've ruled out.",
};

/**
 * Political-fit answers that need reconfirming (the wording changed) or have
 * expired authorize nothing: they're neither shown nor used to keep the worker
 * out of work they ruled out. Profile says so; Today asks.
 */
async function FitReconfirm({ workerId }: { workerId: string }) {
  const fit = await loadLatestPreference(workerId);
  if (!fit || fit.status.state === "current") return null;
  return (
    <section className="card space-y-2" aria-label="Political-fit answers">
      <p className="font-semibold text-fg">
        {fit.status.state === "expired" ? "Your political-fit answers have expired" : "Check your political-fit answers"}
      </p>
      <p className="text-muted-sm">
        {fit.status.state === "expired"
          ? "They reached the expiry you chose."
          : fit.visibilityMode === "APPLIED_TO"
            ? "We've changed how we describe who sees them: claiming a spot counts, as applying does."
            : "We've updated how Turfcut describes these choices."}{" "}
        {PAUSED[fit.visibilityMode]}
      </p>
      <Link href="/profile/preferences" className="btn-secondary btn-sm">Review and reconfirm</Link>
    </section>
  );
}

/** Open jobs, soonest first (screen mockups' "Best matches", without a ranking). */
async function OpenJobs({ workerId }: { workerId: string }) {
  const [{ jobs }, mine] = await Promise.all([
    loadFeed(workerId),
    db().engagement.findMany({ where: { workerId }, select: { jobId: true } }),
  ]);
  const engaged = new Set(mine.map((e) => e.jobId));
  const open = jobs.filter((j) => !engaged.has(j.id)).slice(0, 3);
  return (
    <section className="section">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">Open jobs</h2>
        <Link href="/jobs" className="text-sm font-medium text-muted hover:text-fg">View all</Link>
      </div>
      {open.length === 0 ? (
        <p className="text-muted-sm">No open jobs right now. New ones show up here first.</p>
      ) : (
        <ul className="list-card">
          {open.map((j) => (
            <li key={j.id}>
              <JobRow j={j} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A removed member: what happened, and any invite they can choose to accept. */
async function Detached() {
  const user = await getAuthUser();
  const invites = user ? await pendingInvitesFor(user) : [];
  return (
    <div className="space-y-4">
      <div className="empty-state">
        <p className="empty-state-title">You&apos;re no longer part of an organization</p>
        <p className="empty-state-body">
          An owner removed this login from their organization. Everything you did there stays on record.
          {invites.length === 0 && " If an owner invites you, the invite appears here."}
        </p>
      </div>
      {invites.length > 0 && (
        <ul className="list-card">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="font-medium text-fg">{i.org.name} invited you as {roleName({ role: i.role as Role, roleName: i.orgRole?.name }, ROLE_LABELS)}</p>
                <p className="text-muted-sm">Open until {i.expiresAt.toISOString().slice(0, 10)}. Nothing changes unless you accept.</p>
              </div>
              <ActionButton action={acceptOrgInvite} fields={{ inviteId: i.id }} label="Accept" pendingLabel="Joining…" variant="btn-secondary" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await requireAuth();
  // Organization roles live on the Desk (C1.3); workers and removed members stay here.
  if (session.role !== "WORKER" && session.orgId) {
    // A member whose role has no Desk (a role saved before every role got one) lands on the first page their role reaches, never back here.
    redirect(landingFor(session.role, session.grants, session.staff));
  }

  const isWorker = session.role === "WORKER" && !!session.workerId;

  // Home is a ListPage (redesign §5): the day's work in the main column, and beside it from 1024
  // (below it on a phone) the pay summary, the worker's own choices and their campaigns.
  const head = isWorker ? (
    // Today is the day, not a greeting: the date under the title, no name or email (D1b).
    <Masthead title="Today" meta={<TodayDate />} />
  ) : (
    <Masthead title="Your account" meta={[roleName(session, ROLE_LABELS), session.email].filter(Boolean).join(" · ")} />
  );
  if (!isWorker) {
    return (
      <ListPage head={head}>
        {session.role !== "WORKER" ? (
          <Detached />
        ) : (
          <div className="empty-state">
            <p className="empty-state-title">Nothing here yet</p>
            <p className="empty-state-body">This login isn&apos;t linked to a worker profile or an organization yet.</p>
          </div>
        )}
      </ListPage>
    );
  }
  const workerId = session.workerId!;
  return (
    <ListPage
      head={head}
      aside={
        <>
          <EarningsCard workerId={workerId} />
          <FitReconfirm workerId={workerId} />
          <SharingNote workerId={workerId} />
          <CampaignsOn workerId={workerId} />
        </>
      }
    >
      <WorkerBrief workerId={workerId} userId={session.userId} />
      <WorkerHero workerId={workerId} />
      <CredentialReminder workerId={workerId} />
      <LaterShifts workerId={workerId} />
      <OpenSeats workerId={workerId} />
      <OpenJobs workerId={workerId} />
    </ListPage>
  );
}
