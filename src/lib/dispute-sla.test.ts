import { describe, expect, it } from "vitest";
import { addBusinessDays, businessDaysBetween, clockText, disputeClock } from "@/lib/dispute-sla";

const d = (s: string) => new Date(s);

describe("business days", () => {
  it("skips weekends and keeps the time of day", () => {
    expect(addBusinessDays(d("2026-10-22T15:30:00Z"), 3).toISOString()).toBe("2026-10-27T15:30:00.000Z"); // Thu + 3 → Tue
    expect(addBusinessDays(d("2026-10-23T09:00:00Z"), 1).toISOString()).toBe("2026-10-26T09:00:00.000Z"); // Fri + 1 → Mon
    expect(addBusinessDays(d("2026-10-19T09:00:00Z"), 10).toISOString()).toBe("2026-11-02T09:00:00.000Z"); // Mon + 10 → two weeks
  });
  it("a weekend start counts from Monday", () => {
    expect(addBusinessDays(d("2026-10-24T12:00:00Z"), 0).toISOString()).toBe("2026-10-26T12:00:00.000Z");
    expect(addBusinessDays(d("2026-10-24T12:00:00Z"), 3).toISOString()).toBe("2026-10-28T12:00:00.000Z"); // Sat + 3 → Wed
  });
  it("counts whole business days between dates", () => {
    expect(businessDaysBetween(d("2026-10-22T15:30:00Z"), d("2026-10-22T18:00:00Z"))).toBe(0);
    expect(businessDaysBetween(d("2026-10-22T15:30:00Z"), d("2026-10-27T08:00:00Z"))).toBe(3);
    expect(businessDaysBetween(d("2026-10-27T08:00:00Z"), d("2026-10-22T15:30:00Z"))).toBe(0);
  });
});

describe("the dispute clock", () => {
  const openedAt = d("2026-10-22T15:30:00Z"); // Thursday
  it("sets both deadlines from opening", () => {
    const c = disputeClock({ openedAt, firstOrgReplyAt: null, resolvedAt: null }, d("2026-10-23T10:00:00Z"));
    expect(c.firstResponseDue.toISOString()).toBe("2026-10-27T15:30:00.000Z");
    expect(c.resolutionDue.toISOString()).toBe("2026-11-05T15:30:00.000Z");
    expect(c.overdue).toBeNull();
    expect(c.next).toEqual({ kind: "first", due: c.firstResponseDue });
  });
  it("goes overdue on the first response, then on the resolution", () => {
    expect(disputeClock({ openedAt, firstOrgReplyAt: null, resolvedAt: null }, d("2026-10-27T16:00:00Z")).overdue).toBe("first");
    const replied = { openedAt, firstOrgReplyAt: d("2026-10-26T09:00:00Z"), resolvedAt: null };
    expect(disputeClock(replied, d("2026-10-27T16:00:00Z")).overdue).toBeNull();
    expect(disputeClock(replied, d("2026-11-05T16:00:00Z")).overdue).toBe("resolution");
    expect(disputeClock(replied, d("2026-11-05T16:00:00Z")).next?.kind).toBe("resolution");
  });
  it("a resolution meets both, and a resolved dispute is never overdue", () => {
    const c = disputeClock({ openedAt, firstOrgReplyAt: null, resolvedAt: d("2026-10-30T12:00:00Z") }, d("2026-12-01T00:00:00Z"));
    expect(c.overdue).toBeNull();
    expect(c.next).toBeNull();
    expect(c.firstResponseMetAt?.toISOString()).toBe("2026-10-30T12:00:00.000Z");
    expect(c.daysToFirstResponse).toBe(6);
    expect(c.daysToResolution).toBe(6);
  });
  it("says it in words for each side", () => {
    const text = (dd: Date) => dd.toISOString().slice(0, 10);
    const open = disputeClock({ openedAt, firstOrgReplyAt: null, resolvedAt: null }, d("2026-10-23T10:00:00Z"));
    expect(clockText(open, "worker", "Front Range", text)).toBe("Front Range has until 2026-10-27 to reply.");
    expect(clockText(open, "org", "Front Range", text)).toBe("You have until 2026-10-27 to reply.");
    const late = disputeClock({ openedAt, firstOrgReplyAt: null, resolvedAt: null }, d("2026-10-28T10:00:00Z"));
    expect(clockText(late, "worker", "Front Range", text)).toMatch(/was due to reply by 2026-10-27 and hasn't yet/);
    expect(clockText(late, "org", "Front Range", text)).toMatch(/^Overdue/);
  });
});
