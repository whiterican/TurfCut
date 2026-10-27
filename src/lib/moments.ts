/**
 * The pure parts of P1.4's field-worker moments, browser-safe and tested:
 * count-up frames, ring geometry, the connection pill's state, and when a
 * pay line earns its "paid" morph. No timing lives here; durations come from
 * the motion tokens (lib/motion.ts) where these are used.
 */

/** Ease-out (cubic) for count-ups: quick at first, settling on the value. */
export const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * The number a count-up shows at progress t (0..1) from `from` to `to`.
 * Whole steps only, and it never passes the target in either direction, so
 * a count of signatures never shows a number that wasn't real at one end.
 */
export function countAt(from: number, to: number, t: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return to;
  const v = from + (to - from) * easeOut(t);
  return to >= from ? Math.min(to, Math.floor(v)) : Math.max(to, Math.ceil(v));
}

/** A ring's fill, 0..1, from a fraction that may be missing or out of range. */
export const ringFill = (fraction: number | null | undefined) =>
  fraction === null || fraction === undefined || !Number.isFinite(fraction) ? 0 : Math.min(1, Math.max(0, fraction));

/** The shift ring: share of the scheduled time worked so far. */
export const shiftFill = (workedMs: number, scheduledMs: number) => (scheduledMs > 0 ? ringFill(workedMs / scheduledMs) : 0);

export type PillState = "online" | "offline" | "syncing" | "waiting" | "refused" | "unsaved";

/**
 * The connection pill on the field-day card: one state, most urgent first.
 * "unsaved": entries wait but the phone couldn't store them, so only this
 * page holds them; said before anything about signal, since closing the page
 * loses them (P0).
 */
export function pillState(o: { online: boolean; reachable: boolean; syncing: boolean; waiting: number; refused: number; memoryOnly?: boolean }): PillState {
  if (o.refused > 0) return "refused";
  if (o.memoryOnly && o.waiting > 0) return "unsaved";
  if (!o.online || !o.reachable) return "offline";
  if (o.syncing) return "syncing";
  if (o.waiting > 0) return "waiting";
  return "online";
}

/**
 * Field-day sync language (S1, plan #78): one word per truth, never "saved"
 * for something only queued.
 * - saved on this phone: in the phone's storage, not sent yet
 * - only on this page: the phone couldn't store it (storage full or blocked);
 *   closing the page loses it
 * - sending: a send is under way
 * - recorded: the server has it
 * - not recorded: the server refused it (not "rejected": that's a review word)
 * Nothing sends in the background, so unsent entries go the next time Turfcut
 * is open with signal.
 */
export type EntryLike = { savedAt?: number; rejected?: string };

/** Why a waiting entry isn't on its way right now, or "sending" if it is (or is about to be). */
export type SendState = "sending" | "no-signal" | "unreachable" | "problem";

export function sendState(o: { syncing: boolean; online: boolean; unreachable: boolean; problem: boolean }): SendState {
  // No signal outranks a send in flight (it will fail), as in pillState.
  if (!o.online) return "no-signal";
  if (o.syncing) return "sending";
  if (o.problem) return "problem";
  if (o.unreachable) return "unreachable";
  return "sending";
}

/**
 * The message under the field-day controls about the entry just recorded,
 * named (several can be in flight), derived on every render from the queue
 * rather than from one look after a send, which another tab or Today's
 * send-all can pre-empt. `entry` is the queued entry, or undefined once it
 * left the queue; `shownOnPage` says the page already shows it (the server
 * had it and the page reloaded). Null: nothing to say.
 */
/** done: the server has it; pending: on its way or waiting; problem: needs the worker. */
export type Tone = "done" | "pending" | "problem";

export function entryMessage(o: {
  what: string;
  entry: EntryLike | undefined;
  shownOnPage: boolean;
  /** The phone's storage holds the queue (false: only this page does). */
  stored: boolean;
  send: SendState;
}): { tone: Tone; text: string } | null {
  if (o.entry?.rejected) return { tone: "problem", text: `${o.what} — not recorded: ${o.entry.rejected}` };
  if (o.entry?.savedAt || (!o.entry && o.shownOnPage)) return { tone: "done", text: `${o.what} — recorded.` };
  if (!o.entry) return null;
  if (!o.stored) return { tone: "problem", text: `${o.what} — not saved on this phone: storage is full or blocked. Keep this page open until it's sent, or it will be lost.` };
  const later =
    o.send === "no-signal"
      ? " It'll send when Turfcut is open with signal."
      : o.send === "unreachable"
        ? " It'll keep trying while Turfcut is open."
        : ""; // a problem's reason is shown under the pill
  return { tone: "pending", text: o.send === "sending" ? `${o.what} — saved on this phone. Sending…` : `${o.what} — saved on this phone, not sent yet.${later}` };
}

/** The connection pill's words for its state (see pillState): short (two lines at most at 320px), never "All saved". */
export function pillText(state: PillState, o: { waiting: number; refused: number; send: SendState }): string {
  const lead = o.send === "no-signal" ? "No signal — " : o.send === "problem" || o.send === "unreachable" ? "Not sent — " : "";
  switch (state) {
    case "refused":
      return `${o.refused} not recorded`;
    case "unsaved":
      return lead ? `${lead}${o.waiting} only on this page. Keep it open.` : `${o.waiting} only on this page — keep it open`;
    case "offline":
      if (!o.waiting) return "No signal — you can keep working";
      return `${o.send === "unreachable" ? "Can't connect — " : lead || "No signal — "}${o.waiting} saved on this phone`;
    case "syncing":
      return "Sending…";
    case "waiting":
      return `${o.waiting} saved on this phone, not sent yet`;
    default:
      return "Nothing waiting to send";
  }
}

/** Statuses that mean "on its way", from which arriving at PAID is worth showing. */
const ON_THE_WAY = new Set(["APPROVED", "PROCESSING"]);

/** A pay line morphs to paid once: when this phone last saw it on its way and now it's paid. */
export const morphsToPaid = (lastSeen: string | null, now: string) => now === "PAID" && lastSeen !== null && ON_THE_WAY.has(lastSeen);
