import { describe, expect, it } from "vitest";
import { computeScorecard, type ScorecardShift } from "./scorecard";
import { SEED_SHIFT_EVENTS, SEED_SHIFT_ID } from "../../prisma/seed-fixture";

const checkIn = new Date("2026-09-28T09:00:00Z");
const now = new Date("2026-09-28T18:00:00Z");
const at = (min: number) => new Date(checkIn.getTime() + min * 60_000);

const seedShift: ScorecardShift = {
  id: SEED_SHIFT_ID,
  status: "COMPLETED",
  startsAt: checkIn,
  events: SEED_SHIFT_EVENTS.map((e) => ({
    id: e.id,
    type: e.type,
    payload: e.payload,
    createdAt: new Date(checkIn.getTime() + e.offsetMs),
  })),
};

describe("scorecard from the seeded shift (hand-computed values)", () => {
  const s = computeScorecard([seedShift], now);

  it("excludes the 30-minute pause from active hours", () => {
    expect(s.totals.activeHours).toBe(3.5);
    expect(s.totals.pausedHours).toBe(0.5);
  });

  it("matches every hand-computed metric", () => {
    expect(s.metrics.doorsPerActiveHour.value).toBeCloseTo(40 / 3.5, 10);
    expect(s.metrics.doorsPerCompletedShift.value).toBe(40);
    expect(s.metrics.contactRate.value).toBe(0.45);
    expect(s.metrics.signaturesPerActiveHour.value).toBeCloseTo(22 / 3.5, 10);
    expect(s.metrics.acceptanceRate.value).toBeCloseTo(20 / 22, 10);
    expect(s.metrics.showRate.value).toBe(1);
  });

  it("explains each metric with its numerator, denominator and evidence", () => {
    expect(s.metrics.acceptanceRate).toMatchObject({ numerator: 20, denominator: 22 });
    expect(s.metrics.doorsPerActiveHour).toMatchObject({ numerator: 40, denominator: 3.5 });
    for (const m of Object.values(s.metrics)) {
      expect(m.formula).not.toBe("");
      expect(m.evidence).not.toBe("");
    }
  });

  it("reports no composite score", () => {
    expect(Object.keys(s)).toEqual(["metrics", "totals", "eventCount", "computedAt"]);
  });
});

describe("scorecard edge cases", () => {
  const shift = (
    id: string,
    events: Array<[string, number, object?]>,
    extra: Partial<ScorecardShift> = {}
  ): ScorecardShift => ({
    id,
    status: "COMPLETED",
    startsAt: checkIn,
    events: events.map(([type, min, payload = {}], i) => ({
      id: `${id}-${i}`,
      type,
      payload,
      createdAt: at(min),
    })),
    ...extra,
  });

  it("counts a no-show against show rate but not against per-hour rates", () => {
    const s = computeScorecard(
      [
        shift("a", [["CHECK_IN", 0], ["DOOR_KNOCK", 30, { count: 20 }], ["CHECK_OUT", 120]]),
        shift("b", []), // due, never checked in
      ],
      now
    );
    expect(s.metrics.showRate.value).toBe(0.5);
    expect(s.metrics.doorsPerActiveHour.value).toBe(10);
  });

  it("ignores cancelled and future shifts entirely", () => {
    const s = computeScorecard(
      [
        shift("a", [["CHECK_IN", 0], ["CHECK_OUT", 60]]),
        shift("c", [], { status: "CANCELLED" }),
        shift("f", [], { status: "SCHEDULED", startsAt: new Date(now.getTime() + 3_600_000) }),
      ],
      now
    );
    expect(s.metrics.showRate).toMatchObject({ numerator: 1, denominator: 1 });
  });

  it("leaves a shift without check-out out of per-hour rates", () => {
    const s = computeScorecard(
      [
        shift("a", [["CHECK_IN", 0], ["DOOR_KNOCK", 30, { count: 10 }], ["CHECK_OUT", 60]]),
        shift("b", [["CHECK_IN", 0], ["DOOR_KNOCK", 30, { count: 99 }]]),
      ],
      now
    );
    expect(s.metrics.doorsPerActiveHour.value).toBe(10);
    expect(s.metrics.doorsPerCompletedShift.value).toBe(10);
    // Contact rate still sees every door knocked.
    expect(s.totals.doorsKnocked).toBe(109);
  });

  it("treats an unclosed pause as paused until check-out", () => {
    const s = computeScorecard(
      [shift("a", [["CHECK_IN", 0], ["PAUSE_START", 60], ["CHECK_OUT", 120]])],
      now
    );
    expect(s.totals.activeHours).toBe(1);
  });

  it("applies the newest CORRECTION without touching the original event", () => {
    const original = shift("a", [
      ["CHECK_IN", 0],
      ["DOOR_KNOCK", 10, { count: 50 }],
      ["CHECK_OUT", 60],
    ]);
    const doorId = original.events[1].id;
    original.events.push(
      { id: "c1", type: "CORRECTION", payload: { supersedesEventId: doorId, count: 45 }, createdAt: at(70) },
      { id: "c2", type: "CORRECTION", payload: { supersedesEventId: doorId, count: 42 }, createdAt: at(80) }
    );
    const s = computeScorecard([original], now);
    expect(s.totals.doorsKnocked).toBe(42);
    expect(original.events[1].payload).toEqual({ count: 50 });
  });

  it("computes acceptance only over supervisor-reconciled shifts", () => {
    const s = computeScorecard(
      [
        shift("a", [["CHECK_IN", 0], ["SIGNATURE_SUBMITTED", 10, { count: 10 }], ["CHECK_OUT", 60], ["BATCH_COUNT", 70, { accepted: 8 }]]),
        shift("b", [["CHECK_IN", 0], ["SIGNATURE_SUBMITTED", 10, { count: 30 }], ["CHECK_OUT", 60]]),
      ],
      now
    );
    expect(s.metrics.acceptanceRate).toMatchObject({ value: 0.8, numerator: 8, denominator: 10 });
  });

  it("returns null metrics, not zeros, when there is no evidence", () => {
    const s = computeScorecard([], now);
    for (const m of Object.values(s.metrics)) expect(m.value).toBeNull();
  });
});
