/**
 * Profile builder: experience records and their verification levels.
 *
 * - A worker can only ever create SELF_REPORTED records. PLATFORM,
 *   ORGANIZATION and IMPORTED are set by Turfcut, a hiring org, or an import.
 * - SELF_REPORTED records are shown on the profile but never counted in
 *   verified totals.
 * - Verified records are locked: the worker can't edit or remove them, since
 *   that would silently change what someone else vouched for.
 */

export type VerificationLevel =
  | "PLATFORM"
  | "ORGANIZATION"
  | "IMPORTED"
  | "SELF_REPORTED";

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  PLATFORM: "Verified by Turfcut",
  ORGANIZATION: "Verified by organization",
  IMPORTED: "Imported record",
  SELF_REPORTED: "Self-reported",
};

export const UNIT_TYPES = [
  "signatures",
  "doors",
  "contacts",
  "calls",
  "shifts",
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export interface ExperienceInput {
  campaign: string;
  role: string;
  startDate: Date;
  endDate: Date | null;
  unitType: UnitType;
  unitCount: number;
}

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(v: string): Date | null {
  if (!DATE_RE.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v
    ? null
    : d;
}

/**
 * Validates a worker-submitted experience record. Deliberately has no
 * verificationLevel field: whatever the form sends, the record is
 * SELF_REPORTED.
 */
export function validateExperience(
  raw: Record<string, unknown>,
  today: Date = new Date()
): Validated<ExperienceInput> {
  const errors: Record<string, string> = {};
  const str = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");

  const campaign = str("campaign");
  if (!campaign) errors.campaign = "Campaign is required.";
  else if (campaign.length > 200) errors.campaign = "Keep it under 200 characters.";

  const role = str("role");
  if (!role) errors.role = "Role is required.";
  else if (role.length > 100) errors.role = "Keep it under 100 characters.";

  const startDate = parseDate(str("startDate"));
  if (!startDate) errors.startDate = "Start date is required (YYYY-MM-DD).";
  else if (startDate > today) errors.startDate = "Start date can't be in the future.";

  let endDate: Date | null = null;
  if (str("endDate")) {
    endDate = parseDate(str("endDate"));
    if (!endDate) errors.endDate = "End date must be YYYY-MM-DD, or left blank if ongoing.";
    else if (startDate && endDate < startDate) errors.endDate = "End date is before the start date.";
  }

  const unitType = str("unitType") as UnitType;
  if (!UNIT_TYPES.includes(unitType)) errors.unitType = "Pick a unit type.";

  const countStr = str("unitCount");
  const unitCount = Number(countStr);
  if (!/^\d+$/.test(countStr) || !Number.isSafeInteger(unitCount) || unitCount > 1_000_000) {
    errors.unitCount = "Enter a whole number from 0 to 1,000,000.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { campaign, role, startDate: startDate!, endDate, unitType, unitCount },
  };
}

export function isVerified(level: VerificationLevel): boolean {
  return level !== "SELF_REPORTED";
}

/** Workers may only change records nobody else has vouched for. */
export function workerCanModify(level: VerificationLevel): boolean {
  return level === "SELF_REPORTED";
}

export interface ExperienceTotals {
  /** Units per type from PLATFORM / ORGANIZATION / IMPORTED records. */
  verified: Record<string, number>;
  /** Units per type from SELF_REPORTED records — shown, never added to verified. */
  selfReported: Record<string, number>;
  verifiedRecords: number;
  selfReportedRecords: number;
}

export function experienceTotals(
  records: Array<{ unitType: string; unitCount: number; verificationLevel: VerificationLevel }>
): ExperienceTotals {
  const t: ExperienceTotals = {
    verified: {},
    selfReported: {},
    verifiedRecords: 0,
    selfReportedRecords: 0,
  };
  for (const r of records) {
    const bucket = isVerified(r.verificationLevel) ? t.verified : t.selfReported;
    bucket[r.unitType] = (bucket[r.unitType] ?? 0) + r.unitCount;
    if (isVerified(r.verificationLevel)) t.verifiedRecords++;
    else t.selfReportedRecords++;
  }
  return t;
}
