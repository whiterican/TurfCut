import type { PillState } from "@/lib/moments";

/**
 * The status vocabulary (redesign §4.1.3): every state the product shows,
 * each with its own glyph and colour so no two can be mistaken for each
 * other, in any theme or in greyscale. Callers never pick a colour: a domain
 * value maps to a state through the functions that already word it
 * (statusLabel, the shift replay, the engagement labels), and StatusBadge
 * draws it. Only `live` is forest; only a shift genuinely under way is live.
 */
export const STATUS_STATES = [
  "live",
  "paid",
  "approved",
  "approved-blocked",
  "sending",
  "pending",
  "queued",
  "memory-only",
  "draft",
  "overdue",
  "disputed",
  "held",
  "blocked",
  "not-shared",
  "closed",
] as const;

export type StatusState = (typeof STATUS_STATES)[number];

/** A worded state: what a badge shows. The words come from the domain; the state picks glyph and colour. */
export type Status = { label: string; state: StatusState };

/** Glyph and colour family per state. Pairs are unique (tested). */
export const STATUS_LOOK: Record<StatusState, { glyph: string; tone: "forest" | "eggplant" | "muted" | "subtle" | "warning" | "danger" }> = {
  live: { glyph: "dot", tone: "forest" },
  paid: { glyph: "circle-check", tone: "eggplant" },
  approved: { glyph: "circle", tone: "eggplant" },
  "approved-blocked": { glyph: "lock", tone: "eggplant" },
  sending: { glyph: "send", tone: "eggplant" },
  pending: { glyph: "circle-dashed", tone: "muted" },
  queued: { glyph: "clock", tone: "muted" },
  "memory-only": { glyph: "clock-alert", tone: "warning" },
  draft: { glyph: "circle-dot-dashed", tone: "subtle" },
  overdue: { glyph: "hourglass", tone: "warning" },
  disputed: { glyph: "triangle-alert", tone: "warning" },
  held: { glyph: "circle-pause", tone: "danger" },
  blocked: { glyph: "square", tone: "danger" },
  "not-shared": { glyph: "eye-off", tone: "muted" },
  closed: { glyph: "minus", tone: "subtle" },
};

/**
 * The field-day connection pill as a status: what the phone holds and whether
 * it reached the server. No signal with nothing waiting has nothing queued.
 */
export function syncStatus(state: PillState, text: string, waiting = 1): Status {
  switch (state) {
    case "online":
      return { label: text, state: "closed" };
    case "syncing":
      return { label: text, state: "sending" };
    case "waiting":
      return { label: text, state: "queued" };
    case "offline":
      return { label: text, state: waiting > 0 ? "queued" : "closed" };
    case "unsaved":
      return { label: text, state: "memory-only" };
    case "refused":
      return { label: text, state: "blocked" };
  }
}
