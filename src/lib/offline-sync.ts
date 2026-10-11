/**
 * Offline field day (M6): the rules for actions a worker's phone saved
 * while it had no signal. Pure functions — no database access; usable on
 * the phone too (the queue checks shapes before saving).
 *
 * - Each action carries the phone's id for it (clientId) and the phone's
 *   clock when it happened. On sync the phone also sends its clock "now";
 *   the server corrects every time by the difference, so a phone whose
 *   clock is wrong still records the right times.
 * - A corrected time can't be in the future, can't be older than 24 hours
 *   (owner decision, M6 — older work goes to a supervisor), and a batch is
 *   kept in the order the phone recorded it.
 * - Check-in location is decided on the phone: only "at staging: yes/no"
 *   and a rough distance band are ever sent. The position itself is never
 *   saved, not even while waiting to sync.
 */
import { locationCheck, type LocationCheck, type WorkerAction } from "@/lib/field-day";

export const MAX_OFFLINE_MS = 24 * 3_600_000;
/** Older than this when it reached the server = recorded offline. */
export const LIVE_WINDOW_MS = 2 * 60_000;
/** Allowed clock slack into the future after correction. */
export const FUTURE_SLACK_MS = 2 * 60_000;
export const MAX_BATCH = 200;

/** The field actions a phone may queue (cancelling needs a connection). */
export type QueuedKind = "check_in" | "pause" | "resume" | "log" | "return_packet" | "check_out";

export interface QueuedAction {
  clientId: string;
  /** Phone clock when it happened, ms since epoch. */
  at: number;
  action: Exclude<WorkerAction, { kind: "cancel" }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : NaN);
const BANDS = ["under 250 m", "250 m – 1 km", "over 1 km"] as const;

/** A staging check the phone made: yes/no plus a band that agrees with it — never a position. */
export function readLocationCheck(v: unknown): LocationCheck | null {
  const o = obj(v);
  if (o.checked === false) return { checked: false };
  if (o.checked === true && typeof o.atStaging === "boolean" && BANDS.includes(o.distance as (typeof BANDS)[number])) {
    // The band must agree with the yes/no.
    if (o.atStaging !== (o.distance === "under 250 m")) return null;
    return { checked: true, atStaging: o.atStaging, distance: o.distance as (typeof BANDS)[number] };
  }
  return null;
}

/** Validates one queued action from the phone (anything else is refused). */
export function readQueued(raw: unknown): QueuedAction | null {
  const o = obj(raw);
  if (typeof o.clientId !== "string" || !UUID.test(o.clientId)) return null;
  if (typeof o.at !== "number" || !Number.isFinite(o.at)) return null;
  const a = obj(o.action);
  let action: QueuedAction["action"];
  switch (a.kind) {
    case "check_in": {
      const location = readLocationCheck(a.location);
      if (!location) return null;
      action = { kind: "check_in", location };
      break;
    }
    case "pause":
    case "resume":
    case "check_out":
      action = { kind: a.kind };
      break;
    case "log":
      if (a.unit !== "signatures" && a.unit !== "doors" && a.unit !== "contacts") return null;
      action = { kind: "log", unit: a.unit, count: int(a.count) };
      break;
    case "return_packet":
      if (typeof a.packetId !== "string" || a.packetId.length > 40) return null;
      action = { kind: "return_packet", packetId: a.packetId, sheetsReturned: int(a.sheetsReturned), signatures: int(a.signatures) };
      break;
    default:
      return null;
  }
  return { clientId: o.clientId.toLowerCase(), at: o.at, action };
}

/** A phone time on the server's clock: shifted by (server now − phone now). */
export function correctTime(at: number, deviceNow: number, serverNow: Date): Date {
  return new Date(at + (serverNow.getTime() - deviceNow));
}

/**
 * Where an accepted action goes on the timeline: its corrected time (never
 * later than now), but always after `lastSaved` — the latest event the
 * shift already has, then each action saved from the batch — so nothing
 * lands in front of recorded work and two actions never share a time. That
 * can put an action a few milliseconds past now; it never goes earlier.
 * Age and future checks use the corrected time itself, before this.
 */
export function placeTime(corrected: Date, lastSaved: Date | null, serverNow: Date): Date {
  const t = Math.min(corrected.getTime(), serverNow.getTime());
  return new Date(lastSaved ? Math.max(t, lastSaved.getTime() + 1) : t);
}

/** Why a corrected time can't be recorded automatically, or null. */
export function timeProblem(t: Date, serverNow: Date): string | null {
  if (t.getTime() > serverNow.getTime() + FUTURE_SLACK_MS) return "This was timed in the future. Check your phone's clock.";
  if (serverNow.getTime() - t.getTime() > MAX_OFFLINE_MS) return "Recorded more than 24 hours ago. Ask your supervisor to enter it.";
  return null;
}

/** Recorded offline (reached the server well after it happened). */
export const wasOffline = (t: Date, serverNow: Date) => serverNow.getTime() - t.getTime() > LIVE_WINDOW_MS;

/**
 * The at-staging check, on the phone: the same comparison the server used
 * to make (lib/field-day locationCheck), returning only yes/no and a band.
 * The caller drops the position right after.
 */
export function stagingCheck(staging: { lat: number; lng: number; radiusM?: number } | null, device: { lat: number; lng: number } | null): LocationCheck {
  return locationCheck({ lat: staging?.lat ?? null, lng: staging?.lng ?? null, radiusM: staging?.radiusM }, device);
}
