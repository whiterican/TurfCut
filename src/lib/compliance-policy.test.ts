import { describe, expect, it } from "vitest";
import { preflightCompliancePolicy, type ComplianceContext, type CompliancePolicy } from "./compliance-policy";

const context: ComplianceContext = { jurisdiction: "US-MD", sector: "political", activity: "door_canvassing", method: "in_person" };
const policy: CompliancePolicy = { id: "example", version: 1, ...context, approved: true, effectiveAt: "2026-01-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z", officialSources: ["https://www.law.cornell.edu/supremecourt/text/536/150"] };
const at = new Date("2026-10-23T15:00:00Z");
describe("policy metadata preflight; not actual legal permission", () => {
  it("fails closed without a policy", () => expect(preflightCompliancePolicy(context, null, at).eligibleForReview).toBe(false));
  it("accepts structurally complete current approval for further review only", () => expect(preflightCompliancePolicy(context, policy, at)).toEqual({ eligibleForReview: true, reasons: [], policyVersion: 1 }));
  it("requires exact work context", () => {
    expect(preflightCompliancePolicy({ ...context, jurisdiction: "US-VA" }, policy, at).eligibleForReview).toBe(false);
    expect(preflightCompliancePolicy({ ...context, activity: "door_sales" }, policy, at).eligibleForReview).toBe(false);
    expect(preflightCompliancePolicy({ ...context, method: "sms" }, policy, at).eligibleForReview).toBe(false);
  });
  it("rejects unapproved, expired, future and invalid date policies", () => {
    for (const p of [{ ...policy, approved: false }, { ...policy, expiresAt: "2026-10-01" }, { ...policy, effectiveAt: "2026-12-01" }, { ...policy, effectiveAt: "bad" }]) {
      expect(preflightCompliancePolicy(context, p, at).eligibleForReview).toBe(false);
    }
  });
  it("rejects missing source references and invalid policy identity", () => {
    expect(preflightCompliancePolicy(context, { ...policy, officialSources: [] }, at).eligibleForReview).toBe(false);
    expect(preflightCompliancePolicy(context, { ...policy, version: 0 }, at).eligibleForReview).toBe(false);
  });
});
