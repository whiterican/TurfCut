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
  it("rejects unsupported classifications even when a supplied policy repeats them", () => {
    const unknown = { ...context, activity: "future_unreviewed_activity" } as unknown as ComplianceContext;
    const fabricated = { ...policy, activity: unknown.activity };
    expect(preflightCompliancePolicy(unknown, fabricated, at).eligibleForReview).toBe(false);
    const invalidMethod = { ...context, method: "new_technology" } as unknown as ComplianceContext;
    expect(preflightCompliancePolicy(invalidMethod, { ...policy, method: invalidMethod.method }, at).eligibleForReview).toBe(false);
  });
  it("fails closed on malformed source collections at runtime", () => {
    const malformed = { ...policy, officialSources: null } as unknown as CompliancePolicy;
    expect(preflightCompliancePolicy(context, malformed, at).eligibleForReview).toBe(false);
    expect(preflightCompliancePolicy(context, { ...policy, officialSources: [42] as unknown as string[] }, at).eligibleForReview).toBe(false);
  });

  it("rejects truthy nonboolean approval, invalid contexts, malformed identifiers and ambiguous dates", () => {
    for (const approved of ["false", 1, {}]) {
      expect(preflightCompliancePolicy(context, { ...policy, approved } as unknown as CompliancePolicy, at).eligibleForReview).toBe(false);
    }
    for (const broken of [null, [], { ...policy, id: 42 }, { ...policy, id: null }]) {
      expect(preflightCompliancePolicy(context, broken as unknown as CompliancePolicy, at).eligibleForReview).toBe(false);
    }
    expect(preflightCompliancePolicy(null as unknown as ComplianceContext, policy, at).eligibleForReview).toBe(false);
    expect(preflightCompliancePolicy({ ...context, jurisdiction: " US-MD" }, { ...policy, jurisdiction: " US-MD" }, at).eligibleForReview).toBe(false);
    for (const timestamp of ["2027", "10/24/2026", "2026-10-23T23:00", "2026-10-27"]) {
      expect(preflightCompliancePolicy(context, { ...policy, expiresAt: timestamp }, at).eligibleForReview).toBe(false);
    }
  });

  it("accepts only public https source pages", () => {
    for (const bad of ["https://x", "https://law.cornell.edu@evil.example/x", "https://127.0.0.1/", "https://[::1]/", "http://www.ftc.gov/x"]) {
      expect(preflightCompliancePolicy(context, { ...policy, officialSources: [bad] }, at).eligibleForReview, bad).toBe(false);
    }
  });
});
