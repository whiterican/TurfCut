import { describe, expect, it } from "vitest";
import { plural, relativeTime } from "./format";

describe("format", () => {
  it("pluralises", () => {
    expect(plural(1, "shift")).toBe("1 shift");
    expect(plural(0, "shift")).toBe("0 shifts");
    expect(plural(2, "worker")).toBe("2 workers");
  });
  it("says when, like a person", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const ago = (sec: number) => relativeTime(new Date(now.getTime() - sec * 1000), now);
    expect(ago(10)).toBe("just now");
    expect(ago(12 * 60)).toBe("12 min ago");
    expect(ago(3 * 3600)).toBe("3 hr ago");
    expect(ago(86_400)).toBe("1 day ago");
    expect(ago(30 * 86_400)).toMatch(/^on Sep 1, 2026$/);
  });
});
