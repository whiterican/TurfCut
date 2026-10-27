/**
 * Future scheduling integration boundary: all required compliance checks must
 * pass before a shift is even eligible for legal / operational review.
 *
 * NOTE: this is deliberately not wired into production shift creation. The
 * underlying rule records are not yet stored, reviewed, or linked to jobs.
 * Never display this result as an unconditional determination of legality.
 */
import {
  preflightCompliancePolicy,
  type ComplianceContext,
  type CompliancePolicy,
} from "./compliance-policy";
import {
  checkApprovedShiftWindow,
  type ApprovedShiftWindow,
  type ShiftLegalityContext,
} from "./shift-legal-window";

export interface ProposedCompliantShift extends ShiftLegalityContext {
  sector: ComplianceContext["sector"];
  method: ComplianceContext["method"];
  /** The current policy is checked both now and throughout the entire shift. */
  startsAt: Date;
  endsAt: Date;
}

export interface ScheduleComplianceResult {
  readyForLegalReview: boolean;
  reasons: string[];
  policyId: string | null;
  policyVersion: number | null;
}

/**
 * Preserve the difference between "metadata and configured window passed"
 * and "this activity is legally permitted". A runtime scheduling block will
 * additionally require a signed-off rule store, legal applicability decisions,
 * worker agreement checks, permits, and other activity-specific predicates.
 */
export function preflightProposedShift(
  shift: ProposedCompliantShift,
  policy: CompliancePolicy | null,
  window: ApprovedShiftWindow | null,
  now = new Date(),
): ScheduleComplianceResult {
  if (!shift || typeof shift !== "object" || Array.isArray(shift) ||
      !(shift.startsAt instanceof Date) || !Number.isFinite(shift.startsAt.getTime()) ||
      !(shift.endsAt instanceof Date) || !Number.isFinite(shift.endsAt.getTime()) ||
      shift.endsAt <= shift.startsAt) {
    return { readyForLegalReview: false, reasons: ["Shift start and end must form a valid positive interval."], policyId: null, policyVersion: null };
  }
  const context: ComplianceContext = {
    jurisdiction: shift.jurisdiction,
    sector: shift.sector,
    activity: shift.activity as ComplianceContext["activity"],
    method: shift.method,
  };
  const atNow = preflightCompliancePolicy(context, policy, now);
  const atStart = preflightCompliancePolicy(context, policy, shift.startsAt);
  const atEnd = preflightCompliancePolicy(
    context, policy, new Date(shift.endsAt.getTime() - 1),
  );
  const hours = checkApprovedShiftWindow(shift, window, now);
  const reasons = [...new Set([
    ...atNow.reasons,
    ...atStart.reasons.map((r) => `Shift start: ${r}`),
    ...atEnd.reasons.map((r) => `Shift end: ${r}`),
    ...hours.reasons,
  ])];
  return {
    readyForLegalReview: reasons.length === 0,
    reasons,
    policyId: typeof policy?.id === "string" && policy.id.trim() ? policy.id : null,
    policyVersion: policy?.version ?? null,
  };
}
