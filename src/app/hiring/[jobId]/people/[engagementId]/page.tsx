import { StatusBadge } from "@/components/StatusBadge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/employer-session";
import { expiryToday } from "@/lib/credentials";
import { engagementStatus } from "@/lib/engagement-labels";
import { heldCredentials, requiredKinds } from "@/lib/applicants";
import { applicantForViewer } from "@/lib/applicant-view-data";
import { Masthead } from "@/components/staff/Masthead";
import { HiringActions } from "@/components/HiringActions";
import { EngagementHistory } from "@/components/EngagementHistory";
import { OrgProfileSections } from "@/components/OrgProfileSections";
import { SnapshotView } from "@/components/SnapshotView";
import { NotSharedChip } from "@/components/staff/NotSharedChip";
import { startDirect } from "@/app/messages/actions";
import { InviteComposer } from "@/components/InviteComposer";
import { ChevronLeft } from "lucide-react";
import { RecordPage } from "@/components/layout/Page";

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
  // The loader checks hiring access, the organization and the ids itself (redesign §4.3).
  const a = await applicantForViewer(session, { jobId, engagementId }, { view: "page", now });
  if (!a) notFound();
  const { engagement: e, facts, access, open, appJob, profile: view, free, creds, snapshot, hired } = a;
  const job = e.job;

  return (
    <RecordPage org head={<Masthead eyebrow={`Applicant · ${job.title}`} title={e.worker.displayName} meta={`Since ${e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`}>
        <Link href={`/hiring/${job.id}/applicants`} className="btn-ghost btn-sm"><ChevronLeft aria-hidden className="size-4 shrink-0" />Applicants</Link>
        <Link href={`/jobs/${job.id}`} className="btn-secondary btn-sm">Job page</Link>
      </Masthead>}>

      <section className="card space-y-3">
        <p className="flex items-center gap-2 font-medium text-fg">Stage <StatusBadge status={engagementStatus(e, facts, now)} /></p>
        <HiringActions jobId={job.id} jobStatus={job.status} engagementId={e.id} status={e.status} inReview={facts.inReview} offerExpiresAt={facts.offerExpiresAt} inviteExpiresAt={e.inviteExpiresAt} />
        {hired && (
          <form action={startDirect}>
            <input type="hidden" name="engagementId" value={e.id} />
            <button className="btn-secondary btn-sm">Message</button>
          </form>
        )}
        <EngagementHistory events={facts.events} />
      </section>

      {open && view ? (
        <>
          <section className="section">
            <h2 className="section-title">For this job</h2>
            <dl className="list-card">
              {job.startsAt && job.endsAt && (
                <div className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-muted">Free on the job&apos;s dates</dt>
                  <dd className="text-fg sm:text-right">
                    {view.availability === "withheld" ? <NotSharedChip what="availability" /> : free?.text || "Not set"}
                  </dd>
                </div>
              )}
              {requiredKinds(appJob).length > 0 && (
                <div className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:justify-between sm:gap-4">
                  <dt className="text-muted">Required credentials</dt>
                  <dd className="text-fg sm:text-right">
                    {creds === "withheld" || !creds ? <NotSharedChip what="credentials" /> : heldCredentials(creds, appJob, expiryToday(now)).map((h) => <span key={h.kind} className="block">{h.text}</span>)}
                  </dd>
                </div>
              )}
            </dl>
          </section>
          <InviteComposer workerId={e.worker.id} orgId={session.orgId} />
          <OrgProfileSections view={view} />
        </>
      ) : (
        <section className="alert-info">
          {e.worker.closedAt
            ? "This worker closed their account. The history and the copy below stay."
            : e.status === "INVITED"
              ? "They haven't answered your invitation, so their profile opens only once they do (or if they apply to one of your jobs)."
              : access?.kind === "denied" && !job.org.approved
                ? "Profiles open once Turfcut approves your organization."
                : "They have no open application or job with your organization now, so their live profile isn't open to you. The history and the copy below stay."}
        </section>
      )}

      <section className="section">
        <h2 className="section-title">{snapshot?.kind === "invitation" ? "When you invited them" : "When they applied"}</h2>
        <p className="text-muted-sm">Exactly what you could see then. It never changes, even if they share less later.</p>
        {snapshot ? <SnapshotView snapshot={snapshot} /> : <p className="text-hint">No copy was kept for this engagement.</p>}
      </section>
    </RecordPage>
  );
}
