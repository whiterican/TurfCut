import { ActionButton } from "@/components/ActionButton";
import { NotSelectedForm } from "@/components/NotSelectedForm";
import { offerApplication, reviewApplication, withdrawInvitation } from "@/app/jobs/actions";
import { type EngagementStatus } from "@/lib/engagements";

/** "about 5 hours left": readable in any time zone. */
export const timeLeft = (until: Date, now = new Date()) => {
  const h = Math.ceil((until.getTime() - now.getTime()) / 3_600_000);
  return h <= 1 ? "less than an hour left" : `about ${h} hours left`;
};

/**
 * What an organization can do next with one engagement (C3): put an
 * application in review, send an offer (the worker accepts within
 * OFFER_HOURS, engagements.ts), mark it not selected, or withdraw an unanswered invitation.
 */
export function HiringActions({
  jobId,
  jobStatus,
  engagementId,
  status,
  inReview,
  offerExpiresAt,
}: {
  jobId: string;
  jobStatus: "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED";
  engagementId: string;
  status: EngagementStatus;
  inReview: boolean;
  offerExpiresAt: Date | null;
}) {
  const fields = { jobId, engagementId };
  if (jobStatus === "CLOSED") return null;
  if (status === "APPLIED") {
    return (
      <div className="flex flex-wrap items-start gap-2">
        <ActionButton action={offerApplication} fields={fields} label="Send offer" pendingLabel="Sending…" variant="btn-primary btn-sm" />
        {!inReview && <ActionButton action={reviewApplication} fields={fields} label="Mark in review" pendingLabel="Saving…" variant="btn-secondary btn-sm" />}
        <NotSelectedForm jobId={jobId} engagementId={engagementId} />
      </div>
    );
  }
  if (status === "OFFERED") {
    const expired = !!offerExpiresAt && offerExpiresAt <= new Date();
    return (
      <div className="flex flex-wrap items-start gap-2">
        <p className="text-muted-sm">
          {expired ? "The offer expired unanswered." : `Offer sent, waiting on the worker${offerExpiresAt ? ` (${timeLeft(offerExpiresAt)} to accept)` : ""}.`}
        </p>
        <NotSelectedForm jobId={jobId} engagementId={engagementId} label={expired ? "Close as not selected" : "Withdraw the offer"} />
      </div>
    );
  }
  if (status === "INVITED") {
    return <ActionButton action={withdrawInvitation} fields={fields} label="Withdraw invitation" pendingLabel="Withdrawing…" variant="btn-ghost btn-sm" />;
  }
  return null;
}
