import { describe, expect, it } from "vitest";
import { profileSectionCurrent, PROFILE_SECTIONS } from "./profile-nav";

const marks = (path: string) => Object.fromEntries(PROFILE_SECTIONS.map((s) => [s.href, profileSectionCurrent(s.href, path)]).filter(([, v]) => v));

describe("the profile sub-nav (redesign §5)", () => {
  it("marks its own page 'page' and the section above a sub-page 'true', exactly one", () => {
    expect(marks("/profile")).toEqual({ "/profile": "page" });
    expect(marks("/earnings")).toEqual({ "/earnings": "page" });
    expect(marks("/earnings/receipts")).toEqual({ "/earnings": "true" });
    expect(marks("/profile/preferences/edit")).toEqual({ "/profile/preferences": "true" });
    expect(marks("/settings")).toEqual({ "/settings": "page" });
    // Under a mount prefix (the local preview), the same answer.
    expect(marks("/zz-preview/profile/sharing")).toEqual({ "/profile/sharing": "page" });
    expect(marks("/jobs")).toEqual({});
  });
  it("keeps the sign-out cue on the settings row", () => {
    expect(PROFILE_SECTIONS.at(-1)?.label).toBe("Settings & sign out");
  });
});
