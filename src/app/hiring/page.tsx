import { requireArea } from "@/lib/employer-session";
import { db } from "@/lib/db";
import { openJobsEndAfter } from "@/lib/jobs";
import { pipeline } from "@/lib/hiring";
import { Masthead } from "@/components/staff/Masthead";
import { SummaryBar } from "@/components/staff/SummaryBar";
import { DataTable } from "@/components/staff/DataTable";

/** The hiring pipeline (C1.4): one row per open job, people at each stage. */
export default async function HiringPage() {
  const session = await requireArea("hiring");
  const now = new Date();
  const jobs = await db().job.findMany({
    where: { orgId: session.orgId, status: { in: ["PUBLISHED", "PAUSED"] }, OR: [{ endsAt: null }, { endsAt: { gt: openJobsEndAfter(now) } }] },
    select: { id: true, title: true, status: true, headcount: true, startsAt: true },
  });
  const engagements = await db().engagement.findMany({ where: { jobId: { in: jobs.map((j) => j.id) } }, select: { jobId: true, status: true } });
  const rows = pipeline(jobs.map((j) => ({ ...j, status: j.status as "PUBLISHED" | "PAUSED" })), engagements);
  const total = (k: "applied" | "invited" | "engaged") => rows.reduce((n, r) => n + r[k], 0);

  return (
    <main className="page max-w-4xl">
      <Masthead eyebrow="Hiring" title="Pipeline" meta="Open jobs and the people at each stage. Scorecard columns arrive once workers can choose what to share." />
      <SummaryBar
        label="Hiring totals"
        items={[
          { label: "Open jobs", value: rows.length },
          { label: "Applications waiting", value: total("applied") },
          { label: "Invited", value: total("invited") },
          { label: "Hired, working", value: total("engaged") },
        ]}
      />
      <DataTable
        caption="Open jobs and their hiring pipeline"
        empty="No open jobs. Publish a job to start hiring."
        columns={[
          { key: "job", label: "Job", sortable: true },
          { key: "applied", label: "Applied", numeric: true, sortable: true },
          { key: "invited", label: "Invited", numeric: true, sortable: true },
          { key: "engaged", label: "Hired", numeric: true, sortable: true },
          { key: "completed", label: "Completed", numeric: true, sortable: true },
        ]}
        rows={rows.map((r) => ({
          id: r.jobId,
          cells: {
            job: { text: r.status === "PAUSED" ? `${r.title} (paused)` : r.title, href: `/hiring/${r.jobId}/applicants`, sort: r.title },
            applied: { text: String(r.applied), sort: r.applied },
            invited: { text: String(r.invited), sort: r.invited },
            engaged: { text: r.headcount === null ? String(r.engaged) : `${r.engaged} of ${r.headcount}`, sort: r.engaged },
            completed: { text: String(r.completed), sort: r.completed },
          },
        }))}
      />
    </main>
  );
}
