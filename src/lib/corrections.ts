/**
 * Corrections to the work ledger (M7). Nothing in work_events is ever
 * edited: a supervisor's correction is a new CORRECTION event that names
 * the event it supersedes, who signed it and why. Every reader of a shift's
 * events — live widget, shift state, scorecard, pay — applies them through
 * `effectiveEvents`, so they all agree.
 *
 * A valid correction carries `supersedesEventId`, `signedBy` and `reason`.
 * The rest of its payload is what changed:
 * - `at` (ISO time): the event happened at this time instead;
 * - any other field (`count`, `sheetsReturned`, `signatures`): replaces
 *   that field of the original payload.
 * The newest valid correction for an event wins; unsigned or unexplained
 * ones are ignored and counted. An event with a REJECTED per-event
 * validation is dropped.
 */
export interface LedgerEvent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}

export interface LedgerValidation {
  workEventId: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
  createdAt: Date;
}

/** Payload keys a correction may change on each event type. */
export const CORRECTABLE: Record<string, readonly string[]> = {
  CHECK_IN: ["at"],
  CHECK_OUT: ["at"],
  PAUSE_START: ["at"],
  PAUSE_END: ["at"],
  SIGNATURE_SUBMITTED: ["at", "count"],
  DOOR_KNOCK: ["at", "count"],
  CONTACT: ["at", "count"],
  PACKET_RETURN: ["at", "sheetsReturned", "signatures"],
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const latest = <T extends { createdAt: Date }>(xs: T[]): T | undefined =>
  xs.reduce<T | undefined>((a, b) => (!a || b.createdAt >= a.createdAt ? b : a), undefined);

/** The correction fields of a valid CORRECTION payload, or null. */
export function readCorrection(payload: unknown): { supersedesEventId: string; signedBy: string; reason: string; at: Date | null; fields: Record<string, unknown> } | null {
  const p = obj(payload);
  if (!nonEmpty(p.supersedesEventId) || !nonEmpty(p.signedBy) || !nonEmpty(p.reason)) return null;
  const { supersedesEventId, signedBy, reason, at, ...fields } = p;
  const when = typeof at === "string" ? new Date(at) : null;
  return {
    supersedesEventId: supersedesEventId as string,
    signedBy: signedBy as string,
    reason: reason as string,
    at: when && !Number.isNaN(when.getTime()) ? when : null,
    fields,
  };
}

/**
 * Drops rejected events and applies valid corrections: newest valid
 * correction per target wins. Returns the events in effective time order,
 * without the CORRECTION events themselves.
 */
export function effectiveEvents<E extends LedgerEvent>(events: E[], validations: LedgerValidation[] = []): { events: E[]; applied: number; ignored: number } {
  const rejected = new Set<string>();
  const byEvent = new Map<string, LedgerValidation[]>();
  for (const v of validations) {
    if (!v.workEventId) continue;
    byEvent.set(v.workEventId, [...(byEvent.get(v.workEventId) ?? []), v]);
  }
  for (const [id, vs] of byEvent) if (latest(vs)?.status === "REJECTED") rejected.add(id);

  const sorted = [...events].filter((e) => !rejected.has(e.id)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const corrections = new Map<string, NonNullable<ReturnType<typeof readCorrection>>>();
  let ignored = 0;
  for (const e of sorted) {
    if (e.type !== "CORRECTION") continue;
    const c = readCorrection(e.payload);
    if (c) corrections.set(c.supersedesEventId, c);
    else ignored++;
  }
  let applied = 0;
  const out = sorted
    .filter((e) => e.type !== "CORRECTION")
    .map((e) => {
      const c = corrections.get(e.id);
      if (!c) return e;
      applied++;
      return { ...e, createdAt: c.at ?? e.createdAt, payload: { ...obj(e.payload), ...c.fields } };
    })
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { events: out, applied, ignored };
}

/** The latest valid correction for each event id (for showing "corrected by …"). */
export function correctionsByEvent(events: LedgerEvent[]): Map<string, { signedBy: string; reason: string; at: Date | null; fields: Record<string, unknown>; createdAt: Date }> {
  const out = new Map<string, { signedBy: string; reason: string; at: Date | null; fields: Record<string, unknown>; createdAt: Date }>();
  for (const e of [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (e.type !== "CORRECTION") continue;
    const c = readCorrection(e.payload);
    if (c) out.set(c.supersedesEventId, { signedBy: c.signedBy, reason: c.reason, at: c.at, fields: c.fields, createdAt: e.createdAt });
  }
  return out;
}
