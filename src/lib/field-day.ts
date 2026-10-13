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
import { CORRECTABLE, effectiveEvents } from "@/lib/corrections";

// Also runs on the phone (offline field day), so it doesn't import lib/jobs.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Events → shift state
// ---------------------------------------------------------------------------

export interface FieldEvent {
  /** The ledger row (absent for entries the phone hasn't synced yet). */
  id?: string;
  type: string;
  payload: unknown;
  actorId: string | null;
  createdAt: Date;
}

/**
 * The shift's events with supervisor corrections applied (lib/corrections):
 * what every reader below — state, time worked, flags — works from, so they
 * agree with the scorecard and pay — including dropping an entry a
 * per-entry review rejected. Entries without an id can't be corrected and
 * pass through.
 */
export function correctedEvents(s: Pick<ShiftFacts, "events" | "validations">): FieldEvent[] {
  const withId = s.events.filter((e): e is FieldEvent & { id: string } => !!e.id);
  const rest = s.events.filter((e) => !e.id);
  return [...effectiveEvents(withId, s.validations).events, ...rest];
}

export interface FieldValidation {
  workEventId: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
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
  /** True when the organization assigned turf for this shift. */
  campaignTurf?: boolean;
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
  const corrected = correctedEvents(s);
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
  for (const e of [...corrected].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
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
        // Same rule as pay (lib/scorecard verifiedWork): only a valid count counts.
        if (num(p.accepted) >= 0 && typeof p.accepted === "number" && (typeof p.reviewed === "number" || typeof p.rejected === "number")) st.batchCounted = true;
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

/** One-word status for lists, with its badge style. */
export function shiftStatusLabel(st: ShiftState): { label: string; badge: string } {
  if (st.cancelled) return { label: "Cancelled", badge: "badge-neutral" };
  if (st.closeout?.status === "APPROVED") return { label: "Approved", badge: "badge-solid" };
  if (st.closeout?.status === "REJECTED") return { label: "Not approved", badge: "badge-coral" };
  if (st.checkedOutAt) return { label: "In review", badge: "badge-butter" };
  if (st.checkedInAt) return { label: st.paused ? "On break" : "On shift", badge: "badge-accent" };
  return { label: "Scheduled", badge: "badge-sky" };
}

// ---------------------------------------------------------------------------
// Progress (the mockup's five-step timeline)
// ---------------------------------------------------------------------------

export type StepState = "done" | "current" | "todo";
/**
 * Time worked so far: check-in to check-out (or `now` while on shift, but
 * never past the scheduled end — a forgotten check-out doesn't keep
 * counting), minus breaks (an open break runs to the end). Once the worker
 * checks out, the check-out time counts even if it's after the scheduled
 * end, as in the scorecard's verified hours (what pay is based on) — so the
 * review shows `scheduleFlags` for time outside the schedule.
 */
export function activeTime(s: ShiftFacts, now: Date): { ms: number; running: boolean } {
  const events = [...correctedEvents(s)].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const checkIn = events.find((e) => e.type === "CHECK_IN")?.createdAt;
  if (!checkIn) return { ms: 0, running: false };
  const checkOut = events.find((e) => e.type === "CHECK_OUT")?.createdAt;
  const overdue = !checkOut && now > s.endsAt;
  const end = checkOut ?? (overdue ? s.endsAt : now);
  let paused = 0;
  let pauseStart: Date | null = null;
  for (const e of events) {
    if (e.type === "PAUSE_START" && !pauseStart) pauseStart = e.createdAt;
    if (e.type === "PAUSE_END" && pauseStart) {
      paused += Math.max(0, Math.min(e.createdAt.getTime(), end.getTime()) - Math.max(pauseStart.getTime(), checkIn.getTime()));
      pauseStart = null;
    }
  }
  if (pauseStart) paused += Math.max(0, end.getTime() - Math.max(pauseStart.getTime(), checkIn.getTime()));
  const ms = Math.max(0, end.getTime() - checkIn.getTime() - paused);
  return { ms, running: !checkOut && !overdue && !pauseStart && s.status !== "CANCELLED" };
}

/** Slack before time outside the schedule is flagged (a punctual early arrival isn't). */
const SCHEDULE_SLACK_MS = 15 * 60_000;
const span = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
};

/**
 * Worked time outside the scheduled window, for the reviewer: an early
 * check-in or a late check-out counts toward verified hours, so the person
 * approving the shift sees it before they do.
 */
export function scheduleFlags(s: ShiftFacts): string[] {
  const events = [...correctedEvents(s)].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const checkIn = events.find((e) => e.type === "CHECK_IN")?.createdAt;
  const checkOut = events.find((e) => e.type === "CHECK_OUT")?.createdAt;
  const out: string[] = [];
  if (checkIn && s.startsAt.getTime() - checkIn.getTime() > SCHEDULE_SLACK_MS) {
    out.push(`Checked in ${span(s.startsAt.getTime() - checkIn.getTime())} before the scheduled start.`);
  }
  if (checkOut && checkOut.getTime() - s.endsAt.getTime() > SCHEDULE_SLACK_MS) {
    out.push(`Checked out ${span(checkOut.getTime() - s.endsAt.getTime())} after the scheduled end.`);
  }
  return out;
}

/**
 * The live earnings estimate — gross, and never a promise: pay follows
 * supervisor review. Hourly: rate × time worked. Per unit: rate × units
 * submitted, labelled "if all accepted". Shift rate: the rate.
 */
export function earningsEstimate(
  method: "HOURLY" | "SHIFT_RATE" | "PER_UNIT",
  cents: number | null,
  activeMs: number,
  units: number
): { cents: number; label: string } | null {
  if (!cents) return null;
  if (method === "HOURLY") return { cents: Math.floor((cents * activeMs) / 3_600_000), label: "Est. gross" };
  if (method === "PER_UNIT") return { cents: cents * units, label: "Gross if all accepted" };
  return { cents, label: "Per completed shift" };
}

export interface ProgressStep {
  key: "checkin" | "materials" | "collecting" | "return" | "payout";
  label: string;
  state: StepState;
  detail: string;
  /** When the step happened, for the browser to show in local time. */
  at?: Date;
}

/** `payout`: the pay step as the caller may show it (lib/pay-data shiftPay). */
export function shiftProgress(s: ShiftFacts, payout?: { done: boolean; detail: string; at?: Date }): ProgressStep[] {
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
      at: petition ? s.events.filter((e) => e.type === "PACKET_PICKUP").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]?.createdAt : undefined,
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
    { key: "payout", label: "Payout", done: payout?.done ?? false, at: payout?.at, detail: payout?.detail ?? "Paid in the app after your supervisor approves the shift" },
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
      // Packet IDs match regardless of case ("18a" is packet 18A).
      const packetId = st.packetsOut.find((p) => samePacket(p, a.packetId));
      if (!packetId) return no("That packet isn't checked out to you on this shift.");
      if (!Number.isInteger(a.sheetsReturned) || a.sheetsReturned < 0 || a.sheetsReturned > 1000) return no("Enter the number of sheets returned.");
      if (!Number.isInteger(a.signatures) || a.signatures < 0 || a.signatures > 10_000) return no("Enter the signatures you're claiming on this packet.");
      return { ok: true, event: { type: "PACKET_RETURN", payload: { packetId, sheetsReturned: a.sheetsReturned, signatures: a.signatures } } };
    }
    case "check_out":
      if (!active) return no("You're not on shift.");
      if (st.paused) return no("End your break before checking out.");
      if (st.packetsOut.length) return no(`Return packet ${st.packetsOut.join(", ")} before checking out.`);
      return { ok: true, event: { type: "CHECK_OUT", payload: {} }, status: "COMPLETED" };
    case "cancel":
      if (st.checkedInAt) return no("You can't cancel a shift you've started.");
      if (now > s.endsAt) return no("This shift has already ended.");
      if (!a.reason.trim()) return no("Say briefly why you're cancelling.");
      return { ok: true, event: { type: "SHIFT_CANCELLED", payload: { by: "WORKER", reason: a.reason.trim().slice(0, 200) } }, status: "CANCELLED" };
  }
}

/** Packet IDs are compared without case: "18a" and "18A" are one packet. */
export const samePacket = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * Supervisor actions. `packetsOutElsewhere` lists packet IDs currently out on
 * other shifts of the same job — a packet can't be in two hands at once.
 */
export function supervisorAction(s: ShiftFacts, a: SupervisorAction, packetsOutElsewhere: string[], now: Date): Outcome {
  const st = shiftState(s);
  if (st.cancelled) return no("This shift was cancelled.");
  switch (a.kind) {
    case "packet_pickup": {
      const id = a.packetId.trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(id)) return no("Packet IDs are letters, numbers, dots, dashes or underscores (up to 40).");
      if (!st.checkedInAt) return no("The worker must check in before taking packets.");
      if (st.checkedOutAt) return no("The worker has already checked out.");
      if ([...st.packetsOut, ...st.packetsReturned].some((p) => samePacket(p, id))) return no(`Packet ${id} is already recorded on this shift.`);
      if (packetsOutElsewhere.some((p) => samePacket(p, id))) return no(`Packet ${id} is still checked out on another shift. Record its return first.`);
      if (!Number.isInteger(a.sheets) || a.sheets < 1 || a.sheets > 1000) return no("Enter the number of sheets in the packet.");
      return { ok: true, event: { type: "PACKET_PICKUP", payload: { packetId: id, sheets: a.sheets } } };
    }
    case "batch_count": {
      if (s.workType !== "PETITION") return no("Batch counts are for petition shifts.");
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
      // After the end an unstarted shift is a no-show; cancelling can't erase it.
      if (now > s.endsAt) return no("This shift has already ended.");
      if (!a.reason.trim()) return no("Give the worker a reason.");
      return { ok: true, event: { type: "SHIFT_CANCELLED", payload: { by: "ORGANIZATION", reason: a.reason.trim().slice(0, 200) } }, status: "CANCELLED" };
  }
}

// ---------------------------------------------------------------------------
// Supervisor corrections (M7) — new events that supersede, never edits
// ---------------------------------------------------------------------------

/** Events a supervisor may enter on a worker's behalf. */
export const ENTERABLE = ["CHECK_IN", "CHECK_OUT", "PAUSE_START", "PAUSE_END", "SIGNATURE_SUBMITTED", "DOOR_KNOCK", "CONTACT", "PACKET_RETURN"] as const;
export type EnterableType = (typeof ENTERABLE)[number];
/** An entered or corrected time must fall inside the shift ± this. */
export const CORRECTION_WINDOW_MS = 2 * 3_600_000;
const COUNTED = new Set(["SIGNATURE_SUBMITTED", "DOOR_KNOCK", "CONTACT"]);

export type CorrectionAction =
  | { kind: "correct_event"; eventId: string; at?: Date; count?: number; sheetsReturned?: number; signatures?: number; reason: string }
  | { kind: "enter_event"; type: EnterableType; at: Date; count?: number; packetId?: string; sheetsReturned?: number; signatures?: number; reason: string };

export type CorrectionOutcome =
  | { ok: true; event: { type: string; payload: Record<string, unknown>; createdAt: Date } }
  | { ok: false; reason: string };

const noC = (reason: string): CorrectionOutcome => ({ ok: false, reason });
const intIn = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Why a timeline (events already corrected) can't have happened, or null:
 * one check-in, nothing before it or after check-out, breaks alternate,
 * packets return after they went out and before check-out.
 */
export function timelineProblem(events: FieldEvent[], s: Pick<ShiftFacts, "startsAt" | "endsAt" | "workType">): string | null {
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let checkIn: Date | null = null;
  let checkOut: Date | null = null;
  let paused = false;
  const out = new Set<string>();
  for (const e of sorted) {
    const p = (e.payload ?? {}) as Record<string, unknown>;
    switch (e.type) {
      case "CHECK_IN":
        if (checkIn) return "That would make two check-ins.";
        checkIn = e.createdAt;
        break;
      case "CHECK_OUT":
        if (!checkIn) return "A check-out needs a check-in before it.";
        if (checkOut) return "That would make two check-outs.";
        if (paused) return "The break would still be open at check-out.";
        if (out.size) return `Packet ${[...out].join(", ")} would still be out at check-out.`;
        checkOut = e.createdAt;
        break;
      case "PAUSE_START":
        if (!checkIn || checkOut) return "A break has to start while on shift.";
        if (paused) return "That would start a break during a break.";
        paused = true;
        break;
      case "PAUSE_END":
        if (!paused) return "That would end a break that hadn't started.";
        paused = false;
        break;
      case "SIGNATURE_SUBMITTED":
      case "DOOR_KNOCK":
      case "CONTACT":
        if (!checkIn || checkOut) return "Work has to be logged while on shift.";
        if (!intIn(p.count, 1, 500)) return "Counts are whole numbers from 1 to 500.";
        if (e.type === "SIGNATURE_SUBMITTED" && s.workType !== "PETITION") return "Signatures are for petition shifts.";
        if (e.type !== "SIGNATURE_SUBMITTED" && s.workType !== "CANVASS") return "Doors and contacts are for canvass shifts.";
        break;
      case "PACKET_PICKUP":
        if (!checkIn || checkOut) return "A packet can only go out while on shift.";
        if (typeof p.packetId === "string") out.add(p.packetId);
        break;
      case "PACKET_RETURN": {
        const id = typeof p.packetId === "string" ? [...out].find((x) => samePacket(x, p.packetId as string)) : undefined;
        if (!id) return "That packet wasn't out at that time.";
        if (!intIn(p.sheetsReturned, 0, 1000) || !intIn(p.signatures, 0, 10_000)) return "Enter the sheets returned and the signatures claimed.";
        out.delete(id);
        break;
      }
    }
  }
  return null;
}

/**
 * A supervisor's correction, checked by replaying the shift with it
 * applied. The original is never touched: a `correct_event` becomes a
 * CORRECTION event naming it; an `enter_event` becomes the missing event
 * itself, marked as entered by the supervisor, at the time they state.
 */
/**
 * A corrected or entered time has to be near the scheduled shift. Only the
 * time being set is checked: a worker's own late check-out, recorded as it
 * happened, never blocks correcting something else on the shift.
 */
function windowProblem(at: Date, s: Pick<ShiftFacts, "startsAt" | "endsAt">): string | null {
  const t = at.getTime();
  if (t < s.startsAt.getTime() - CORRECTION_WINDOW_MS || t > s.endsAt.getTime() + CORRECTION_WINDOW_MS) return "That time is more than 2 hours outside the scheduled shift.";
  return null;
}

export function correctionAction(s: ShiftFacts, a: CorrectionAction, signedBy: string, now: Date): CorrectionOutcome {
  if (s.status === "CANCELLED") return noC("This shift was cancelled.");
  const reason = a.reason.trim();
  if (reason.length < 10) return noC("Say why, in at least a few words (the worker sees it).");
  if (reason.length > 500) return noC("Keep the reason under 500 characters.");
  const base = correctedEvents(s);
  if (a.kind === "correct_event") {
    const target = s.events.find((e) => e.id === a.eventId);
    if (!target) return noC("That entry isn't on this shift.");
    const allowed = CORRECTABLE[target.type];
    if (!allowed) return noC("That kind of entry can't be corrected.");
    const fields: Record<string, unknown> = {};
    if (a.count !== undefined) fields.count = a.count;
    if (a.sheetsReturned !== undefined) fields.sheetsReturned = a.sheetsReturned;
    if (a.signatures !== undefined) fields.signatures = a.signatures;
    for (const k of Object.keys(fields)) if (!allowed.includes(k)) return noC(`A ${target.type.toLowerCase().replace(/_/g, " ")} entry has no ${k} to correct.`);
    if (a.at && !allowed.includes("at")) return noC("That entry's time can't be changed.");
    if (a.at && a.at.getTime() > now.getTime()) return noC("That time is in the future.");
    const outside = a.at && windowProblem(a.at, s);
    if (outside) return noC(outside);
    if (!a.at && !Object.keys(fields).length) return noC("Change the time or a value.");
    const current = base.find((e) => e.id === a.eventId);
    if (!current) return noC("That entry was rejected and can't be corrected.");
    const changed = (!a.at || a.at.getTime() === current.createdAt.getTime()) && Object.entries(fields).every(([k, v]) => ((current.payload ?? {}) as Record<string, unknown>)[k] === v);
    if (changed) return noC("That's what the entry already says.");
    const replay = base.map((e) => (e.id === a.eventId ? { ...e, createdAt: a.at ?? e.createdAt, payload: { ...((e.payload ?? {}) as Record<string, unknown>), ...fields } } : e));
    const problem = timelineProblem(replay, s);
    if (problem) return noC(problem);
    return { ok: true, event: { type: "CORRECTION", payload: { supersedesEventId: a.eventId, signedBy, reason, ...(a.at ? { at: a.at.toISOString() } : {}), ...fields }, createdAt: now } };
  }
  if (!(ENTERABLE as readonly string[]).includes(a.type)) return noC("That kind of entry can't be entered.");
  if (a.at.getTime() > now.getTime()) return noC("That time is in the future.");
  const outside = windowProblem(a.at, s);
  if (outside) return noC(outside);
  const payload: Record<string, unknown> = { enteredBy: signedBy, reason };
  if (COUNTED.has(a.type)) payload.count = a.count;
  if (a.type === "PACKET_RETURN") {
    if (typeof a.packetId !== "string" || !a.packetId.trim()) return noC("Which packet?");
    payload.packetId = a.packetId.trim().toUpperCase();
    payload.sheetsReturned = a.sheetsReturned;
    payload.signatures = a.signatures;
  }
  if (a.type === "CHECK_IN") payload.locationChecked = false;
  const entered: FieldEvent = { type: a.type, payload, actorId: signedBy, createdAt: a.at };
  const problem = timelineProblem([...base, entered], s);
  if (problem) return noC(problem);
  return { ok: true, event: { type: a.type, payload, createdAt: a.at } };
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

// ---------------------------------------------------------------------------
// Turf marks — the worker's own pins and day turf (append-only NOTE events)
// ---------------------------------------------------------------------------

export const PIN_CATEGORIES = [
  { value: "good_spot", label: "Good spot", color: "#4a7a2e" },
  { value: "covered", label: "Covered", color: "#4b7bb5" },
  { value: "come_back", label: "Come back", color: "#b7791f" },
  { value: "do_not_knock", label: "Don't knock", color: "#b42318" },
  { value: "note", label: "Note", color: "#5b5f66" },
] as const;
export type PinCategory = (typeof PIN_CATEGORIES)[number]["value"];
export const MAX_PINS = 200;
/** Append-only means removals add events too: cap the total per shift. */
export const MAX_TURF_EVENTS = 1000;
export const MAX_DAY_TURF_EVENTS = 50;

export interface TurfPin {
  id: string;
  lat: number;
  lng: number;
  category: PinCategory;
  label: string | null;
  at: Date;
}

/**
 * Current pins and the worker's own day turf, replayed from NOTE events:
 * {kind:"pin"} adds, {kind:"unpin"} removes, {kind:"day_turf"} sets (latest
 * wins; polygon null clears). Nothing is ever edited or deleted.
 */
export function turfMarks(events: FieldEvent[]): { pins: TurfPin[]; dayTurf: TurfPolygon | null } {
  const pins = new Map<string, TurfPin>();
  let dayTurf: TurfPolygon | null = null;
  for (const e of [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (e.type !== "NOTE") continue;
    const p = obj(e.payload);
    if (p.kind === "pin" && typeof p.pinId === "string" && isLatLng(p.lat, p.lng) && PIN_CATEGORIES.some((c) => c.value === p.category)) {
      pins.set(p.pinId, { id: p.pinId, lat: p.lat as number, lng: p.lng as number, category: p.category as PinCategory, label: typeof p.label === "string" ? p.label : null, at: e.createdAt });
    } else if (p.kind === "unpin" && typeof p.pinId === "string") {
      pins.delete(p.pinId);
    } else if (p.kind === "day_turf") {
      dayTurf = p.polygon === null ? null : readTurf(p.polygon);
    }
  }
  return { pins: [...pins.values()], dayTurf };
}

export type TurfAction =
  | { kind: "pin"; pinId: string; lat: number; lng: number; category: string; label: string | null }
  | { kind: "unpin"; pinId: string }
  | { kind: "day_turf"; polygon: unknown };

/**
 * Pins and day turf are for the day of the shift: from when check-in opens
 * until six hours after it ends, and never once the shift is reviewed.
 */
export function turfMarksClosed(s: ShiftFacts, now: Date): string | null {
  const st = shiftState(s);
  if (st.cancelled) return "This shift was cancelled.";
  if (st.closeout) return "This shift has been reviewed; its turf is closed.";
  if (now.getTime() < s.startsAt.getTime() - CHECK_IN_EARLY_MIN * 60_000) return "You can mark turf from an hour before the shift.";
  if (now.getTime() > s.endsAt.getTime() + 6 * 3_600_000) return "Turf marks close six hours after the shift ends.";
  return null;
}

export function turfAction(s: ShiftFacts, a: TurfAction, now: Date): Outcome {
  const closed = turfMarksClosed(s, now);
  if (closed) return no(closed);
  const notes = s.events.filter((e) => e.type === "NOTE");
  // Only additions count against the cap: removing a wrong pin or clearing
  // a wrong turf must always work (removals need a live mark, so they're bounded).
  const adding = a.kind === "pin" || (a.kind === "day_turf" && a.polygon !== null);
  if (adding && notes.length >= MAX_TURF_EVENTS) return no("This shift has reached its limit of turf changes.");
  const marks = turfMarks(s.events);
  switch (a.kind) {
    case "pin": {
      if (!isLatLng(a.lat, a.lng)) return no("Tap the map to place the pin.");
      if (!PIN_CATEGORIES.some((c) => c.value === a.category)) return no("Pick what the pin marks.");
      if (marks.pins.length >= MAX_PINS) return no(`Up to ${MAX_PINS} pins per shift.`);
      if (a.label !== null && typeof a.label !== "string") return no("Pin notes must be text.");
      const label = a.label?.trim().replace(/\s+/g, " ").slice(0, 80) || null;
      return {
        ok: true,
        event: { type: "NOTE", payload: { kind: "pin", pinId: a.pinId, lat: Math.round(a.lat * 1e6) / 1e6, lng: Math.round(a.lng * 1e6) / 1e6, category: a.category, label } },
      };
    }
    case "unpin":
      if (!marks.pins.some((p) => p.id === a.pinId)) return no("That pin is already gone.");
      return { ok: true, event: { type: "NOTE", payload: { kind: "unpin", pinId: a.pinId } } };
    case "day_turf": {
      if (s.campaignTurf) return no("The campaign assigned this shift's turf.");
      if (notes.filter((e) => obj(e.payload).kind === "day_turf").length >= MAX_DAY_TURF_EVENTS) return no("You've redrawn this shift's turf too many times.");
      if (a.polygon === null) return marks.dayTurf ? { ok: true, event: { type: "NOTE", payload: { kind: "day_turf", polygon: null } } } : no("There's no turf to clear.");
      const poly = readTurf(a.polygon);
      if (!poly) return no("Draw at least three corners.");
      return { ok: true, event: { type: "NOTE", payload: { kind: "day_turf", polygon: poly } } };
    }
    default:
      return no("Unknown turf action.");
  }
}
