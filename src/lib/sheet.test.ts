import { describe, expect, it } from "vitest";
import { sheetRelease } from "./sheet";

describe("bottom sheet release (P1.6)", () => {
  it("leaves when dragged far or flicked down, settles back otherwise, never lifts", () => {
    expect(sheetRelease(200, 0, 500)).toBe("dismiss");
    expect(sheetRelease(60, 0, 500)).toBe("settle");
    expect(sheetRelease(60, 0.9, 500)).toBe("dismiss");
    expect(sheetRelease(10, 3, 500)).toBe("settle"); // a twitch
    expect(sheetRelease(-200, -2, 500)).toBe("settle"); // upward: nothing
    expect(sheetRelease(NaN, 0, 500)).toBe("settle");
    expect(sheetRelease(200, 0, 0)).toBe("settle");
  });
});
