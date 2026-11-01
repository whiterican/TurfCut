import { describe, expect, it } from "vitest";
import { ENGAGEMENT_LABELS, engagementStatus, JOB_STATUS_LABELS } from "@/lib/engagement-labels";

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
  it("a lapsed offer or invitation reads closed with its own words, never still waiting", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const past = new Date("2026-10-19T12:00:00Z");
    const later = new Date("2026-10-21T12:00:00Z");
    const none = { events: [], offerExpiresAt: null };
    expect(engagementStatus({ status: "OFFERED", inviteExpiresAt: null }, { events: [], offerExpiresAt: past }, now)).toEqual({ label: "Offer expired", state: "closed" });
    expect(engagementStatus({ status: "OFFERED", inviteExpiresAt: null }, { events: [], offerExpiresAt: later }, now)).toEqual({ label: "Offer", state: "pending" });
    expect(engagementStatus({ status: "INVITED", inviteExpiresAt: past }, none, now)).toEqual({ label: "Invitation expired", state: "closed" });
    expect(engagementStatus({ status: "INVITED", inviteExpiresAt: later }, none, now)).toEqual({ label: "Invited", state: "pending" });
    expect(engagementStatus({ status: "ACTIVE", inviteExpiresAt: past }, none, now)).toEqual({ label: "Active", state: "approved" });
    expect(engagementStatus({ status: "WITHDRAWN", inviteExpiresAt: null }, { events: [{ type: "INVITE_WITHDRAWN" }], offerExpiresAt: null }, now)).toEqual({ label: "Invitation withdrawn", state: "closed" });
    expect(engagementStatus({ status: "APPLIED", inviteExpiresAt: null }, { events: [{ type: "IN_REVIEW" }], offerExpiresAt: null }, now)).toEqual({ label: "In review", state: "pending" });
  });
});
