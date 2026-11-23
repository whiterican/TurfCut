import { notFound } from "next/navigation";
import { requireArea } from "@/lib/employer-session";
import { applicantForViewer } from "@/lib/applicant-view-data";
import { loadHiringPaused } from "@/lib/jobs-data";
import { ApplicantRecord } from "@/components/ApplicantRecord";
import { InviteComposer } from "@/components/InviteComposer";

/**
 * One person in the context of one job (C3.2): where they stand, what they
 * share with this organization now — including political-fit answers,
 * display only, where the worker shares them — and the copy taken when they
 * applied. The live profile is open while the worker has a relationship
 * with the organization (an open or worked engagement they started on any
 * of its jobs, C1); otherwise only the history and the copy stay. Issue
 * overlap with this job's campaign shows only on an engagement the worker
 * entered themselves that is still open or worked (fitCampaignAllowed).
 */
export default async function ApplicantPage({ params }: { params: Promise<{ jobId: string; engagementId: string }> }) {
  const { jobId, engagementId } = await params;
  const session = await requireArea("hiring");
  const now = new Date();
  const applicant = await applicantForViewer(session, { jobId, engagementId }, { view: "page", now });
  if (!applicant) notFound();
  // The server refuses an offer while hiring is paused, so the page doesn't show one.
  const hiringPaused = await loadHiringPaused(applicant.engagement.job.id, session.orgId, now);
  return <ApplicantRecord applicant={applicant} now={now} hiringPaused={hiringPaused} invitation={applicant.open && applicant.profile
    ? <InviteComposer workerId={applicant.engagement.worker.id} orgId={session.orgId} /> : null} />;
}
