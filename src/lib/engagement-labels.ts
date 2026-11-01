import { inviteLapsed, offerLapsed, stageOf, type EngagementEventType, type EngagementStatus } from "@/lib/engagements";
import type { Status } from "@/lib/status";

/**
 * Engagement and job statuses (redesign §4.1.3). The words are unchanged;
 * the state picks glyph and colour, and none of them is live (a hire is not
 * a shift under way). Each has its own glyph, so a status never reads as a
 * campaign's party chip beside it.
 */
export const ENGAGEMENT_LABELS: Record<EngagementStatus, Status> = {
  APPLIED: { label: "Applied", state: "pending" },
  INVITED: { label: "Invited", state: "pending" },
  CLAIMED: { label: "Claimed", state: "approved" },
  ACTIVE: { label: "Active", state: "approved" },
  COMPLETED: { label: "Completed", state: "closed" },
  CANCELLED: { label: "Cancelled", state: "closed" },
  // C3: an offer waits on the worker (pending, not settled); declined and withdrawn never began.
  OFFERED: { label: "Offered", state: "pending" },
  DECLINED: { label: "Declined", state: "closed" },
  WITHDRAWN: { label: "Withdrawn", state: "closed" },
};

export const JOB_STATUS_LABELS: Record<"DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED", Status> = {
  DRAFT: { label: "Draft", state: "draft" },
  PUBLISHED: { label: "Published", state: "approved" },
  PAUSED: { label: "Paused", state: "held" },
  CLOSED: { label: "Closed", state: "closed" },
};

/**
 * An engagement's status as a chip: the worker's-words stage (stageOf) and a
 * state that matches it. A lapsed offer or invitation is over, so it reads
 * closed, never as still waiting.
 */
export function engagementStatus(
  e: { status: EngagementStatus; inviteExpiresAt: Date | null },
  facts: { events: Array<{ type: EngagementEventType }>; offerExpiresAt: Date | null },
  now: Date
): Status {
  const lapsed = offerLapsed(e.status, facts.offerExpiresAt, now) || inviteLapsed(e.status, e.inviteExpiresAt, now);
  return { label: stageOf(e, facts, now), state: lapsed ? "closed" : ENGAGEMENT_LABELS[e.status].state };
}
