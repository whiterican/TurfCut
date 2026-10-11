import { describe, expect, it } from "vitest";
import { changeLabels, jobDiff, listText, materialLabels, releaseDeadline, releaseOpen } from "./job-changes";

const at = (s: string) => new Date(s);

describe("job changes", () => {
  it("records only what changed, comparing values not spellings", () => {
    const before = { title: "A", payRateCents: 2400, startsAt: at("2026-11-01T00:00:00Z"), geography: { city: "Denver", state: "CO" }, launch: null, measureIds: ["I-1"] };
    const after = { title: "A", payRateCents: 2600, startsAt: "2026-11-01T00:00:00.000Z", geography: { state: "CO", city: "Denver" }, launch: { mode: "SELF", points: [] }, measureIds: ["I-1"] };
    const d = jobDiff(before, after);
    expect(Object.keys(d).sort()).toEqual(["launch", "payRateCents"]);
    expect(d.payRateCents).toEqual({ from: 2400, to: 2600 });
    expect(jobDiff(before, { title: "A" })).toEqual({});
  });

  it("names the material parts once each, in a fixed order", () => {
    const d = jobDiff({ startsAt: at("2026-11-01Z"), endsAt: at("2026-12-01Z"), payRateCents: 1, description: "x", title: "t" }, { startsAt: at("2026-11-02Z"), endsAt: at("2026-12-02Z"), payRateCents: 2, description: "y", title: "u" });
    expect(materialLabels(d)).toEqual(["dates", "pay"]);
    expect(changeLabels(d)).toEqual(["title", "description", "dates", "pay"]);
    expect(materialLabels(jobDiff({ title: "t" }, { title: "u" }))).toEqual([]);
    expect(listText(["dates", "pay", "location"])).toBe("dates, pay and location");
    expect(listText(["pay"])).toBe("pay");
  });

  it("opens the release for 24 hours after a material change made after the hire", () => {
    const change = { material: ["pay"], createdAt: at("2026-11-01T12:00:00Z") };
    const hired = at("2026-10-20T00:00:00Z");
    expect(releaseDeadline(change.createdAt).toISOString()).toBe("2026-11-02T12:00:00.000Z");
    expect(releaseOpen(change, hired, at("2026-11-02T11:59:00Z"))).toBe(true);
    expect(releaseOpen(change, hired, at("2026-11-02T12:00:00Z"))).toBe(false);
    expect(releaseOpen({ ...change, material: [] }, hired, at("2026-11-01T13:00:00Z"))).toBe(false);
    // Hired after the change: that change is what they agreed to.
    expect(releaseOpen(change, at("2026-11-01T13:00:00Z"), at("2026-11-01T14:00:00Z"))).toBe(false);
  });
});
