import { describe, expect, it } from "vitest";
import { campaignHistory, computeScorecard, type ScorecardShift } from "./scorecard";
import { SEED_SHIFT_EVENTS, SEED_SHIFT_ID } from "../../prisma/seed-fixture";

const checkIn = new Date("2026-09-28T09:00:00Z");
const now = new Date("2026-09-28T18:00:00Z");
const at = (min: number, base = checkIn) => new Date(base.getTime() + min * 60_000);
const approved = (min = 300) => [{ workEventId: null, status: "APPROVED" as const, createdAt: at(min) }];

const seedShift: ScorecardShift = {
  id: SEED_SHIFT_ID,
  engagementId: "eng-seed",
  engagementStatus: "ACTIVE",
  workType: "PETITION",
  state: "CO",
  status: "COMPLETED",
  startsAt: checkIn,
  endsAt: at(480),
  scheduledAt: at(-7 * 24 * 60),
  events: SEED_SHIFT_EVENTS.map((e) => ({
    id: e.id,
    type: e.type,
    payload: e.payload,
    createdAt: new Date(checkIn.getTime() + e.offsetMs),
  })),
  validations: approved(),
};

describe("scorecard from the seeded shift (hand-computed, spec p.10 formulas)", () => {
  const s = computeScorecard([seedShift], { now });
  const seg = s.segments[0];

  it("puts the seeded petition shift in one PETITION segment", () => {
    expect(s.segments.map((x) => x.workType)).toEqual(["PETITION"]);
    expect(seg.statesWorked).toEqual(["CO"]);
    expect(seg.verificationBreakdown).toEqual({ verifiedShifts: 1, pendingReviewShifts: 0, rejectedShifts: 0, incompleteShifts: 0 });
  });

  it("reports the spec's minimum totals, with signature stages stored separately", () => {
    expect(seg).toMatchObject({
      campaignsCount: 1,
      initiativesCount: 0,
      shiftsCount: 1,
      activeHours: 3.5,
      doorsAttempted: 40,
      contacts: 18,
      signaturesSubmitted: 22,
      signaturesReviewed: 22,
      signaturesAccepted: 20,
      signaturesRejected: 2,
    });
  });

  it("matches every hand-computed average", () => {
    expect(seg.averages.doorsPerActiveHour.value).toBeCloseTo(40 / 3.5, 10);
    expect(seg.averages.doorsPerCompletedShift.value).toBe(40);
    expect(seg.averages.contactRate.value).toBe(0.45);
    expect(seg.averages.signaturesPerActiveHour.value).toBeCloseTo(22 / 3.5, 10);
    expect(seg.averages.acceptanceRate.value).toBeCloseTo(20 / 22, 10);
    expect(s.reliability.showRate.value).toBe(1);
  });

  it("explains each metric with formula, sample size, date range and states", () => {
    expect(seg.averages.acceptanceRate).toMatchObject({ numerator: 20, denominator: 22 });
    expect(seg.averages.acceptanceRate.evidence).toContain("1 verified shift on Sep 28, 2026, CO");
    for (const m of [...Object.values(seg.averages), s.reliability.showRate]) {
      expect(m.formula).not.toBe("");
      expect(m.evidence).not.toBe("");
    }
  });

  it("has no composite score anywhere", () => {
    expect(JSON.stringify(s)).not.toMatch(/overall|composite|"score"/i);
  });
});

describe("spec formulas and verification rules", () => {
  let n = 0;
  const shift = (
    events: Array<[string, number, object?]>,
    extra: Partial<ScorecardShift> = {}
  ): ScorecardShift => {
    const id = `s${++n}`;
    return {
      id,
      engagementId: `e${n}`,
      engagementStatus: "ACTIVE",
      workType: "PETITION",
      state: "CO",
      status: "COMPLETED",
      startsAt: checkIn,
      endsAt: at(480),
      scheduledAt: at(-7 * 24 * 60),
      events: events.map(([type, min, payload = {}], i) => ({ id: `${id}-${i}`, type, payload, createdAt: at(min) })),
      validations: approved(),
      ...extra,
    };
  };

  it("uses only verified (approved-closeout) shifts in averages", () => {
    const s = computeScorecard(
      [
        shift([["CHECK_IN", 0], ["DOOR_KNOCK", 10, { count: 20 }], ["CHECK_OUT", 120]]),
        shift([["CHECK_IN", 0], ["DOOR_KNOCK", 10, { count: 99 }], ["CHECK_OUT", 60]], { validations: [] }),
        shift([["CHECK_IN", 0], ["DOOR_KNOCK", 10, { count: 99 }], ["CHECK_OUT", 60]], {
          validations: [{ workEventId: null, status: "REJECTED", createdAt: at(90) }],
        }),
        shift([["CHECK_IN", 0], ["DOOR_KNOCK", 10, { count: 99 }]]), // no check-out
      ],
      { now }
    );
    const seg = s.segments[0];
    expect(seg.averages.doorsPerActiveHour.value).toBe(10);
    expect(seg.verificationBreakdown).toEqual({ verifiedShifts: 1, pendingReviewShifts: 1, rejectedShifts: 1, incompleteShifts: 1 });
  });

  it("follows the latest closeout decision (approved after an earlier rejection counts)", () => {
    const s = computeScorecard(
      [
        shift([["CHECK_IN", 0], ["DOOR_KNOCK", 10, { count: 10 }], ["CHECK_OUT", 60]], {
          validations: [
            { workEventId: null, status: "REJECTED", createdAt: at(70) },
            { workEventId: null, status: "APPROVED", createdAt: at(200) },
          ],
        }),
      ],
      { now }
    );
    expect(s.segments[0].shiftsCount).toBe(1);
  });

  it("excludes an individually rejected event", () => {
    const sh = shift([["CHECK_IN", 0], ["DOOR_KNOCK", 10, { count: 10 }], ["DOOR_KNOCK", 20, { count: 50 }], ["CHECK_OUT", 60]]);
    sh.validations.push({ workEventId: sh.events[2].id, status: "REJECTED", createdAt: at(100) });
    expect(computeScorecard([sh], { now }).segments[0].doorsAttempted).toBe(10);
  });

  it("computes acceptance over signatures reviewed, not submitted", () => {
    const s = computeScorecard(
      [shift([["CHECK_IN", 0], ["SIGNATURE_SUBMITTED", 10, { count: 30 }], ["CHECK_OUT", 60], ["BATCH_COUNT", 70, { reviewed: 25, accepted: 20, rejected: 5 }]])],
      { now }
    );
    expect(s.segments[0].averages.acceptanceRate).toMatchObject({ value: 0.8, numerator: 20, denominator: 25 });
    expect(s.segments[0].signaturesSubmitted).toBe(30);
  });

  it("divides doors by completed door shifts only", () => {
    const s = computeScorecard(
      [
        shift([["CHECK_IN", 0], ["DOOR_KNOCK", 10, { count: 30 }], ["CHECK_OUT", 60]]),
        shift([["CHECK_IN", 0], ["SIGNATURE_SUBMITTED", 10, { count: 12 }], ["CHECK_OUT", 60]]), // storefront, no doors
      ],
      { now }
    );
    expect(s.segments[0].averages.doorsPerCompletedShift).toMatchObject({ value: 30, denominator: 1 });
  });

  it("segments by work type; signatures per hour is petition-only", () => {
    const s = computeScorecard(
      [
        shift([["CHECK_IN", 0], ["SIGNATURE_SUBMITTED", 10, { count: 10 }], ["CHECK_OUT", 60]]),
        shift([["CHECK_IN", 0], ["DOOR_KNOCK", 10, { count: 40 }], ["SIGNATURE_SUBMITTED", 20, { count: 5 }], ["CHECK_OUT", 120]], { workType: "CANVASS" }),
      ],
      { now }
    );
    const [petition, canvass] = s.segments;
    expect(petition.averages.signaturesPerActiveHour.value).toBe(10); // 10 sigs / 1 petition hour
    expect(canvass.averages.signaturesPerActiveHour.value).toBeNull();
    expect(canvass.averages.doorsPerActiveHour.value).toBe(20);
  });

  it("filters by period and state", () => {
    const old = shift([["CHECK_IN", 0, {}], ["CHECK_OUT", 60]], { startsAt: new Date("2025-01-10T09:00:00Z") });
    old.events.forEach((e, i) => (e.createdAt = at(i * 60, old.startsAt)));
    const az = shift([["CHECK_IN", 0], ["CHECK_OUT", 60]], { state: "AZ" });
    const recent = shift([["CHECK_IN", 0], ["CHECK_OUT", 60]]);
    expect(computeScorecard([old, az, recent], { now }).segments[0].shiftsCount).toBe(3);
    expect(computeScorecard([old, az, recent], { now, period: "90d" }).segments[0].shiftsCount).toBe(2);
    expect(computeScorecard([old, az, recent], { now, state: "AZ" }).segments[0].shiftsCount).toBe(1);
    expect(computeScorecard([old, az, recent], { now }).segments[0].statesWorked).toEqual(["AZ", "CO"]);
  });

  it("counts campaigns as unique engagements", () => {
    const a = shift([["CHECK_IN", 0], ["CHECK_OUT", 60]]);
    const b = shift([["CHECK_IN", 0], ["CHECK_OUT", 60]], { engagementId: a.engagementId });
    const c = shift([["CHECK_IN", 0], ["CHECK_OUT", 60]]);
    expect(computeScorecard([a, b, c], { now }).segments[0].campaignsCount).toBe(2);
  });

  it("show rate = started accepted shifts ÷ accepted shifts not cancelled", () => {
    const s = computeScorecard(
      [
        shift([["CHECK_IN", 0], ["CHECK_OUT", 60]]),
        shift([], { status: "SCHEDULED" }), // no-show
        shift([], { status: "CANCELLED" }),
        shift([], { engagementStatus: "APPLIED" }), // never accepted
        shift([], { status: "SCHEDULED", startsAt: new Date(now.getTime() + 3_600_000) }), // future
      ],
      { now }
    );
    expect(s.reliability.showRate).toMatchObject({ value: 0.5, numerator: 1, denominator: 2 });
  });

  it("counts a late worker cancellation as a no-show; timely or org cancellations leave the denominator", () => {
    const start = new Date("2026-09-28T09:00:00Z");
    const cancel = (by: string, hoursBefore: number, extra: Partial<ScorecardShift> = {}) =>
      shift([], {
        startsAt: start,
        endsAt: new Date(start.getTime() + 8 * 3_600_000),
        status: "CANCELLED",
        cancellationNoticeHours: 24,
        ...extra,
        events: [{ id: `c-${by}-${hoursBefore}`, type: "SHIFT_CANCELLED", payload: { by, reason: "test" }, createdAt: new Date(start.getTime() - hoursBefore * 3_600_000) }],
      });
    const s = computeScorecard(
      [
        shift([["CHECK_IN", 0], ["CHECK_OUT", 60]]), // started
        cancel("WORKER", 2), // late: inside the 24h window → no-show
        cancel("WORKER", 48), // timely → excused
        cancel("ORGANIZATION", 1), // org cancelled → never the worker's fault
        cancel("WORKER", 6, { cancellationNoticeHours: 4 }), // job allows 4h notice → timely
      ],
      { now }
    );
    expect(s.reliability.showRate).toMatchObject({ value: 0.5, numerator: 1, denominator: 2 });
    expect(s.reliability.showRate.evidence).toMatch(/1 late cancellation.*3 timely or organization/);
    expect(s.segments[0].shiftsCount).toBe(1); // cancelled shifts aren't work
  });

  it("gives a shift scheduled inside the notice window until its start to cancel", () => {
    const start = new Date("2026-09-28T09:00:00Z");
    const cancelled = (scheduledHoursBefore: number, cancelHoursBefore: number) =>
      shift([], {
        startsAt: start,
        endsAt: new Date(start.getTime() + 8 * 3_600_000),
        scheduledAt: new Date(start.getTime() - scheduledHoursBefore * 3_600_000),
        status: "CANCELLED",
        cancellationNoticeHours: 24,
        events: [{ id: `c-${scheduledHoursBefore}-${cancelHoursBefore}`, type: "SHIFT_CANCELLED", payload: { by: "WORKER", reason: "test" }, createdAt: new Date(start.getTime() - cancelHoursBefore * 3_600_000) }],
      });
    // Scheduled 1h before the start on a 24h-notice job, cancelled 55 min before → excused.
    expect(computeScorecard([cancelled(1, 55 / 60)], { now }).reliability.showRate.denominator).toBe(0);
    // Scheduled with full notice, cancelled 2h before → still a no-show.
    expect(computeScorecard([cancelled(72, 2)], { now }).reliability.showRate).toMatchObject({ numerator: 0, denominator: 1 });
    // Short notice still ends at the start: cancelling after it began is a no-show.
    expect(computeScorecard([cancelled(3, -1)], { now }).reliability.showRate).toMatchObject({ numerator: 0, denominator: 1 });
  });

  it("doesn't let a cancellation after the shift ended erase a no-show", () => {
    const start = new Date("2026-09-27T09:00:00Z");
    const s = shift([], {
      startsAt: start,
      endsAt: new Date(start.getTime() + 8 * 3_600_000),
      status: "CANCELLED",
      events: [{ id: "c-late-org", type: "SHIFT_CANCELLED", payload: { by: "ORGANIZATION", reason: "cleanup" }, createdAt: new Date(start.getTime() + 22 * 3_600_000) }],
    });
    expect(computeScorecard([s], { now }).reliability.showRate).toMatchObject({ value: 0, numerator: 0, denominator: 1 });
  });

  it("doesn't count a shift as a no-show until it has ended", () => {
    const started = shift([["CHECK_IN", 0], ["CHECK_OUT", 60]]);
    const justStarted = shift([], { status: "SCHEDULED", startsAt: at(-1, now), endsAt: at(239, now), validations: [] });
    const missed = shift([], { status: "SCHEDULED", startsAt: at(-300, now), endsAt: at(-60, now), validations: [] });
    expect(computeScorecard([started, justStarted], { now }).reliability.showRate).toMatchObject({ value: 1, numerator: 1, denominator: 1 });
    expect(computeScorecard([started, missed], { now }).reliability.showRate).toMatchObject({ value: 0.5, numerator: 1, denominator: 2 });
  });

  it("shows no doors-per-hour for petition work with no doors logged", () => {
    const seg = computeScorecard([shift([["CHECK_IN", 0], ["SIGNATURE_SUBMITTED", 30, { count: 10 }], ["CHECK_OUT", 120]])], { now }).segments[0];
    expect(seg.averages.doorsPerActiveHour.value).toBeNull();
    expect(seg.averages.doorsPerActiveHour.evidence).toBe("No doors are logged on petition shifts.");
  });

  it("counts unique ballot measures across verified shifts", () => {
    const s = computeScorecard(
      [
        shift([["CHECK_IN", 0], ["CHECK_OUT", 60]], { measureIds: ["I-305", "I-12"] }),
        shift([["CHECK_IN", 0], ["CHECK_OUT", 60]], { measureIds: ["I-305"] }),
        shift([["CHECK_IN", 0], ["CHECK_OUT", 60]], { measureIds: ["I-99"], validations: [] }), // unverified
      ],
      { now }
    );
    expect(s.segments[0].initiativesCount).toBe(2);
  });

  it("treats an unclosed pause as paused until check-out", () => {
    const s = computeScorecard([shift([["CHECK_IN", 0], ["PAUSE_START", 60], ["CHECK_OUT", 120]])], { now });
    expect(s.segments[0].activeHours).toBe(1);
  });

  it("applies only signed, explained corrections — newest wins, original untouched", () => {
    const sh = shift([["CHECK_IN", 0], ["DOOR_KNOCK", 10, { count: 50 }], ["CHECK_OUT", 60]]);
    const doorId = sh.events[1].id;
    sh.events.push(
      { id: "c1", type: "CORRECTION", payload: { supersedesEventId: doorId, count: 45, signedBy: "sup-1", reason: "double-logged block" }, createdAt: at(70) },
      { id: "c2", type: "CORRECTION", payload: { supersedesEventId: doorId, count: 42, signedBy: "sup-1", reason: "recount" }, createdAt: at(80) },
      { id: "c3", type: "CORRECTION", payload: { supersedesEventId: doorId, count: 1 }, createdAt: at(90) } // unsigned
    );
    const seg = computeScorecard([sh], { now }).segments[0];
    expect(seg.doorsAttempted).toBe(42);
    expect(seg.correctionsApplied).toBe(1);
    expect(seg.correctionsIgnored).toBe(1);
    expect(sh.events[1].payload).toEqual({ count: 50 });
  });

  it("applies a time correction: the corrected check-out sets verified hours", () => {
    const sh = shift([["CHECK_IN", 0], ["CHECK_OUT", 60]]);
    sh.events.push({ id: "c1", type: "CORRECTION", payload: { supersedesEventId: sh.events[1].id, at: at(180).toISOString(), signedBy: "sup-1", reason: "forgot to check out" }, createdAt: at(300) });
    expect(computeScorecard([sh], { now }).segments[0].activeHours).toBe(3);
  });

  it("returns null metrics, not zeros, when there is no evidence", () => {
    const s = computeScorecard([], { now });
    expect(s.segments).toEqual([]);
    expect(s.reliability.showRate.value).toBeNull();
    expect(s.lastUpdated).toBeNull();
  });
});

describe("date range labels", () => {
  it("reads like a person wrote it — plain dates, no server-side 'today'", async () => {
    const { rangeLabel, rangePhrase } = await import("./scorecard");
    expect(rangeLabel("2026-09-28", "2026-09-28")).toBe("Sep 28, 2026");
    expect(rangeLabel("2026-09-01", "2026-09-28")).toBe("Sep 1 – Sep 28, 2026");
    expect(rangeLabel("2025-12-30", "2026-01-02")).toBe("Dec 30, 2025 – Jan 2, 2026");
    expect(rangePhrase("2026-09-28", "2026-09-28")).toBe("on Sep 28, 2026");
    expect(rangePhrase("2026-09-01", "2026-09-28")).toBe("from Sep 1 to Sep 28, 2026");
    expect(rangePhrase("2025-12-30", "2026-01-02")).toBe("from Dec 30, 2025 to Jan 2, 2026");
  });
});

describe("per-campaign history (the worker's own profile only)", () => {
  it("counts verified shifts per job with the scorecard's own rules, newest first", () => {
    const a = { ...seedShift, jobId: "job-a", jobTitle: "Denver drive" };
    const pending = { ...a, id: "pending", validations: [] };
    const b = { ...seedShift, id: "b", jobId: "job-b", jobTitle: "Aurora drive", startsAt: at(60 * 24) };
    const h = campaignHistory([a, pending, b]);
    expect(h.map((x) => x.title)).toEqual(["Aurora drive", "Denver drive"]);
    const total = computeScorecard([a, b], { now: at(60 * 48) }).segments[0];
    // Adds up to the scorecard: same verified shifts, same accepted/reviewed.
    expect(h.reduce((n, x) => n + x.verifiedShifts, 0)).toBe(total.shiftsCount);
    expect(h.reduce((n, x) => n + x.accepted, 0)).toBe(total.signaturesAccepted);
    expect(h.reduce((n, x) => n + x.reviewed, 0)).toBe(total.signaturesReviewed);
  });
});
