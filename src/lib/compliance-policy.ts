/**
 * Fail-closed, pure compliance preflight for future multi-sector job activities.
 * This is NOT wired into live publishing, scheduling, calling, or payments.
 * A legal reviewer must verify the underlying rule and approve its policy
 * record before this result could be used for any real-world authorization.
 */
export const COMPLIANCE_ACTIVITIES = [
  "petition_circulation",
  "door_canvassing",
  "nonprofit_fundraising",
  "door_sales",
  "phone_banking",
  "phone_polling",
  "door_polling",
  "polling_place_outreach",
] as const;

export type ComplianceActivity = (typeof COMPLIANCE_ACTIVITIES)[number];
export type ComplianceSector = "political" | "nonprofit" | "private";
export type CommunicationMethod = "in_person" | "manual_voice" | "automated_voice" | "prerecorded_voice" | "sms";

export interface CompliancePolicy {
  id: string;
  version: number;
  jurisdiction: string;
  activity: ComplianceActivity;
  sector: ComplianceSector;
  method: CommunicationMethod;
  /** Recorded review approval, not an automated inference from a URL. */
  approved: boolean;
  effectiveAt: string;
  expiresAt: string;
  officialSources: string[];
}

export interface ComplianceContext {
  jurisdiction: string;
  activity: ComplianceActivity;
  sector: ComplianceSector;
  method: CommunicationMethod;
}

export interface PolicyPreflight {
  eligibleForReview: boolean;
  reasons: string[];
  policyVersion: number | null;
}

/**
 * Returns whether policy metadata is complete and current. This is *not* a
 * legal permission-to-work decision or a substitute for runtime rules.
 */
export function preflightCompliancePolicy(
  context: ComplianceContext,
  policy: CompliancePolicy | null | undefined,
  at: Date = new Date(),
): PolicyPreflight {
  if (!policy) return { eligibleForReview: false, reasons: ["No approved compliance policy is on file."], policyVersion: null };
  const reasons: string[] = [];
  if (!policy.id.trim() || !Number.isSafeInteger(policy.version) || policy.version < 1) {
    reasons.push("Compliance policy identity or version is invalid.");
  }
  if (!policy.approved) reasons.push("Compliance policy is not approved.");
  if (!context.jurisdiction.trim() || policy.jurisdiction !== context.jurisdiction ||
      policy.activity !== context.activity || policy.sector !== context.sector || policy.method !== context.method) {
    reasons.push("Compliance policy does not match this jurisdiction, sector, activity and method.");
  }
  const from = Date.parse(policy.effectiveAt);
  const until = Date.parse(policy.expiresAt);
  const now = at.getTime();
  if (!Number.isFinite(now) || !Number.isFinite(from) || !Number.isFinite(until) || from >= until) {
    reasons.push("Compliance policy dates are invalid.");
  } else if (now < from || now >= until) {
    reasons.push("Compliance policy is not currently effective.");
  }
  if (!policy.officialSources.length || policy.officialSources.some((s) => {
    try {
      const u = new URL(s);
      return u.protocol !== "https:" || !u.hostname;
    } catch { return true; }
  })) {
    reasons.push("Compliance policy requires valid HTTPS source links.");
  }
  return { eligibleForReview: reasons.length === 0, reasons, policyVersion: Number.isSafeInteger(policy.version) ? policy.version : null };
}
