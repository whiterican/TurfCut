import { ActionButton } from "@/components/ActionButton";
import { NotSelectedForm } from "@/components/NotSelectedForm";
import { offerApplication, reviewApplication, withdrawInvitation } from "@/app/jobs/actions";
import { inviteLapsed, offerLapsed, type EngagementStatus } from "@/lib/engagements";
import { hiringPausedMessage } from "@/lib/jobs";

/** "about 5 hours left": readable in any time zone. */
export const timeLeft = (until: Date, now = new Date()) => {
  const h = Math.ceil((until.getTime() - now.getTime()) / 3_600_000);
  return h <= 1 ? "less than an hour left" : `about ${h} hours left`;
};

/**
 * What an organization can do next with one engagement (C3): put an
 * application in review, send an offer (the worker accepts within
 * OFFER_HOURS, engagements.ts) or a new one once it lapses, mark it not
 * selected, or withdraw an unanswered invitation. On a closed job only the
 * close-outs remain, so nothing is left hanging. While hiring is paused on
 * the job (hiringPaused: the reasons) an offer can't be sent, as the server
 * refuses it; review and the close-outs stay.
 */
export function HiringActions({
  jobId,
  jobStatus,
  engagementId,
  status,
  inReview,
  offerExpiresAt,
  inviteExpiresAt = null,
  hiringPaused = [],
}: {
  jobId: string;
  jobStatus: "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED";
  engagementId: string;
  status: EngagementStatus;
  inReview: boolean;
  offerExpiresAt: Date | null;
  /** When an invitation lapses (C3.3); null for invitations sent before C3. */
  inviteExpiresAt?: Date | null;
  /** Why hiring is paused on the job right now (hiringPausedReasons); empty when it isn't. */
  hiringPaused?: string[];
}) {
  const fields = { jobId, engagementId };
  const closed = jobStatus === "CLOSED";
  const canOffer = !closed && hiringPaused.length === 0;
  const pausedNote = !closed && hiringPaused.length > 0 ? <p className="text-muted-sm">{hiringPausedMessage(hiringPaused)} You can send an offer once it&apos;s cleared.</p> : null;
  if (status === "APPLIED") {
    return (
      <div className="space-y-2">
        {pausedNote}
        <div className="flex flex-wrap items-start gap-2">
          {canOffer && <ActionButton action={offerApplication} fields={fields} label="Send offer" pendingLabel="Sending…" variant="btn-secondary btn-sm" />}
          {!closed && !inReview && <ActionButton action={reviewApplication} fields={fields} label="Mark in review" pendingLabel="Saving…" variant="btn-secondary btn-sm" />}
          <NotSelectedForm jobId={jobId} engagementId={engagementId} />
        </div>
      </div>
    );
  }
  if (status === "OFFERED") {
    const expired = offerLapsed(status, offerExpiresAt, new Date());
    return (
      <div className="space-y-2">
        <p className="text-muted-sm">
          {expired || !offerExpiresAt ? "The offer lapsed before the worker answered." : `Offer sent, waiting on the worker (${timeLeft(offerExpiresAt)} to accept).`}
        </p>
        {expired ? pausedNote : !closed && hiringPaused.length > 0 && <p className="text-muted-sm">{hiringPausedMessage(hiringPaused)} The worker can accept once it&apos;s cleared.</p>}
        <div className="flex flex-wrap items-start gap-2">
          {expired && canOffer && <ActionButton action={offerApplication} fields={fields} label="Send a new offer" pendingLabel="Sending…" variant="btn-secondary btn-sm" />}
          <NotSelectedForm jobId={jobId} engagementId={engagementId} label={expired ? "Close as not selected" : "Withdraw the offer"} />
        </div>
      </div>
    );
  }
  if (status === "INVITED") {
    const lapsed = inviteLapsed(status, inviteExpiresAt, new Date());
    return (
      <div className="space-y-2">
        {closed ? (
          <p className="text-muted-sm">The job closed before the worker answered.</p>
        ) : lapsed ? (
          <p className="text-muted-sm">
            The invitation expired unanswered.{jobStatus === "PUBLISHED" ? " You can invite them again from their page." : " You can invite them again once the job is published."}
          </p>
        ) : (
          inviteExpiresAt && <p className="text-muted-sm">Invitation sent; the worker can answer until {inviteExpiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.</p>
        )}
      <ActionButton
        action={withdrawInvitation}
        fields={fields}
        label="Withdraw invitation"
        pendingLabel="Withdrawing…"
        variant="btn-ghost btn-sm"
        confirm={{ text: "Withdraw this invitation? You can't invite this worker to this job again.", label: "Yes, withdraw" }}
      />
      </div>
    );
  }
  return null;
}
