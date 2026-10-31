import { describe, expect, it } from "vitest";
import { isShareCancelled, saveFailureText, SHARE_FAILED } from "./job-head-feedback";

describe("job head feedback", () => {
  it("treats only a closed share sheet as a cancellation", () => {
    expect(isShareCancelled(new DOMException("closed", "AbortError"))).toBe(true);
    expect(isShareCancelled({ name: "AbortError" })).toBe(true);
    expect(isShareCancelled(new DOMException("denied", "NotAllowedError"))).toBe(false);
    expect(isShareCancelled(new Error("clipboard unavailable"))).toBe(false);
    expect(isShareCancelled(undefined)).toBe(false);
  });

  it("says which mark failed, and invites a retry", () => {
    expect(saveFailureText(true)).toBe("Couldn't save this job. Try again.");
    expect(saveFailureText(false)).toBe("Couldn't remove this saved job. Try again.");
    expect(SHARE_FAILED).toMatch(/Copy the link below/);
  });
});
