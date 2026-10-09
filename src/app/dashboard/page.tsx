import { getAuthUser, requireAuth } from "@/lib/auth";
import { pendingInvitesFor } from "@/lib/members-data";
import { ActionButton } from "@/components/ActionButton";
import { acceptOrgInvite } from "./actions";
import { db } from "@/lib/db";
import { shiftPriority } from "@/lib/priority";
import { ACCEPTED_STATUSES } from "@/lib/engagements";
import { openJobsEndAfter, payShort, payText } from "@/lib/jobs";
import { loadFeed } from "@/lib/jobs-data";
import { JobFeedCard } from "@/components/JobFeedCard";
import { LocalTime } from "@/components/LocalTime";
import Link from "next/link";
import { redirect } from "next/navigation";
import { workerPayTotals } from "@/lib/pay-data";
import { OfflineBrief } from "@/components/OfflineBrief";
import { briefPaths } from "@/lib/offline-brief-data";
import { money } from "@/lib/pay";
import { cookies } from "next/headers";
import { loadSharing } from "@/lib/sharing-data";
import { noteDismissedBy, RELATIONSHIP_PHRASE, SHARING_NOTE_COOKIE } from "@/lib/sharing";
import { DismissibleNote } from "@/components/DismissibleNote";
import { loadCredentials } from "@/lib/credentials-data";
import { credentialName, expiryReminder, expiryState, expiryToday } from "@/lib/credentials";
import { dismissSharingNote } from "./actions";

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
        <span aria-hidden className="text-subtle transition group-hover:translate-x-0.5">→</span>
      </p>
      <p className="text-muted-sm mt-1">{body}</p>
    </Link>
  );
}

async function WorkerHero({ workerId }: { workerId: string }) {
  const shift = await db().shift.findFirst({
    where: { engagement: { workerId }, status: { not: "CANCELLED" }, endsAt: { gte: new Date() }, checkOutAt: null },
    include: { engagement: { select: { job: { select: { title: true, type: true, compensationMethod: true, payRateCents: true } } } } },
    orderBy: { startsAt: "asc" },
  });
  if (shift) {
    const live = shift.checkInAt !== null;
    return (
      <Link transitionTypes={["nav-forward"]} href={`/shifts/${shift.id}`} className="hero-card hero-card-accent block space-y-4" data-priority={shiftPriority(shift)}>
        <p className="eyebrow">
          {live ? "Live shift" : "Next shift"} · <LocalTime iso={shift.startsAt.toISOString()} mode="date" />
        </p>
        <p className="hero-title">{shift.engagement.job.title}</p>
        <p className="flex flex-wrap gap-x-8 gap-y-2">
          <span>
            <span className="block text-lg font-bold"><LocalTime iso={shift.startsAt.toISOString()} mode="time" /></span>
            <span className="hero-muted text-sm">{live ? "Started" : "Check-in"}</span>
          </span>
          <span>
            <span className="block text-lg font-bold">{payShort(shift.engagement.job.compensationMethod, shift.engagement.job.payRateCents, shift.engagement.job.type)}</span>
            <span className="hero-muted text-sm">gross</span>
          </span>
        </p>
        {shift.stagingLocation && <p className="hero-muted text-sm">Staging · {shift.stagingLocation}</p>}
      </Link>
    );
  }
  const next = await db().engagement.findFirst({
    where: { workerId, status: { in: ACCEPTED_STATUSES }, job: { endsAt: { gt: openJobsEndAfter(new Date()) } } },
    include: { job: { select: { id: true, title: true, startsAt: true, compensationMethod: true, payRateCents: true } } },
    orderBy: { job: { startsAt: "asc" } },
  });
  if (!next) {
    return (
      <Link href="/jobs" className="hero-card block space-y-3">
        <p className="eyebrow">Nothing scheduled</p>
        <p className="hero-title">Find your next field job</p>
        <p className="hero-muted text-sm">Open jobs show the gross rate, credentials and who to call before you apply.</p>
      </Link>
    );
  }
  return (
    <Link transitionTypes={["nav-forward"]} href={`/jobs/${next.job.id}`} className="hero-card block space-y-4">
      <p className="eyebrow">Your next job · starts {day(next.job.startsAt)}</p>
      <p className="hero-title">{next.job.title}</p>
      <p className="text-sm font-semibold">{payText(next.job.compensationMethod, next.job.payRateCents)}</p>
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
      <Link transitionTypes={["nav-forward"]} href="/profile/setup" className="btn-primary btn-sm">{never ? "Set it up (4 short steps)" : "Check your choices"}</Link>
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

/** Saves today's and the next two days' shift pages on the phone (offline brief). */
async function WorkerBrief({ workerId, userId }: { workerId: string; userId: string }) {
  return <OfflineBrief userId={userId} paths={await briefPaths(workerId)} />;
}

/** The worker's pay at a glance (their own totals only). */
async function EarningsCard({ workerId }: { workerId: string }) {
  const t = await workerPayTotals(workerId);
  const parts = [
    `${money(t.paid)} paid`,
    t.onTheWay ? `${money(t.onTheWay)} on the way` : null,
    t.awaiting ? `${money(t.awaiting)} awaiting approval` : null,
    t.stopped ? `${money(t.stopped)} on hold or disputed` : null,
  ].filter(Boolean);
  const any = t.paid || t.onTheWay || t.awaiting || t.stopped;
  return <NavCard href="/earnings" title="Earnings" body={any ? parts.join(" · ") : "Your pay shows up here once a supervisor approves a shift."} />;
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
        <ul className="space-y-3">
          {open.map((j) => (
            <li key={j.id}>
              <JobFeedCard j={j} />
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
                <p className="font-medium text-fg">{i.org.name} invited you as {ROLE_LABELS[i.role] ?? i.role}</p>
                <p className="text-muted-sm">Open until {i.expiresAt.toISOString().slice(0, 10)}. Nothing changes unless you accept.</p>
              </div>
              <ActionButton action={acceptOrgInvite} fields={{ inviteId: i.id }} label="Accept" pendingLabel="Joining…" />
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
  if (session.role !== "WORKER" && session.orgId) redirect("/desk");

  const isWorker = session.role === "WORKER" && !!session.workerId;
  const [worker] = await Promise.all([
    isWorker ? db().worker.findUnique({ where: { id: session.workerId! }, select: { displayName: true } }) : null,
  ]);
  const name = worker?.displayName.split(" ")[0] ?? "Welcome";

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1.5">
          <p className="eyebrow">{isWorker ? "Today" : "Account"}</p>
          <h1 className="page-title">{name}</h1>
          <p className="text-muted-sm">
            {[ROLE_LABELS[session.role] ?? session.role, session.email].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      {isWorker && <WorkerBrief workerId={session.workerId!} userId={session.userId} />}
      {isWorker && <WorkerHero workerId={session.workerId!} />}
      {isWorker && <CredentialReminder workerId={session.workerId!} />}
      {isWorker && <SharingNote workerId={session.workerId!} />}

      {isWorker && <EarningsCard workerId={session.workerId!} />}
      {isWorker && <OpenJobs workerId={session.workerId!} />}

      {isWorker ? null : session.role !== "WORKER" ? (
        <Detached />
      ) : (
        <div className="empty-state">
          <p className="empty-state-title">Nothing here yet</p>
          <p className="empty-state-body">This login isn&apos;t linked to a worker profile or an organization yet.</p>
        </div>
      )}
    </main>
  );
}
