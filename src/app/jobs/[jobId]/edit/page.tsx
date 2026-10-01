import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireEmployer } from "@/lib/employer-session";
import { jobToForm, UUID_RE } from "@/lib/jobs";
import { jurisdictionOptions } from "@/lib/jurisdiction-options";
import { JobForm } from "@/components/JobForm";

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
          <p className="text-muted-sm">Edit draft</p>
          <h1 className="page-title">{job.title}</h1>
        </div>
        <Link href={`/jobs/${job.id}`} className="btn-ghost">← Job</Link>
      </header>
      {job.status === "DRAFT" ? (
        <JobForm jobId={job.id} defaults={jobToForm(job)} jurisdictions={jurisdictions} />
      ) : (
        <div className="empty-state">
          <p className="empty-state-title">Published jobs can&apos;t be edited</p>
          <p className="empty-state-body">Workers applied under these terms. Changes to live jobs arrive with job versioning.</p>
        </div>
      )}
    </main>
  );
}
