import { describe, expect, it } from "vitest";
import { SETUP_STEPS, setupOrigin, setupStep, shownVersion } from "./setup-flow";

describe("setupStep", () => {
  it("takes a whole step number in range", () => {
    for (let n = 1; n <= SETUP_STEPS.length; n++) expect(setupStep(String(n))).toBe(n);
  });
  it("falls back to step 1 for anything else", () => {
    for (const raw of ["2.5", "0", "5", "-1", " 2", "2 ", "abc", "Infinity", "1e1", "", undefined, ["1", "2"], ["2"]]) {
      expect(setupStep(raw)).toBe(1);
    }
  });
});

describe("setupOrigin", () => {
  it("returns to Profile only when it came from there", () => {
    expect(setupOrigin("profile")).toBe("profile");
    for (const raw of ["dashboard", "", undefined, "https://evil.example", ["profile"]]) expect(setupOrigin(raw)).toBe("dashboard");
  });
});

describe("shownVersion", () => {
  it("reads the version the Done step showed", () => {
    expect(shownVersion("")).toBeNull();
    expect(shownVersion("3")).toBe(3);
  });
  it("treats a malformed value as no match", () => {
    for (const raw of ["x", "1.5", "-1", null, undefined, "1234567890"]) expect(shownVersion(raw)).toBeUndefined();
  });
});
