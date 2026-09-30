/**
 * Political-fit preferences: worker-controlled, never inferred (CLAUDE.md #4).
 *
 * - Every stored value is an explicit worker choice from the fixed option
 *   lists below. There is no free text, no default answer, and nothing is
 *   derived from any other data. `null` means "not answered".
 * - Consent versioning: saving writes a NEW PoliticalPreference row with the
 *   next consentVersion. The latest version is authoritative; older rows stay.
 * - Employers see only what the worker authorized. Anything else renders as
 *   "not shared", and every not-shared case looks identical — the employer
 *   can't tell private from matching-only from unanswered, so withholding is
 *   never a signal.
 */
import type { Validated } from "@/lib/experience";

export type VisibilityMode =
  | "PRIVATE"
  | "MATCHING_ONLY"
  | "APPLIED_TO"
  | "APPROVED_RECRUITERS";

export const VISIBILITY_OPTIONS: Array<{ value: VisibilityMode; label: string; description: string }> = [
  {
    value: "PRIVATE",
    label: "Private",
    description: "Never used for matching and never shown to any organization.",
  },
  {
    value: "MATCHING_ONLY",
    label: "Matching only",
    description:
      "Used only to keep you out of work you've ruled out and to find good fits. Organizations never see your answers — they see \"not shared\".",
  },
  {
    value: "APPLIED_TO",
    label: "Organizations I apply to",
    description:
      "Used for matching, and shown to organizations you apply to or accept an invitation from. Everyone else sees \"not shared\".",
  },
  {
    value: "APPROVED_RECRUITERS",
    label: "Recruiters I approve",
    description:
      "Used for matching, and shown only to recruiters you approve one by one. Approving recruiters isn't available yet, so for now everyone sees \"not shared\".",
  },
];

export const IDENTITY_LABELS = [
  "progressive",
  "liberal",
  "moderate",
  "conservative",
  "libertarian",
  "populist",
  "unaffiliated",
  "pro-labor",
  "pro-business",
  "environmentalist",
  "faith-motivated",
  "nonpartisan professional",
] as const;

export const PARTIES = [
  "democratic",
  "republican",
  "libertarian",
  "green",
  "other party",
  "unaffiliated",
  "not registered",
] as const;

export const LEANS = ["democratic", "republican", "neither", "varies"] as const;

export const ISSUES = [
  { key: "minimum_wage", label: "Minimum wage increases" },
  { key: "labor_unions", label: "Labor unions / right to organize" },
  { key: "abortion_access", label: "Abortion access" },
  { key: "gun_rights", label: "Gun rights" },
  { key: "immigration", label: "Expanding immigration" },
  { key: "climate_energy", label: "Climate and clean-energy measures" },
  { key: "tax_increases", label: "Tax increases" },
  { key: "criminal_justice_reform", label: "Criminal-justice reform" },
  { key: "affordable_housing", label: "Affordable-housing measures" },
  { key: "voting_access", label: "Expanding voting access" },
  { key: "school_choice", label: "School choice" },
  { key: "drug_policy_reform", label: "Drug-policy reform" },
] as const;

export const POSITIONS = ["support", "oppose", "neutral"] as const;
export const SIDES = ["support", "oppose"] as const;

type Party = (typeof PARTIES)[number];
type Lean = (typeof LEANS)[number];
type IssueKey = (typeof ISSUES)[number]["key"];
type Position = (typeof POSITIONS)[number];
type Side = (typeof SIDES)[number];

export interface PartyRelationship {
  registered: Party | null;
  leans: Lean | null;
}

export interface CampaignBoundaries {
  /** Parties whose campaigns the worker won't work for. */
  willNotWorkFor: Party[];
  /** Issue sides the worker won't campaign for, e.g. {issue: "gun_rights", side: "oppose"}. */
  willNotWorkOn: Array<{ issue: IssueKey; side: Side }>;
}

export interface FitPreferences {
  visibilityMode: VisibilityMode;
  identityLabels: string[] | null;
  partyRelationship: PartyRelationship | null;
  issuePositions: Partial<Record<IssueKey, Position>> | null;
  campaignBoundaries: CampaignBoundaries | null;
}

/** The flow's steps, in the required order. */
export const FLOW_STEPS = [
  "visibility",
  "identity",
  "party",
  "issues",
  "boundaries",
  "review",
] as const;

const ISSUE_KEYS = ISSUES.map((i) => i.key) as readonly string[];
const has = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === "string" && (list as readonly string[]).includes(v);

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Strict whitelist validation of a worker's submission. Unknown keys and
 * values outside the option lists are rejected, never coerced — a value we
 * didn't offer is a value the worker didn't explicitly choose.
 */
export function validatePreferences(raw: unknown): Validated<FitPreferences> {
  const errors: Record<string, string> = {};
  const r = obj(raw) ?? {};

  if (!has(VISIBILITY_OPTIONS.map((o) => o.value), r.visibilityMode)) {
    errors.visibilityMode = "Choose who can see your answers.";
  }

  let identityLabels: string[] | null = null;
  if (r.identityLabels !== null && r.identityLabels !== undefined) {
    if (!Array.isArray(r.identityLabels) || !r.identityLabels.every((l) => has(IDENTITY_LABELS, l))) {
      errors.identityLabels = "Pick labels from the list.";
    } else if (r.identityLabels.length > 0) {
      identityLabels = [...new Set(r.identityLabels as string[])];
    }
  }

  let partyRelationship: PartyRelationship | null = null;
  if (r.partyRelationship !== null && r.partyRelationship !== undefined) {
    const p = obj(r.partyRelationship);
    const registered = p?.registered ?? null;
    const leans = p?.leans ?? null;
    if (!p || (registered !== null && !has(PARTIES, registered)) || (leans !== null && !has(LEANS, leans))) {
      errors.partyRelationship = "Pick from the listed options.";
    } else if (registered !== null || leans !== null) {
      partyRelationship = { registered: registered as Party | null, leans: leans as Lean | null };
    }
  }

  let issuePositions: FitPreferences["issuePositions"] = null;
  if (r.issuePositions !== null && r.issuePositions !== undefined) {
    const ip = obj(r.issuePositions);
    if (!ip || !Object.entries(ip).every(([k, v]) => ISSUE_KEYS.includes(k) && has(POSITIONS, v))) {
      errors.issuePositions = "Pick a position from the list for each issue you answer.";
    } else if (Object.keys(ip).length > 0) {
      issuePositions = ip as FitPreferences["issuePositions"];
    }
  }

  let campaignBoundaries: CampaignBoundaries | null = null;
  if (r.campaignBoundaries !== null && r.campaignBoundaries !== undefined) {
    const cb = obj(r.campaignBoundaries);
    const forList = cb?.willNotWorkFor ?? [];
    const onList = cb?.willNotWorkOn ?? [];
    const okFor = Array.isArray(forList) && forList.every((p) => has(PARTIES, p));
    const okOn =
      Array.isArray(onList) &&
      onList.every((x) => {
        const o = obj(x);
        return !!o && ISSUE_KEYS.includes(o.issue as string) && has(SIDES, o.side) && Object.keys(o).length === 2;
      });
    if (!cb || !okFor || !okOn) {
      errors.campaignBoundaries = "Pick boundaries from the listed options.";
    } else if ((forList as unknown[]).length > 0 || (onList as unknown[]).length > 0) {
      campaignBoundaries = {
        willNotWorkFor: [...new Set(forList as Party[])],
        willNotWorkOn: dedupeSides(onList as CampaignBoundaries["willNotWorkOn"]),
      };
    }
  }

  const allowed = new Set(["visibilityMode", "identityLabels", "partyRelationship", "issuePositions", "campaignBoundaries"]);
  for (const k of Object.keys(r)) if (!allowed.has(k)) errors[k] = "Unexpected field.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      visibilityMode: r.visibilityMode as VisibilityMode,
      identityLabels,
      partyRelationship,
      issuePositions,
      campaignBoundaries,
    },
  };
}

function dedupeSides(list: CampaignBoundaries["willNotWorkOn"]) {
  const seen = new Set<string>();
  return list.filter((x) => {
    const k = `${x.issue}:${x.side}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Reads a stored row back into the app's shape. Tolerant: it never adds values. */
export function fromRow(row: {
  visibilityMode: VisibilityMode;
  identityLabels: unknown;
  partyRelationship: unknown;
  issuePositions: unknown;
  campaignBoundaries: unknown;
}): FitPreferences {
  const labels = Array.isArray(row.identityLabels)
    ? row.identityLabels.filter((l): l is string => typeof l === "string")
    : [];
  const pr = obj(row.partyRelationship);
  const ip = obj(row.issuePositions);
  const cb = obj(row.campaignBoundaries);
  return {
    visibilityMode: row.visibilityMode,
    identityLabels: labels.length ? labels : null,
    partyRelationship: pr
      ? { registered: (pr.registered as Party) ?? null, leans: (pr.leans as Lean) ?? null }
      : null,
    issuePositions: ip && Object.keys(ip).length ? (ip as FitPreferences["issuePositions"]) : null,
    campaignBoundaries: cb
      ? {
          willNotWorkFor: Array.isArray(cb.willNotWorkFor) ? (cb.willNotWorkFor as Party[]) : [],
          willNotWorkOn: Array.isArray(cb.willNotWorkOn) ? (cb.willNotWorkOn as CampaignBoundaries["willNotWorkOn"]) : [],
        }
      : null,
  };
}

/** Order-insensitive equality, so re-consenting to identical answers is a no-op. */
export function samePreferences(a: FitPreferences, b: FitPreferences): boolean {
  const norm = (p: FitPreferences) =>
    JSON.stringify({
      v: p.visibilityMode,
      i: p.identityLabels ? [...p.identityLabels].sort() : null,
      p: p.partyRelationship,
      q: p.issuePositions ? Object.entries(p.issuePositions).sort() : null,
      b: p.campaignBoundaries
        ? {
            f: [...p.campaignBoundaries.willNotWorkFor].sort(),
            o: p.campaignBoundaries.willNotWorkOn.map((x) => `${x.issue}:${x.side}`).sort(),
          }
        : null,
    });
  return norm(a) === norm(b);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const issueLabel = (k: string) => ISSUES.find((i) => i.key === k)?.label ?? k;

export function describeIdentity(p: FitPreferences): string | null {
  return p.identityLabels?.join(", ") ?? null;
}

export function describeParty(p: FitPreferences): string | null {
  const pr = p.partyRelationship;
  if (!pr) return null;
  const parts = [
    pr.registered && `Registered: ${pr.registered}`,
    pr.leans && `Leans: ${pr.leans}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function describeIssues(p: FitPreferences): string[] | null {
  if (!p.issuePositions) return null;
  return Object.entries(p.issuePositions).map(([k, v]) => `${issueLabel(k)}: ${v}`);
}

export function describeBoundaries(p: FitPreferences): string[] | null {
  const cb = p.campaignBoundaries;
  if (!cb) return null;
  const lines = [
    ...cb.willNotWorkFor.map((party) => `Won't work for ${party} campaigns`),
    ...cb.willNotWorkOn.map((x) => `Won't campaign to ${x.side} ${issueLabel(x.issue).toLowerCase()}`),
  ];
  return lines.length ? lines : null;
}

// ---------------------------------------------------------------------------
// Employer view
// ---------------------------------------------------------------------------

export const FIT_FIELDS = [
  { key: "identity", label: "Identity labels" },
  { key: "party", label: "Party relationship" },
  { key: "issues", label: "Issue positions" },
  { key: "boundaries", label: "Campaign boundaries" },
] as const;
type FitField = (typeof FIT_FIELDS)[number]["key"];

export type EmployerFieldView =
  | { shared: true; lines: string[] }
  | { shared: false };

export interface EmployerFitView {
  fields: Record<FitField, EmployerFieldView>;
  /** Why the viewer sees what they see — the same text for every not-shared case. */
  basis: string;
}

export const NOT_SHARED_BASIS =
  "Political-fit answers are shared only when a worker chooses to. \"Not shared\" is the default and says nothing about fit.";

/**
 * What an organization may see of a worker's political-fit answers.
 *
 * Shown only when the worker's latest consent is APPLIED_TO and the viewing
 * org has an engagement with them (the worker applied or was invited).
 * APPROVED_RECRUITERS shows nothing until per-recruiter approvals exist.
 *
 * Every not-shared outcome returns an identical object, so the employer
 * cannot distinguish PRIVATE, MATCHING_ONLY, unanswered, or no-relationship.
 * The visibility mode itself is never returned.
 */
export function employerFitView(
  pref: FitPreferences | null,
  ctx: { orgHasRelationship: boolean }
): EmployerFitView {
  const notShared: EmployerFitView = {
    fields: { identity: { shared: false }, party: { shared: false }, issues: { shared: false }, boundaries: { shared: false } },
    basis: NOT_SHARED_BASIS,
  };
  if (!pref || pref.visibilityMode !== "APPLIED_TO" || !ctx.orgHasRelationship) {
    return notShared;
  }

  const field = (lines: string[] | string | null): EmployerFieldView =>
    lines === null ? { shared: false } : { shared: true, lines: Array.isArray(lines) ? lines : [lines] };
  const view: EmployerFitView = {
    fields: {
      identity: field(describeIdentity(pref)),
      party: field(describeParty(pref)),
      issues: field(describeIssues(pref)),
      boundaries: field(describeBoundaries(pref)),
    },
    basis: NOT_SHARED_BASIS,
  };
  if (Object.values(view.fields).some((f) => f.shared)) {
    view.basis =
      "Shown because this worker chose to share their answers with organizations they apply to or accept an invitation from, and they have with yours. Answers they skipped show as \"not shared\".";
  }
  return view;
}
