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
export function readBasis(v: unknown): { formula: string; effectiveHourlyCents: number | null } {
  const o = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return {
    formula: typeof o.formula === "string" ? o.formula : "",
    effectiveHourlyCents: typeof o.effectiveHourlyCents === "number" ? o.effectiveHourlyCents : null,
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
  /** Last failure or reversal, shown so finance knows why it's back. */
  note: string | null;
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
 * Replays a line's events. A transfer's outcome (paid, failed, reversed)
 * only counts for the transfer it names: a late answer about an earlier
 * transfer never reopens or re-pays a line. A reversal puts the line on
 * hold — someone decides whether to pay it again.
 */
export function lineState(line: { amountCents: number }, events: PayEventFact[], openDispute: boolean): LineState {
  let voided = false;
  let approvedAt: Date | null = null;
  let held: string | null = null;
  let transfer = null as { id: string | null; state: "processing" | "paid"; at: Date; ref: string | null } | null;
  let note: string | null = null;
  const current = (e: PayEventFact) => transfer !== null && (e.transferId === null || transfer.id === null || e.transferId === transfer.id);
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
        // A line is in one transfer at a time; a new one replaces a failed one.
        if (transfer?.state !== "paid") transfer = { id: e.transferId, state: "processing", at: e.createdAt, ref: null };
        break;
      case "PAID":
        if (current(e)) {
          transfer = { id: transfer!.id ?? e.transferId, state: "paid", at: e.createdAt, ref: e.providerRef };
          note = null;
        }
        break;
      case "TRANSFER_FAILED":
        if (current(e) && transfer!.state === "processing") {
          transfer = null;
          note = `Payment failed${e.reason ? `: ${e.reason}` : ""}`;
        }
        break;
      case "REVERSED":
        if (current(e) && transfer!.state === "paid") {
          transfer = null;
          held = `Payment reversed${e.reason ? `: ${e.reason}` : ""}`;
        }
        break;
    }
  }
  const paid = transfer?.state === "paid";
  let status: PayStatus;
  if (voided) status = "VOIDED";
  else if (paid) status = "PAID";
  else if (transfer?.state === "processing") status = "PROCESSING";
  else if (line.amountCents === 0) status = "NOTHING_DUE";
  else if (openDispute) status = "DISPUTED";
  else if (held) status = "HELD";
  else if (approvedAt) status = "APPROVED";
  else status = "AWAITING_APPROVAL";
  return {
    status,
    approvedAt,
    paidAt: paid ? transfer!.at : null,
    paidRef: paid ? transfer!.ref : null,
    transferId: transfer?.id ?? null,
    heldReason: status === "HELD" ? held : null,
    note: status === "VOIDED" || status === "PAID" ? null : note,
    payable: status === "APPROVED",
  };
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
      return { label: "Sending", badge: "badge-lime" };
    case "PAID":
      return { label: "Paid", badge: "badge-mint" };
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
  const locked = lines.find((l) => l.status !== "VOIDED" && (l.approvedAt || l.status === "PROCESSING" || l.status === "PAID"));
  return locked ? "Pay for this shift is already approved for payment. Changes now go through a pay adjustment." : null;
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
