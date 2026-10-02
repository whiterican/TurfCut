import { describe, expect, it } from "vitest";
import {
  computeShiftPay,
  statusLabel,
  disputeProblem,
  lineActionProblem,
  lineState,
  money,
  parseMoney,
  payableTotal,
  platformFee,
  reReviewProblem,
  resolutionProblem,
  wageFlag,
  type PayEventFact,
} from "@/lib/pay";
import { verifiedWork } from "@/lib/scorecard";
import { SEED_SHIFT_EVENTS } from "../../prisma/seed-fixture";

const H = 3_600_000;
const work = (o: Partial<Parameters<typeof computeShiftPay>[0]["work"]> = {}) => ({
  completed: true,
  activeMs: 3.5 * H,
  accepted: 0,
  contacts: 0,
  batchCounted: false,
  ...o,
});
const t = (min: number) => new Date(Date.UTC(2026, 9, 1, 12, min));
const ev = (type: PayEventFact["type"], min: number, o: Partial<PayEventFact> = {}): PayEventFact => ({
  type,
  createdAt: t(min),
  reason: null,
  transferId: null,
  providerRef: null,
  ...o,
});

describe("computeShiftPay", () => {
  it("hourly: verified hours × rate, 15% fee on top", () => {
    const r = computeShiftPay({ method: "HOURLY", rateCents: 2500, workType: "PETITION", work: work(), jurisdictionVersion: 1 });
    expect(r).toMatchObject({ ok: true, amountCents: 8750, feeCents: 1313 });
    if (r.ok) {
      expect(r.basis.formula).toBe("3h 30m verified × $25.00/hr");
      expect(r.basis.quantity).toBe(3.5);
      expect(r.basis.effectiveHourlyCents).toBe(2500);
      expect(r.basis.jurisdictionVersion).toBe(1);
    }
  });

  it("hourly rounds to the nearest cent", () => {
    const r = computeShiftPay({ method: "HOURLY", rateCents: 2000, workType: "CANVASS", work: work({ activeMs: 61_000 }), jurisdictionVersion: null });
    expect(r.ok && r.amountCents).toBe(34); // 2000 × 61/3600 = 33.9
  });

  it("shift rate pays the rate once", () => {
    const r = computeShiftPay({ method: "SHIFT_RATE", rateCents: 12000, workType: "CANVASS", work: work(), jurisdictionVersion: 2 });
    expect(r).toMatchObject({ ok: true, amountCents: 12000, feeCents: 1800 });
  });

  it("per accepted signature needs the batch count", () => {
    const no = computeShiftPay({ method: "PER_UNIT", rateCents: 150, workType: "PETITION", work: work({ accepted: 20 }), jurisdictionVersion: 1 });
    expect(no).toEqual({ ok: false, reason: expect.stringContaining("Count the batch") });
    const yes = computeShiftPay({ method: "PER_UNIT", rateCents: 150, workType: "PETITION", work: work({ accepted: 20, batchCounted: true }), jurisdictionVersion: 1 });
    expect(yes).toMatchObject({ ok: true, amountCents: 3000 });
    if (yes.ok) expect(yes.basis.formula).toBe("20 accepted signatures × $1.50");
  });

  it("per contact uses verified contacts", () => {
    const r = computeShiftPay({ method: "PER_UNIT", rateCents: 100, workType: "CANVASS", work: work({ contacts: 1 }), jurisdictionVersion: 1 });
    expect(r.ok && r.basis.formula).toBe("1 verified contact × $1.00");
  });

  it("refuses fractional counts and implausible amounts", () => {
    expect(computeShiftPay({ method: "PER_UNIT", rateCents: 100, workType: "CANVASS", work: work({ contacts: 1.5 }), jurisdictionVersion: 1 }).ok).toBe(false);
    expect(computeShiftPay({ method: "SHIFT_RATE", rateCents: 2_000_000, workType: "CANVASS", work: work(), jurisdictionVersion: 1 }).ok).toBe(false);
  });

  it("a recount replaces the earlier batch count", () => {
    const at = (m: number) => new Date(Date.UTC(2026, 8, 1, 14, m));
    const w = verifiedWork(
      [
        { id: "1", type: "CHECK_IN", payload: {}, createdAt: at(0) },
        { id: "2", type: "CHECK_OUT", payload: {}, createdAt: at(60) },
        { id: "3", type: "BATCH_COUNT", payload: { reviewed: 30, accepted: 25, rejected: 5 }, createdAt: at(70) },
        { id: "4", type: "BATCH_COUNT", payload: { reviewed: 30, accepted: 20, rejected: 10 }, createdAt: at(80) },
        { id: "5", type: "BATCH_COUNT", payload: { note: "malformed" }, createdAt: at(90) },
      ],
      []
    );
    expect(w).toMatchObject({ accepted: 20, reviewed: 30, batchCounted: true });
    expect(verifiedWork([{ id: "5", type: "BATCH_COUNT", payload: {}, createdAt: at(90) }], []).batchCounted).toBe(false);
  });

  it("refuses without a rate or a completed shift", () => {
    expect(computeShiftPay({ method: "HOURLY", rateCents: null, workType: "PETITION", work: work(), jurisdictionVersion: 1 }).ok).toBe(false);
    expect(computeShiftPay({ method: "HOURLY", rateCents: 2500, workType: "PETITION", work: work({ completed: false }), jurisdictionVersion: 1 }).ok).toBe(false);
  });

  it("matches the seeded shift: 4h on shift, 30 min paused", () => {
    const start = Date.UTC(2026, 8, 1, 14);
    const w = verifiedWork(
      SEED_SHIFT_EVENTS.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: new Date(start + e.offsetMs) })),
      [{ workEventId: null, status: "APPROVED", createdAt: new Date(Date.UTC(2026, 8, 2)) }]
    );
    expect(w.completed).toBe(true);
    const r = computeShiftPay({ method: "HOURLY", rateCents: 2500, workType: "PETITION", work: w, jurisdictionVersion: 1 });
    expect(r.ok && r.amountCents).toBe(8750);
  });
});

describe("fees and money", () => {
  it("rounds the fee half away from zero, symmetric for adjustments", () => {
    expect(platformFee(8750)).toBe(1313);
    expect(platformFee(-8750)).toBe(-1313);
    expect(platformFee(0)).toBe(0);
  });
  it("formats and parses dollars", () => {
    expect(money(123456)).toBe("$1,234.56");
    expect(money(-500)).toBe("−$5.00");
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("$7")).toBe(700);
    expect(parseMoney("-$5.25")).toBe(-525);
    expect(parseMoney("−3")).toBe(-300);
    expect(parseMoney("1,000.00")).toBe(100000);
    expect(parseMoney("1.234")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
});

describe("lineState", () => {
  const line = { amountCents: 8750 };
  it("walks awaiting → approved → sending → paid", () => {
    expect(lineState(line, [], false).status).toBe("AWAITING_APPROVAL");
    const approved = [ev("APPROVED", 1)];
    expect(lineState(line, approved, false)).toMatchObject({ status: "APPROVED", payable: true });
    const sending = [...approved, ev("TRANSFER_STARTED", 2, { transferId: "t1" })];
    expect(lineState(line, sending, false)).toMatchObject({ status: "PROCESSING", payable: false, transferId: "t1" });
    const paid = [...sending, ev("PAID", 3, { transferId: "t1", providerRef: "tr_1" })];
    expect(lineState(line, paid, false)).toMatchObject({ status: "PAID", paidRef: "tr_1", paidAt: t(3) });
  });
  it("replays out of order by time", () => {
    expect(lineState(line, [ev("PAID", 3, { providerRef: "tr" }), ev("APPROVED", 1), ev("TRANSFER_STARTED", 2)], false).status).toBe("PAID");
  });
  it("a failed or reversed transfer makes it payable again, with a note", () => {
    const failed = [ev("APPROVED", 1), ev("TRANSFER_STARTED", 2), ev("TRANSFER_FAILED", 3, { reason: "balance too low" })];
    expect(lineState(line, failed, false)).toMatchObject({ status: "APPROVED", payable: true, note: "Payment failed: balance too low" });
  });
  it("a reversal holds the line until someone releases it", () => {
    const reversed = [ev("APPROVED", 1), ev("TRANSFER_STARTED", 2, { transferId: "t1" }), ev("PAID", 3, { transferId: "t1" }), ev("REVERSED", 4, { transferId: "t1", reason: "wrong account" })];
    expect(lineState(line, reversed, false)).toMatchObject({ status: "HELD", payable: false, heldReason: "Payment reversed: wrong account" });
    expect(lineState(line, [...reversed, ev("RELEASED", 5)], false)).toMatchObject({ status: "APPROVED", payable: true });
  });
  it("ignores a late answer about an earlier transfer", () => {
    const events = [
      ev("APPROVED", 1),
      ev("TRANSFER_STARTED", 2, { transferId: "t1" }),
      ev("TRANSFER_FAILED", 3, { transferId: "t1" }),
      ev("TRANSFER_STARTED", 4, { transferId: "t2" }),
      ev("PAID", 5, { transferId: "t2", providerRef: "tr_2" }),
      ev("REVERSED", 6, { transferId: "t1" }),
      ev("TRANSFER_FAILED", 7, { transferId: "t1" }),
    ];
    expect(lineState(line, events, false)).toMatchObject({ status: "PAID", paidRef: "tr_2" });
    // …but a "paid" for t1 while t2 is in flight means money moved: flagged.
    const inFlight = [ev("APPROVED", 1), ev("TRANSFER_STARTED", 2, { transferId: "t1" }), ev("TRANSFER_FAILED", 3, { transferId: "t1" }), ev("TRANSFER_STARTED", 4, { transferId: "t2" }), ev("PAID", 5, { transferId: "t1" })];
    expect(lineState(line, inFlight, false)).toMatchObject({ status: "PAID", conflict: true });
    expect(lineState(line, [...inFlight, ev("PAID", 6, { transferId: "t2" }), ev("REVERSED", 7, { transferId: "t1" })], false)).toMatchObject({ status: "PAID", conflict: false, transferId: "t2" });
  });
  it("a pre-M5 paid line stays paid", () => {
    expect(lineState(line, [ev("APPROVED", 0), ev("PAID", 0, { providerRef: "tr_old" })], false)).toMatchObject({ status: "PAID", paidRef: "tr_old", payable: false });
  });
  it("flags a possible double payment and never pays the line again", () => {
    const twice = [ev("APPROVED", 1), ev("TRANSFER_STARTED", 2, { transferId: "t1" }), ev("TRANSFER_FAILED", 3, { transferId: "t1" }), ev("TRANSFER_STARTED", 4, { transferId: "t2" }), ev("PAID", 5, { transferId: "t2" }), ev("PAID", 6, { transferId: "t1" })];
    expect(lineState(line, twice, false)).toMatchObject({ status: "PAID", conflict: true, note: expect.stringMatching(/More than one payment/) });
    // Reversing either payment clears the conflict and leaves the other paid.
    expect(lineState(line, [...twice, ev("REVERSED", 7, { transferId: "t2" })], false)).toMatchObject({ status: "PAID", conflict: false, transferId: "t1" });
    expect(lineState(line, [...twice, ev("REVERSED", 7, { transferId: "t1" })], false)).toMatchObject({ status: "PAID", conflict: false, transferId: "t2" });
    const overlap = [ev("APPROVED", 1), ev("TRANSFER_STARTED", 2, { transferId: "t1" }), ev("TRANSFER_STARTED", 3, { transferId: "t2" })];
    expect(lineState(line, overlap, false)).toMatchObject({ status: "PROCESSING", transferId: "t1", conflict: true });
    const failedBack = [...overlap, ev("TRANSFER_FAILED", 4, { transferId: "t1" })];
    expect(lineState(line, failedBack, false)).toMatchObject({ status: "PROCESSING", transferId: "t2", conflict: false });
  });
  it("a reversal that arrives before its payment still holds the line", () => {
    const early = [ev("APPROVED", 1), ev("TRANSFER_STARTED", 2, { transferId: "t1" }), ev("REVERSED", 3, { transferId: "t1" }), ev("PAID", 4, { transferId: "t1" })];
    expect(lineState(line, early, false)).toMatchObject({ status: "HELD", payable: false });
  });
  it("replays same-millisecond events in the order they can happen", () => {
    expect(lineState(line, [ev("TRANSFER_FAILED", 2, { transferId: "t" }), ev("TRANSFER_STARTED", 2, { transferId: "t" }), ev("APPROVED", 1)], false).status).toBe("APPROVED");
    expect(lineState(line, [ev("RELEASED", 2), ev("HELD", 2, { reason: "x" })], false).status).toBe("AWAITING_APPROVAL");
  });
  it("holds and disputes stop payment", () => {
    expect(lineState(line, [ev("APPROVED", 1), ev("HELD", 2, { reason: "Check hours" })], false)).toMatchObject({ status: "HELD", heldReason: "Check hours", payable: false });
    expect(lineState(line, [ev("APPROVED", 1), ev("HELD", 2), ev("RELEASED", 3)], false).status).toBe("APPROVED");
    expect(lineState(line, [ev("APPROVED", 1)], true)).toMatchObject({ status: "DISPUTED", payable: false });
  });
  it("voided wins; zero lines have nothing to pay", () => {
    expect(lineState(line, [ev("VOIDED", 1)], false).status).toBe("VOIDED");
    expect(lineState({ amountCents: 0 }, [ev("APPROVED", 1)], false)).toMatchObject({ status: "NOTHING_DUE", payable: false });
  });
});

describe("finance actions and re-review", () => {
  const st = (events: PayEventFact[], dispute = false) => lineState({ amountCents: 100 }, events, dispute);
  it("approve only what's awaiting; hold needs a reason; release only holds", () => {
    expect(lineActionProblem(st([]), "approve")).toBeNull();
    expect(lineActionProblem(st([ev("APPROVED", 1)]), "approve")).not.toBeNull();
    expect(lineActionProblem(st([], true), "approve")).not.toBeNull();
    expect(lineActionProblem(st([]), "hold", " ")).toMatch(/why/);
    expect(lineActionProblem(st([ev("APPROVED", 1)]), "hold", "Check")).toBeNull();
    expect(lineActionProblem(st([ev("APPROVED", 1), ev("TRANSFER_STARTED", 2)]), "hold", "x")).not.toBeNull();
    expect(lineActionProblem(st([ev("HELD", 1, { reason: "x" })]), "release")).toBeNull();
  });
  it("a void never hides a payment that went out", () => {
    const st2 = lineState({ amountCents: 100 }, [ev("APPROVED", 1), ev("TRANSFER_STARTED", 2, { transferId: "t" }), ev("VOIDED", 3), ev("PAID", 4, { transferId: "t" })], false);
    expect(st2).toMatchObject({ status: "PAID", conflict: true, payable: false });
    expect(reReviewProblem([st2])).not.toBeNull();
  });
  it("re-review is allowed until pay is approved", () => {
    expect(reReviewProblem([st([])])).toBeNull();
    expect(reReviewProblem([st([ev("HELD", 1, { reason: "x" })])])).toBeNull();
    expect(reReviewProblem([st([ev("APPROVED", 1)])])).toMatch(/adjustment/);
    expect(reReviewProblem([st([ev("APPROVED", 1), ev("VOIDED", 2)])])).toBeNull();
  });
  it("totals net payable lines, including negative adjustments", () => {
    const a = st([ev("APPROVED", 1)]);
    const lines = [
      { amountCents: 8750, feeCents: 1313, state: a },
      { amountCents: -500, feeCents: -75, state: lineState({ amountCents: -500 }, [ev("APPROVED", 1)], false) },
      { amountCents: 999, feeCents: 150, state: st([]) },
    ];
    expect(payableTotal(lines)).toEqual({ amountCents: 8250, feeCents: 1238, count: 2 });
  });
});

describe("labels", () => {
  it("names deductions as deductions", () => {
    expect(statusLabel("APPROVED", -500).label).toBe("Deducted from your next payment");
    expect(statusLabel("APPROVED", 500).label).toBe("Approved · on the way");
  });
});

describe("disputes", () => {
  const ok = { reviewed: true, openDispute: false, disputes: 0, reason: "My hours are short by an hour." };
  it("needs a reviewed shift, one open at a time, a real reason", () => {
    expect(disputeProblem(ok)).toBeNull();
    expect(disputeProblem({ ...ok, reviewed: false })).toMatch(/reviewed/);
    expect(disputeProblem({ ...ok, openDispute: true })).toMatch(/open dispute/);
    expect(disputeProblem({ ...ok, disputes: 3 })).toMatch(/up to 3/);
    expect(disputeProblem({ ...ok, reason: "short" })).toMatch(/Explain/);
  });
  it("resolutions need a response; adjustments a non-zero amount; re-review a newer review", () => {
    expect(resolutionProblem({ outcome: "KEPT", response: "Hours match the check-out." }, { reviewedSinceDispute: false })).toBeNull();
    expect(resolutionProblem({ outcome: "KEPT", response: "" }, { reviewedSinceDispute: false })).toMatch(/response/);
    expect(resolutionProblem({ outcome: "ADJUSTED", response: "Added the hour.", amountCents: 0 }, { reviewedSinceDispute: false })).toMatch(/zero/);
    expect(resolutionProblem({ outcome: "ADJUSTED", response: "Added the hour.", amountCents: 2500 }, { reviewedSinceDispute: false })).toBeNull();
    expect(resolutionProblem({ outcome: "REREVIEWED", response: "Approved now." }, { reviewedSinceDispute: false })).toMatch(/Re-review/);
    expect(resolutionProblem({ outcome: "REREVIEWED", response: "Approved now." }, { reviewedSinceDispute: true })).toBeNull();
  });
});

describe("minimum-wage review", () => {
  it("flags only when the jurisdiction lists a minimum", () => {
    expect(wageFlag(1000, {})).toBeNull();
    expect(wageFlag(1000, { minimumWageCents: 1481 })).toMatch(/below the \$14\.81\/hr/);
    expect(wageFlag(2000, { minimumWageCents: 1481 })).toBeNull();
    expect(wageFlag(null, { minimumWageCents: 1481 })).toBeNull();
  });
});
