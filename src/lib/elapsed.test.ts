import { describe, expect, it } from "vitest";
import { formatElapsed } from "./elapsed";
import { directionsHref } from "./directions";

describe("formatElapsed", () => {
  it("says minutes under an hour, hours and minutes after", () => {
    expect(formatElapsed(0)).toBe("0m");
    expect(formatElapsed(59)).toBe("59m");
    expect(formatElapsed(60)).toBe("1h 0m");
    expect(formatElapsed(150)).toBe("2h 30m");
  });
  it("never goes negative or fractional (clock skew, a check-in a moment ago)", () => {
    expect(formatElapsed(-3)).toBe("0m");
    expect(formatElapsed(12.9)).toBe("12m");
  });
});

describe("directionsHref", () => {
  it("sends the staging words to the maps app, encoded", () => {
    expect(directionsHref("Central Library, 10 W 14th Ave & Broadway")).toBe("https://www.google.com/maps/search/?api=1&query=Central%20Library%2C%2010%20W%2014th%20Ave%20%26%20Broadway");
  });
});
