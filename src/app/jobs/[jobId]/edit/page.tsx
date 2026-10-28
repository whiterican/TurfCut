import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireJobEditor } from "@/lib/employer-session";
import { jobToForm, UUID_RE } from "@/lib/jobs";
import { jurisdictionOptions } from "@/lib/jurisdiction-options";
import { JobForm } from "@/components/JobForm";
import { materialText, RELEASE_HOURS } from "@/lib/job-changes";
import { Masthead } from "@/components/Masthead";
import { ChevronLeft } from "lucide-react";

export default async function EditJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID_RE.test(jobId)) notFound();
  const { orgId } = await requireJobEditor();
  const job = orgId ? await db().job.findFirst({ where: { id: jobId, orgId } }) : null;
  if (!job) notFound();
  const jurisdictions = await jurisdictionOptions();

  return (
    <main className="page max-w-3xl">
      <Masthead eyebrow={job.status === "DRAFT" ? "Edit draft" : "Edit published job"} title={job.title}>
        <Link transitionTypes={["nav-back"]} href={`/jobs/${job.id}`} className="btn-ghost"><ChevronLeft aria-hidden className="size-4 shrink-0" />Job</Link>
      </Masthead>
      {job.status === "DRAFT" || job.status === "PUBLISHED" || job.status === "PAUSED" ? (
        <>
          {job.status !== "DRAFT" && (
            <p className="alert-info">
              This job is live. Every change is recorded and everyone on the job is told. If you change the {materialText()}, workers already hired
              may leave within {RELEASE_HOURS} hours with no effect on their reliability. The job has to stay publishable: a change that would fail a
              check is refused.
            </p>
          )}
          <JobForm jobId={job.id} autosave={job.status === "DRAFT"} defaults={jobToForm(job)} jurisdictions={jurisdictions} />
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
