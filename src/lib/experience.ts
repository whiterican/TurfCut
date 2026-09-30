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

// Spec p.9 experience taxonomy. Wording needs review with pilot companies.
export const EXPERIENCE_GROUPS = [
  { value: "door_to_door", label: "Door-to-door" },
  { value: "petition_circulation", label: "Petition circulation" },
  { value: "polling_research", label: "Polling + research" },
  { value: "cold_calls", label: "Cold calls" },
  { value: "digital_outreach", label: "Digital outreach" },
  { value: "field_leadership", label: "Field leadership" },
] as const;

export const CAMPAIGN_TYPES = [
  { value: "candidate", label: "Candidate" },
  { value: "party", label: "Party" },
  { value: "issue_advocacy", label: "Issue advocacy" },
  { value: "ballot_initiative", label: "Ballot initiative" },
  { value: "referendum", label: "Referendum" },
  { value: "candidate_nomination", label: "Candidate nomination petition" },
  { value: "recall", label: "Recall" },
  { value: "local_measure", label: "Local measure" },
  { value: "polling_research", label: "Polling / research" },
  { value: "nonprofit", label: "Nonprofit / civic" },
] as const;

export const CHANNELS = [
  { value: "door", label: "Door-to-door" },
  { value: "public_intercept", label: "Public intercept / tabling" },
  { value: "phone", label: "Phone" },
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "virtual", label: "Virtual" },
] as const;

export const TURF_TYPES = ["urban", "suburban", "rural"] as const;

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS",
  "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC",
  "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

export interface ExperienceInput {
  // Campaign
  organizationName: string | null;
  campaign: string;
  campaignType: string | null;
  experienceGroup: string;
  role: string;
  channel: string | null;
  // Where
  state: string | null;
  countyOrDistrict: string | null;
  turfType: string | null;
  // When
  startDate: Date;
  endDate: Date | null;
  completedShifts: number | null;
  activeHours: number | null;
  // What
  unitType: UnitType;
  unitCount: number;
  approvedCount: number | null;
  // Proof
  referenceContact: string | null;
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

  const optionalText = (k: string, max: number, label: string): string | null => {
    const v = str(k);
    if (!v) return null;
    if (v.length > max) errors[k] = `${label}: keep it under ${max} characters.`;
    return v;
  };
  const optionalChoice = (k: string, list: readonly string[], message: string): string | null => {
    const v = str(k);
    if (!v) return null;
    if (!list.includes(v)) errors[k] = message;
    return v;
  };
  const optionalInt = (k: string, max: number, message: string): number | null => {
    const v = str(k);
    if (!v) return null;
    if (!/^\d+$/.test(v) || Number(v) > max) errors[k] = message;
    return Number(v);
  };
  const values = (xs: readonly { value: string }[]) => xs.map((x) => x.value);

  const organizationName = optionalText("organizationName", 200, "Organization");
  const campaignType = optionalChoice("campaignType", values(CAMPAIGN_TYPES), "Pick a campaign type from the list.");
  const channel = optionalChoice("channel", values(CHANNELS), "Pick a channel from the list.");
  const state = optionalChoice("state", US_STATES, "Pick a US state.");
  const countyOrDistrict = optionalText("countyOrDistrict", 100, "County or district");
  const turfType = optionalChoice("turfType", TURF_TYPES, "Pick urban, suburban or rural.");
  const completedShifts = optionalInt("completedShifts", 10_000, "Enter a whole number of shifts (10,000 max).");
  const approvedCount = optionalInt("approvedCount", 1_000_000, "Enter a whole number from 0 to 1,000,000.");
  const referenceContact = optionalText("referenceContact", 200, "Reference");

  let activeHours: number | null = null;
  if (str("activeHours")) {
    activeHours = Number(str("activeHours"));
    if (!/^\d+(\.\d{1,2})?$/.test(str("activeHours")) || activeHours > 100_000) {
      errors.activeHours = "Enter hours as a number, e.g. 42 or 42.5.";
    }
  }

  const experienceGroup = str("experienceGroup");
  if (!values(EXPERIENCE_GROUPS).includes(experienceGroup)) errors.experienceGroup = "Pick the kind of work.";

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

  if (approvedCount !== null && !errors.unitCount && !errors.approvedCount && approvedCount > unitCount) {
    errors.approvedCount = "Approved output can't be more than submitted output.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      organizationName,
      campaign,
      campaignType,
      experienceGroup,
      role,
      channel,
      state,
      countyOrDistrict,
      turfType,
      startDate: startDate!,
      endDate,
      completedShifts,
      activeHours,
      unitType,
      unitCount,
      approvedCount,
      referenceContact,
    },
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
