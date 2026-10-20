import { US_STATES } from "@/lib/experience";
import { COMPENSATION_METHODS, type CompensationMethod } from "@/lib/jobs";

/**
 * The rules a jurisdiction profile carries (M10.3), as the publish gate and
 * the job card read them (lib/jobs.ts). Browser-safe: the version form
 * shares this with the server.
 */
export interface JurisdictionRules {
  /** Pay methods jobs may use here. Hourly is always allowed by the gate; it is listed so the record says so. */
  compensationAllowed: CompensationMethod[];
  /** Counsel's explicit per-unit approval; required by the gate before any per-unit job, on top of the method being listed. */
  perUnitAllowed: boolean;
  workerRegistrationRequired: boolean;
  badgeRequired: boolean;
  affidavitRequired: boolean;
  notes: string;
}

export const NOTES_MAX = 2000;
export const METHOD_VALUES = COMPENSATION_METHODS.map((m) => m.value) as readonly CompensationMethod[];
const isMethod = (v: unknown): v is CompensationMethod => typeof v === "string" && (METHOD_VALUES as readonly string[]).includes(v);

/** A stored rules record read tolerantly: unknown or malformed fields fall back to the strict defaults. */
export function readRules(raw: unknown): JurisdictionRules {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const methods = Array.isArray(r.compensationAllowed) ? r.compensationAllowed.filter(isMethod) : [];
  return {
    compensationAllowed: methods.length ? [...new Set(methods)] : ["HOURLY"],
    perUnitAllowed: r.perUnitAllowed === true,
    workerRegistrationRequired: r.workerRegistrationRequired === true,
    badgeRequired: r.badgeRequired === true,
    affidavitRequired: r.affidavitRequired === true,
    notes: typeof r.notes === "string" ? r.notes : "",
  };
}

/** Why a rules record can't be saved (empty = fine). */
export function rulesProblems(rules: JurisdictionRules): string[] {
  const out: string[] = [];
  if (!rules.compensationAllowed.length) out.push("Allow at least one pay method.");
  if (rules.compensationAllowed.some((m) => !isMethod(m))) out.push("Unknown pay method.");
  if (rules.compensationAllowed.includes("PER_UNIT") !== rules.perUnitAllowed) out.push("Per-unit pay is allowed only with counsel's explicit per-unit approval, and that approval means the method is allowed.");
  if (rules.notes.length > NOTES_MAX) out.push(`Keep the notes to ${NOTES_MAX} characters or fewer.`);
  return out;
}

/** The version form's fields as rules: ticked methods (per-unit ticks both flags), the three circulator requirements, and the notes. */
export function rulesFromForm(get: (name: string) => string[]): JurisdictionRules {
  const methods = get("methods").filter(isMethod);
  return {
    compensationAllowed: [...new Set(methods)],
    perUnitAllowed: methods.includes("PER_UNIT"),
    workerRegistrationRequired: get("workerRegistrationRequired").length > 0,
    badgeRequired: get("badgeRequired").length > 0,
    affidavitRequired: get("affidavitRequired").length > 0,
    notes: (get("notes")[0] ?? "").trim(),
  };
}

export const LOCALITY_MAX = 80;

/** A place for a profile: a state (two letters, one of the fifty plus DC) and an optional locality, cleaned, or what is wrong. */
export function readPlace(rawState: unknown, rawLocality: unknown): { ok: true; state: string; locality: string | null } | { ok: false; message: string } {
  const state = typeof rawState === "string" ? rawState.trim().toUpperCase() : "";
  if (!(US_STATES as readonly string[]).includes(state)) return { ok: false, message: "Pick a state." };
  const locality = typeof rawLocality === "string" ? rawLocality.trim().replace(/\s+/g, " ") : "";
  if (locality.length > LOCALITY_MAX) return { ok: false, message: `Keep the locality to ${LOCALITY_MAX} characters or fewer.` };
  return { ok: true, state, locality: locality || null };
}
