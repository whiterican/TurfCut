import { describe, expect, it } from "vitest";
import { dayIn, relativeDay } from "./relative-day";

const NOW = new Date("2026-10-28T19:00:00Z"); // 1 pm in Denver
const DENVER = "America/Denver";

describe("relativeDay: whole calendar days in the viewer's zone", () => {
  it("names today, tomorrow, yesterday, and counts the rest", () => {
    expect(relativeDay(new Date("2026-10-28T23:30:00Z"), NOW, DENVER)).toEqual({ kind: "today", days: 0, words: "today" });
    expect(relativeDay(new Date("2026-10-29T15:00:00Z"), NOW, DENVER)).toEqual({ kind: "tomorrow", days: 1, words: "tomorrow" });
    expect(relativeDay(new Date("2026-10-31T15:00:00Z"), NOW, DENVER)).toEqual({ kind: "in", days: 3, words: "in 3 days" });
    expect(relativeDay(new Date("2026-10-27T15:00:00Z"), NOW, DENVER)).toEqual({ kind: "yesterday", days: -1, words: "yesterday" });
    expect(relativeDay(new Date("2026-10-24T15:00:00Z"), NOW, DENVER)).toEqual({ kind: "ago", days: -4, words: "4 days ago" });
    expect(relativeDay(new Date("2026-11-27T15:00:00Z"), NOW, DENVER).words).toBe("in 30 days");
  });

  it("counts calendar days, not 24-hour spans: late tonight to early tomorrow is tomorrow", () => {
    const late = new Date("2026-10-29T05:30:00Z"); // 11:30 pm Denver, Oct 28
    const early = new Date("2026-10-29T07:30:00Z"); // 1:30 am Denver, Oct 29
    expect(relativeDay(early, late, DENVER).kind).toBe("tomorrow");
    expect(relativeDay(late, early, DENVER).kind).toBe("yesterday");
  });

  it("follows the zone: the same instant is today in Denver and tomorrow in UTC", () => {
    const t = new Date("2026-10-29T02:00:00Z"); // 8 pm Denver, Oct 28
    expect(relativeDay(t, NOW, DENVER).kind).toBe("today");
    expect(relativeDay(t, NOW, "UTC").kind).toBe("tomorrow");
    // In Tokyo "now" is already 4 am on Oct 29, so 11 am that day is today.
    expect(relativeDay(t, NOW, "Asia/Tokyo").kind).toBe("today");
  });

  it("is not thrown by a daylight-saving change", () => {
    // Denver falls back on 2026-11-01: a 25-hour day is still one day.
    const sat = new Date("2026-10-31T18:00:00Z");
    expect(relativeDay(new Date("2026-11-01T18:00:00Z"), sat, DENVER).kind).toBe("tomorrow");
    expect(relativeDay(new Date("2026-11-02T18:00:00Z"), sat, DENVER).words).toBe("in 2 days");
    // Spring forward on 2026-03-08: a 23-hour day too.
    const sat2 = new Date("2026-03-07T18:00:00Z");
    expect(relativeDay(new Date("2026-03-08T18:00:00Z"), sat2, DENVER).kind).toBe("tomorrow");
    expect(relativeDay(new Date("2026-03-09T18:00:00Z"), sat2, DENVER).words).toBe("in 2 days");
  });

  it("dayIn gives the zone's calendar day", () => {
    expect(dayIn(new Date("2026-10-29T02:00:00Z"), DENVER)).toBe("2026-10-28");
    expect(dayIn(new Date("2026-10-29T02:00:00Z"), "UTC")).toBe("2026-10-29");
  });
});
