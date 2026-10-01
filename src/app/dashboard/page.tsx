import { requireAuth } from "@/lib/auth";
import { SCHEDULING_ROLES } from "@/lib/access";
import { db } from "@/lib/db";
import { ACCEPTED_STATUSES } from "@/lib/engagements";
import { payShort, payText } from "@/lib/jobs";
import { Greeting } from "@/components/Greeting";
import { Avatar } from "@/components/chat/Avatar";
import { loadOps } from "@/lib/field-day-data";
import { LocalTime } from "@/components/LocalTime";
import Link from "next/link";

const ROLE_LABELS: Record<string, string> = {
  WORKER: "Field worker",
  OWNER: "Organization owner",
  RECRUITER: "Recruiter",
  COMPLIANCE: "Compliance",
  SUPERVISOR: "Supervisor",
  FINANCE: "Finance",
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
      <Link transitionTypes={["nav-forward"]} href={`/shifts/${shift.id}`} className="hero-card hero-card-lime block space-y-4">
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
    where: { workerId, status: { in: ACCEPTED_STATUSES }, job: { endsAt: { gte: new Date() } } },
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

async function OrgHero({ orgId }: { orgId: string }) {
  const ops = await loadOps(orgId);
  const attention = [
    ...ops.late.map((r) => ({ id: r.shift.id, title: `${r.shift.engagement.worker.displayName} hasn't checked in`, sub: r.shift.engagement.job.title, tag: "Late", badge: "badge-coral" })),
    ...ops.awaitingReview.map((r) => ({ id: r.shift.id, title: `Review ${r.shift.engagement.worker.displayName}'s shift`, sub: r.shift.engagement.job.title, tag: "Review", badge: "badge-butter" })),
  ];
  return (
    <>
      <div className="hero-card space-y-4">
        <p className="eyebrow">Active today</p>
        <p className="hero-title">{ops.scheduled === 1 ? "1 shift" : `${ops.scheduled} shifts`} in the field</p>
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span><span className="block text-lg font-bold tabular-nums">{ops.checkedIn} / {ops.scheduled}</span><span className="hero-muted">Checked in</span></span>
          <span><span className="block text-lg font-bold tabular-nums">{ops.signatures}</span><span className="hero-muted">Signatures submitted</span></span>
          {ops.doors > 0 && <span><span className="block text-lg font-bold tabular-nums">{ops.doors}</span><span className="hero-muted">Doors</span></span>}
        </p>
      </div>
      <section className="section">
        <h2 className="section-title flex items-center justify-between">
          Needs attention <span className="text-xs font-medium text-subtle">{attention.length} item{attention.length === 1 ? "" : "s"}</span>
        </h2>
        {attention.length === 0 ? (
          <p className="text-muted-sm">Nothing right now. Late check-ins and shifts waiting for review show up here.</p>
        ) : (
          <ul className="list-card">
            {attention.map((a) => (
              <li key={a.id + a.tag}>
                <Link transitionTypes={["nav-forward"]} href={`/shifts/${a.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface-2">
                  <span><span className="block text-sm font-semibold text-fg">{a.title}</span><span className="text-xs text-muted">{a.sub}</span></span>
                  <span className={a.badge}>{a.tag}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default async function DashboardPage() {
  const session = await requireAuth();

  const isWorker = session.role === "WORKER" && !!session.workerId;
  const canHire = session.role === "OWNER" || session.role === "RECRUITER";
  const [worker, org] = await Promise.all([
    isWorker ? db().worker.findUnique({ where: { id: session.workerId! }, select: { displayName: true } }) : null,
    session.orgId ? db().organization.findUnique({ where: { id: session.orgId }, select: { name: true } }) : null,
  ]);
  const name = worker?.displayName.split(" ")[0] ?? org?.name ?? "Welcome";

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1.5">
          <p className="eyebrow">{isWorker ? <Greeting /> : "Operations"}</p>
          <h1 className="page-title">{name}</h1>
          <p className="text-muted-sm">
            {[ROLE_LABELS[session.role] ?? session.role, session.email].filter(Boolean).join(" · ")}
          </p>
        </div>
        {isWorker && worker && (
          <Link href="/profile" transitionTypes={["nav-forward"]} aria-label="Your profile" className="rounded-full">
            <Avatar name={worker.displayName} tone="coral" />
          </Link>
        )}
      </header>

      {isWorker && <WorkerHero workerId={session.workerId!} />}
      {!isWorker && session.orgId && SCHEDULING_ROLES.includes(session.role) && <OrgHero orgId={session.orgId} />}

      {isWorker || session.orgId ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {isWorker && (
            <>
              <NavCard href="/shifts" title="My shifts" body="Every campaign in one calendar, from check-in to review." />
              <NavCard href="/shifts/turf" title="My turf" body="Turf assigned to you, or mark your own for the day — and drop pins." />
              <NavCard href="/jobs" title="Find work" body="Open jobs, with pay, credentials and who to call — up front." />
              <NavCard href="/profile" title="My profile" body="Your scorecard, experience and political-fit status." />
              <NavCard
                href="/profile/preferences"
                title="Political-fit preferences"
                body="Choose what, if anything, organizations may see."
              />
            </>
          )}
          {!isWorker && session.orgId && (
            <NavCard href="/jobs" title="Jobs" body={canHire ? "Build, publish and staff your jobs." : "Your organization's jobs."} />
          )}
          {canHire && (
            <NavCard href="/workers" title="People" body="Verified scorecards and experience, listed alphabetically." />
          )}
          {!isWorker && session.orgId && (
            <NavCard href="/org/settings" title="Organization settings" body="Publishing checks, legal contact and jurisdiction rules." />
          )}
        </div>
      ) : (
        <div className="empty-state">
          <p className="empty-state-title">Nothing here yet</p>
          <p className="empty-state-body">This login isn&apos;t linked to a worker profile or an organization yet.</p>
        </div>
      )}
    </main>
  );
}
