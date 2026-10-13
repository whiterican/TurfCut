/**
 * Credentials wallet (C2.5). Pure — credentials-data.ts reads and writes.
 *
 * - Every credential a worker enters is self-reported; organization
 *   verification arrives with the applicant detail in C3. The database
 *   refuses a worker's own row claiming any other level.
 * - An edit appends a row that supersedes the old one, and removal appends a
 *   "removed" row (rule 3). The current wallet is the rows nothing supersedes
 *   that aren't removals.
 * - Only the last four characters of a credential's number are kept (shown
 *   masked). A full number typed by mistake — even an SSN — is never stored,
 *   so it never sits in append-only history that can't be erased.
 */
import type { Validated } from "@/lib/experience";
import { hasHiddenChars } from "@/lib/text-guard";

export type CredentialKind = "CIRCULATOR_REGISTRATION" | "NOTARY_OR_AFFIDAVIT" | "TRAINING" | "OTHER";
export type VerificationLevel = "PLATFORM" | "ORGANIZATION" | "IMPORTED" | "SELF_REPORTED";

export const CREDENTIAL_KINDS: Array<{ value: CredentialKind; label: string; needsLabel: boolean; hint: string }> = [
  { value: "CIRCULATOR_REGISTRATION", label: "Circulator registration", needsLabel: false, hint: "Your state's petition circulator registration." },
  { value: "NOTARY_OR_AFFIDAVIT", label: "Notary or affidavit status", needsLabel: false, hint: "A notary commission, or approval to sign circulator affidavits." },
  { value: "TRAINING", label: "Training completed", needsLabel: true, hint: "Name the course, e.g. \"Petition basics\"." },
  { value: "OTHER", label: "Other", needsLabel: true, hint: "Say what it is." },
];

export const VERIFICATION_LABELS: Record<VerificationLevel, string> = {
  PLATFORM: "Verified by Turfcut",
  ORGANIZATION: "Verified by an organization",
  IMPORTED: "Imported from a trusted source",
  SELF_REPORTED: "Self-reported",
};

export interface CredentialInput {
  kind: CredentialKind;
  label: string | null;
  state: string | null;
  identifier: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
}

export interface CredentialRow {
  id: string;
  kind: CredentialKind;
  label: string | null;
  state: string | null;
  identifier: string | null;
  issuedOn: Date | null;
  expiresOn: Date | null;
  verification: VerificationLevel;
  supersedesId: string | null;
  removed: boolean;
  createdAt: Date;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function day(v: unknown): string | null | false {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !DATE.test(v)) return false;
  const year = Number(v.slice(0, 4));
  if (year < 1900 || year > 2100) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : false;
}

type Text = string | null | "long" | "hidden";
function text(v: unknown, max: number): Text {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return "hidden";
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) return null;
  if (hasHiddenChars(t, true)) return "hidden";
  return t.length <= max ? t : "long";
}
const HIDDEN_MSG = "This has a character that can't be shown. Retype it rather than pasting.";

/** The last four characters of a credential number: all Turfcut keeps. */
export const IDENTIFIER_KEPT = 4;
export const identifierTail = (id: string) => id.replace(/\s+/g, "").slice(-IDENTIFIER_KEPT);

export function validateCredential(raw: unknown): Validated<CredentialInput> {
  const errors: Record<string, string> = {};
  const r = obj(raw) ?? {};
  const kind = CREDENTIAL_KINDS.find((k) => k.value === r.kind);
  if (!kind) errors.kind = "Choose what kind of credential this is.";

  const label = text(r.label, 80);
  if (label === "long") errors.label = "Keep the name under 80 characters.";
  else if (label === "hidden") errors.label = HIDDEN_MSG;
  else if (kind?.needsLabel && !label) errors.label = kind.value === "TRAINING" ? "Name the course." : "Say what the credential is.";

  const rawState = typeof r.state === "string" ? r.state.trim().toUpperCase() : r.state;
  const state = rawState === "" || rawState === undefined || rawState === null ? null : typeof rawState === "string" && /^[A-Z]{2}$/.test(rawState) ? rawState : false;
  if (state === false) errors.state = "Use the two-letter state code, e.g. CO.";
  else if (kind?.value === "CIRCULATOR_REGISTRATION" && !state) errors.state = "Which state is the registration for?";

  const identifier = text(r.identifier, 64);
  if (identifier === "long") errors.identifier = "Keep the number under 64 characters.";
  else if (identifier === "hidden") errors.identifier = HIDDEN_MSG;

  const issuedOn = day(r.issuedOn);
  const expiresOn = day(r.expiresOn);
  if (issuedOn === false) errors.issuedOn = "Use a real date between 1900 and 2100.";
  if (expiresOn === false) errors.expiresOn = "Use a real date between 1900 and 2100.";
  if (issuedOn && expiresOn && issuedOn > expiresOn) errors.expiresOn = "The expiry is before the issue date.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: kind!.value,
      // A label only where the kind uses one; the kind's own name otherwise.
      label: kind!.needsLabel ? (label as string) : (label || null),
      state: state as string | null,
      // Only the tail is kept (see top of file).
      identifier: identifier ? identifierTail(identifier) : null,
      issuedOn: issuedOn as string | null,
      expiresOn: expiresOn as string | null,
    },
  };
}

/** "•••• 2345". What's stored is already only the last four characters. */
export function maskIdentifier(id: string | null): string | null {
  if (!id) return null;
  return `•••• ${id.slice(-IDENTIFIER_KEPT)}`;
}

/**
 * The wallet now: rows nothing supersedes, minus removals. Each carries
 * `rootId`, the first row of its edit chain, so a credential keeps one
 * identity (and its place in the list, newest added first) across edits.
 */
export function currentCredentials<T extends Pick<CredentialRow, "id" | "supersedesId" | "removed" | "createdAt">>(rows: T[]): Array<T & { rootId: string }> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const superseded = new Set(rows.map((r) => r.supersedesId).filter(Boolean));
  const root = (r: T): T => {
    let cur = r;
    for (let i = 0; cur.supersedesId && byId.has(cur.supersedesId) && i < rows.length; i++) cur = byId.get(cur.supersedesId)!;
    return cur;
  };
  return rows
    .filter((r) => !superseded.has(r.id) && !r.removed)
    .map((r) => ({ r, root: root(r) }))
    .sort((a, b) => b.root.createdAt.getTime() - a.root.createdAt.getTime())
    .map(({ r, root }) => ({ ...r, rootId: root.id }));
}

export function credentialName(c: Pick<CredentialRow, "kind" | "label" | "state">): string {
  const base = CREDENTIAL_KINDS.find((k) => k.value === c.kind)?.label ?? "Credential";
  // The worker's own words keep their capitals; only built-in names read in sentence case.
  if (c.kind === "TRAINING" || c.kind === "OTHER") return c.label ? (c.state ? `${c.state}: ${c.label}` : c.label) : c.state ? `${c.state} ${base.toLowerCase()}` : base;
  return c.state ? `${c.state} ${base.charAt(0).toLowerCase()}${base.slice(1)}` : base;
}

export type ExpiryState = { kind: "expired"; days: number } | { kind: "soon"; days: number } | { kind: "ok" } | { kind: "none" };

/** Days are whole calendar days in UTC, matching how expiry dates are stored. */
export function expiryState(expiresOn: Date | null, today: string, soonDays = 30): ExpiryState {
  if (!expiresOn) return { kind: "none" };
  const days = Math.round((Date.parse(expiresOn.toISOString().slice(0, 10)) - Date.parse(today)) / 86_400_000);
  if (days < 0) return { kind: "expired", days: -days };
  if (days <= soonDays) return { kind: "soon", days };
  return { kind: "ok" };
}

/**
 * Today's card (plan C2.5): from 30 days out ("30"), urgent from 7 days
 * ("7"), and for as long as a credential is expired ("expired") — an expired
 * registration never quietly drops off.
 */
export function expiryReminder(expiresOn: Date | null, today: string): "30" | "7" | "expired" | null {
  const s = expiryState(expiresOn, today);
  if (s.kind === "expired") return "expired";
  if (s.kind !== "soon") return null;
  return s.days <= 7 ? "7" : "30";
}

/**
 * Today's date for expiry, in the furthest-west US time (Hawaii, UTC−10):
 * a credential still counts on its expiry date wherever the worker is in the
 * US, instead of reading "expired" from 6pm the evening before in Colorado.
 */
export const expiryToday = (now = new Date()) => new Date(now.getTime() - 10 * 3_600_000).toISOString().slice(0, 10);

export const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** What an organization sees of a credential: name, level and expiry. Never the identifier. */
export interface OrgCredentialView {
  kind: CredentialKind;
  label: string | null;
  state: string | null;
  verification: VerificationLevel;
  expiresOn: Date | null;
}

/** The wallet as an organization sees it, or "withheld" when the worker doesn't share credentials with it. */
export function orgCredentialView(creds: CredentialRow[], shared: boolean): OrgCredentialView[] | "withheld" {
  if (!shared) return "withheld";
  return creds.map((c) => ({ kind: c.kind, label: c.label, state: c.state, verification: c.verification, expiresOn: c.expiresOn }));
}
