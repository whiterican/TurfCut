import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/employer-session";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { expiryToday } from "@/lib/credentials";
import { offerLapsed } from "@/lib/engagements";
import { loadApplicants } from "@/lib/applicants-data";
import { applicantCells, applicantJob, availableColumns, columnLabel, filtersActive, keepApplicant, parseColumns, parseFilters, tableColumns } from "@/lib/applicants";
import { Masthead } from "@/components/staff/Masthead";
import { DataTable } from "@/components/staff/DataTable";
import { BulkApplicantActions } from "@/components/BulkApplicantActions";
import { HiringTabs } from "@/components/staff/HiringTabs";
import { hiringCounts } from "@/lib/invitations-data";

const BULK_FORM = "applicants-bulk";

/**
 * One job's applicants (C3.2): the people who applied or claimed, in a
 * table whose columns the recruiter picks. Only what each worker shares
 * with this organization now; "not shared" is never ranked or filtered
 * out. Political answers are never a column, filter or sort (Q3) — they
 * show on the applicant's own page, where the worker shared them.
 */
export default async function ApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const session = await requireArea("hiring");
  const job = await db().job.findFirst({
    where: { id: jobId, orgId: session.orgId },
    select: { id: true, title: true, status: true, type: true, headcount: true, startsAt: true, endsAt: true, requirements: true, jurisdiction: { select: { state: true, rules: true } } },
  });
  if (!job) notFound();

  const raw = await searchParams;
  const qs = new URLSearchParams(Object.entries(raw).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : typeof v === "string" ? [[k, v]] : [])));
  const facts = applicantJob(job);
  const cols = parseColumns(qs.getAll("col").join(","), facts);
  const filters = parseFilters(qs);
  const now = new Date();
  const today = expiryToday(now);

  // Scorecards load only when a column shows one.
  const scorecards = cols.some((c) => !["applied", "stage", "free", "credentials"].includes(c));
  const [all, counts] = await Promise.all([loadApplicants(job.id, session.orgId, now, { scorecards }), hiringCounts(job.id, session.orgId)]);
  const filtering = filtersActive(filters);
  const shown = all.filter((a) => keepApplicant(a, facts, filters, today));
  const toDecide = all.filter((a) => a.status === "APPLIED").length;
  const offers = all.filter((a) => a.status === "OFFERED" && !offerLapsed(a.status, a.offerExpiresAt, now)).length;
  const offerable = job.status === "PUBLISHED" || job.status === "PAUSED";

  return (
    <main className="page max-w-5xl">
      <Masthead
        eyebrow="Applicants"
        title={job.title}
        meta={`${all.length} ${all.length === 1 ? "applicant" : "applicants"} · ${toDecide} to decide · ${offers} ${offers === 1 ? "offer" : "offers"} out${job.headcount !== null ? ` · ${job.headcount} spots` : ""}`}
      >
        <Link href="/hiring" className="btn-ghost btn-sm">← Pipeline</Link>
        <Link href={`/jobs/${job.id}`} className="btn-secondary btn-sm">Job page</Link>
      </Masthead>
      <HiringTabs jobId={job.id} current="applicants" counts={counts} />

      <details className="card p-0" open={filtering || undefined}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-fg">Columns and filters</summary>
        <form className="space-y-4 border-t border-border p-4">
          <fieldset className="space-y-2">
            <legend className="label">Columns</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {availableColumns(facts).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="col" value={c} defaultChecked={cols.includes(c)} className="size-4" />
                  {columnLabel(c)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <legend className="label mb-2">Filters</legend>
            <label className="space-y-1.5">
              <span className="label">Stage</span>
              <select name="stage" className="field" defaultValue={filters.stage}>
                <option value="all">Every stage</option>
                <option value="open">Waiting on someone (applied, offered)</option>
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="label">Applied on or after</span>
              <input type="date" name="since" className="field" defaultValue={filters.since ?? ""} />
            </label>
            {job.startsAt && job.endsAt && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="free" value="1" defaultChecked={filters.free} className="size-4" />
                Free on at least one of the job&apos;s days
              </label>
            )}
            {availableColumns(facts).includes("credentials") && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="creds" value="1" defaultChecked={filters.credentials} className="size-4" />
                Holds every required credential
              </label>
            )}
          </fieldset>
          <p className="text-hint">A filter narrows what workers shared. Anyone who doesn&apos;t share what it looks at stays on the list, marked &ldquo;not shared&rdquo;.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary btn-sm">Show</button>
            <Link href={`/hiring/${job.id}/applicants`} className="btn-ghost btn-sm">Reset</Link>
          </div>
        </form>
      </details>

      {filtering && (
        <p className="text-muted-sm" role="status">
          Showing {shown.length} of {all.length}. <Link href={`/hiring/${job.id}/applicants${cols.length ? `?${cols.map((c) => `col=${c}`).join("&")}` : ""}`} className="link">Clear filters</Link>
        </p>
      )}

      {offerable && shown.some((a) => a.status === "APPLIED" || a.status === "OFFERED") && <BulkApplicantActions formId={BULK_FORM} jobId={job.id} />}

      <DataTable
        caption={`Applicants for ${job.title}`}
        empty={all.length ? "No applicants match these filters." : "Nobody has applied yet."}
        columns={tableColumns(cols)}
        select={offerable ? { form: BULK_FORM, name: "engagementId" } : undefined}
        rows={shown.map((a) => ({
          id: a.engagementId,
          selectable: a.status === "APPLIED" || a.status === "OFFERED",
          cells: applicantCells(a, facts, cols, today, `/hiring/${job.id}/people/${a.engagementId}`),
        }))}
      />
      <p className="text-hint">
        Only what each worker shares with your organization, as of now. &ldquo;Not shared&rdquo; is never counted as zero or ranked. There is no overall score. Political answers never appear in this table.
      </p>
    </main>
  );
}
