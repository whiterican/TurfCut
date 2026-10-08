/**
 * Jobs: validation, campaign disclosure, the publish gate, job-card answers
 * and worker-side exclusions. Pure functions — no database access.
 *
 * Rules (CLAUDE.md + spec pp. 7, 11, 13–15):
 * - Jurisdiction hard stop: a job cannot publish with an unknown, unapproved,
 *   superseded, not-yet-effective or expired rule profile. Every blocking
 *   reason is returned, in plain language — never a silent default.
 * - Compensation: hourly is always allowed; shift-rate only where the
 *   jurisdiction lists it; per-unit only where it is listed AND the profile
 *   explicitly allows per-unit pay.
 * - No job publishes until the organization is approved, has signed the
 *   contractor terms and has completed its classification review.
 * - Campaigns disclose affiliation, issues and message (spec p.14) using the
 *   same option lists workers answer with, so overlap is a direct comparison
 *   and nothing about a worker is ever inferred.
 */
import type { Validated } from "@/lib/experience";
import {
  boundaryText,
  CAMPAIGN_TYPES as FIT_CAMPAIGN_TYPES,
  ISSUES,
  PARTIES,
  type FitPreferences,
  type IssueKey,
} from "@/lib/political-fit";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export const JOB_TYPES = [
  { value: "PETITION", label: "Petition circulation" },
  { value: "CANVASS", label: "Door-to-door canvass" },
] as const;

export const COMPENSATION_METHODS = [
  { value: "HOURLY", label: "Hourly" },
  { value: "SHIFT_RATE", label: "Per shift" },
  { value: "PER_UNIT", label: "Per accepted unit" },
] as const;

export const HIRING_MODES = [
  { value: "application", label: "Workers apply" },
  { value: "invite", label: "We invite workers" },
  { value: "instant_claim", label: "Instant claim (first come, up to headcount)" },
] as const;

/** Campaign affiliation a job discloses: a party, or none. */
export const AFFILIATIONS = ["nonpartisan", ...PARTIES] as const;

export type JobType = (typeof JOB_TYPES)[number]["value"];
export type CompensationMethod = (typeof COMPENSATION_METHODS)[number]["value"];
export type HiringMode = (typeof HIRING_MODES)[number]["value"];
export type Affiliation = (typeof AFFILIATIONS)[number];
export type CampaignType = (typeof FIT_CAMPAIGN_TYPES)[number]["value"];

export interface JobDisclosure {
  campaignType: CampaignType;
  affiliation: Affiliation;
  /** Candidate or measure name, if any. */
  campaignName: string | null;
  /** Positions the campaign takes publicly. */
  issues: Partial<Record<IssueKey, "support" | "oppose">>;
  message: string;
}

export interface SupportContacts {
  emergency: string;
  disputes: string;
  lostMaterials: string;
}

export interface JobRequirements {
  badge: boolean;
  registration: boolean;
  affidavit: boolean;
  training: string | null;
  script: string | null;
}

export interface JobInput {
  type: JobType;
  title: string;
  description: string | null;
  jurisdictionId: string;
  startsAt: Date;
  endsAt: Date;
  city: string;
  state: string;
  compensationMethod: CompensationMethod;
  payRateCents: number;
  headcount: number;
  hiringModes: HiringMode[];
  requirements: JobRequirements;
  disclosure: JobDisclosure;
  supportContacts: SupportContacts;
  measureIds: string[];
  cancellationNoticeHours: number;
}

// ---------------------------------------------------------------------------
// Validation (form → JobInput)
// ---------------------------------------------------------------------------

const values = (xs: readonly { value: string }[]) => xs.map((x) => x.value) as readonly string[];
const ISSUE_KEYS = ISSUES.map((i) => i.key) as readonly string[];
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(raw: Record<string, unknown>, k: string): string {
  const v = raw[k];
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
}

const checked = (v: unknown) => v === true || v === "on" || v === "true";

function list(raw: Record<string, unknown>, k: string): string[] {
  const v = raw[k];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return typeof v === "string" && v ? [v] : [];
}

/**
 * Validates the job builder's submission. `raw` is FormData flattened with
 * repeated keys as arrays (see formToObject). Issue positions arrive as
 * `issue_<key>` = "support" | "oppose" | "".
 */
export function validateJob(raw: Record<string, unknown>): Validated<JobInput> {
  const errors: Record<string, string> = {};
  const need = (k: string, label: string, max: number) => {
    const v = text(raw, k);
    if (!v) errors[k] = `${label} is required.`;
    else if (v.length > max) errors[k] = `${label}: keep it under ${max} characters.`;
    return v;
  };

  const type = text(raw, "type");
  if (!values(JOB_TYPES).includes(type)) errors.type = "Pick petition or canvass.";
  const title = need("title", "Title", 120);
  const description = text(raw, "description") || null;
  if (description && description.length > 2000) errors.description = "Keep the description under 2,000 characters.";
  const jurisdictionId = text(raw, "jurisdictionId");
  if (!UUID_RE.test(jurisdictionId)) errors.jurisdictionId = "Pick a jurisdiction.";

  const date = (k: string, label: string) => {
    const v = text(raw, k);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
    if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
      errors[k] = `${label} is required (YYYY-MM-DD).`;
      return null;
    }
    return d;
  };
  const startsAt = date("startsAt", "Start date");
  const endsAt = date("endsAt", "End date");
  if (startsAt && endsAt && endsAt < startsAt) errors.endsAt = "End date is before the start date.";

  const city = need("city", "City", 80);
  const state = text(raw, "state").toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) errors.state = "Use a two-letter state code.";

  const compensationMethod = text(raw, "compensationMethod");
  if (!values(COMPENSATION_METHODS).includes(compensationMethod)) errors.compensationMethod = "Pick how workers are paid.";
  const rate = text(raw, "payRate");
  let payRateCents = 0;
  if (!/^\d+(\.\d{1,2})?$/.test(rate) || Number(rate) <= 0 || Number(rate) > 10_000) {
    errors.payRate = "Enter the gross rate in dollars, e.g. 25 or 25.50.";
  } else payRateCents = Math.round(Number(rate) * 100);

  const headcountStr = text(raw, "headcount");
  const headcount = Number(headcountStr);
  if (!/^\d+$/.test(headcountStr) || headcount < 1 || headcount > 10_000) errors.headcount = "Enter how many workers you need (1–10,000).";

  const hiringModes = [...new Set(list(raw, "hiringModes"))];
  if (hiringModes.length === 0 || !hiringModes.every((m) => values(HIRING_MODES).includes(m))) {
    errors.hiringModes = "Pick at least one way to hire.";
  }

  const training = text(raw, "training") || null;
  const script = text(raw, "script") || null;
  if (training && training.length > 120) errors.training = "Keep the training name under 120 characters.";
  if (script && script.length > 4000) errors.script = "Keep the script under 4,000 characters.";

  // Disclosure
  const campaignType = text(raw, "campaignType");
  if (!values(FIT_CAMPAIGN_TYPES).includes(campaignType)) errors.campaignType = "Pick the campaign type.";
  const affiliation = text(raw, "affiliation");
  if (!(AFFILIATIONS as readonly string[]).includes(affiliation)) errors.affiliation = "Pick the campaign's affiliation.";
  const campaignName = text(raw, "campaignName") || null;
  if (campaignName && campaignName.length > 120) errors.campaignName = "Keep the name under 120 characters.";
  const issues: JobDisclosure["issues"] = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith("issue_") || v === "" || v === undefined) continue;
    const key = k.slice("issue_".length);
    if (!ISSUE_KEYS.includes(key) || (v !== "support" && v !== "oppose")) errors.issues = "Pick support or oppose for each disclosed issue.";
    else issues[key as IssueKey] = v;
  }
  const message = need("message", "Campaign message", 500);

  const supportContacts = {
    emergency: need("contactEmergency", "Emergency contact", 200),
    disputes: need("contactDisputes", "Disputes contact", 200),
    lostMaterials: need("contactLostMaterials", "Lost-materials contact", 200),
  };

  const measureIds = [
    ...new Set(
      text(raw, "measureIds")
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean)
    ),
  ];
  if (measureIds.some((m) => m.length > 40) || measureIds.length > 20) errors.measureIds = "Up to 20 measure IDs, comma-separated.";

  const noticeStr = text(raw, "cancellationNoticeHours") || "24";
  const cancellationNoticeHours = Number(noticeStr);
  if (!/^\d+$/.test(noticeStr) || cancellationNoticeHours > 168) errors.cancellationNoticeHours = "Enter 0–168 hours.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      type: type as JobType,
      title,
      description,
      jurisdictionId,
      startsAt: startsAt!,
      endsAt: endsAt!,
      city,
      state,
      compensationMethod: compensationMethod as CompensationMethod,
      payRateCents,
      headcount,
      hiringModes: hiringModes as HiringMode[],
      requirements: {
        // A checked form box ("on"), or true from a JSON client.
        badge: checked(raw.badge),
        registration: checked(raw.registration),
        affidavit: checked(raw.affidavit),
        training,
        script,
      },
      disclosure: {
        campaignType: campaignType as CampaignType,
        affiliation: affiliation as Affiliation,
        campaignName,
        issues,
        message,
      },
      supportContacts,
      measureIds,
      cancellationNoticeHours,
    },
  };
}

/** FormData → plain object; repeated keys become arrays. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    if (k in out) out[k] = ([] as unknown[]).concat(out[k], v);
    else out[k] = v;
  }
  for (const k of ["hiringModes"]) if (typeof out[k] === "string") out[k] = [out[k]];
  return out;
}

// ---------------------------------------------------------------------------
// Reading stored JSON (tolerant of M0 seed shapes; never invents values)
// ---------------------------------------------------------------------------

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export function readDisclosure(v: unknown): JobDisclosure | null {
  const o = obj(v);
  if (!str(o.campaignType) || !str(o.affiliation) || !str(o.message)) return null;
  const issues: JobDisclosure["issues"] = {};
  for (const [k, side] of Object.entries(obj(o.issues))) {
    if (ISSUE_KEYS.includes(k) && (side === "support" || side === "oppose")) issues[k as IssueKey] = side;
  }
  return {
    campaignType: o.campaignType as CampaignType,
    affiliation: o.affiliation as Affiliation,
    campaignName: str(o.campaignName),
    issues,
    message: o.message as string,
  };
}

export function readSupportContacts(v: unknown): SupportContacts | null {
  const o = obj(v);
  const e = str(o.emergency), d = str(o.disputes), l = str(o.lostMaterials);
  return e && d && l ? { emergency: e, disputes: d, lostMaterials: l } : null;
}

export function readRequirements(v: unknown): JobRequirements {
  const o = obj(v);
  return {
    badge: o.badge === true,
    registration: o.registration === true,
    affidavit: o.affidavit === true,
    training: str(o.training),
    script: str(o.script),
  };
}

/** M0 seed stored `{ mode: "application" }`; M2 stores `{ modes: [...] }`. */
export function readHiringModes(v: unknown): HiringMode[] {
  const o = obj(v);
  const raw = Array.isArray(o.modes) ? o.modes : typeof o.mode === "string" ? [o.mode] : [];
  return raw.filter((m): m is HiringMode => values(HIRING_MODES).includes(m as string));
}

// ---------------------------------------------------------------------------
// Jurisdiction + publish gate
// ---------------------------------------------------------------------------

export interface JurisdictionFacts {
  state: string;
  locality: string | null;
  version: number;
  approved: boolean;
  isCurrent: boolean;
  effectiveFrom: Date | null;
  approvalExpiresAt: Date | null;
  rules: unknown;
}

export function jurisdictionLabel(j: Pick<JurisdictionFacts, "state" | "locality" | "version">): string {
  return `${j.locality ? `${j.locality}, ` : ""}${j.state} (rules v${j.version})`;
}

/** Why a jurisdiction rule profile can't be used right now (empty = usable). */
export function jurisdictionProblems(j: JurisdictionFacts | null, now: Date = new Date()): string[] {
  if (!j) return ["The jurisdiction rule profile is unknown. Pick an approved jurisdiction."];
  const label = jurisdictionLabel(j);
  const out: string[] = [];
  if (!j.approved) out.push(`${label} hasn't been approved by counsel.`);
  if (!j.isCurrent) out.push(`${label} has been superseded by a rule change that is awaiting re-approval.`);
  if (j.effectiveFrom && j.effectiveFrom > now) out.push(`${label} isn't effective until ${j.effectiveFrom.toISOString().slice(0, 10)}.`);
  if (j.approvalExpiresAt && j.approvalExpiresAt <= now) out.push(`Counsel approval for ${label} expired on ${j.approvalExpiresAt.toISOString().slice(0, 10)}.`);
  if (!Array.isArray(obj(j.rules).compensationAllowed)) out.push(`${label} has no compensation rules on file.`);
  return out;
}

/**
 * Spec p.13: a rule change freezes new shifts until the profile is
 * re-approved. Shift scheduling arrives with shift operations; it must call
 * this before creating a shift.
 */
export function canScheduleShift(j: JurisdictionFacts | null, now: Date = new Date()): { ok: boolean; reasons: string[] } {
  const reasons = jurisdictionProblems(j, now);
  return { ok: reasons.length === 0, reasons };
}

export function compensationProblem(method: CompensationMethod, rules: unknown): string | null {
  if (method === "HOURLY") return null; // default; always allowed
  const r = obj(rules);
  const allowed = Array.isArray(r.compensationAllowed) ? (r.compensationAllowed as unknown[]) : [];
  const label = COMPENSATION_METHODS.find((m) => m.value === method)!.label.toLowerCase();
  if (!allowed.includes(method)) return `This jurisdiction doesn't allow ${label} pay. Use hourly, or a method its rules list.`;
  if (method === "PER_UNIT" && r.perUnitAllowed !== true) return "Per-unit pay needs the jurisdiction's explicit per-unit approval, which isn't on file.";
  return null;
}

export interface PublishFacts {
  job: {
    status: "DRAFT" | "PUBLISHED" | "PAUSED" | "CLOSED";
    compensationMethod: CompensationMethod;
    payRateCents: number | null;
    headcount: number | null;
    startsAt: Date | null;
    endsAt: Date | null;
    campaignDisclosure: unknown;
    supportContacts: unknown;
    hiringMethod: unknown;
    geography: unknown;
  };
  jurisdiction: JurisdictionFacts | null;
  org: { approved: boolean; contractorTermsSignedAt: Date | null; classificationReviewedAt: Date | null };
}

/**
 * The rule profile must be for the state the job is in — picking any
 * approved profile can't stand in for the job's own jurisdiction.
 */
export function jurisdictionStateProblem(jobState: string | null, profileState: string): string | null {
  if (!jobState) return "Set the job's state.";
  return jobState.toUpperCase() === profileState.toUpperCase()
    ? null
    : `The job is in ${jobState.toUpperCase()} but the rule profile is for ${profileState}. Pick a ${jobState.toUpperCase()} profile.`;
}

/**
 * Job dates are calendar days (stored as midnight UTC). The end date is
 * over only once that day has ended everywhere in the US — Hawaii, UTC−10,
 * is last — not at midnight UTC, which is the evening before in the US.
 */
const END_DAY_MS = (24 + 10) * 3_600_000;
export const jobEndPassed = (endsAt: Date, now: Date) => now.getTime() >= endsAt.getTime() + END_DAY_MS;
/** Jobs whose stored end date is at or after this are still open. */
export const openJobsEndAfter = (now: Date) => new Date(now.getTime() - END_DAY_MS);

/** Every reason this job can't publish right now (empty = it can). */
export function publishBlockers(f: PublishFacts, now: Date = new Date()): string[] {
  const out: string[] = [];
  if (f.job.status !== "DRAFT" && f.job.status !== "PAUSED") out.push("Only draft or paused jobs can be published.");
  if (!f.org.approved) out.push("Your organization is awaiting Turfcut approval.");
  if (!f.org.contractorTermsSignedAt) out.push("Sign the contractor terms in organization settings.");
  if (!f.org.classificationReviewedAt) out.push("Complete the worker-classification review in organization settings.");
  out.push(...jurisdictionProblems(f.jurisdiction, now));
  if (f.jurisdiction) {
    const c = compensationProblem(f.job.compensationMethod, f.jurisdiction.rules);
    if (c) out.push(c);
    const s = jurisdictionStateProblem(str(obj(f.job.geography).state), f.jurisdiction.state);
    if (s) out.push(s);
  }
  if (!f.job.payRateCents || f.job.payRateCents <= 0) out.push("Set the gross pay rate.");
  if (!f.job.headcount || f.job.headcount < 1) out.push("Set the headcount.");
  if (!f.job.startsAt || !f.job.endsAt) out.push("Set the start and end dates.");
  else if (jobEndPassed(f.job.endsAt, now)) out.push("The job's end date has passed.");
  if (!readDisclosure(f.job.campaignDisclosure)) out.push("Disclose the campaign's type, affiliation and message.");
  if (!readSupportContacts(f.job.supportContacts)) out.push("Name who handles emergencies, disputes and lost materials.");
  if (readHiringModes(f.job.hiringMethod).length === 0) out.push("Pick at least one way to hire.");
  return out;
}

// ---------------------------------------------------------------------------
// Job card — the five questions every card must answer (spec p.7)
// ---------------------------------------------------------------------------

export function payText(method: CompensationMethod, cents: number | null): string {
  if (!cents) return "Rate not set";
  const d = `$${(cents / 100).toFixed(2)}`;
  return method === "HOURLY" ? `${d} / hour (gross)` : method === "SHIFT_RATE" ? `${d} / completed shift (gross)` : `${d} / accepted unit (gross)`;
}

/**
 * Compact pay for cards — "$28/hr", "$120/completed shift", "$1.50/accepted
 * signature" — keeping what's actually paid for. Always gross: show that
 * label nearby.
 */
export function payShort(method: CompensationMethod, cents: number | null, type: JobType = "PETITION"): string {
  const p = payParts(method, cents, type);
  return p ? `${p.amount}/${p.short}` : "Rate not set";
}

/** Pay split for big displays: "$28" + "hour" (short "hr"), "$1.50" + "accepted signature". */
export function payParts(method: CompensationMethod, cents: number | null, type: JobType = "PETITION"): { amount: string; unit: string; short: string } | null {
  if (!cents) return null;
  const amount = `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
  if (method === "HOURLY") return { amount, unit: "hour", short: "hr" };
  if (method === "SHIFT_RATE") return { amount, unit: "completed shift", short: "completed shift" };
  const unit = `accepted ${type === "PETITION" ? "signature" : "contact"}`;
  return { amount, unit, short: unit };
}

export interface FitReason {
  /** "yes" = a check; "info" = worth knowing, not a mark against you. */
  kind: "yes" | "info";
  title: string;
  detail: string;
}

/**
 * Why a job fits — shown to the worker only, built from their own verified
 * record and the job's published rules. Never a score or a percentage, and
 * nothing here reads political-fit answers beyond the worker's own
 * "do not match me" boundaries (which already passed, or the job would be
 * hidden).
 */
export function fitReasons(f: {
  type: JobType;
  state: string;
  verifiedShiftsOfType: number;
  statesWorked: string[];
  credentials: string[];
  noExtraCredentials: boolean;
  spotsLeft: number | null;
  hasBoundaries: boolean;
}): FitReason[] {
  const work = f.type === "PETITION" ? "Petition" : "Canvass";
  const out: FitReason[] = [];
  out.push(
    f.verifiedShiftsOfType > 0
      ? { kind: "yes", title: `${work} experience`, detail: `${f.verifiedShiftsOfType} verified ${f.verifiedShiftsOfType === 1 ? "shift" : "shifts"} on your scorecard` }
      : { kind: "info", title: `New to ${work.toLowerCase()} work`, detail: "Onboarding covers the basics — your first verified shift starts your record" }
  );
  out.push(
    f.statesWorked.includes(f.state)
      ? { kind: "yes", title: `Worked in ${f.state} before`, detail: "You know this jurisdiction's rules" }
      : { kind: "info", title: `First job in ${f.state}`, detail: "Check the credentials below before you start" }
  );
  out.push(
    f.noExtraCredentials
      ? { kind: "yes", title: "No extra credentials", detail: "Nothing beyond the job's onboarding" }
      : { kind: "info", title: "Credentials needed", detail: f.credentials.join(" · ") }
  );
  if (f.spotsLeft !== null) {
    out.push(
      f.spotsLeft > 0
        ? { kind: "yes", title: `${f.spotsLeft} ${f.spotsLeft === 1 ? "spot" : "spots"} open`, detail: "Apply or claim while there's room" }
        : { kind: "info", title: "Every spot is filled", detail: "Check back — spots open when plans change" }
    );
  }
  if (f.hasBoundaries) out.push({ kind: "yes", title: "Within your boundaries", detail: "None of your “do not match me” answers apply" });
  return out;
}

/**
 * The credentials a job needs: what the organization asked for, plus the
 * jurisdiction's circulator rules (registration, badge, affidavit). Those
 * rules govern petition circulation, so they apply to petition jobs only — a
 * canvass job needs just what its organization asks for. The job card and
 * the feed's "No credentials" filter both use this list, so they agree.
 */
export function jobCredentials(job: { type: JobType; requirements: unknown; jurisdictionRules: unknown }): string[] {
  const req = readRequirements(job.requirements);
  const rules = obj(job.jurisdictionRules);
  const circulating = job.type === "PETITION";
  return [
    (req.registration || (circulating && rules.workerRegistrationRequired === true)) && "Circulator registration",
    (req.badge || (circulating && rules.badgeRequired === true)) && "Badge",
    (req.affidavit || (circulating && rules.affidavitRequired === true)) && "Signed affidavit",
    req.training && `Training: ${req.training}`,
  ].filter((x): x is string => Boolean(x));
}

export function jobCardAnswers(job: {
  type: JobType;
  compensationMethod: CompensationMethod;
  payRateCents: number | null;
  requirements: unknown;
  supportContacts: unknown;
  orgName: string;
  jurisdictionRules: unknown;
}) {
  const creds = jobCredentials(job);
  const contacts = readSupportContacts(job.supportContacts);
  const unit = job.type === "PETITION" ? "signature" : "completed contact";
  return {
    who: job.orgName,
    paidFor: payText(job.compensationMethod, job.payRateCents),
    payable:
      job.compensationMethod === "HOURLY"
        ? "Hours between check-in and check-out on shifts a supervisor approves."
        : job.compensationMethod === "SHIFT_RATE"
          ? "Each completed shift a supervisor approves."
          : `Each ${unit} accepted at supervisor review.`,
    credentials: creds.length ? creds : ["None beyond the job's onboarding"],
    contacts,
  };
}

// ---------------------------------------------------------------------------
// Worker-side exclusions — explicit "do not match me" boundaries only
// ---------------------------------------------------------------------------

/**
 * Why this job is hidden from the worker (empty = shown). Uses only the
 * worker's own "do not match me" answers under a current consent; PRIVATE
 * preferences are never used for anything. Nothing is inferred.
 */
export function exclusionReasons(
  pref: FitPreferences | null,
  job: { disclosure: JobDisclosure | null; orgName: string; measureIds: string[] }
): string[] {
  if (!pref || pref.visibilityMode === "PRIVATE" || !job.disclosure) return [];
  const d = job.disclosure;
  const eq = (a: string | null | undefined, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
  return (pref.campaignBoundaries ?? [])
    .filter((b) => b.stance === "do_not_match")
    .filter((b) => {
      switch (b.kind) {
        case "campaign_type":
          return b.target === d.campaignType;
        case "party":
          return b.target === d.affiliation;
        case "issue":
          return b.target in d.issues;
        case "organization":
          return eq(job.orgName, b.target);
        case "candidate":
          return eq(d.campaignName, b.target);
        case "measure":
          return eq(d.campaignName, b.target) || job.measureIds.some((m) => eq(m, b.target));
      }
    })
    .map((b) => `You asked not to be matched — ${boundaryText(b).replace(/^Do not match me: /, "")}`);
}

// ---------------------------------------------------------------------------
// Display + form round-trip
// ---------------------------------------------------------------------------

export function affiliationLabel(a: string): string {
  return a === "nonpartisan" ? "Nonpartisan" : `${a[0].toUpperCase()}${a.slice(1)} party`;
}

/** A stored job back into the builder's form fields (inverse of validateJob). */
export function jobToForm(job: {
  type: string;
  title: string;
  description: string | null;
  jurisdictionId: string;
  startsAt: Date | null;
  endsAt: Date | null;
  geography: unknown;
  compensationMethod: string;
  payRateCents: number | null;
  headcount: number | null;
  hiringMethod: unknown;
  requirements: unknown;
  campaignDisclosure: unknown;
  supportContacts: unknown;
  measureIds: string[];
  cancellationNoticeHours: number;
}): Record<string, unknown> {
  const geo = obj(job.geography);
  const req = readRequirements(job.requirements);
  const d = readDisclosure(job.campaignDisclosure);
  const c = readSupportContacts(job.supportContacts);
  const day = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "");
  return {
    type: job.type,
    title: job.title,
    description: job.description ?? "",
    jurisdictionId: job.jurisdictionId,
    startsAt: day(job.startsAt),
    endsAt: day(job.endsAt),
    city: str(geo.city) ?? "",
    state: str(geo.state) ?? "",
    compensationMethod: job.compensationMethod,
    payRate: job.payRateCents ? (job.payRateCents / 100).toFixed(2) : "",
    headcount: job.headcount ? String(job.headcount) : "",
    hiringModes: readHiringModes(job.hiringMethod),
    ...(req.badge ? { badge: "on" } : {}),
    ...(req.registration ? { registration: "on" } : {}),
    ...(req.affidavit ? { affidavit: "on" } : {}),
    training: req.training ?? "",
    script: req.script ?? "",
    campaignType: d?.campaignType ?? "",
    affiliation: d?.affiliation ?? "",
    campaignName: d?.campaignName ?? "",
    ...Object.fromEntries(Object.entries(d?.issues ?? {}).map(([k, v]) => [`issue_${k}`, v])),
    message: d?.message ?? "",
    contactEmergency: c?.emergency ?? "",
    contactDisputes: c?.disputes ?? "",
    contactLostMaterials: c?.lostMaterials ?? "",
    measureIds: job.measureIds.join(", "),
    cancellationNoticeHours: String(job.cancellationNoticeHours),
  };
}

export interface FeedFilters {
  type?: JobType;
  minRateCents?: number;
  startsBefore?: Date;
  noCredentials?: boolean;
}

/** Worker feed filters from a query string. Unknown or malformed values are ignored. */
export function parseFeedFilters(p: URLSearchParams, now = new Date()): FeedFilters {
  const f: FeedFilters = {};
  const type = p.get("type");
  if (type && values(JOB_TYPES).includes(type)) f.type = type as JobType;
  const rate = p.get("minRate");
  if (rate && /^\d+(\.\d{1,2})?$/.test(rate)) f.minRateCents = Math.round(Number(rate) * 100);
  const before = p.get("startsBefore");
  if (before && /^\d{4}-\d{2}-\d{2}$/.test(before) && !Number.isNaN(Date.parse(before))) f.startsBefore = new Date(`${before}T23:59:59Z`);
  if (p.get("noCredentials") === "1" || p.get("noCredentials") === "on") f.noCredentials = true;
  // "This week" quick filter: starting within the next 7 days.
  // A date typed in "More filters" wins over the chip.
  if (p.get("week") === "1" && !f.startsBefore) f.startsBefore = new Date(now.getTime() + 7 * 86_400_000);
  return f;
}
