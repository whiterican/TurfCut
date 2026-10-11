import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireEmployer } from "@/lib/employer-session";
import { jobToForm, UUID_RE } from "@/lib/jobs";
import { jurisdictionOptions } from "@/lib/jurisdiction-options";
import { JobForm } from "@/components/JobForm";
import { materialText, RELEASE_HOURS } from "@/lib/job-changes";

export default async function EditJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const { orgId } = await requireEmployer();
  const job = orgId ? await db().job.findFirst({ where: { id: jobId, orgId } }) : null;
  if (!job) notFound();
  const jurisdictions = await jurisdictionOptions();

  return (
    <main className="page max-w-3xl">
      <header className="page-header">
        <div className="space-y-1">
          <p className="eyebrow">{job.status === "DRAFT" ? "Edit draft" : "Edit published job"}</p>
          <h1 className="page-title masthead">{job.title}</h1>
        </div>
        <Link transitionTypes={["nav-back"]} href={`/jobs/${job.id}`} className="btn-ghost">← Job</Link>
      </header>
      {job.status === "DRAFT" || job.status === "PUBLISHED" || job.status === "PAUSED" ? (
        <>
          {job.status !== "DRAFT" && (
            <p className="alert-info">
              This job is live. Every change is recorded and everyone on the job is told. If you change the {materialText()}, workers already hired
              may leave within {RELEASE_HOURS} hours with no effect on their reliability. The job has to stay publishable: a change that would fail a
              check is refused.
            </p>
          )}
          <JobForm jobId={job.id} defaults={jobToForm(job)} jurisdictions={jurisdictions} />
        </>
      ) : (
        <div className="empty-state">
          <p className="empty-state-title">This job can&apos;t be edited</p>
          <p className="empty-state-body">A closed job keeps the terms it closed with.</p>
        </div>
      )}
    </main>
  );
}
