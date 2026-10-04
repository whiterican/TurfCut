import Link from "next/link";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { HIRING_ROLES, ORG_ROLES } from "@/lib/access";
import { ENGAGEMENT_LABELS, JOB_STATUS_LABELS } from "@/lib/engagement-labels";
import { JOB_TYPES, exclusionReasons, parseFeedFilters, readDisclosure } from "@/lib/jobs";
import { effectivePreference } from "@/lib/political-fit";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { plural } from "@/lib/format";
import { loadFeed } from "@/lib/jobs-data";
import { JobFeedCard } from "@/components/JobFeedCard";

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
  const [{ jobs, hidden }, engagements, latest] = await Promise.all([
    loadFeed(workerId, filters),
    db().engagement.findMany({
      where: { workerId },
      include: { job: { select: { id: true, title: true, startsAt: true, campaignDisclosure: true, measureIds: true, org: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    loadLatestPreference(workerId),
  ]);
  // An invitation to a job the worker's own do-not-match answers rule out
  // never shows in "Your jobs" with an Accept (whatever the feed filters).
  const pref = effectivePreference(latest);
  const mine = engagements.filter(
    (e) => !(e.status === "INVITED" && exclusionReasons(pref, { disclosure: readDisclosure(e.job.campaignDisclosure), orgName: e.job.org.name, measureIds: e.job.measureIds }).length)
  );
  const engagedIds = new Set(engagements.map((e) => e.jobId));
  const open = jobs.filter((j) => !engagedIds.has(j.id));

  // Quick-filter chips toggle one URL parameter each.
  const toggle = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (next.get(key) === value) next.delete(key);
    else next.set(key, value);
    // Turning "This week" on replaces a typed date, so the chip and the results agree.
    if (key === "week" && next.get("week") === "1") next.delete("startsBefore");
    const qs = next.toString();
    return qs ? `/jobs?${qs}` : "/jobs";
  };
  const quick = [
    { label: "This week", href: toggle("week", "1"), on: params.get("week") === "1" && !params.get("startsBefore"), tone: "filter-chip-sky" },
    { label: "Petition", href: toggle("type", "PETITION"), on: filters.type === "PETITION", tone: "filter-chip-butter" },
    { label: "Canvass", href: toggle("type", "CANVASS"), on: filters.type === "CANVASS", tone: "filter-chip-forest" },
    { label: "No credentials", href: toggle("noCredentials", "1"), on: !!filters.noCredentials, tone: "filter-chip-accent" },
  ];
  const anyFilter = !!(filters.type || filters.minRateCents || filters.startsBefore || filters.noCredentials);
  // The date field shows a typed date only, not the "This week" window.
  const typedStartsBefore = parseFeedFilters(new URLSearchParams(params.get("startsBefore") ? { startsBefore: params.get("startsBefore")! } : {})).startsBefore;

  return (
    <main className="page">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">Work</p>
          <h1 className="page-title">Find your next field job.</h1>
          <p className="text-muted-sm">Open jobs, soonest first, with pay, place and dates up front.</p>
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

      <section className="section space-y-4">
        {/* Quick filters (screen mockups): one tap on, one tap off. */}
        <nav aria-label="Quick filters" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {quick.map((q) => (
            <Link key={q.label} href={q.href} scroll={false} className={`filter-chip ${q.on ? q.tone : ""}`}>
              {q.on && <span aria-hidden>✓</span>}
              {q.label}
              <span className="sr-only">{q.on ? " (on — tap to turn off)" : " (off)"}</span>
            </Link>
          ))}
        </nav>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="section-title">{plural(open.length, "opportunity", "opportunities")}</h2>
          {anyFilter && <Link href="/jobs" scroll={false} className="link text-sm">Clear filters</Link>}
        </div>

        <details className="card p-0" open={!!filters.minRateCents}>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-fg">More filters</summary>
          <form className="grid gap-3 border-t border-border p-4 sm:grid-cols-4 sm:items-end">
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
              <input type="date" name="startsBefore" className="field" defaultValue={typedStartsBefore?.toISOString().slice(0, 10) ?? ""} />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="toggle">
                <input type="checkbox" role="switch" name="noCredentials" value="1" defaultChecked={filters.noCredentials} />
                No credentials required
              </label>
              <button className="btn-secondary">Apply</button>
            </div>
          </form>
        </details>

        {open.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No open jobs match</p>
            <p className="empty-state-body">Try fewer filters, or check back soon.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {open.map((j) => (
              <li key={j.id}>
                <JobFeedCard j={j} />
              </li>
            ))}
          </ul>
        )}
        <Link href="/profile/preferences" className="btn-secondary w-full">Adjust who you won&apos;t be matched with</Link>
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
