import { describe, expect, it } from "vitest";
import { ENGAGEMENT_LABELS, JOB_STATUS_LABELS, jobPageBadge } from "@/lib/engagement-labels";

describe("status chips beside a party chip", () => {
  it("a pastel status becomes plain on a job page; solid and dashed stay", () => {
    for (const b of ["badge-sky", "badge-butter", "badge-coral", "badge-accent"]) expect(jobPageBadge(b)).toBe("badge-neutral");
    expect(jobPageBadge("badge-solid")).toBe("badge-solid");
    expect(jobPageBadge("badge-dashed")).toBe("badge-dashed");
  });
  it("engagement statuses never use a pastel fill", () => {
    for (const { badge } of Object.values(ENGAGEMENT_LABELS)) expect(["badge-solid", "badge-dashed", "badge-neutral"]).toContain(badge);
  });
  it("a paused job reads plain on its page", () => {
    expect(jobPageBadge(JOB_STATUS_LABELS.PAUSED.badge)).toBe("badge-neutral");
  });
});
