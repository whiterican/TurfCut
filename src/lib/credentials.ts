/**
 * Credentials wallet (C2.5). Pure — credentials-data.ts reads and writes.
 *
 * - Every credential a worker enters is self-reported; organization
 *   verification arrives with the applicant detail in C3. The database
 *   refuses a worker's own row claiming any other level.
 * - An edit appends a row that supersedes the old one, and removal appends a
 *   "removed" row (rule 3). The current wallet is the rows nothing supersedes
 *   that aren't removals.
 * - The identifier is stored in full and only ever shown masked.
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
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : false;
}

function text(v: unknown, max: number): string | null | false {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return false;
  const t = v.trim().replace(/\s+/g, " ");
  if (!t) return null;
  return t.length <= max && !hasHiddenChars(t, true) ? t : false;
}

export function validateCredential(raw: unknown): Validated<CredentialInput> {
  const errors: Record<string, string> = {};
  const r = obj(raw) ?? {};
  const kind = CREDENTIAL_KINDS.find((k) => k.value === r.kind);
  if (!kind) errors.kind = "Choose what kind of credential this is.";

  const label = text(r.label, 80);
  if (label === false) errors.label = "Keep the name under 80 characters.";
  else if (kind?.needsLabel && !label) errors.label = kind.value === "TRAINING" ? "Name the course." : "Say what the credential is.";

  const rawState = typeof r.state === "string" ? r.state.trim().toUpperCase() : r.state;
  const state = rawState === "" || rawState === undefined || rawState === null ? null : typeof rawState === "string" && /^[A-Z]{2}$/.test(rawState) ? rawState : false;
  if (state === false) errors.state = "Use the two-letter state code, e.g. CO.";
  else if (kind?.value === "CIRCULATOR_REGISTRATION" && !state) errors.state = "Which state is the registration for?";

  const identifier = text(r.identifier, 64);
  if (identifier === false) errors.identifier = "Keep the number under 64 characters.";

  const issuedOn = day(r.issuedOn);
  const expiresOn = day(r.expiresOn);
  if (issuedOn === false) errors.issuedOn = "Use a real date.";
  if (expiresOn === false) errors.expiresOn = "Use a real date.";
  if (issuedOn && expiresOn && issuedOn > expiresOn) errors.expiresOn = "The expiry is before the issue date.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kind: kind!.value,
      // A label only where the kind uses one; the kind's own name otherwise.
      label: kind!.needsLabel ? (label as string) : (label || null),
      state: state as string | null,
      identifier: identifier as string | null,
      issuedOn: issuedOn as string | null,
      expiresOn: expiresOn as string | null,
    },
  };
}

/** "•••• 2345": the last four characters at most, and never more than half. */
export function maskIdentifier(id: string | null): string | null {
  if (!id) return null;
  const show = Math.min(4, Math.floor(id.length / 2));
  return show <= 0 ? "••••" : `•••• ${id.slice(-show)}`;
}

/** The wallet now: rows nothing supersedes, minus removals. Newest first. */
export function currentCredentials<T extends Pick<CredentialRow, "id" | "supersedesId" | "removed" | "createdAt">>(rows: T[]): T[] {
  const superseded = new Set(rows.map((r) => r.supersedesId).filter(Boolean));
  return rows
    .filter((r) => !superseded.has(r.id) && !r.removed)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function credentialName(c: Pick<CredentialRow, "kind" | "label" | "state">): string {
  const base = CREDENTIAL_KINDS.find((k) => k.value === c.kind)?.label ?? "Credential";
  const name = c.kind === "TRAINING" || c.kind === "OTHER" ? (c.label ?? base) : base;
  return c.state ? `${c.state} ${name.charAt(0).toLowerCase()}${name.slice(1)}` : name;
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

/** The Today card shows at 30 days and again at 7 (plan C2.5). */
export function expiryReminder(expiresOn: Date | null, today: string): "30" | "7" | "expired" | null {
  const s = expiryState(expiresOn, today);
  if (s.kind === "expired") return s.days <= 30 ? "expired" : null;
  if (s.kind !== "soon") return null;
  return s.days <= 7 ? "7" : "30";
}

export const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
