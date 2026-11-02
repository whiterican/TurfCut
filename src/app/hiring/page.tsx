import { requireArea } from "@/lib/employer-session";
import { db } from "@/lib/db";
import { openJobsEndAfter } from "@/lib/jobs";
import { pipeline } from "@/lib/hiring";
import { Masthead } from "@/components/staff/Masthead";
import { WorkspacePage } from "@/components/layout/Page";
import { DataTable } from "@/components/staff/DataTable";
import { matchCounts } from "@/lib/matches-data";

/** The hiring pipeline (C1.4): one row per open job, people at each stage. */
export default async function HiringPage() {
  const session = await requireArea("hiring");
  const now = new Date();
  const jobs = await db().job.findMany({
    where: { orgId: session.orgId, status: { in: ["PUBLISHED", "PAUSED"] }, OR: [{ endsAt: null }, { endsAt: { gt: openJobsEndAfter(now) } }] },
    select: { id: true, title: true, status: true, headcount: true, startsAt: true },
  });
  const engagements = await db().engagement.findMany({ where: { jobId: { in: jobs.map((j) => j.id) } }, select: { jobId: true, status: true, inviteExpiresAt: true } });
  const rows = pipeline(jobs.map((j) => ({ ...j, status: j.status as "PUBLISHED" | "PAUSED" })), engagements, now);
  const matches = await matchCounts(jobs.map((j) => j.id), session.orgId, now);
  const total = (k: "applied" | "offered" | "invited" | "engaged") => rows.reduce((n, r) => n + r[k], 0);

  return (
    <WorkspacePage head={<Masthead title="Pipeline" meta="Open jobs and the people at each stage. Open a job's applicants to compare what each worker shares with you." />}>
      {/* One compact band (#114 Hiring), as Pay has: the totals across open jobs, each a real count. */}
      <section aria-labelledby="hiring-totals-heading">
        <h2 id="hiring-totals-heading" className="sr-only">Hiring totals</h2>
        <dl className="summary-band">
          <div><dt>{rows.length === 1 ? "open job" : "open jobs"}</dt><dd>{rows.length}</dd></div>
          <div><dt>{total("applied") === 1 ? "application waiting" : "applications waiting"}</dt><dd>{total("applied")}</dd></div>
          <div><dt>{total("offered") === 1 ? "offer out" : "offers out"}</dt><dd>{total("offered")}</dd></div>
          <div><dt>invited</dt><dd>{total("invited")}</dd></div>
          <div><dt>working</dt><dd>{total("engaged")}</dd></div>
        </dl>
      </section>
      <DataTable
        stack
        caption="Open jobs and their hiring pipeline"
        empty="No open jobs. Publish a job to start hiring."
        columns={[
          { key: "job", label: "Job", sortable: true },
          { key: "applied", label: "Applied", numeric: true, sortable: true },
          { key: "offered", label: "Offered", numeric: true, sortable: true },
          { key: "invited", label: "Invited", numeric: true, sortable: true },
          // Workers who chose to be found for this work nearby (C3.4); blank when it can't be measured.
          { key: "matches", label: "Matches", numeric: true, sortable: true },
          { key: "engaged", label: "Working", numeric: true, sortable: true },
          // Hired so far (working or completed), as the Jobs list and the capacity check count it.
          { key: "filled", label: "Filled", numeric: true, sortable: true },
        ]}
        rows={rows.map((r) => ({
          id: r.jobId,
          cells: {
            job: { text: r.status === "PAUSED" ? `${r.title} (paused)` : r.title, href: `/hiring/${r.jobId}/applicants`, sort: r.title },
            applied: { text: String(r.applied), sort: r.applied, href: r.applied ? `/hiring/${r.jobId}/applicants` : undefined },
            offered: { text: String(r.offered), sort: r.offered, href: r.offered ? `/hiring/${r.jobId}/applicants` : undefined },
            invited: { text: String(r.invited), sort: r.invited, href: r.invited ? `/hiring/${r.jobId}/invites` : undefined },
            matches: (() => {
              const n = matches.get(r.jobId);
              return n === null || n === undefined ? { text: "—", sort: null } : { text: String(n), sort: n, href: n ? `/hiring/${r.jobId}/matches` : undefined };
            })(),
            engaged: { text: String(r.engaged), sort: r.engaged },
            filled: { text: r.headcount === null ? String(r.engaged + r.completed) : `${r.engaged + r.completed} of ${r.headcount}`, sort: r.engaged + r.completed },
          },
        }))}
      />
    </WorkspacePage>
  );
}
