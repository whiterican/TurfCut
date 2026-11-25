import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { METHOD_VALUES, readPlace, readRules, rulesFromForm, rulesProblems, NOTES_MAX, LOCALITY_MAX } from "./jurisdiction-rules";

describe("jurisdiction rules (M10.3)", () => {
  it("reads a stored record tolerantly: unknown shapes fall back to hourly only and nothing required", () => {
    expect(readRules(null)).toEqual({ compensationAllowed: ["HOURLY"], perUnitAllowed: false, workerRegistrationRequired: false, badgeRequired: false, affidavitRequired: false, notes: "" });
    expect(readRules({ compensationAllowed: ["HOURLY", "BOGUS", "PER_UNIT", "PER_UNIT"], perUnitAllowed: true, badgeRequired: "yes", notes: 42 })).toEqual({ compensationAllowed: ["HOURLY", "PER_UNIT"], perUnitAllowed: true, workerRegistrationRequired: false, badgeRequired: false, affidavitRequired: false, notes: "" });
  });

  it("names what stops a record being saved", () => {
    const good = readRules({ compensationAllowed: ["HOURLY", "SHIFT_RATE"], notes: "Statute 1-40-112" });
    expect(rulesProblems(good)).toEqual([]);
    expect(rulesProblems({ ...good, compensationAllowed: [] })).toEqual(["Allow at least one pay method."]);
    expect(rulesProblems({ ...good, compensationAllowed: ["PER_UNIT"] })[0]).toMatch(/explicit per-unit approval/);
    expect(rulesProblems({ ...good, perUnitAllowed: true })[0]).toMatch(/explicit per-unit approval/);
    expect(rulesProblems({ ...good, notes: "x".repeat(NOTES_MAX + 1) })[0]).toMatch(/2000 characters or fewer/);
  });

  it("turns the form's fields into rules: ticking per-unit records counsel's explicit approval too", () => {
    const fields: Record<string, string[]> = { methods: ["HOURLY", "PER_UNIT", "PER_UNIT"], badgeRequired: ["on"], notes: ["  Counsel memo of Oct 20  "] };
    expect(rulesFromForm((n) => fields[n] ?? [])).toEqual({ compensationAllowed: ["HOURLY", "PER_UNIT"], perUnitAllowed: true, workerRegistrationRequired: false, badgeRequired: true, affidavitRequired: false, notes: "Counsel memo of Oct 20" });
    expect(rulesFromForm(() => [])).toMatchObject({ compensationAllowed: [], perUnitAllowed: false, notes: "" });
  });

  it("reads a place: two letters for the state, a cleaned optional locality", () => {
    expect(readPlace(" co ", "  Denver   County ")).toEqual({ ok: true, state: "CO", locality: "Denver County" });
    expect(readPlace("CO", "")).toEqual({ ok: true, state: "CO", locality: null });
    expect(readPlace("Colorado", "")).toMatchObject({ ok: false, message: "Pick a state." });
    expect(readPlace("XX", "")).toMatchObject({ ok: false, message: "Pick a state." });
    expect(readPlace("dc", "")).toEqual({ ok: true, state: "DC", locality: null });
    expect(readPlace(null, undefined)).toMatchObject({ ok: false });
    expect(readPlace("CO", "x".repeat(LOCALITY_MAX + 1))).toMatchObject({ ok: false, message: expect.stringMatching(/80 characters/) });
  });

  it("volunteer work is a method a profile lists or does not: never allowed by default (docs/product/VOLUNTEERS.md)", () => {
    expect(readRules(null).compensationAllowed).toEqual(["HOURLY"]);
    expect(readRules({}).compensationAllowed).not.toContain("VOLUNTEER");
    expect(METHOD_VALUES).toContain("VOLUNTEER");
  });

  describe("listing volunteer work on a profile is what switches it on in a place", () => {
    // Off whatever the shell running the tests has exported; the "on" case below switches it on itself.
    beforeEach(() => vi.stubEnv("TURFCUT_VOLUNTEERS", ""));
    afterEach(() => vi.unstubAllEnvs());
    const fields: Record<string, string[]> = { methods: ["HOURLY", "VOLUNTEER"], notes: ["Counsel memo of Nov 25"] };

    it("so the server refuses it while volunteering is off, whatever the form posted (the box is not on the form either)", () => {
      const posted = rulesFromForm((n) => fields[n] ?? []);
      expect(posted.compensationAllowed).toEqual(["HOURLY", "VOLUNTEER"]);
      expect(rulesProblems(posted)).toEqual(["Volunteer work can't be allowed on a rule profile yet: it isn't available."]);
      // Paid methods are judged as before.
      expect(rulesProblems(readRules({ compensationAllowed: ["HOURLY", "SHIFT_RATE"] }))).toEqual([]);
    });

    it("and accepts it once volunteering is on", () => {
      vi.stubEnv("TURFCUT_VOLUNTEERS", "1");
      const listed = readRules({ compensationAllowed: ["HOURLY", "VOLUNTEER"], notes: "Counsel memo of Nov 25" });
      expect(listed.compensationAllowed).toEqual(["HOURLY", "VOLUNTEER"]);
      expect(rulesProblems(listed)).toEqual([]);
      expect(rulesProblems(rulesFromForm((n) => fields[n] ?? []))).toEqual([]);
    });
  });
});
