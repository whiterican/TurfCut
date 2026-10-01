import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { ACCEPTED_STATUSES } from "@/lib/engagements";
import { payText } from "@/lib/jobs";
import { redirect } from "next/navigation";
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
    <Link href={`/jobs/${next.job.id}`} className="hero-card block space-y-4">
      <p className="eyebrow">Your next job · starts {day(next.job.startsAt)}</p>
      <p className="hero-title">{next.job.title}</p>
      <p className="text-sm font-semibold">{payText(next.job.compensationMethod, next.job.payRateCents)}</p>
    </Link>
  );
}

async function OrgHero({ orgId }: { orgId: string }) {
  const jobs = await db().job.findMany({
    where: { orgId, status: "PUBLISHED" },
    select: { headcount: true, _count: { select: { engagements: { where: { status: { in: ACCEPTED_STATUSES } } } } } },
  });
  const spots = jobs.reduce((n, j) => n + (j.headcount ?? 0), 0);
  const filled = jobs.reduce((n, j) => n + j._count.engagements, 0);
  return (
    <Link href="/jobs" className="hero-card block space-y-4">
      <p className="eyebrow">Live now</p>
      <p className="hero-title">{jobs.length === 1 ? "1 published job" : `${jobs.length} published jobs`}</p>
      <div className="flex gap-6 text-sm">
        <p><span className="block text-lg font-bold tabular-nums">{filled} / {spots}</span><span className="hero-muted">Spots filled</span></p>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const session = await requireAuth();

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

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
          <p className="eyebrow">{isWorker ? "Today" : "Operations"}</p>
          <h1 className="page-title">{name}</h1>
          <p className="text-muted-sm">
            {ROLE_LABELS[session.role] ?? session.role} · <span className="text-fg">{session.email}</span>
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="btn-secondary btn-sm">
            Sign out
          </button>
        </form>
      </header>

      {isWorker && <WorkerHero workerId={session.workerId!} />}
      {!isWorker && session.orgId && <OrgHero orgId={session.orgId} />}

      {isWorker || session.orgId ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {isWorker && (
            <>
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
