import Link from "next/link";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { HIRING_ROLES, ORG_ROLES } from "@/lib/access";
import { ENGAGEMENT_LABELS, JOB_STATUS_LABELS } from "@/lib/engagement-labels";
import { JOB_TYPES, parseFeedFilters, payText } from "@/lib/jobs";
import { plural } from "@/lib/format";
import { loadFeed } from "@/lib/jobs-data";

const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function JobsPage({ searchParams }: { searchParams: Search }) {
  const session = await requireAuth();
  if (session.role === "WORKER" && session.workerId) return <WorkerFeed workerId={session.workerId} searchParams={searchParams} />;
  if (ORG_ROLES.includes(session.role) && session.orgId) return <OrgJobs orgId={session.orgId} canHire={HIRING_ROLES.includes(session.role)} />;
  return (
    <main className="page max-w-2xl">
      <div className="empty-state">
        <p className="empty-state-title">No jobs for this account</p>
        <p className="empty-state-body">This login isn&apos;t linked to a worker profile or an organization.</p>
      </div>
    </main>
  );
}

async function WorkerFeed({ workerId, searchParams }: { workerId: string; searchParams: Search }) {
  const raw = await searchParams;
  const params = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const filters = parseFeedFilters(params);
  const [{ jobs, hidden }, mine] = await Promise.all([
    loadFeed(workerId, filters),
    db().engagement.findMany({
      where: { workerId },
      include: { job: { select: { id: true, title: true, startsAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const engagedIds = new Set(mine.map((e) => e.jobId));
  const open = jobs.filter((j) => !engagedIds.has(j.id));

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Work</p>
          <h1 className="page-title">Find your next field job.</h1>
          <p className="text-muted-sm">Open jobs, soonest first. Ranked matches are coming soon.</p>
        </div>
      </header>

      {mine.length > 0 && (
        <section className="section">
          <h2 className="section-title">Your jobs</h2>
          <ul className="list-card">
            {mine.map((e) => {
              const s = ENGAGEMENT_LABELS[e.status];
              return (
                <li key={e.id}>
                  <Link transitionTypes={["nav-forward"]} href={`/jobs/${e.job.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-fg transition hover:bg-surface-2">
                    <span className="font-medium">{e.job.title}</span>
                    <span className={s.badge}>{s.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Open jobs</h2>
        <form className="card grid gap-3 sm:grid-cols-4 sm:items-end">
          <label className="space-y-1.5">
            <span className="label">Type</span>
            <select name="type" className="field" defaultValue={filters.type ?? ""}>
              <option value="">Any</option>
              {JOB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="label">Minimum rate ($)</span>
            <input name="minRate" inputMode="decimal" className="field" defaultValue={filters.minRateCents ? (filters.minRateCents / 100).toString() : ""} />
          </label>
          <label className="space-y-1.5">
            <span className="label">Starts by</span>
            <input type="date" name="startsBefore" className="field" defaultValue={filters.startsBefore?.toISOString().slice(0, 10) ?? ""} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="toggle">
              <input type="checkbox" role="switch" name="noCredentials" value="1" defaultChecked={filters.noCredentials} />
              No credentials required
            </label>
            <button className="btn-secondary">Filter</button>
          </div>
        </form>

        {open.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No open jobs match</p>
            <p className="empty-state-body">Try fewer filters, or check back soon.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {open.map((j) => {
              const geo = (j.geography ?? {}) as { city?: string; state?: string };
              return (
                <li key={j.id}>
                  <Link transitionTypes={["nav-forward"]} href={`/jobs/${j.id}`} className="card group flex flex-col gap-3 transition hover:border-[var(--border-strong)] sm:flex-row sm:items-start sm:justify-between">
                    <span className="min-w-0 space-y-2">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-muted">
                        {j.org.name}
                        {geo.city && <><span aria-hidden>·</span>{geo.city}, {geo.state}</>}
                        <span className="badge-mint">Approved org</span>
                      </span>
                      <span className="block text-base font-bold tracking-[-0.01em] text-fg">{j.title}</span>
                      <span className="flex flex-wrap gap-1.5">
                        <span className="badge-neutral">{day(j.startsAt)} – {day(j.endsAt)}</span>
                        <span className="badge-neutral">{j.type === "PETITION" ? "Petition" : "Canvass"}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                      <span className="text-sm font-bold text-fg tabular-nums">{payText(j.compensationMethod, j.payRateCents)}</span>
                      <span className="btn-primary btn-sm">View job</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {hidden.length > 0 && (
        <section className="section">
          <h2 className="section-title">Hidden by your preferences</h2>
          <p className="text-muted-sm">
            Only your own &ldquo;do not match me&rdquo; answers hide jobs.{" "}
            <Link href="/profile/preferences" className="link">Change them</Link>
          </p>
          <ul className="list-card">
            {hidden.map((h) => (
              <li key={h.id} className="space-y-0.5 px-4 py-3 text-sm">
                <p className="font-medium text-fg">{h.title}</p>
                {h.reasons.map((r) => <p key={r} className="text-muted">{r}</p>)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

async function OrgJobs({ orgId, canHire }: { orgId: string; canHire: boolean }) {
  const jobs = await db().job.findMany({
    where: { orgId },
    include: { _count: { select: { engagements: true } } },
    orderBy: [{ createdAt: "desc" }],
  });
  return (
    <main className="page max-w-3xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Jobs</p>
          <h1 className="page-title">Your jobs</h1>
          <p className="text-muted-sm">Your organization&apos;s jobs, newest first.</p>
        </div>
        {canHire && <Link href="/jobs/new" className="btn-primary">New job</Link>}
      </header>
      {jobs.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No jobs yet</p>
          <p className="empty-state-body">{canHire ? "Create a draft, then publish once every check passes." : "Owners and recruiters create jobs."}</p>
        </div>
      ) : (
        <ul className="list-card">
          {jobs.map((j) => {
            const s = JOB_STATUS_LABELS[j.status];
            return (
              <li key={j.id}>
                <Link transitionTypes={["nav-forward"]} href={`/jobs/${j.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-fg transition hover:bg-surface-2">
                  <span className="space-y-0.5">
                    <span className="block font-medium">{j.title}</span>
                    <span className="text-muted-sm block">Starts {day(j.startsAt)} · {plural(j._count.engagements, "worker")} engaged</span>
                  </span>
                  <span className={s.badge}>{s.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
