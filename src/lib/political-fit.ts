/**
 * Political-fit preferences: worker-controlled, never inferred (CLAUDE.md #4,
 * spec p.8 "Workers report political fit explicitly, one field at a time").
 *
 * - Every stored value is an explicit worker answer: a choice from the option
 *   lists below, or free text the worker typed where the spec allows it
 *   (identity "other", named organizations/candidates/measures). Nothing is
 *   pre-selected or derived from any other data. `null` = not answered.
 * - Party relationship is the worker's own description of their relationship
 *   to a party. It is deliberately NOT voter-registration data.
 * - Sharing is opt-in per answer: an answer reaches an organization only if
 *   the worker marked it `shared`, the visibility mode allows it, and (for
 *   issues) it matches a position the campaign disclosed. The full issue
 *   questionnaire is never shown to anyone but the worker.
 * - Consent versioning: saving writes a NEW PoliticalPreference row with the
 *   next consentVersion. The latest version is authoritative.
 * - Every not-shared outcome looks identical to the employer, and the
 *   visibility mode is never exposed: withholding is never a signal.
 */
import type { Validated } from "@/lib/experience";

// ---------------------------------------------------------------------------
// Options (spec p.8). Wording needs counsel review before the pilot.
// ---------------------------------------------------------------------------

export type VisibilityMode = "PRIVATE" | "MATCHING_ONLY" | "APPLIED_TO" | "APPROVED_RECRUITERS";

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
      "Used for matching. Answers you choose to share are shown to organizations you apply to or accept an invitation from. Everyone else sees \"not shared\".",
  },
  {
    value: "APPROVED_RECRUITERS",
    label: "Recruiters I approve",
    description:
      "Used for matching, and shown only to recruiters you approve one by one. Approving recruiters isn't available yet, so for now everyone sees \"not shared\".",
  },
];

/** Modes under which a `shared` answer can ever reach an organization. */
export const SHARING_MODES: VisibilityMode[] = ["APPLIED_TO", "APPROVED_RECRUITERS"];

export const IDENTITY_LABELS = [
  "progressive",
  "liberal",
  "moderate",
  "conservative",
  "libertarian",
  "independent",
  "nonpartisan",
  "other",
] as const;

export const RELATIONSHIPS = [
  { value: "member_supporter", label: "Member / supporter of", needsParty: true },
  { value: "leans_toward", label: "Lean toward", needsParty: true },
  { value: "no_affiliation", label: "No party affiliation", needsParty: false },
  { value: "cross_partisan", label: "Cross-partisan", needsParty: false },
  { value: "other", label: "Other", needsParty: false },
] as const;

export const PARTIES = ["democratic", "republican", "libertarian", "green", "other"] as const;

export const ISSUES = [
  { key: "housing_affordability", label: "Housing affordability" },
  { key: "renewable_energy", label: "Renewable energy" },
  { key: "minimum_wage", label: "Minimum wage" },
  { key: "labor_unions", label: "Labor unions / right to organize" },
  { key: "abortion_access", label: "Abortion access" },
  { key: "gun_rights", label: "Gun rights" },
  { key: "immigration", label: "Immigration" },
  { key: "tax_policy", label: "Tax increases" },
  { key: "criminal_justice_reform", label: "Criminal-justice reform" },
  { key: "voting_access", label: "Voting access" },
  { key: "school_choice", label: "School choice" },
  { key: "healthcare_access", label: "Healthcare access" },
] as const;

export const POSITIONS = [
  { value: "support", label: "Support" },
  { value: "lean_support", label: "Lean support" },
  { value: "neutral", label: "Neutral" },
  { value: "lean_oppose", label: "Lean oppose" },
  { value: "oppose", label: "Oppose" },
  { value: "unsure", label: "Unsure" },
  { value: "private", label: "Private" },
] as const;

export const IMPORTANCE = ["high", "medium", "low"] as const;

export const CAMPAIGN_TYPES = [
  { value: "candidate", label: "Candidate campaigns" },
  { value: "ballot_measure", label: "Ballot measures" },
  { value: "issue_advocacy", label: "Issue advocacy" },
  { value: "party_committee", label: "Party committees" },
  { value: "nonpartisan_civic", label: "Nonpartisan civic work (voter registration, GOTV)" },
] as const;

export const STANCES = [
  { value: "actively_interested", label: "Actively interested" },
  { value: "open_to", label: "Open to" },
  { value: "ask_me_first", label: "Ask me first" },
  { value: "do_not_match", label: "Do not match me" },
] as const;

export const BOUNDARY_KINDS = ["campaign_type", "party", "issue", "organization", "candidate", "measure"] as const;
/** Kinds whose target is free text the worker typed. */
export const FREE_TEXT_KINDS = ["organization", "candidate", "measure"] as const;

export type IdentityLabel = (typeof IDENTITY_LABELS)[number];
export type Relationship = (typeof RELATIONSHIPS)[number]["value"];
export type Party = (typeof PARTIES)[number];
export type IssueKey = (typeof ISSUES)[number]["key"];
export type Position = (typeof POSITIONS)[number]["value"];
export type Importance = (typeof IMPORTANCE)[number];
export type Stance = (typeof STANCES)[number]["value"];
export type BoundaryKind = (typeof BOUNDARY_KINDS)[number];

export interface IdentityAnswer {
  label: IdentityLabel;
  /** Required for "other": the worker's own words. */
  text?: string;
  shared?: boolean;
}

export interface PartyAnswer {
  relationship: Relationship;
  party?: Party;
  /** Worker's own words for relationship "other" or party "other". */
  text?: string;
  shared?: boolean;
}

export interface IssueAnswer {
  position: Position;
  importance?: Importance;
  shared?: boolean;
}

export interface Boundary {
  kind: BoundaryKind;
  /** Option value for campaign_type/party/issue; worker's text otherwise. */
  target: string;
  stance: Stance;
  shared?: boolean;
}

export interface FitPreferences {
  visibilityMode: VisibilityMode;
  identityLabels: IdentityAnswer[] | null;
  partyRelationship: PartyAnswer | null;
  issuePositions: Partial<Record<IssueKey, IssueAnswer>> | null;
  campaignBoundaries: Boundary[] | null;
}

/** The flow's steps, in the required order. */
export const FLOW_STEPS = ["visibility", "identity", "party", "issues", "boundaries", "review"] as const;

// ---------------------------------------------------------------------------
// Validation — strict whitelist; nothing is coerced into an answer.
// ---------------------------------------------------------------------------

const values = <T extends { value: string }>(xs: readonly T[]) => xs.map((x) => x.value) as readonly string[];
const ISSUE_KEYS = ISSUES.map((i) => i.key) as readonly string[];
const is = (list: readonly string[], v: unknown): boolean => typeof v === "string" && list.includes(v);

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function onlyKeys(o: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(o).every((k) => allowed.includes(k));
}

/** Worker-typed text: trimmed, 1..max chars, no control characters. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t.length >= 1 && t.length <= max && !/[\u0000-\u001f\u007f]/.test(t) ? t : null;
}

const sharedFlag = (v: unknown) => v === undefined || typeof v === "boolean";
const withShared = <T extends object>(x: T, shared: unknown): T => (shared === true ? { ...x, shared: true } : x);

export function validatePreferences(raw: unknown): Validated<FitPreferences> {
  const errors: Record<string, string> = {};
  const r = obj(raw) ?? {};

  if (!is(values(VISIBILITY_OPTIONS), r.visibilityMode)) {
    errors.visibilityMode = "Choose who can see your answers.";
  }

  // Identity labels
  let identityLabels: IdentityAnswer[] | null = null;
  if (r.identityLabels != null) {
    const out: IdentityAnswer[] = [];
    const ok =
      Array.isArray(r.identityLabels) &&
      r.identityLabels.every((x) => {
        const o = obj(x);
        if (!o || !onlyKeys(o, ["label", "text", "shared"]) || !is(IDENTITY_LABELS, o.label) || !sharedFlag(o.shared)) return false;
        if (o.label === "other") {
          const t = text(o.text, 60);
          if (!t) return false;
          out.push(withShared({ label: "other" as const, text: t }, o.shared));
        } else {
          if (o.text !== undefined) return false;
          out.push(withShared({ label: o.label as IdentityLabel }, o.shared));
        }
        return true;
      });
    if (!ok) errors.identityLabels = "Pick labels from the list; \"other\" needs a short description (60 characters max).";
    else if (out.length) identityLabels = dedupe(out, (x) => `${x.label}:${x.text ?? ""}`);
  }

  // Party relationship
  let partyRelationship: PartyAnswer | null = null;
  if (r.partyRelationship != null) {
    const o = obj(r.partyRelationship);
    const rel = RELATIONSHIPS.find((x) => x.value === o?.relationship);
    let ok = !!o && !!rel && onlyKeys(o, ["relationship", "party", "text", "shared"]) && sharedFlag(o.shared);
    if (ok && rel) {
      const a: PartyAnswer = { relationship: rel.value };
      if (rel.needsParty) {
        ok = is(PARTIES, o!.party);
        if (ok) a.party = o!.party as Party;
      } else if (o!.party !== undefined) ok = false;
      const needsText = rel.value === "other" || a.party === "other";
      if (ok && needsText) {
        const t = text(o!.text, 60);
        ok = !!t;
        if (t) a.text = t;
      } else if (ok && o!.text !== undefined) ok = false;
      if (ok) partyRelationship = withShared(a, o!.shared);
    }
    if (!ok) errors.partyRelationship = "Pick a relationship (and a party where asked); \"other\" needs a short description.";
  }

  // Issue positions
  let issuePositions: FitPreferences["issuePositions"] = null;
  if (r.issuePositions != null) {
    const o = obj(r.issuePositions);
    const out: Partial<Record<IssueKey, IssueAnswer>> = {};
    const ok =
      !!o &&
      Object.entries(o).every(([k, v]) => {
        const a = obj(v);
        if (!ISSUE_KEYS.includes(k) || !a || !onlyKeys(a, ["position", "importance", "shared"])) return false;
        if (!is(values(POSITIONS), a.position) || !sharedFlag(a.shared)) return false;
        if (a.importance !== undefined && !is(IMPORTANCE, a.importance)) return false;
        if (a.position === "private" && a.shared === true) return false; // a private answer can't be shared
        const ans: IssueAnswer = { position: a.position as Position };
        if (a.importance !== undefined) ans.importance = a.importance as Importance;
        out[k as IssueKey] = withShared(ans, a.shared);
        return true;
      });
    if (!ok) errors.issuePositions = "Pick a listed position for each issue you answer. Private answers can't be shared.";
    else if (Object.keys(out).length) issuePositions = out;
  }

  // Campaign boundaries
  let campaignBoundaries: Boundary[] | null = null;
  if (r.campaignBoundaries != null) {
    const out: Boundary[] = [];
    const ok =
      Array.isArray(r.campaignBoundaries) &&
      r.campaignBoundaries.every((x) => {
        const o = obj(x);
        if (!o || !onlyKeys(o, ["kind", "target", "stance", "shared"])) return false;
        if (!is(BOUNDARY_KINDS, o.kind) || !is(values(STANCES), o.stance) || !sharedFlag(o.shared)) return false;
        let target: string | null = null;
        if (o.kind === "campaign_type") target = is(values(CAMPAIGN_TYPES), o.target) ? (o.target as string) : null;
        else if (o.kind === "party") target = is(PARTIES, o.target) && o.target !== "other" ? (o.target as string) : null;
        else if (o.kind === "issue") target = is(ISSUE_KEYS, o.target) ? (o.target as string) : null;
        else target = text(o.target, 100);
        if (!target) return false;
        out.push(withShared({ kind: o.kind as BoundaryKind, target, stance: o.stance as Stance }, o.shared));
        return true;
      });
    if (!ok) errors.campaignBoundaries = "Pick a listed stance for each boundary; named organizations, candidates and measures need a name (100 characters max).";
    else if (out.length) campaignBoundaries = dedupe(out, (b) => `${b.kind}:${b.target.toLowerCase()}`);
  }

  const allowed = ["visibilityMode", "identityLabels", "partyRelationship", "issuePositions", "campaignBoundaries"];
  for (const k of Object.keys(r)) if (!allowed.includes(k)) errors[k] = "Unexpected field.";

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

/** Keeps the last occurrence per key (a later edit wins). */
function dedupe<T>(xs: T[], key: (x: T) => string): T[] {
  const m = new Map<string, T>();
  for (const x of xs) {
    m.delete(key(x));
    m.set(key(x), x);
  }
  return [...m.values()];
}

// ---------------------------------------------------------------------------
// Reading stored rows
// ---------------------------------------------------------------------------

/**
 * Reads a stored row back into the app's shape. It never adds an answer.
 * M0 rows stored identity labels as plain strings: a listed label is kept as
 * that label; anything else becomes "other" with the worker's original words.
 * Values that no longer validate are dropped from the read (the stored row is
 * untouched) and the worker is asked again next time they open the flow.
 */
export function fromRow(row: {
  visibilityMode: VisibilityMode;
  identityLabels: unknown;
  partyRelationship: unknown;
  issuePositions: unknown;
  campaignBoundaries: unknown;
}): FitPreferences {
  const identity = Array.isArray(row.identityLabels)
    ? row.identityLabels.map((x) =>
        typeof x === "string"
          ? is(IDENTITY_LABELS, x) && x !== "other"
            ? { label: x }
            : { label: "other", text: x }
          : x
      )
    : row.identityLabels;
  const pick = <K extends keyof FitPreferences>(key: K, value: unknown): FitPreferences[K] | null => {
    const v = validatePreferences({ visibilityMode: "PRIVATE", [key]: value });
    return v.ok ? (v.value[key] as FitPreferences[K]) : null;
  };
  return {
    visibilityMode: row.visibilityMode,
    identityLabels: pick("identityLabels", identity),
    partyRelationship: pick("partyRelationship", row.partyRelationship),
    issuePositions: pick("issuePositions", row.issuePositions),
    campaignBoundaries: pick("campaignBoundaries", row.campaignBoundaries),
  };
}

/** Deep, order-insensitive equality, so re-consenting identical answers is a no-op. */
export function samePreferences(a: FitPreferences, b: FitPreferences): boolean {
  return canonical(a) === canonical(b);
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).sort().join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

// ---------------------------------------------------------------------------
// Display helpers (worker's own view)
// ---------------------------------------------------------------------------

const labelOf = <T extends { value: string; label: string }>(xs: readonly T[], v: string) =>
  xs.find((x) => x.value === v)?.label ?? v;
export const issueLabel = (k: string) => ISSUES.find((i) => i.key === k)?.label ?? k;

export function identityText(a: IdentityAnswer): string {
  return a.label === "other" ? (a.text ?? "other") : a.label;
}

export function partyText(p: PartyAnswer): string {
  const party = p.party === "other" ? p.text : p.party;
  switch (p.relationship) {
    case "member_supporter":
      return `Member / supporter: ${party} party`;
    case "leans_toward":
      return `Leans toward the ${party} party`;
    case "no_affiliation":
      return "No party affiliation";
    case "cross_partisan":
      return "Cross-partisan";
    case "other":
      return `Other: ${p.text}`;
  }
}

export function issueText(k: string, a: IssueAnswer): string {
  return `${issueLabel(k)}: ${labelOf(POSITIONS, a.position).toLowerCase()}${a.importance ? ` · ${a.importance} importance` : ""}`;
}

export function boundaryText(b: Boundary): string {
  const target =
    b.kind === "campaign_type"
      ? labelOf(CAMPAIGN_TYPES, b.target).toLowerCase()
      : b.kind === "party"
        ? `${b.target} party campaigns`
        : b.kind === "issue"
          ? `${issueLabel(b.target).toLowerCase()} campaigns`
          : `${b.kind} "${b.target}"`;
  return `${labelOf(STANCES, b.stance)}: ${target}`;
}

// ---------------------------------------------------------------------------
// Employer view
// ---------------------------------------------------------------------------

/** Positions a campaign has publicly disclosed (spec p.14). Jobs gain this in M2. */
export interface CampaignDisclosure {
  issues: Partial<Record<IssueKey, "support" | "oppose">>;
}

export const FIT_FIELDS = [
  { key: "identity", label: "Identity labels" },
  { key: "party", label: "Party relationship" },
  { key: "issues", label: "Issue overlap with this campaign" },
  { key: "boundaries", label: "Campaign interests" },
] as const;
type FitField = (typeof FIT_FIELDS)[number]["key"];

export type EmployerFieldView = { shared: true; lines: string[] } | { shared: false };

export interface EmployerFitView {
  fields: Record<FitField, EmployerFieldView>;
  /** Why the viewer sees what they see — the same text for every not-shared case. */
  basis: string;
}

export const NOT_SHARED_BASIS =
  "Political-fit answers are shared only when a worker chooses to. \"Not shared\" is the default and says nothing about fit.";

export const SHARED_BASIS =
  "Worker-authorized signals: shown because this worker chose to share these answers with organizations they apply to or accept an invitation from, and they have with yours. Issue positions appear only where they agree with a position your campaign disclosed; the worker's full questionnaire is never shared.";

const SAME_SIDE: Record<Position, "support" | "oppose" | null> = {
  support: "support",
  lean_support: "support",
  oppose: "oppose",
  lean_oppose: "oppose",
  neutral: null,
  unsure: null,
  private: null,
};

/**
 * What an organization may see of a worker's political fit (spec p.8, p.12).
 *
 * Nothing unless the worker's latest consent is APPLIED_TO and the viewing
 * org has an engagement with them. Then, only answers the worker marked
 * `shared`:
 * - identity labels and party relationship as the worker wrote them;
 * - issues only where the worker's position agrees with a position the
 *   campaign disclosed — disagreement, neutral, unsure, private and
 *   unanswered all look the same (absent);
 * - boundaries only where the worker is "actively interested" or "open to".
 *   Exclusions ("do not match me", "ask me first") drive matching and are
 *   never displayed.
 * APPROVED_RECRUITERS shows nothing until per-recruiter approvals exist.
 * The visibility mode itself is never returned.
 */
export function employerFitView(
  pref: FitPreferences | null,
  ctx: { orgHasRelationship: boolean; campaign?: CampaignDisclosure | null }
): EmployerFitView {
  const notShared: EmployerFitView = {
    fields: { identity: { shared: false }, party: { shared: false }, issues: { shared: false }, boundaries: { shared: false } },
    basis: NOT_SHARED_BASIS,
  };
  if (!pref || pref.visibilityMode !== "APPLIED_TO" || !ctx.orgHasRelationship) return notShared;

  const field = (lines: string[]): EmployerFieldView => (lines.length ? { shared: true, lines } : { shared: false });

  const identity = (pref.identityLabels ?? []).filter((a) => a.shared).map(identityText);
  const party = pref.partyRelationship?.shared ? [partyText(pref.partyRelationship)] : [];
  const issues = Object.entries(ctx.campaign?.issues ?? {}).flatMap(([k, side]) => {
    const a = pref.issuePositions?.[k as IssueKey];
    if (!a?.shared || SAME_SIDE[a.position] !== side) return [];
    const verb = a.position.startsWith("lean_") ? "Leans toward" : "Agrees with";
    return [`${verb} the campaign's position on ${issueLabel(k).toLowerCase()}${a.importance === "high" ? " (high importance)" : ""}`];
  });
  const boundaries = (pref.campaignBoundaries ?? [])
    .filter((b) => b.shared && (b.stance === "actively_interested" || b.stance === "open_to"))
    .map(boundaryText);

  const view: EmployerFitView = {
    fields: { identity: field(identity), party: field(party), issues: field(issues), boundaries: field(boundaries) },
    basis: NOT_SHARED_BASIS,
  };
  if (Object.values(view.fields).some((f) => f.shared)) view.basis = SHARED_BASIS;
  return view;
}
