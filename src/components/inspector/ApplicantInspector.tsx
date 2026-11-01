import Link from "next/link";
import type { ApplicantInspector as Data } from "@/lib/applicant-view-data";
import { engagementStatus } from "@/lib/engagement-labels";
import { heldCredentials, requiredKinds } from "@/lib/applicants";
import { StatusBadge } from "@/components/StatusBadge";
import { HiringActions } from "@/components/HiringActions";
import { NotSharedChip } from "@/components/staff/NotSharedChip";

/**
 * One applicant beside the applicants table (redesign §4.3), at 1280 and
 * wider. It shows what the inspector loader returns and nothing else: no
 * political fit, not even whether answers exist (applicantForInspector).
 * The full applicant page keeps everything else.
 */
export function ApplicantInspector({ a, closeHref, now }: { a: Data; closeHref: string; now: Date }) {
  const e = a.engagement;
  const fullHref = `/hiring/${e.job.id}/people/${e.id}`;
  const today = a.profile?.today ?? now.toISOString().slice(0, 10);
  return (
    <div className="card space-y-4" data-inspector>
      <div className="flex items-start justify-between gap-3">
        <h2 id="inspector-heading" tabIndex={-1} className="t-headline min-w-0 break-words outline-none">
          {e.worker.displayName}
        </h2>
        <Link href={closeHref} className="btn-ghost btn-sm shrink-0" data-inspector-close scroll={false}>
          Close
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={engagementStatus(e, a.facts, now)} />
        <span className="text-muted-sm">Since {e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
      </div>
      <HiringActions jobId={e.job.id} jobStatus={e.job.status} engagementId={e.id} status={e.status} inReview={a.facts.inReview} offerExpiresAt={a.facts.offerExpiresAt} inviteExpiresAt={e.inviteExpiresAt} />
      {a.open && a.profile ? (
        <dl className="space-y-3 text-sm">
          {e.job.startsAt && e.job.endsAt && (
            <div className="space-y-0.5">
              <dt className="text-muted">Free on the job&apos;s dates</dt>
              <dd className="text-fg">{a.profile.availability === "withheld" ? <NotSharedChip what="availability" /> : a.free?.text || "Not set"}</dd>
            </div>
          )}
          {requiredKinds(a.appJob).length > 0 && (
            <div className="space-y-0.5">
              <dt className="text-muted">Required credentials</dt>
              <dd className="text-fg">
                {a.creds === "withheld" || !a.creds ? <NotSharedChip what="credentials" /> : heldCredentials(a.creds, a.appJob, today).map((h) => <span key={h.kind} className="block">{h.text}</span>)}
              </dd>
            </div>
          )}
        </dl>
      ) : (
        <p className="text-muted-sm">
          {e.worker.closedAt ? "This worker closed their account." : "Their live profile isn't open to you now. The history and the copy from when they applied stay on their page."}
        </p>
      )}
      <Link href={fullHref} className="btn-secondary btn-sm">Open the full page</Link>
    </div>
  );
}
