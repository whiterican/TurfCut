/**
 * Field day: the shift loop from check-in to review (spec p.13, mockup
 * "Field day"). Pure functions — no database access.
 *
 * Rules:
 * - Work events are append-only. Every action here produces a new event;
 *   nothing is edited. Who recorded it (worker or supervisor) is kept.
 * - Chain of custody is metadata only: packet IDs, sheet counts and claimed
 *   signatures. Signed sheets are never photographed or uploaded.
 * - Check-in location: the worker's position is compared with the staging
 *   point and then discarded. Only "at staging: yes/no" and a rough distance
 *   band are stored. No location is tracked during the shift.
 * - New shifts are frozen while the jurisdiction rule profile is unusable
 *   (canScheduleShift in lib/jobs.ts).
 * - A worker can't hold two overlapping shifts, across every campaign.
 */
import type { Validated } from "@/lib/experience";
import { UUID_RE } from "@/lib/jobs";

// ---------------------------------------------------------------------------
// Events → shift state
// ---------------------------------------------------------------------------

export interface FieldEvent {
  type: string;
  payload: unknown;
  actorId: string | null;
  createdAt: Date;
}

export interface FieldValidation {
  workEventId: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string | null;
  createdAt: Date;
}

export interface ShiftFacts {
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  startsAt: Date;
  endsAt: Date;
  workType: "PETITION" | "CANVASS";
  events: FieldEvent[];
  validations: FieldValidation[];
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export interface ShiftState {
  cancelled: boolean;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  paused: boolean;
  /** Packets handed out and not yet returned, by packet ID. */
  packetsOut: string[];
  packetsReturned: string[];
  signatures: number;
  doors: number;
  contacts: number;
  batchCounted: boolean;
  closeout: FieldValidation | null;
  atStaging: boolean | null;
}

export function shiftState(s: ShiftFacts): ShiftState {
  const st: ShiftState = {
    cancelled: s.status === "CANCELLED",
    checkedInAt: null,
    checkedOutAt: null,
    paused: false,
    packetsOut: [],
    packetsReturned: [],
    signatures: 0,
    doors: 0,
    contacts: 0,
    batchCounted: false,
    closeout: null,
    atStaging: null,
  };
  const out = new Set<string>();
  for (const e of [...s.events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const p = obj(e.payload);
    switch (e.type) {
      case "CHECK_IN":
        st.checkedInAt ??= e.createdAt;
        st.atStaging = typeof p.atStaging === "boolean" ? p.atStaging : null;
        break;
      case "CHECK_OUT":
        st.checkedOutAt ??= e.createdAt;
        st.paused = false;
        break;
      case "PAUSE_START":
        st.paused = true;
        break;
      case "PAUSE_END":
        st.paused = false;
        break;
      case "PACKET_PICKUP":
        if (typeof p.packetId === "string") out.add(p.packetId);
        break;
      case "PACKET_RETURN":
        if (typeof p.packetId === "string" && out.delete(p.packetId)) st.packetsReturned.push(p.packetId);
        break;
      case "SIGNATURE_SUBMITTED":
        st.signatures += num(p.count) || 1;
        break;
      case "DOOR_KNOCK":
        st.doors += num(p.count) || 1;
        break;
      case "CONTACT":
        st.contacts += num(p.count) || 1;
        break;
      case "BATCH_COUNT":
        st.batchCounted = true;
        break;
      case "SHIFT_CANCELLED":
        st.cancelled = true;
        break;
    }
  }
  st.packetsOut = [...out];
  const closeouts = s.validations.filter((v) => v.workEventId === null).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  st.closeout = closeouts[0] ?? null;
  return st;
}

// ---------------------------------------------------------------------------
// Progress (the mockup's five-step timeline)
// ---------------------------------------------------------------------------

export type StepState = "done" | "current" | "todo";
export interface ProgressStep {
  key: "checkin" | "materials" | "collecting" | "return" | "payout";
  label: string;
  state: StepState;
  detail: string;
  /** When the step happened, for the browser to show in local time. */
  at?: Date;
}

export function shiftProgress(s: ShiftFacts): ProgressStep[] {
  const st = shiftState(s);
  const petition = s.workType === "PETITION";
  const returned = st.checkedOutAt !== null && st.packetsOut.length === 0;
  const reviewed = st.closeout?.status === "APPROVED" || st.closeout?.status === "REJECTED";
  const raw: Array<Omit<ProgressStep, "state"> & { done: boolean }> = [
    {
      key: "checkin",
      label: "Checked in",
      done: !!st.checkedInAt,
      at: st.checkedInAt ?? undefined,
      detail: st.checkedInAt
        ? st.atStaging === null ? "Location not checked" : st.atStaging ? "At staging" : "Away from staging"
        : "Check in when you arrive at staging",
    },
    {
      key: "materials",
      label: "Materials received",
      done: st.packetsOut.length + st.packetsReturned.length > 0 || !petition,
      detail: petition
        ? st.packetsOut.length + st.packetsReturned.length > 0
          ? `Packet ${[...st.packetsOut, ...st.packetsReturned].join(", ")}`
          : "Your supervisor records the packets you pick up"
        : "No petition packets for this shift",
    },
    {
      key: "collecting",
      label: petition ? "Collecting signatures" : "Knocking doors",
      done: !!st.checkedOutAt,
      detail: petition ? `${st.signatures} submitted` : `${st.doors} doors · ${st.contacts} contacts`,
    },
    {
      key: "return",
      label: "Return & review",
      done: reviewed,
      detail: reviewed
        ? st.closeout!.status === "APPROVED"
          ? "Approved by your supervisor"
          : `Not approved${st.closeout!.reason ? `: ${st.closeout!.reason}` : ""}`
        : returned
          ? "Awaiting supervisor review"
          : "Return packets and check out",
    },
    { key: "payout", label: "Payout", done: false, detail: "After approval — in-app payouts arrive in M4" },
  ];
  let current = false;
  return raw.map(({ done, ...step }) => {
    if (done) return { ...step, state: "done" as const };
    if (!current && !st.cancelled) {
      current = true;
      return { ...step, state: "current" as const };
    }
    return { ...step, state: "todo" as const };
  });
}

// ---------------------------------------------------------------------------
// Actions → the event to append, or why not
// ---------------------------------------------------------------------------

export const CHECK_IN_EARLY_MIN = 60;

export type WorkerAction =
  | { kind: "check_in"; location: LocationCheck }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "log"; unit: "signatures" | "doors" | "contacts"; count: number }
  | { kind: "return_packet"; packetId: string; sheetsReturned: number; signatures: number }
  | { kind: "check_out" }
  | { kind: "cancel"; reason: string };

export type SupervisorAction =
  | { kind: "packet_pickup"; packetId: string; sheets: number }
  | { kind: "batch_count"; reviewed: number; accepted: number; rejected: number; exceptions: string | null }
  | { kind: "closeout"; status: "APPROVED" | "REJECTED"; reason: string | null }
  | { kind: "cancel"; reason: string };

export type Outcome =
  | { ok: true; event: { type: string; payload: Record<string, unknown> } | null; closeout?: { status: "APPROVED" | "REJECTED"; reason: string | null }; status?: ShiftFacts["status"] }
  | { ok: false; reason: string };

const no = (reason: string): Outcome => ({ ok: false, reason });

export function workerAction(s: ShiftFacts, a: WorkerAction, now: Date): Outcome {
  const st = shiftState(s);
  if (st.cancelled) return no("This shift was cancelled.");
  const active = !!st.checkedInAt && !st.checkedOutAt;
  switch (a.kind) {
    case "check_in": {
      if (st.checkedInAt) return no("You're already checked in.");
      const opens = new Date(s.startsAt.getTime() - CHECK_IN_EARLY_MIN * 60_000);
      if (now < opens) return no(`Check-in opens ${CHECK_IN_EARLY_MIN} minutes before the shift starts.`);
      if (now > s.endsAt) return no("This shift has already ended.");
      const payload = a.location.checked ? { atStaging: a.location.atStaging, distance: a.location.distance } : { locationChecked: false };
      return { ok: true, event: { type: "CHECK_IN", payload }, status: "ACTIVE" };
    }
    case "pause":
      if (!active) return no("You're not on shift.");
      if (st.paused) return no("You're already on a break.");
      return { ok: true, event: { type: "PAUSE_START", payload: { reason: "break" } } };
    case "resume":
      if (!st.paused) return no("You're not on a break.");
      return { ok: true, event: { type: "PAUSE_END", payload: {} } };
    case "log": {
      if (!active) return no("Check in before logging work.");
      if (st.paused) return no("End your break before logging work.");
      if (!Number.isInteger(a.count) || a.count < 1 || a.count > 500) return no("Enter a count from 1 to 500.");
      if (a.unit === "signatures" && s.workType !== "PETITION") return no("This isn't a petition shift.");
      if (a.unit !== "signatures" && s.workType !== "CANVASS") return no("This isn't a canvass shift.");
      const type = a.unit === "signatures" ? "SIGNATURE_SUBMITTED" : a.unit === "doors" ? "DOOR_KNOCK" : "CONTACT";
      return { ok: true, event: { type, payload: { count: a.count } } };
    }
    case "return_packet": {
      if (!st.checkedInAt) return no("Check in first.");
      if (!st.packetsOut.includes(a.packetId)) return no("That packet isn't checked out to you on this shift.");
      if (!Number.isInteger(a.sheetsReturned) || a.sheetsReturned < 0 || a.sheetsReturned > 1000) return no("Enter the number of sheets returned.");
      if (!Number.isInteger(a.signatures) || a.signatures < 0 || a.signatures > 10_000) return no("Enter the signatures you're claiming on this packet.");
      return { ok: true, event: { type: "PACKET_RETURN", payload: { packetId: a.packetId, sheetsReturned: a.sheetsReturned, signatures: a.signatures } } };
    }
    case "check_out":
      if (!active) return no("You're not on shift.");
      if (st.paused) return no("End your break before checking out.");
      if (st.packetsOut.length) return no(`Return packet ${st.packetsOut.join(", ")} before checking out.`);
      return { ok: true, event: { type: "CHECK_OUT", payload: {} }, status: "COMPLETED" };
    case "cancel":
      if (st.checkedInAt) return no("You can't cancel a shift you've started.");
      if (!a.reason.trim()) return no("Say briefly why you're cancelling.");
      return { ok: true, event: { type: "SHIFT_CANCELLED", payload: { by: "WORKER", reason: a.reason.trim().slice(0, 200) } }, status: "CANCELLED" };
  }
}

/**
 * Supervisor actions. `packetsOutElsewhere` lists packet IDs currently out on
 * other shifts of the same job — a packet can't be in two hands at once.
 */
export function supervisorAction(s: ShiftFacts, a: SupervisorAction, packetsOutElsewhere: string[]): Outcome {
  const st = shiftState(s);
  if (st.cancelled) return no("This shift was cancelled.");
  switch (a.kind) {
    case "packet_pickup": {
      const id = a.packetId.trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(id)) return no("Packet IDs are letters, numbers, dots, dashes or underscores (up to 40).");
      if (!st.checkedInAt) return no("The worker must check in before taking packets.");
      if (st.checkedOutAt) return no("The worker has already checked out.");
      if (st.packetsOut.includes(id) || st.packetsReturned.includes(id)) return no(`Packet ${id} is already recorded on this shift.`);
      if (packetsOutElsewhere.includes(id)) return no(`Packet ${id} is still checked out on another shift. Record its return first.`);
      if (!Number.isInteger(a.sheets) || a.sheets < 1 || a.sheets > 1000) return no("Enter the number of sheets in the packet.");
      return { ok: true, event: { type: "PACKET_PICKUP", payload: { packetId: id, sheets: a.sheets } } };
    }
    case "batch_count": {
      if (!st.checkedOutAt) return no("Count the batch after the worker checks out.");
      const ints = [a.reviewed, a.accepted, a.rejected];
      if (!ints.every((n) => Number.isInteger(n) && n >= 0 && n <= 100_000)) return no("Counts must be whole numbers.");
      if (a.accepted + a.rejected !== a.reviewed) return no("Accepted plus rejected must equal reviewed.");
      return {
        ok: true,
        event: {
          type: "BATCH_COUNT",
          payload: { reviewed: a.reviewed, accepted: a.accepted, rejected: a.rejected, ...(a.exceptions ? { exceptions: a.exceptions.slice(0, 500) } : {}) },
        },
      };
    }
    case "closeout": {
      if (!st.checkedOutAt) return no("Review the shift after the worker checks out.");
      if (st.packetsOut.length) return no(`Packet ${st.packetsOut.join(", ")} hasn't been returned.`);
      if (a.status === "REJECTED" && !a.reason?.trim()) return no("Give the worker a reason when a shift isn't approved.");
      return { ok: true, event: null, closeout: { status: a.status, reason: a.reason?.trim().slice(0, 500) || null } };
    }
    case "cancel":
      if (st.checkedInAt) return no("This shift has started; review it instead.");
      if (!a.reason.trim()) return no("Give the worker a reason.");
      return { ok: true, event: { type: "SHIFT_CANCELLED", payload: { by: "ORGANIZATION", reason: a.reason.trim().slice(0, 200) } }, status: "CANCELLED" };
  }
}

// ---------------------------------------------------------------------------
// Check-in location — compared, then discarded
// ---------------------------------------------------------------------------

export const STAGING_RADIUS_M = 250;
export type LocationCheck =
  | { checked: false }
  | { checked: true; atStaging: boolean; distance: "under 250 m" | "250 m – 1 km" | "over 1 km" };

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The only thing stored about where the worker was: a yes/no and a band. */
export function locationCheck(
  staging: { lat: number | null; lng: number | null },
  device: { lat: number; lng: number } | null
): LocationCheck {
  if (!device || staging.lat === null || staging.lng === null) return { checked: false };
  if (!isLatLng(device.lat, device.lng)) return { checked: false };
  const d = distanceMeters({ lat: staging.lat, lng: staging.lng }, device);
  return { checked: true, atStaging: d <= STAGING_RADIUS_M, distance: d <= STAGING_RADIUS_M ? "under 250 m" : d <= 1000 ? "250 m – 1 km" : "over 1 km" };
}

const isLatLng = (lat: unknown, lng: unknown) =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

/** Shifts that overlap [startsAt, endsAt). Cancelled shifts never conflict. */
export function findConflicts<T extends { startsAt: Date; endsAt: Date; status: string }>(
  shift: { startsAt: Date; endsAt: Date },
  existing: T[]
): T[] {
  return existing.filter((e) => e.status !== "CANCELLED" && e.startsAt < shift.endsAt && shift.startsAt < e.endsAt);
}

export interface TurfPolygon {
  type: "Polygon";
  coordinates: [number, number][][];
}

/** Accepts a GeoJSON Polygon: one closed ring of 4–500 [lng, lat] points. */
export function readTurf(v: unknown): TurfPolygon | null {
  const o = obj(v);
  if (o.type !== "Polygon" || !Array.isArray(o.coordinates) || o.coordinates.length !== 1) return null;
  const ring = o.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 500) return null;
  if (!ring.every((p) => Array.isArray(p) && p.length === 2 && isLatLng(p[1], p[0]))) return null;
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (first[0] !== last[0] || first[1] !== last[1]) return null;
  return { type: "Polygon", coordinates: [ring.map((p: number[]) => [p[0], p[1]] as [number, number])] };
}

export interface ShiftInput {
  startsAt: Date;
  endsAt: Date;
  stagingLocation: string | null;
  stagingLat: number | null;
  stagingLng: number | null;
  supervisorId: string | null;
  turfArea: TurfPolygon | null;
}

/**
 * Validates the schedule form. Times arrive as ISO strings (the browser
 * converts the organizer's local time), so the server never guesses a zone.
 */
export function validateShift(raw: Record<string, unknown>, job: { startsAt: Date | null; endsAt: Date | null }): Validated<ShiftInput> {
  const errors: Record<string, string> = {};
  const t = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim() : "");
  const when = (k: string, label: string) => {
    const d = new Date(t(k));
    if (!t(k) || Number.isNaN(d.getTime())) {
      errors[k] = `${label} is required.`;
      return null;
    }
    return d;
  };
  const startsAt = when("startsAt", "Start time");
  const endsAt = when("endsAt", "End time");
  if (startsAt && endsAt) {
    const hours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
    if (hours <= 0) errors.endsAt = "The shift must end after it starts.";
    else if (hours > 14) errors.endsAt = "Shifts can be at most 14 hours.";
    const day = (d: Date) => d.toISOString().slice(0, 10);
    // Job dates are calendar days; allow the shift's local day to straddle UTC.
    if (job.startsAt && day(new Date(startsAt.getTime() + 14 * 3_600_000)) < day(job.startsAt)) errors.startsAt = "That's before the job starts.";
    if (job.endsAt && day(new Date(startsAt.getTime() - 14 * 3_600_000)) > day(job.endsAt)) errors.startsAt = "That's after the job ends.";
  }
  const stagingLocation = t("stagingLocation").replace(/\s+/g, " ") || null;
  if (stagingLocation && stagingLocation.length > 200) errors.stagingLocation = "Keep the staging location under 200 characters.";
  const [latS, lngS] = [t("stagingLat"), t("stagingLng")];
  let stagingLat: number | null = null;
  let stagingLng: number | null = null;
  if (latS || lngS) {
    const [lat, lng] = [Number(latS), Number(lngS)];
    if (!latS || !lngS || !isLatLng(lat, lng)) errors.stagingLat = "Pick the staging point on the map, or leave it empty.";
    else [stagingLat, stagingLng] = [Math.round(lat * 1e6) / 1e6, Math.round(lng * 1e6) / 1e6];
  }
  const supervisorId = t("supervisorId") || null;
  if (supervisorId && !UUID_RE.test(supervisorId)) errors.supervisorId = "Pick a supervisor.";
  let turfArea: TurfPolygon | null = null;
  if (t("turfArea")) {
    try {
      turfArea = readTurf(JSON.parse(t("turfArea")));
    } catch {
      turfArea = null;
    }
    if (!turfArea) errors.turfArea = "Draw the turf with at least three points, or clear it.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { startsAt: startsAt!, endsAt: endsAt!, stagingLocation, stagingLat, stagingLng, supervisorId, turfArea } };
}
