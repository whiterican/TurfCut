import type { EngagementStatus } from "@/lib/engagements";

export const ENGAGEMENT_LABELS: Record<EngagementStatus, { label: string; badge: string }> = {
  APPLIED: { label: "Applied", badge: "badge-sky" },
  INVITED: { label: "Invited", badge: "badge-lime" },
  CLAIMED: { label: "Claimed", badge: "badge-mint" },
  ACTIVE: { label: "Active", badge: "badge-mint" },
  COMPLETED: { label: "Completed", badge: "badge-neutral" },
  CANCELLED: { label: "Cancelled", badge: "badge-neutral" },
};

export const JOB_STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  DRAFT: { label: "Draft", badge: "badge-dashed" },
  PUBLISHED: { label: "Published", badge: "badge-mint" },
  PAUSED: { label: "Paused", badge: "badge-butter" },
  CLOSED: { label: "Closed", badge: "badge-neutral" },
};
