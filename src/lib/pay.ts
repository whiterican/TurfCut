/**
 * Pay (M5, spec p.13 "Compensation engine", p.15 "Pay records"). Pure
 * functions — no database access.
 *
 * Rules:
 * - Pay is calculated by the server from what review verified, at the
 *   moment a supervisor approves the shift, and frozen on the pay line with
 *   the formula. It is never recalculated: a correction is a new ADJUSTMENT
 *   line, and the old value stays.
 * - Workers always get the gross amount. The platform fee is charged to the
 *   organization on top and saved per line, so a fee change is never
 *   retroactive.
 * - A line's status is replayed from its append-only events.
 */

export type CompMethod = "HOURLY" | "SHIFT_RATE" | "PER_UNIT";
export type WorkType = "PETITION" | "CANVASS";

/** 15% of approved pay, charged to the organization (owner decision, M5). */
export const PLATFORM_FEE_BPS = 1500;

/** The fee on a line, rounded half away from zero (adjustments can be negative). */
export function platformFee(amountCents: number, bps = PLATFORM_FEE_BPS): number {
  const fee = Math.round((Math.abs(amountCents) * bps) / 10_000);
  return amountCents < 0 ? -fee : fee;
}

export function money(cents: number): string {
  const s = `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return cents < 0 ? `−${s}` : s;
}

/** "3h 30m", "45m", "8h". */
export function hoursText(ms: number): string {
  const min = Math.round(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ---------------------------------------------------------------------------
// Calculation
// ---------------------------------------------------------------------------

/** Saved on the pay line exactly as calculated. */
export interface PayBasis {
  method: CompMethod;
  rateCents: number;
  /** Hours (to 4 places), 1 shift, or accepted units. */
  quantity: number;
  unit: "hour" | "shift" | "signature" | "contact";
  activeMs: number;
  /** "3h 30m verified × $25.00/hr". */
  formula: string;
  jurisdictionVersion: number | null;
  /** Gross per verified hour, for the minimum-wage review; null without hours. */
  effectiveHourlyCents: number | null;
}

export interface VerifiedWork {
  completed: boolean;
  activeMs: number;
  accepted: number;
  contacts: number;
  batchCounted: boolean;
}

/** No single shift pays more than this; larger amounts point to a data error. */
export const MAX_LINE_CENTS = 1_000_000;

export type PayResult = { ok: true; amountCents: number; feeCents: number; basis: PayBasis } | { ok: false; reason: string };

export function computeShiftPay(input: {
  method: CompMethod;
  rateCents: number | null;
  workType: WorkType;
  work: VerifiedWork;
  jurisdictionVersion: number | null;
}): PayResult {
  const { method, workType, work } = input;
  const rate = input.rateCents;
  if (!rate || rate <= 0 || !Number.isInteger(rate)) return { ok: false, reason: "The job has no pay rate on file." };
  if (!work.completed) return { ok: false, reason: "The worker hasn't checked in and out." };
  const per = (n: number) => (work.activeMs > 0 ? Math.round((n * 3_600_000) / work.activeMs) : null);
  let amountCents: number;
  let quantity: number;
  let unit: PayBasis["unit"];
  let formula: string;
  if (method === "HOURLY") {
    amountCents = Math.round((rate * work.activeMs) / 3_600_000);
    quantity = Math.round((work.activeMs / 3_600_000) * 10_000) / 10_000;
    unit = "hour";
    formula = `${hoursText(work.activeMs)} verified × ${money(rate)}/hr`;
  } else if (method === "SHIFT_RATE") {
    amountCents = rate;
    quantity = 1;
    unit = "shift";
    formula = `1 approved shift × ${money(rate)}`;
  } else if (workType === "PETITION") {
    // Pay per accepted signature needs the supervisor's batch count.
    if (!work.batchCounted) return { ok: false, reason: "Count the batch first: this shift is paid per accepted signature." };
    amountCents = rate * work.accepted;
    quantity = work.accepted;
    unit = "signature";
    formula = `${work.accepted} accepted ${work.accepted === 1 ? "signature" : "signatures"} × ${money(rate)}`;
  } else {
    amountCents = rate * work.contacts;
    quantity = work.contacts;
    unit = "contact";
    formula = `${work.contacts} verified ${work.contacts === 1 ? "contact" : "contacts"} × ${money(rate)}`;
  }
  if ((unit !== "hour" && !Number.isSafeInteger(quantity)) || !Number.isSafeInteger(amountCents)) return { ok: false, reason: "The verified counts aren't whole numbers. Correct the count first." };
  if (amountCents > MAX_LINE_CENTS) return { ok: false, reason: `Pay over ${money(MAX_LINE_CENTS)} for one shift needs a check: correct the counts or the rate.` };
  return {
    ok: true,
    amountCents,
    feeCents: platformFee(amountCents),
    basis: {
      method,
      rateCents: rate,
      quantity,
      unit,
      activeMs: work.activeMs,
      formula,
      jurisdictionVersion: input.jurisdictionVersion,
      effectiveHourlyCents: per(amountCents),
    },
  };
}

/** Reads a saved basis back (lines from before M5 have only a formula). */
export function readBasis(v: unknown): { formula: string; effectiveHourlyCents: number | null; method: CompMethod | null; activeMs: number } {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return {
    formula: typeof o.formula === "string" ? o.formula : "",
    effectiveHourlyCents: typeof o.effectiveHourlyCents === "number" ? o.effectiveHourlyCents : null,
    method: o.method === "HOURLY" || o.method === "SHIFT_RATE" || o.method === "PER_UNIT" ? o.method : null,
    activeMs: typeof o.activeMs === "number" && Number.isFinite(o.activeMs) ? o.activeMs : 0,
  };
}

/**
 * Minimum-wage review (spec p.13): when the jurisdiction's rules list a
 * minimum hourly wage, flag lines whose gross per verified hour is below it.
 * A flag for a person to review — never an automatic change.
 */
export function wageFlag(effectiveHourlyCents: number | null, rules: unknown): string | null {
  const r = rules && typeof rules === "object" && !Array.isArray(rules) ? (rules as Record<string, unknown>) : {};
  const min = r.minimumWageCents;
  if (typeof min !== "number" || !Number.isFinite(min) || min <= 0 || effectiveHourlyCents === null) return null;
  return effectiveHourlyCents < min ? `${money(effectiveHourlyCents)} per verified hour is below the ${money(min)}/hr minimum on file.` : null;
}

// ---------------------------------------------------------------------------
// Status — replayed from append-only events
// ---------------------------------------------------------------------------

export type PayEventType = "APPROVED" | "HELD" | "RELEASED" | "VOIDED" | "TRANSFER_STARTED" | "PAID" | "TRANSFER_FAILED" | "REVERSED";

export interface PayEventFact {
  type: PayEventType;
  createdAt: Date;
  reason: string | null;
  transferId: string | null;
  providerRef: string | null;
}

export type PayStatus = "AWAITING_APPROVAL" | "APPROVED" | "HELD" | "DISPUTED" | "PROCESSING" | "PAID" | "VOIDED" | "NOTHING_DUE";

export interface LineState {
  status: PayStatus;
  approvedAt: Date | null;
  paidAt: Date | null;
  /** Stripe transfer id when paid. */
  paidRef: string | null;
  /** The transfer in flight or that paid it. */
  transferId: string | null;
  heldReason: string | null;
  /** Last failure, or a possible double payment, shown to finance. */
  note: string | null;
  /** The line's history shows a possible double payment: never pay it again. */
  conflict: boolean;
  /** Approved and nothing stops it from being paid. */
  payable: boolean;
}

/** Same-millisecond events replay in the order they can happen. */
const EVENT_ORDER: Record<PayEventType, number> = {
  APPROVED: 0,
  HELD: 1,
  RELEASED: 2,
  TRANSFER_STARTED: 3,
  PAID: 4,
  TRANSFER_FAILED: 4,
  REVERSED: 5,
  VOIDED: 6,
};

export function sortEvents<T extends { type: PayEventType; createdAt: Date }>(events: T[]): T[] {
  return [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || EVENT_ORDER[a.type] - EVENT_ORDER[b.type]);
}

/**
 * Replays a line's events. Every transfer is tracked by id: a payment always
 * counts (money moved, including pre-M5 lines with no start event); a
 * failure or reversal only affects the transfer it names, so a late answer
 * about an old transfer never re-pays a line. A reversal puts the line on
 * hold — someone decides whether to pay it again. More than one transfer
 * paid or in flight at once is a conflict: shown, and never paid again.
 */
export function lineState(line: { amountCents: number }, events: PayEventFact[], openDispute: boolean): LineState {
  let voided = false;
  let approvedAt: Date | null = null;
  let held: string | null = null;
  let note: string | null = null;
  const inFlight = new Map<string, Date>();
  const paid = new Map<string, { at: Date; ref: string | null }>();
  // Reversed before the "paid" arrived (webhooks out of order).
  const reversedEarly = new Set<string>();
  const LEGACY = "pre-M5";
  /** The transfer an event is about: its own id, else the only one it can mean. */
  const keyOf = (e: PayEventFact, pool: Map<string, unknown>) => e.transferId ?? (pool.size === 1 ? [...pool.keys()][0] : LEGACY);
  for (const e of sortEvents(events)) {
    switch (e.type) {
      case "VOIDED":
        voided = true;
        break;
      case "APPROVED":
        approvedAt ??= e.createdAt;
        break;
      case "HELD":
        held = e.reason ?? "On hold";
        break;
      case "RELEASED":
        held = null;
        break;
      case "TRANSFER_STARTED":
        inFlight.set(e.transferId ?? LEGACY, e.createdAt);
        break;
      case "PAID": {
        const k = keyOf(e, inFlight);
        inFlight.delete(k);
        if (reversedEarly.has(k)) break;
        paid.set(k, { at: e.createdAt, ref: e.providerRef });
        note = null;
        break;
      }
      case "TRANSFER_FAILED": {
        const k = keyOf(e, inFlight);
        if (inFlight.delete(k)) note = `Payment failed${e.reason ? `: ${e.reason}` : ""}`;
        break;
      }
      case "REVERSED": {
        const k = keyOf(e, paid.size ? paid : inFlight);
        if (paid.delete(k) || inFlight.delete(k)) {
          if (!paid.has(k)) reversedEarly.add(k);
          held = `Payment reversed${e.reason ? `: ${e.reason}` : ""}`;
        }
        break;
      }
    }
  }
  // A void can't undo money that moved: shown as a conflict, never as void.
  const conflict = paid.size + inFlight.size > 1 || (voided && paid.size + inFlight.size > 0);
  const lastPaid = [...paid.entries()].sort((x, y) => y[1].at.getTime() - x[1].at.getTime())[0];
  let status: PayStatus;
  if (paid.size) status = "PAID";
  else if (inFlight.size) status = "PROCESSING";
  else if (voided) status = "VOIDED";
  else if (line.amountCents === 0) status = "NOTHING_DUE";
  // Deductions always apply (owner decision): once approved, a dispute or a
  // hold (e.g. after a reversal) never keeps one out of the next payment.
  else if (line.amountCents < 0 && approvedAt) status = "APPROVED";
  else if (openDispute) status = "DISPUTED";
  else if (held) status = "HELD";
  else if (approvedAt) status = "APPROVED";
  else status = "AWAITING_APPROVAL";
  const ids = [...paid.keys(), ...inFlight.keys()];
  return {
    status,
    approvedAt,
    paidAt: lastPaid ? lastPaid[1].at : null,
    paidRef: lastPaid ? lastPaid[1].ref : null,
    transferId: [...inFlight.keys()][0] ?? (lastPaid && lastPaid[0] !== LEGACY ? lastPaid[0] : null),
    heldReason: status === "HELD" ? held : null,
    note: conflict
      ? voided
        ? `This line was replaced after a review, but a payment for it went out (${ids.join(", ")}). Check before paying the replacement.`
        : `More than one payment for this line (${ids.join(", ")}). Check Stripe and reverse the extra one.`
      : status === "VOIDED" || status === "PAID" ? null : note,
    conflict,
    payable: status === "APPROVED" && !conflict,
  };
}

/**
 * Hourly pay for more time than was scheduled (a late check-out, an early
 * check-in) — shown to whoever approves the pay. Null when within the
 * schedule (5 minutes' slack) or the pay isn't hourly.
 */
export function hoursFlag(basis: { method: CompMethod | null; activeMs: number }, scheduledMs: number): string | null {
  if (basis.method !== "HOURLY" || basis.activeMs <= scheduledMs + 5 * 60_000) return null;
  return `${hoursText(basis.activeMs)} verified; the shift was scheduled for ${hoursText(scheduledMs)}.`;
}

export function statusLabel(s: PayStatus, amountCents = 1): { label: string; badge: string } {
  if (amountCents < 0 && (s === "APPROVED" || s === "PROCESSING")) return { label: "Deducted from your next payment", badge: "badge-neutral" };
  if (amountCents < 0 && s === "PAID") return { label: "Deducted", badge: "badge-neutral" };
  switch (s) {
    case "AWAITING_APPROVAL":
      return { label: "Awaiting payment approval", badge: "badge-butter" };
    case "APPROVED":
      return { label: "Approved · on the way", badge: "badge-sky" };
    case "HELD":
      return { label: "On hold", badge: "badge-coral" };
    case "DISPUTED":
      return { label: "Disputed", badge: "badge-coral" };
    case "PROCESSING":
      return { label: "Sending", badge: "badge-accent" };
    case "PAID":
      return { label: "Paid", badge: "badge-solid" };
    case "VOIDED":
      return { label: "Replaced", badge: "badge-neutral" };
    case "NOTHING_DUE":
      return { label: "Nothing to pay", badge: "badge-neutral" };
  }
}

/** Why finance can't take this action on the line right now (null = it can). */
export function lineActionProblem(st: LineState, action: "approve" | "hold" | "release", reason?: string | null): string | null {
  switch (action) {
    case "approve":
      return st.status === "AWAITING_APPROVAL" ? null : "Only lines awaiting approval can be approved.";
    case "hold":
      if (st.status !== "AWAITING_APPROVAL" && st.status !== "APPROVED") return "Only unpaid lines can be put on hold.";
      return reason?.trim() ? null : "Say why the payment is on hold.";
    case "release":
      return st.status === "HELD" ? null : "This line isn't on hold.";
  }
}

/**
 * A supervisor may change a shift's review only while its pay hasn't been
 * approved for payment. After that, a change is an adjustment.
 */
export function reReviewProblem(lines: LineState[]): string | null {
  const locked = lines.find((l) => (l.status !== "VOIDED" || l.conflict) && (l.approvedAt || l.status === "PROCESSING" || l.status === "PAID"));
  return locked ? "Pay for this shift is already approved for payment, so the review is final. Ask your owner or finance team for a pay adjustment." : null;
}

/**
 * Two people for every payment (owner decision, M5). Shift pay: not the
 * person who made the shift's latest review. An adjustment: not the person
 * who made it (they set the amount, someone else approves — two people);
 * a deduction can't send money out, so its maker may approve it.
 * Lines with no shift on record can't be checked this way.
 */
export function selfApprovalProblem(
  line: { kind: "SHIFT" | "ADJUSTMENT"; createdById: string | null; hasShift: boolean; amountCents: number },
  latestReviewerId: string | null,
  actorId: string,
  /** Profiles who entered or corrected the shift's entries, or counted a batch (M7): they set the amount too. */
  amountSetters: readonly string[] = []
): string | null {
  if (line.kind === "SHIFT") {
    if (!line.hasShift) return null;
    if (latestReviewerId === actorId) return "You approved this shift's work, so someone else approves its pay.";
    if (amountSetters.includes(actorId)) return "You entered or corrected this shift's work, so someone else approves its pay.";
    return null;
  }
  return line.amountCents > 0 && line.createdById === actorId ? "You made this adjustment, so someone else approves it." : null;
}

/**
 * Net amount of payable lines. Deductions (negative adjustments) are netted
 * against the same worker's positive lines; a pay run needs a net above zero.
 */
export function payableTotal(lines: Array<{ amountCents: number; feeCents: number; state: LineState }>): { amountCents: number; feeCents: number; count: number } {
  const ready = lines.filter((l) => l.state.payable);
  return {
    amountCents: ready.reduce((n, l) => n + l.amountCents, 0),
    feeCents: ready.reduce((n, l) => n + l.feeCents, 0),
    count: ready.length,
  };
}

// ---------------------------------------------------------------------------
// Disputes
// ---------------------------------------------------------------------------

export const MAX_DISPUTES_PER_SHIFT = 3;

export function disputeProblem(f: { reviewed: boolean; openDispute: boolean; disputes: number; reason: string }): string | null {
  if (!f.reviewed) return "You can dispute pay once the shift has been reviewed.";
  if (f.openDispute) return "There's already an open dispute for this shift.";
  if (f.disputes >= MAX_DISPUTES_PER_SHIFT) return `A shift can be disputed up to ${MAX_DISPUTES_PER_SHIFT} times. Message your organization instead.`;
  const r = f.reason.trim();
  if (r.length < 10) return "Explain what's wrong in a sentence or two.";
  if (r.length > 1000) return "Keep it under 1,000 characters.";
  return null;
}

export type Resolution =
  | { outcome: "KEPT"; response: string }
  | { outcome: "ADJUSTED"; response: string; amountCents: number }
  | { outcome: "REREVIEWED"; response: string };

export function resolutionProblem(r: Resolution, f: { reviewedSinceDispute: boolean }): string | null {
  const t = r.response.trim();
  if (t.length < 2) return "Write a response to the worker.";
  if (t.length > 1000) return "Keep the response under 1,000 characters.";
  if (r.outcome === "ADJUSTED") {
    if (!Number.isInteger(r.amountCents) || r.amountCents === 0) return "Enter the adjustment amount (it can't be zero).";
    if (Math.abs(r.amountCents) > 1_000_000) return "Adjustments are limited to $10,000.";
  }
  if (r.outcome === "REREVIEWED" && !f.reviewedSinceDispute) return "Re-review the shift first, then close the dispute.";
  return null;
}

/** "12.50" / "-5" / "$7" → cents, or null. */
export function parseMoney(s: string): number | null {
  const t = s.trim().replace(/^\$/, "").replace(/^(-|−)\$/, "-").replace(/,/g, "").replace(/^−/, "-");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ""] = t.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return t.startsWith("-") ? -cents : cents;
}
