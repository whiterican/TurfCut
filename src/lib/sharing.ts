/**
 * Worker sharing (C2): who sees each part of a worker's profile. Pure — no
 * database access (sharing-data.ts loads and saves).
 *
 * - Each part (four scorecard groups, availability, credentials) has one of
 *   three audiences. A worker with no saved choice gets DEFAULT_SHARING:
 *   organizations they applied to or accepted an invitation from, for every
 *   part, and not findable. That matches what organizations saw before C2.
 * - canSee() is the only place an audience is turned into yes or no. Every
 *   screen that shows a worker's numbers to someone else goes through it.
 * - Nothing here ranks or scores a worker; a hidden part is "not shared",
 *   never a zero.
 */
import type { Validated } from "@/lib/experience";
import { hasHiddenChars } from "@/lib/text-guard";

export type ShareAudience = "RELATIONSHIP" | "ANY_APPROVED_ORG" | "NOBODY";
export type ShareGroup = "output" | "quality" | "reliability" | "history";
export type SharePart = ShareGroup | "availability" | "credentials";
export type WorkType = "PETITION" | "CANVASS";

export const SHARE_GROUPS: ShareGroup[] = ["output", "quality", "reliability", "history"];
export const SHARE_PARTS: SharePart[] = [...SHARE_GROUPS, "availability", "credentials"];

export const AUDIENCE_OPTIONS: Array<{ value: ShareAudience; label: string }> = [
  { value: "RELATIONSHIP", label: "Organizations I apply to or accept an invite from" },
  { value: "ANY_APPROVED_ORG", label: "Any organization Turfcut has approved" },
  { value: "NOBODY", label: "Nobody" },
];

/** What's in each part (approved as C2-Q1). */
export const PART_DETAILS: Record<SharePart, { label: string; covers: string }> = {
  output: { label: "Output rates", covers: "Doors per hour, doors per shift, signatures per hour" },
  quality: { label: "Quality", covers: "Signature acceptance rate, contact rate" },
  reliability: { label: "Reliability", covers: "Show rate" },
  history: { label: "Hours and history", covers: "Verified shifts, active hours, campaigns, states and dates worked, totals" },
  availability: { label: "Availability", covers: "Your usual week, date exceptions and note" },
  credentials: { label: "Credentials", covers: "Name, verification level and expiry of each credential" },
};

/** The scorecard metric each average belongs to (C2-Q1). */
export const METRIC_GROUP: Record<string, ShareGroup> = {
  doorsPerActiveHour: "output",
  doorsPerCompletedShift: "output",
  signaturesPerActiveHour: "output",
  acceptanceRate: "quality",
  contactRate: "quality",
  showRate: "reliability",
};

export interface SharingChoices {
  audiences: Record<SharePart, ShareAudience>;
  readReceipts: boolean;
  findable: boolean;
  workTypes: WorkType[];
  /** The city or ZIP the worker typed. Never a location from the phone. */
  homeArea: string | null;
  travelMiles: number | null;
}

/** Lists the workers who dismissed the sharing note on Today, on this device. */
export const SHARING_NOTE_COOKIE = "tc_sharing_note";
const NOTE_MAX_WORKERS = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function noteDismissedBy(cookie: string | undefined, workerId: string): boolean {
  return !!cookie && cookie.split(".").includes(workerId);
}

/** The cookie value after this worker dismisses the note: ids only, newest last, at most 8. */
export function withDismissal(cookie: string | undefined, workerId: string): string {
  const ids = (cookie ?? "").split(".").filter((id) => UUID.test(id) && id !== workerId);
  return [...ids, workerId].slice(-NOTE_MAX_WORKERS).join(".");
}

/** Bump when the sharing wording on the worker's screen changes. */
export const SHARING_TEXT_VERSION = "c2-2026-10-06";

export const DEFAULT_SHARING: SharingChoices = {
  audiences: { output: "RELATIONSHIP", quality: "RELATIONSHIP", reliability: "RELATIONSHIP", history: "RELATIONSHIP", availability: "RELATIONSHIP", credentials: "RELATIONSHIP" },
  readReceipts: false,
  findable: false,
  workTypes: [],
  homeArea: null,
  travelMiles: null,
};

/**
 * Who is looking. An organization counts only when Turfcut approved it;
 * "relationship" means the worker applied to, claimed or accepted one of its
 * jobs (RELATIONSHIP_STATUSES), never an invitation alone.
 */
export type Viewer =
  | { kind: "self" }
  | { kind: "org"; approved: boolean; relationship: boolean }
  | { kind: "public" };

/**
 * ANY_APPROVED_ORG already counts here. Today no organization reaches a
 * worker without a relationship (workerAccessFor), so it can't show yet; C3
 * decides whether Matches also requires the worker to be findable.
 */
export function canSee(audience: ShareAudience, viewer: Viewer): boolean {
  if (viewer.kind === "self") return true;
  if (viewer.kind !== "org" || !viewer.approved) return false;
  if (audience === "ANY_APPROVED_ORG") return true;
  if (audience === "RELATIONSHIP") return viewer.relationship;
  return false;
}

export function visibleParts(choices: SharingChoices, viewer: Viewer): Record<SharePart, boolean> {
  return Object.fromEntries(SHARE_PARTS.map((p) => [p, canSee(choices.audiences[p], viewer)])) as Record<SharePart, boolean>;
}

export const MAX_TRAVEL_MILES = 500;
const HOME_AREA_MAX = 80;
const AUDIENCES = AUDIENCE_OPTIONS.map((o) => o.value);
const WORK_TYPES: WorkType[] = ["PETITION", "CANVASS"];

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Checks a save from the worker's form (or anything posing as one). */
export function validateSharing(raw: unknown): Validated<SharingChoices> {
  const errors: Record<string, string> = {};
  const r = obj(raw) ?? {};
  const a = obj(r.audiences) ?? {};

  const audiences = {} as Record<SharePart, ShareAudience>;
  for (const part of SHARE_PARTS) {
    const v = a[part];
    if (typeof v === "string" && (AUDIENCES as string[]).includes(v)) audiences[part] = v as ShareAudience;
    else errors[part] = `Choose who can see your ${PART_DETAILS[part].label.toLowerCase()}.`;
  }
  if (Object.keys(a).some((k) => !(SHARE_PARTS as string[]).includes(k))) errors.audiences = "Unknown sharing choice.";

  const readReceipts = r.readReceipts === undefined ? false : r.readReceipts;
  if (typeof readReceipts !== "boolean") errors.readReceipts = "Read receipts are on or off.";
  const findable = r.findable === undefined ? false : r.findable;
  if (typeof findable !== "boolean") errors.findable = "Choose whether organizations can find you.";

  const rawTypes = r.workTypes === undefined ? [] : r.workTypes;
  const workTypes = Array.isArray(rawTypes) && rawTypes.every((t) => (WORK_TYPES as unknown[]).includes(t)) ? [...new Set(rawTypes as WorkType[])].sort() : null;
  if (!workTypes) errors.workTypes = "Pick petition, canvass or both.";

  const area = typeof r.homeArea === "string" ? r.homeArea.trim().replace(/\s+/g, " ") : r.homeArea ?? null;
  let homeArea: string | null = null;
  if (area === null || area === "") homeArea = null;
  else if (typeof area === "string" && area.length <= HOME_AREA_MAX && !hasHiddenChars(area, true)) homeArea = area;
  else errors.homeArea = `Type a city or ZIP (up to ${HOME_AREA_MAX} characters).`;

  const miles =
    r.travelMiles === "" || r.travelMiles === undefined || r.travelMiles === null
      ? null
      : typeof r.travelMiles === "string"
        ? /^\d{1,3}$/.test(r.travelMiles.trim()) ? Number(r.travelMiles.trim()) : NaN
        : r.travelMiles;
  let travelMiles: number | null = null;
  if (miles === null) travelMiles = null;
  else if (typeof miles === "number" && Number.isInteger(miles) && miles >= 1 && miles <= MAX_TRAVEL_MILES) travelMiles = miles;
  else errors.travelMiles = `Travel distance is a whole number of miles, 1 to ${MAX_TRAVEL_MILES}.`;

  if (findable === true) {
    if (workTypes && workTypes.length === 0) errors.workTypes ??= "Pick the work you want to be found for.";
    if (homeArea === null && !errors.homeArea) errors.homeArea = "Type the city or ZIP you'd travel from.";
    if (travelMiles === null && !errors.travelMiles) errors.travelMiles = "Choose how far you'd travel.";
  } else {
    // Not findable: Turfcut keeps no home area, radius or work types.
    delete errors.workTypes;
    delete errors.homeArea;
    delete errors.travelMiles;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: findable
      ? { audiences, readReceipts: readReceipts as boolean, findable: true, workTypes: workTypes!, homeArea, travelMiles }
      : { audiences, readReceipts: readReceipts as boolean, findable: false, workTypes: [], homeArea: null, travelMiles: null },
  };
}

export function sameSharing(a: SharingChoices, b: SharingChoices): boolean {
  return (
    SHARE_PARTS.every((p) => a.audiences[p] === b.audiences[p]) &&
    a.readReceipts === b.readReceipts &&
    a.findable === b.findable &&
    a.workTypes.join() === b.workTypes.join() &&
    a.homeArea === b.homeArea &&
    a.travelMiles === b.travelMiles
  );
}

/** A stored WorkerSharing row as choices. */
export function sharingFromRow(row: {
  outputAudience: ShareAudience;
  qualityAudience: ShareAudience;
  reliabilityAudience: ShareAudience;
  historyAudience: ShareAudience;
  availabilityAudience: ShareAudience;
  credentialsAudience: ShareAudience;
  readReceipts: boolean;
  findable: boolean;
  workTypes: WorkType[];
  homeArea: string | null;
  travelMiles: number | null;
}): SharingChoices {
  return {
    audiences: {
      output: row.outputAudience,
      quality: row.qualityAudience,
      reliability: row.reliabilityAudience,
      history: row.historyAudience,
      availability: row.availabilityAudience,
      credentials: row.credentialsAudience,
    },
    readReceipts: row.readReceipts,
    findable: row.findable,
    workTypes: [...row.workTypes].sort(),
    homeArea: row.homeArea,
    travelMiles: row.travelMiles,
  };
}

/** Choices as WorkerSharing columns. */
export function sharingToRow(c: SharingChoices) {
  return {
    outputAudience: c.audiences.output,
    qualityAudience: c.audiences.quality,
    reliabilityAudience: c.audiences.reliability,
    historyAudience: c.audiences.history,
    availabilityAudience: c.audiences.availability,
    credentialsAudience: c.audiences.credentials,
    readReceipts: c.readReceipts,
    findable: c.findable,
    workTypes: c.workTypes,
    homeArea: c.homeArea,
    travelMiles: c.travelMiles,
  };
}
