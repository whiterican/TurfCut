import { describe, expect, it } from "vitest";
import { ENGAGEMENT_LABELS, JOB_STATUS_LABELS } from "@/lib/engagement-labels";

describe("engagement and job statuses", () => {
  it("no hire or job status is ever live (live is a shift under way)", () => {
    for (const s of [...Object.values(ENGAGEMENT_LABELS), ...Object.values(JOB_STATUS_LABELS)]) expect(s.state).not.toBe("live");
  });
  it("waiting states read as pending, ended ones as closed", () => {
    expect(ENGAGEMENT_LABELS.APPLIED.state).toBe("pending");
    expect(ENGAGEMENT_LABELS.OFFERED.state).toBe("pending");
    expect(ENGAGEMENT_LABELS.ACTIVE.state).toBe("approved");
    expect(ENGAGEMENT_LABELS.WITHDRAWN.state).toBe("closed");
    expect(JOB_STATUS_LABELS.DRAFT.state).toBe("draft");
    expect(JOB_STATUS_LABELS.PAUSED.state).toBe("held");
  });
});
