import { StatusBadge } from "@/components/StatusBadge";
import Link from "next/link";
import { expiryToday } from "@/lib/credentials";
import { engagementStatus } from "@/lib/engagement-labels";
import { heldCredentials, requiredKinds } from "@/lib/applicants";
import { Masthead } from "@/components/staff/Masthead";
import { HiringActions } from "@/components/HiringActions";
import { EngagementHistory } from "@/components/EngagementHistory";
import { OrgProfileSections } from "@/components/OrgProfileSections";
import { SnapshotView } from "@/components/SnapshotView";
import { NotSharedChip } from "@/components/staff/NotSharedChip";
import { startDirect } from "@/app/messages/actions";
import { ChevronLeft } from "lucide-react";
import { RecordPage } from "@/components/layout/Page";
import styles from "@/components/HiringPeople.module.css";

import type { ReactNode } from "react";
import type { ApplicantPage as ApplicantPageData } from "@/lib/applicant-view-data";

/** The full candidate record, using only the authorized page loader result. */
export function ApplicantRecord({ applicant, now, invitation }: { applicant: ApplicantPageData; now: Date; invitation: ReactNode }) {
  const a = applicant;
  const { engagement: e, facts, access, open, appJob, profile: view, free, creds, snapshot, hired } = a;
  const job = e.job;

  const hasComparison = !!(job.startsAt && job.endsAt) || requiredKinds(appJob).length > 0;
  const capturedAt = snapshot?.capturedAt ? new Date(snapshot.capturedAt) : null;
  const snapshotDay = capturedAt && Number.isFinite(capturedAt.getTime())
    ? capturedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;

  return (
    <div className={styles.page}>
    <RecordPage org head={<div className="space-y-3">
      <Masthead eyebrow={`Applicant · ${job.title}`} title={e.worker.displayName} meta={<div className={styles.stage}>
        <span>Since {e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
        <StatusBadge status={engagementStatus(e, facts, now)} />
      </div>}>
        <Link href={`/hiring/${job.id}/applicants`} className="btn-ghost btn-sm"><ChevronLeft aria-hidden className="size-4 shrink-0" />Applicants</Link>
        <Link href={`/jobs/${job.id}`} className="btn-secondary btn-sm">Job page</Link>
      </Masthead>
      <div className={styles.actions}>
        <HiringActions jobId={job.id} jobStatus={job.status} engagementId={e.id} status={e.status} inReview={facts.inReview} offerExpiresAt={facts.offerExpiresAt} inviteExpiresAt={e.inviteExpiresAt} />
        {hired && <form action={startDirect}>
          <input type="hidden" name="engagementId" value={e.id} />
          <button className="btn-secondary btn-sm">Message</button>
        </form>}
      </div>
    </div>}>
      {open && view ? (
        <>
          {hasComparison && <section className="section">
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
          </section>}
          <section className="section"><h2 className="section-title">History</h2><EngagementHistory events={facts.events} /></section>
          <OrgProfileSections view={view} />
          {invitation}
        </>
      ) : (
        <>
        <section className="section"><h2 className="section-title">History</h2><EngagementHistory events={facts.events} /></section>
        <section className="alert-info">
          {e.worker.closedAt
            ? "This worker closed their account. The history and the copy below stay."
            : e.status === "INVITED"
              ? "They haven't answered your invitation, so their profile opens only once they do (or if they apply to one of your jobs)."
              : access?.kind === "denied" && !job.org.approved
                ? "Profiles open once Turfcut approves your organization."
                : "They have no open application or job with your organization now, so their live profile isn't open to you. The history and the copy below stay."}
        </section>
        </>
      )}

      <details className={`section ${styles.snapshot}`}>
        <summary className="section-title">{snapshot?.kind === "invitation" ? "When you invited them" : "When they applied"}{snapshotDay && ` · ${snapshotDay}`}</summary>
        <div className="space-y-3 pt-3">
          <p className="text-muted-sm">Exactly what you could see then. It never changes, even if they share less later.</p>
          {snapshot ? <SnapshotView snapshot={snapshot} /> : <p className="text-hint">No copy was kept for this engagement.</p>}
        </div>
      </details>
    </RecordPage>
    </div>
  );
}
