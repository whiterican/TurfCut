import { describe, expect, it } from "vitest";
import { preflightProposedShift } from "./shift-compliance";
import type { CompliancePolicy } from "./compliance-policy";
import type { ApprovedShiftWindow } from "./shift-legal-window";

const policy: CompliancePolicy = {
  id: "example-policy", version: 3, jurisdiction: "EXAMPLE-LOCALITY",
  sector: "private", activity: "door_sales", method: "in_person",
  approved: true, effectiveAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-01T00:00:00Z",
  officialSources: ["https://www.ftc.gov/legal-library/browse/rules/cooling-period-sales-made-home-or-other-locations"],
};
const window: ApprovedShiftWindow = {
  jurisdiction: policy.jurisdiction, activity: policy.activity,
  timezone: "America/New_York", localStart: "09:00", localEnd: "20:00",
  allowedWeekdays: [1, 2, 3, 4, 5, 6], approved: true,
  expiresAt: policy.expiresAt, blockedDates: [],
};
const now = new Date("2026-10-23T12:00:00Z");
const shift = (start: string, end: string) => ({
  jurisdiction: policy.jurisdiction, sector: policy.sector,
  activity: policy.activity, method: policy.method,
  startsAt: new Date(start), endsAt: new Date(end),
});
describe("combined compliance review preflight; not legal permission", () => {
  const within = shift("2026-10-26T14:00:00Z", "2026-10-26T18:00:00Z");
  it("blocks when either policy or window rule is unavailable", () => {
    expect(preflightProposedShift(within, null, window, now).readyForLegalReview).toBe(false);
    expect(preflightProposedShift(within, policy, null, now).readyForLegalReview).toBe(false);
  });
  it("accepts a fully scoped example for further review only", () => {
    expect(preflightProposedShift(within, policy, window, now)).toEqual({
      readyForLegalReview: true, reasons: [], policyId: "example-policy", policyVersion: 3,
    });
  });
  it("rejects a wrong work activity or method", () => {
    expect(preflightProposedShift({ ...within, activity: "door_polling" }, policy, window, now).readyForLegalReview).toBe(false);
    expect(preflightProposedShift({ ...within, method: "manual_voice" }, policy, window, now).readyForLegalReview).toBe(false);
  });
  it("rejects after-hours work regardless of policy metadata approval", () => {
    const late = shift("2026-10-26T23:00:00Z", "2026-10-27T01:00:00Z");
    expect(preflightProposedShift(late, policy, window, now).readyForLegalReview).toBe(false);
  });
  it("blocks rules that expire before the requested shift", () => {
    const expiring = { ...policy, expiresAt: "2026-10-26T15:00:00Z" };
    expect(preflightProposedShift(within, expiring, window, now).readyForLegalReview).toBe(false);
  });
  it("blocks missing approval and invalid time intervals", () => {
    expect(preflightProposedShift(within, { ...policy, approved: false }, window, now).readyForLegalReview).toBe(false);
    expect(preflightProposedShift(shift("bad", "2026-10-26T18:00:00Z"), policy, window, now).readyForLegalReview).toBe(false);
  });
});
