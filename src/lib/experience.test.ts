import { describe, expect, it } from "vitest";
import { experienceTotals, validateExperience, workerCanModify } from "./experience";

const today = new Date("2026-09-30T12:00:00Z");
const good = {
  campaign: "Denver Minimum Wage Initiative",
  role: "Circulator",
  startDate: "2026-03-01",
  endDate: "2026-05-15",
  unitType: "signatures",
  unitCount: "1450",
  experienceGroup: "petition_circulation",
};

const fullRecord = {
  ...good,
  organizationName: "Front Range Circulators",
  campaignType: "ballot_initiative",
  channel: "public_intercept",
  state: "CO",
  countyOrDistrict: "Denver County",
  turfType: "urban",
  completedShifts: "38",
  activeHours: "171.5",
  approvedCount: "1310",
  referenceContact: "Dana Lee, field director, dana@example.org",
};

describe("validateExperience", () => {
  it("accepts a complete record", () => {
    const r = validateExperience(good, today);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.unitCount).toBe(1450);
  });

  it("never lets the worker set a verification level", () => {
    const r = validateExperience({ ...good, verificationLevel: "PLATFORM" }, today);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).not.toHaveProperty("verificationLevel");
  });

  it("allows an ongoing record with no end date", () => {
    const r = validateExperience({ ...good, endDate: "" }, today);
    expect(r.ok && r.value.endDate).toBeNull();
  });

  it("rejects bad input with a message per field", () => {
    const r = validateExperience(
      { campaign: " ", role: "", startDate: "2027-01-01", endDate: "2026-02-30", unitType: "vibes", unitCount: "-3" },
      today
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(
        ["campaign", "endDate", "experienceGroup", "role", "startDate", "unitCount", "unitType"].sort()
      );
    }
  });

  it("rejects an end date before the start date", () => {
    const r = validateExperience({ ...good, endDate: "2026-02-01" }, today);
    expect(!r.ok && r.errors.endDate).toBeTruthy();
  });
});

describe("validateExperience — spec p.9 fields", () => {
  it("accepts every field on the spec's experience record", () => {
    const r = validateExperience(fullRecord, today);
    expect(r.ok && r.value).toMatchObject({
      organizationName: "Front Range Circulators",
      campaignType: "ballot_initiative",
      experienceGroup: "petition_circulation",
      channel: "public_intercept",
      state: "CO",
      countyOrDistrict: "Denver County",
      turfType: "urban",
      completedShifts: 38,
      activeHours: 171.5,
      approvedCount: 1310,
      referenceContact: "Dana Lee, field director, dana@example.org",
    });
  });

  it("stores blank optional fields as null", () => {
    const r = validateExperience(good, today);
    expect(r.ok && r.value).toMatchObject({ organizationName: null, state: null, activeHours: null, approvedCount: null, referenceContact: null });
  });

  it("requires the kind of work", () => {
    const r = validateExperience({ ...good, experienceGroup: "" }, today);
    expect(!r.ok && r.errors.experienceGroup).toBeTruthy();
  });

  it("rejects values outside the option lists", () => {
    for (const [k, v] of [
      ["campaignType", "astroturf"],
      ["channel", "carrier pigeon"],
      ["state", "XX"],
      ["turfType", "lunar"],
      ["completedShifts", "2.5"],
      ["activeHours", "12.345"],
    ]) {
      const r = validateExperience({ ...fullRecord, [k]: v }, today);
      expect(!r.ok && r.errors[k]).toBeTruthy();
    }
  });

  it("keeps approved output at or below submitted output", () => {
    const r = validateExperience({ ...fullRecord, approvedCount: "1451" }, today);
    expect(!r.ok && r.errors.approvedCount).toBeTruthy();
  });
});

describe("experienceTotals", () => {
  it("excludes self-reported units from verified totals", () => {
    const t = experienceTotals([
      { unitType: "signatures", unitCount: 1000, verificationLevel: "PLATFORM" },
      { unitType: "signatures", unitCount: 300, verificationLevel: "ORGANIZATION" },
      { unitType: "doors", unitCount: 200, verificationLevel: "IMPORTED" },
      { unitType: "signatures", unitCount: 5000, verificationLevel: "SELF_REPORTED" },
    ]);
    expect(t.verified).toEqual({ signatures: 1300, doors: 200 });
    expect(t.selfReported).toEqual({ signatures: 5000 });
    expect(t.verifiedRecords).toBe(3);
    expect(t.selfReportedRecords).toBe(1);
  });

  it("locks verified records against worker edits", () => {
    expect(workerCanModify("SELF_REPORTED")).toBe(true);
    expect(workerCanModify("PLATFORM")).toBe(false);
    expect(workerCanModify("ORGANIZATION")).toBe(false);
    expect(workerCanModify("IMPORTED")).toBe(false);
  });
});
