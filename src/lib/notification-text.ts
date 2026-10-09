import type { NotificationKind } from "@prisma/client";

/**
 * A notice's words and where it leads (C3.5), drawn from the engagement as
 * the recipient may see it: a worker reads the organization and job, the
 * organization's staff read the worker's display name and job.
 */
export function notificationText(
  kind: NotificationKind,
  e: { id: string; jobId: string; worker: { displayName: string }; job: { title: string; org: { name: string } } },
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
      case "OFFER_RECEIVED": return { text: `${org} offered you a spot on ${job}. Answer within 48 hours.`, href: jobHref };
      case "NOT_SELECTED": return { text: `${org} didn't select you for ${job}. The reason is on the job.`, href: jobHref };
      case "INVITATION_WITHDRAWN": return { text: `${org} withdrew its invitation to ${job}.`, href: jobHref };
      case "JOB_CLOSED": return { text: `${job} closed before a decision on your application or invitation.`, href: jobHref };
      default: return { text: `An update on ${job}.`, href: jobHref };
    }
  }
  switch (kind) {
    case "APPLICATION_RECEIVED": return { text: `${who} applied to ${job}.`, href: personHref };
    case "CLAIM_RECEIVED": return { text: `${who} claimed a spot on ${job}.`, href: personHref };
    case "INVITATION_ACCEPTED": return { text: `${who} accepted your invitation to ${job}.`, href: personHref };
    case "INVITATION_DECLINED": return { text: `${who} declined your invitation to ${job}.`, href: personHref };
    case "OFFER_ACCEPTED": return { text: `${who} accepted your offer on ${job}.`, href: personHref };
    case "OFFER_DECLINED": return { text: `${who} declined your offer on ${job}.`, href: personHref };
    case "APPLICATION_WITHDRAWN": return { text: `${who} withdrew from ${job}.`, href: personHref };
    default: return { text: `An update on ${job}.`, href: personHref };
  }
}
