import Link from "next/link";
import { ACCEPTED_STATUSES, inviteLapsed, stageOf } from "@/lib/engagements";
import { loadPipelineFacts } from "@/lib/engagements-data";
import { Masthead } from "@/components/Masthead";
import { DataTable } from "@/components/staff/DataTable";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { canUse } from "@/lib/access";
import { ENGAGEMENT_LABELS, JOB_STATUS_LABELS } from "@/lib/engagement-labels";
import { JOB_TYPES, exclusionReasons, parseFeedFilters, readDisclosure } from "@/lib/jobs";
import { effectivePreference } from "@/lib/political-fit";
import { loadLatestPreference } from "@/lib/political-fit-data";
import { plural } from "@/lib/format";
import { loadFeed } from "@/lib/jobs-data";
import { JobFeedCard } from "@/components/JobFeedCard";
import { SwipeCard } from "@/components/SwipeCard";
import { Sheet } from "@/components/Sheet";
import { EmptyArt } from "@/components/EmptyState";
import { applyMarks } from "@/lib/job-marks";
import { loadMarks } from "@/lib/job-marks-data";
import { Check, ChevronRight } from "lucide-react";

const day = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function JobsPage({ searchParams }: { searchParams: Search }) {
  const session = await requireAuth();
  if (session.role === "WORKER" && session.workerId) return <WorkerFeed workerId={session.workerId} searchParams={searchParams} />;
  if (session.orgId && canUse(session, "jobs", "read")) return <OrgJobs orgId={session.orgId} canHire={canUse(session, "jobsEdit")} />;
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
  const [{ jobs, hidden }, engagements, latest, marks] = await Promise.all([
    loadFeed(workerId, filters),
    db().engagement.findMany({
      where: { workerId },
      include: { job: { select: { id: true, title: true, status: true, startsAt: true, campaignDisclosure: true, measureIds: true, org: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    loadLatestPreference(workerId),
    loadMarks(workerId),
  ]);
  // An invitation to a job the worker's own do-not-match answers rule out
  // never shows in "Your jobs" with an Accept (whatever the feed filters).
  const pref = effectivePreference(latest);
  const mine = engagements.filter(
    (e) => !(e.status === "INVITED" && exclusionReasons(pref, { disclosure: readDisclosure(e.job.campaignDisclosure), orgName: e.job.org.name, measureIds: e.job.measureIds }).length)
  );
  const facts = await loadPipelineFacts(mine.map((e) => e.id));
  const now = new Date();
  const waitingInvites = mine.filter((e) => e.status === "INVITED" && !inviteLapsed(e.status, e.inviteExpiresAt, now) && e.job.status !== "CLOSED").length;
  const engagedIds = new Set(engagements.map((e) => e.jobId));
  // The worker's own marks (P1.6): hidden jobs leave the list (shown on request), "Saved" narrows to saved ones.
  // Order is the feed's own; a mark never ranks.
  const showHidden = params.get("hidden") === "1";
  const savedOnly = params.get("saved") === "1";
  const { shown: open, hiddenCount } = applyMarks(jobs.filter((j) => !engagedIds.has(j.id)), marks, { showHidden, savedOnly });

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
    { label: "This week", href: toggle("week", "1"), on: params.get("week") === "1" && !params.get("startsBefore") },
    { label: "Petition", href: toggle("type", "PETITION"), on: filters.type === "PETITION" },
    { label: "Canvass", href: toggle("type", "CANVASS"), on: filters.type === "CANVASS" },
    { label: "No credentials", href: toggle("noCredentials", "1"), on: !!filters.noCredentials },
    { label: "Saved", href: toggle("saved", "1"), on: savedOnly },
  ];
  const anyFilter = !!(filters.type || filters.minRateCents || filters.startsBefore || filters.noCredentials || savedOnly || showHidden);
  // The date field shows a typed date only, not the "This week" window.
  const typedStartsBefore = parseFeedFilters(new URLSearchParams(params.get("startsBefore") ? { startsBefore: params.get("startsBefore")! } : {})).startsBefore;

  return (
    <main className="page">
      <Masthead title="Work" meta="Open jobs, soonest first, with pay, place and dates up front." />

      {waitingInvites > 0 && (
        <Link href="/jobs/invitations" className="alert-info flex items-center justify-between gap-3">
          <span className="font-medium">
            {waitingInvites} {waitingInvites === 1 ? "invitation is" : "invitations are"} waiting for your answer
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0" />
        </Link>
      )}

      {mine.length > 0 && (
        <section className="section">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">Your jobs</h2>
            <Link href="/jobs/invitations" className="link text-sm">Invitations</Link>
          </div>
          <ul className="list-card">
            {mine.map((e) => {
              const s = ENGAGEMENT_LABELS[e.status];
              const f = facts.get(e.id);
              const stage = stageOf(e, f ?? { events: [], offerExpiresAt: null }, now);
              return (
                <li key={e.id}>
                  <Link transitionTypes={["nav-forward"]} href={`/jobs/${e.job.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-fg transition hover:bg-surface-2">
                    <span className="font-medium">{e.job.title}</span>
                    <span className={s.badge}>{stage}</span>
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
            <Link key={q.label} href={q.href} scroll={false} className={`filter-chip ${q.on ? "filter-chip-on" : ""}`}>
              {q.on && <Check aria-hidden className="size-4 shrink-0" />}
              {q.label}
              <span className="sr-only">{q.on ? " (on — tap to turn off)" : " (off)"}</span>
            </Link>
          ))}
        </nav>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="section-title">{showHidden ? plural(open.length, "hidden job", "hidden jobs") : savedOnly ? plural(open.length, "saved job", "saved jobs") : plural(open.length, "opportunity", "opportunities")}</h2>
          {anyFilter && <Link href="/jobs" scroll={false} className="link text-sm">{showHidden ? "Back to the feed" : "Clear filters"}</Link>}
        </div>

        <Sheet label="More filters" trigger="More filters" triggerClassName="btn-secondary w-full sm:w-auto">
          <form className="grid gap-3 sm:grid-cols-2">
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
                <input type="checkbox" role="switch" switch="" name="noCredentials" value="1" defaultChecked={filters.noCredentials} />
                No credentials required
              </label>
              <button className="btn-secondary">Show jobs</button>
            </div>
          </form>
        </Sheet>

        {open.length === 0 ? (
          <div className="empty-state">
            <EmptyArt kind="jobs" />
            <p className="empty-state-title">{showHidden ? "Nothing hidden" : savedOnly ? "Nothing saved yet" : "No open jobs match"}</p>
            <p className="empty-state-body">{showHidden ? "Jobs you hide from the feed show up here." : savedOnly ? "Swipe a job right, or tap Save, to keep it here." : "Try fewer filters, or check back soon."}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {open.map((j) => (
              <li key={j.id}>
                <SwipeCard jobId={j.id} saved={marks.saved.has(j.id)} hidden={showHidden}>
                  <JobFeedCard j={j} />
                </SwipeCard>
              </li>
            ))}
          </ul>
        )}
        <p className="text-hint">
          {showHidden
            ? "Unhide brings a job back to your feed. Hiding and saving are private to you: neither is ever used to rank jobs or people."
            : "Swipe right to save a job, left to hide it, or use the buttons. Both are private to you: neither is ever used to rank jobs or people."}
          {hiddenCount > 0 && !showHidden && (
            <> <Link href="/jobs?hidden=1" scroll={false} className="link">{plural(hiddenCount, "hidden job", "hidden jobs")}</Link>.</>
          )}
        </p>
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
    include: { _count: { select: { engagements: { where: { status: { in: ACCEPTED_STATUSES } } } } } },
    orderBy: [{ createdAt: "desc" }],
  });
  return (
    <main className="page max-w-4xl">
      <Masthead title="Your jobs" meta="Your organization's jobs, newest first. Sort by any column.">
        {canHire && <Link href="/jobs/new" className="btn-primary">New job</Link>}
      </Masthead>
      {jobs.length === 0 ? (
        <div className="empty-state">
          <EmptyArt kind="jobs" />
          <p className="empty-state-title">No jobs yet</p>
          <p className="empty-state-body">{canHire ? "Create a draft, then publish once every check passes." : "Owners and recruiters create jobs."}</p>
        </div>
      ) : (
        <DataTable
          caption="Your organization's jobs"
          columns={[
            { key: "title", label: "Job", sortable: true },
            { key: "status", label: "Status", sortable: true },
            { key: "starts", label: "Starts", sortable: true },
            { key: "filled", label: "Filled", numeric: true, sortable: true },
          ]}
          rows={jobs.map((j) => ({
            id: j.id,
            cells: {
              title: { text: j.title, href: `/jobs/${j.id}` },
              status: { text: JOB_STATUS_LABELS[j.status].label },
              starts: { text: day(j.startsAt), sort: j.startsAt?.getTime() ?? null },
              filled: { text: j.headcount === null ? String(j._count.engagements) : `${j._count.engagements} of ${j.headcount}`, sort: j._count.engagements },
            },
          }))}
        />
      )}
    </main>
  );
}
