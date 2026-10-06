import { describe, expect, it } from "vitest";
import { computeScorecard, type ScorecardShift } from "./scorecard";
import { ALL_SHARED, AVERAGE_KEYS, COUNTS_WITHHELD, shareScorecard, sortWithWithheld } from "./shared-scorecard";
import { canSee, visibleParts, DEFAULT_SHARING, type SharePart } from "./sharing";
import { SEED_SHIFT_EVENTS, SEED_SHIFT_ID } from "../../prisma/seed-fixture";

const checkIn = new Date("2026-09-28T09:00:00Z");
const now = new Date("2026-09-28T18:00:00Z");
const at = (min: number) => new Date(checkIn.getTime() + min * 60_000);
const shift: ScorecardShift = {
  id: SEED_SHIFT_ID,
  engagementId: "eng-seed",
  engagementStatus: "ACTIVE",
  workType: "PETITION",
  state: "CO",
  status: "COMPLETED",
  startsAt: checkIn,
  endsAt: at(480),
  scheduledAt: at(-7 * 24 * 60),
  events: SEED_SHIFT_EVENTS.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: new Date(checkIn.getTime() + e.offsetMs) })),
  validations: [{ workEventId: null, status: "APPROVED", createdAt: at(300) }],
};
const sc = computeScorecard([shift], { now });
const only = (...parts: SharePart[]) => ({ ...Object.fromEntries(Object.keys(ALL_SHARED).map((k) => [k, false])), ...Object.fromEntries(parts.map((p) => [p, true])) }) as Record<SharePart, boolean>;
const json = (x: unknown) => JSON.stringify(x);

describe("shareScorecard", () => {
  it("with everything shared, keeps every number and its full evidence", () => {
    const v = shareScorecard(sc, ALL_SHARED);
    const seg = v.segments[0];
    expect(seg.history?.shiftsCount).toBe(1);
    expect(seg.history?.statesWorked).toEqual(["CO"]);
    for (const k of AVERAGE_KEYS) expect(seg.averages[k]).toEqual(sc.segments[0].averages[k]);
    expect(v.showRate).toMatchObject({ value: 1, numerator: 1, denominator: 1 });
    expect(v.lastUpdated).toBe(sc.lastUpdated);
  });

  it("with nothing shared, carries no number at all — only the work type", () => {
    const v = shareScorecard(sc, only());
    expect(v.segments).toEqual([{ workType: "PETITION", history: null, averages: Object.fromEntries(AVERAGE_KEYS.map((k) => [k, null])) }]);
    expect(v.showRate).toBeNull();
    expect(v.lastUpdated).toBeNull();
  });

  it("each group withholds exactly its own metrics (C2-Q1)", () => {
    const out = shareScorecard(sc, only("output")).segments[0].averages;
    expect(Object.entries(out).filter(([, m]) => m).map(([k]) => k).sort()).toEqual(["doorsPerActiveHour", "doorsPerCompletedShift", "signaturesPerActiveHour"]);
    const q = shareScorecard(sc, only("quality")).segments[0].averages;
    expect(Object.entries(q).filter(([, m]) => m).map(([k]) => k).sort()).toEqual(["acceptanceRate", "contactRate"]);
    expect(shareScorecard(sc, only("reliability")).showRate).not.toBeNull();
    expect(shareScorecard(sc, only("history")).segments[0].history).not.toBeNull();
  });

  it("a shared rate without shared history shows its value and formula only — no counts behind it", () => {
    const m = shareScorecard(sc, only("quality")).segments[0].averages.acceptanceRate!;
    expect(m.value).toBe(0.91); // rounded: 20/22 can't be read back
    expect(m).toMatchObject({ numerator: null, denominator: null, evidence: COUNTS_WITHHELD, formula: "accepted signatures ÷ signatures reviewed" });
    const withHistory = shareScorecard(sc, only("quality", "history")).segments[0].averages.acceptanceRate!;
    expect(withHistory.evidence).toMatch(/1 verified shift.*CO/);
  });

  it("withheld history leaves no trace anywhere in the shared view — not even in a rate's math", () => {
    const text = json(shareScorecard(sc, only("output", "quality", "reliability")));
    expect(text).not.toMatch(/"CO"|CO\b|Sep 28|campaignsCount|shiftsCount|lastUpdated":"/);
    // A rate keeps its value (doors per shift is 40 here); none carries the counts behind it.
    expect(text).not.toMatch(/"numerator":\d|"denominator":\d|over [0-9]|contacts from|[0-9] of [0-9]+ accepted shift|of [0-9]+ reviewed/);
    const v = shareScorecard(sc, only("output", "quality", "reliability"));
    const shown = [...Object.values(v.segments[0].averages), v.showRate].filter(Boolean);
    expect(shown.length).toBeGreaterThan(0);
    for (const m of shown) expect(m!.evidence).toBe(COUNTS_WITHHELD);
  });

  it("without history, a rate with no data yet is withheld rather than shown as none", () => {
    const empty = computeScorecard([], { now });
    expect(shareScorecard(empty, only("reliability")).showRate).toBeNull();
    expect(shareScorecard(empty, only("reliability", "history")).showRate?.value).toBeNull();
  });

  it("follows the worker's choices for a real viewer: defaults show a related org everything, others nothing", () => {
    const related = visibleParts(DEFAULT_SHARING, { kind: "org", approved: true, relationship: true });
    expect(json(shareScorecard(sc, related))).toBe(json(shareScorecard(sc, ALL_SHARED)));
    const stranger = visibleParts(DEFAULT_SHARING, { kind: "org", approved: true, relationship: false });
    expect(json(shareScorecard(sc, stranger))).toBe(json(shareScorecard(sc, only())));
    expect(canSee("NOBODY", { kind: "self" })).toBe(true);
  });
});

describe("sortWithWithheld (the rule C3's lists use)", () => {
  const rows = [
    { n: "a", v: 3 as number | null | "withheld" },
    { n: "b", v: "withheld" as const },
    { n: "c", v: 9 },
    { n: "d", v: null },
    { n: "e", v: "withheld" as const },
    { n: "f", v: 3 },
  ];
  it("sorts sharers, then no-data, then withheld in their own group, never as zero", () => {
    const r = sortWithWithheld(rows, (x) => x.v);
    expect(r.sorted.map((x) => x.n)).toEqual(["c", "a", "f"]);
    expect(r.noData.map((x) => x.n)).toEqual(["d"]);
    expect(r.withheld.map((x) => x.n)).toEqual(["b", "e"]);
  });
  it("files NaN with no data, never sorted", () => {
    expect(sortWithWithheld([{ v: NaN }, { v: 1 }], (x) => x.v).noData).toHaveLength(1);
  });
  it("ascending keeps ties in their original order", () => {
    expect(sortWithWithheld(rows, (x) => x.v, "asc").sorted.map((x) => x.n)).toEqual(["a", "f", "c"]);
  });
});
