import type { NotificationKind } from "@prisma/client";
import { money } from "@/lib/pay";

/**
 * Turfcut's decision on the recipient's organization (M10.2). The staff
 * member's reason stays on the ledger; the owner reads the decision and
 * where to look.
 */
export function orgNoticeText(kind: NotificationKind): { text: string; href: string } | null {
  switch (kind) {
    case "ORG_APPROVED": return { text: "Turfcut approved your organization for the pilot. Jobs can publish once the rest of the gate in Settings is done.", href: "/org/settings" };
    case "ORG_APPROVAL_REVOKED": return { text: "Turfcut withdrew your organization's approval. Publishing and hiring are paused until it is restored; Settings shows where things stand.", href: "/org/settings" };
    case "ORG_JOBS_FROZEN": return { text: "A jurisdiction rule change froze one or more of your jobs: no new shifts or seats until they fit the new rules. Each job page says what to change.", href: "/jobs" };
    default: return null;
  }
}

/**
 * A notice's words and where it leads (C3.5), drawn from the engagement as
 * the recipient may see it: a worker reads the organization and job, the
 * organization's staff read the worker's display name and job.
 */
export function notificationText(
  kind: NotificationKind,
  e: { id: string; jobId: string; status: string; wasOffer: boolean; worker: { displayName: string }; job: { title: string; org: { name: string } } },
  viewer: "worker" | "org"
): { text: string; href: string } {
  const org = e.job.org.name;
  const job = e.job.title;
  const who = e.worker.displayName;
  const jobHref = `/jobs/${e.jobId}`;
  const personHref = `/hiring/${e.jobId}/people/${e.id}`;
  if (viewer === "worker") {
    switch (kind) {
      case "INVITATION_RECEIVED": return { text: `${org} invited you to ${job}.`, href: "/jobs/invitations" };
      case "OFFER_RECEIVED": return { text: `${org} offered you a spot on ${job}.`, href: jobHref };
      case "NOT_SELECTED": return { text: `${org} didn't select you for ${job}. The reason is on the job.`, href: jobHref };
      case "INVITATION_WITHDRAWN": return { text: `${org} withdrew its invitation to ${job}.`, href: jobHref };
      case "JOB_CHANGED": return { text: `${org} edited ${job}. The job page lists what changed; if you were hired before a change to its terms, it also says whether you can leave with no penalty.`, href: jobHref };
      case "JOB_CLOSED":
        return {
          text: e.status === "WITHDRAWN" ? `${job} closed, so ${org}'s invitation was withdrawn.` : e.wasOffer ? `${job} closed, so ${org}'s offer was withdrawn.` : `${job} closed before a decision on your application.`,
          href: jobHref,
        };
      default: return { text: `An update on ${job}.`, href: jobHref };
    }
  }
  switch (kind) {
    case "APPLICATION_RECEIVED": return { text: `${who} applied to ${job}.`, href: personHref };
    case "CLAIM_RECEIVED": return { text: `${who} claimed a spot on ${job}.`, href: personHref };
    case "INVITATION_ACCEPTED": return { text: `${who} accepted the invitation to ${job}.`, href: personHref };
    case "INVITATION_DECLINED": return { text: `${who} declined the invitation to ${job}.`, href: personHref };
    case "OFFER_ACCEPTED": return { text: `${who} accepted the offer on ${job}.`, href: personHref };
    case "OFFER_DECLINED": return { text: `${who} declined the offer on ${job}.`, href: personHref };
    case "APPLICATION_WITHDRAWN": return { text: `${who} withdrew from ${job}.`, href: personHref };
    default: return { text: `An update on ${job}.`, href: personHref };
  }
}

/**
 * A pay notice's words (M9): about a dispute (its thread) or a payout
 * transfer (its receipt). A worker reads the organization; staff read the
 * worker's display name.
 */
export function payNoticeText(
  kind: NotificationKind,
  n: {
    dispute: { id: string; worker: { displayName: string }; shift: { engagement: { job: { title: string; org: { name: string } } } } } | null;
    transfer: { id: string; amountCents: number; worker: { displayName: string }; org: { name: string } } | null;
  },
  viewer: "worker" | "org"
): { text: string; href: string } | null {
  if (n.dispute) {
    const job = n.dispute.shift.engagement.job.title;
    const org = n.dispute.shift.engagement.job.org.name;
    const who = n.dispute.worker.displayName;
    const href = viewer === "worker" ? `/earnings/disputes/${n.dispute.id}` : `/pay/disputes/${n.dispute.id}`;
    if (viewer === "worker") {
      switch (kind) {
        case "DISPUTE_MESSAGE": return { text: `${org} replied on your pay dispute for ${job}.`, href };
        case "DISPUTE_RESOLVED": return { text: `${org} closed your pay dispute for ${job}. The outcome is on the thread.`, href };
        default: return { text: `An update on your pay dispute for ${job}.`, href };
      }
    }
    switch (kind) {
      case "DISPUTE_OPENED": return { text: `${who} disputed their pay for ${job}. First reply is due in 3 business days.`, href };
      case "DISPUTE_MESSAGE": return { text: `${who} wrote on their pay dispute for ${job}.`, href };
      case "DISPUTE_OVERDUE": return { text: `${who}'s pay dispute for ${job} is overdue.`, href };
      default: return { text: `An update on ${who}'s pay dispute for ${job}.`, href };
    }
  }
  if (n.transfer) {
    const amount = money(n.transfer.amountCents);
    if (viewer === "worker") {
      const href = `/earnings/receipts/${n.transfer.id}`;
      switch (kind) {
        case "PAYOUT_SENT": return { text: `${amount} from ${n.transfer.org.name} was sent to your account. Your receipt is ready.`, href };
        case "PAYOUT_REVERSED": return { text: `A ${amount} payment from ${n.transfer.org.name} was reversed. The receipt says what happened.`, href };
        default: return { text: `An update on a ${amount} payment from ${n.transfer.org.name}.`, href };
      }
    }
    return { text: `A ${amount} payment to ${n.transfer.worker.displayName}.`, href: "/pay?tab=paid" };
  }
  return null;
}
