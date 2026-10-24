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

export const COMPLIANCE_SECTORS: readonly ComplianceSector[] = ["political", "nonprofit", "private"];
export const COMMUNICATION_METHODS: readonly CommunicationMethod[] = ["in_person", "manual_voice", "automated_voice", "prerecorded_voice", "sms"];

/** Only explicit instants are accepted; never depend on the server's local zone. */
export function parseComplianceInstant(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return NaN;
  // Date.parse rolls impossible dates forward (02-30 becomes 03-02): require the calendar day to exist.
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() + 1 !== m || day.getUTCDate() !== d) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

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
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return { eligibleForReview: false, reasons: ["No valid compliance policy is on file."], policyVersion: null };
  if (!context || typeof context !== "object" || Array.isArray(context)) return { eligibleForReview: false, reasons: ["Work context is invalid."], policyVersion: null };
  const reasons: string[] = [];
  if ((typeof policy.id !== "string" || !policy.id.trim()) || !Number.isSafeInteger(policy.version) || policy.version < 1) {
    reasons.push("Compliance policy identity or version is invalid.");
  }
  if (policy.approved !== true) reasons.push("Compliance policy is not approved.");
  if (!(COMPLIANCE_ACTIVITIES as readonly string[]).includes(context.activity) ||
      !COMPLIANCE_SECTORS.includes(context.sector) ||
      !COMMUNICATION_METHODS.includes(context.method)) {
    reasons.push("Work classification or contact method is not supported.");
  }
  if (typeof context.jurisdiction !== "string" || !context.jurisdiction.trim() || context.jurisdiction !== context.jurisdiction.trim() ||
      typeof policy.jurisdiction !== "string" || !policy.jurisdiction.trim() || policy.jurisdiction !== policy.jurisdiction.trim() ||
      policy.jurisdiction !== context.jurisdiction ||
      policy.activity !== context.activity || policy.sector !== context.sector || policy.method !== context.method) {
    reasons.push("Compliance policy does not match this jurisdiction, sector, activity and method.");
  }
  const from = parseComplianceInstant(policy.effectiveAt);
  const until = parseComplianceInstant(policy.expiresAt);
  const now = at instanceof Date ? at.getTime() : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(from) || !Number.isFinite(until) || from >= until) {
    reasons.push("Compliance policy dates are invalid.");
  } else if (now < from || now >= until) {
    reasons.push("Compliance policy is not currently effective.");
  }
  if (!Array.isArray(policy.officialSources) || !policy.officialSources.length || policy.officialSources.some((s) => {
    try {
      if (typeof s !== "string") return true;
      const u = new URL(s);
      // A public https page: no credentials in the link (https://law.gov@evil.example),
      // no IP address and no single-label host.
      const host = u.hostname;
      const ip = /^\d+(\.\d+){3}$/.test(host) || host.startsWith("[");
      return u.protocol !== "https:" || !host || u.username !== "" || u.password !== "" || ip || !host.includes(".") || host.endsWith(".") || /^localhost\b|\.(local|localdomain|internal)$/i.test(host);
    } catch { return true; }
  })) {
    reasons.push("Compliance policy requires valid HTTPS source links.");
  }
  return { eligibleForReview: reasons.length === 0, reasons, policyVersion: Number.isSafeInteger(policy.version) ? policy.version : null };
}
