import type { EngagementStatus } from "@/lib/engagements";

/**
 * These sit next to party chips on job screens, where a pastel fill means a
 * campaign's declared party: only Claimed/Active take a colour (solid, which
 * no party uses); waiting states are plain or dashed.
 */
export const ENGAGEMENT_LABELS: Record<EngagementStatus, { label: string; badge: string }> = {
  APPLIED: { label: "Applied", badge: "badge-neutral" },
  INVITED: { label: "Invited", badge: "badge-dashed" },
  CLAIMED: { label: "Claimed", badge: "badge-solid" },
  ACTIVE: { label: "Active", badge: "badge-solid" },
  COMPLETED: { label: "Completed", badge: "badge-neutral" },
  CANCELLED: { label: "Cancelled", badge: "badge-neutral" },
};

export const JOB_STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  DRAFT: { label: "Draft", badge: "badge-dashed" },
  PUBLISHED: { label: "Published", badge: "badge-solid" },
  PAUSED: { label: "Paused", badge: "badge-butter" },
  CLOSED: { label: "Closed", badge: "badge-neutral" },
};

/**
 * A status chip shown on a job page, beside the campaign's party chip: solid
 * and dashed stay; a pastel (sky, butter, coral, lime) becomes plain, so no
 * status reads as a party. The words carry the meaning.
 */
export const jobPageBadge = (badge: string) => (badge === "badge-solid" || badge === "badge-dashed" ? badge : "badge-neutral");
