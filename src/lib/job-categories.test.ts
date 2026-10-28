import { describe, expect, it } from "vitest";
import { CATEGORY_STATUS_LABEL, categoryStatusOf, JOB_CATEGORIES, PLANNED_CATEGORIES } from "./job-categories";
import { JOB_TYPES } from "./jobs";

const candidate = { campaignType: "candidate", affiliation: "democratic", campaignName: "Jo Ortiz for Council", message: "Vote Jo" };
const ballot = { campaignType: "ballot_measure", affiliation: "nonpartisan", message: "Yes on 1" };

describe("job categories (data honesty: built / in development / planned)", () => {
  it("lists the founder's seven categories, two built, one in development, five planned", () => {
    expect(JOB_CATEGORIES.map((c) => c.label)).toEqual([
      "Petition circulation",
      "Door-to-door canvassing",
      "Candidate campaign canvassing",
      "Phone banking",
      "Phone polling",
      "Door-to-door polling",
      "Door-to-door fundraising",
      "Door-to-door sales",
    ]);
    expect(JOB_CATEGORIES.filter((c) => c.status === "built").map((c) => c.type)).toEqual(["PETITION", "CANVASS"]);
    expect(PLANNED_CATEGORIES).toHaveLength(5);
    expect(PLANNED_CATEGORIES.every((c) => !c.type)).toBe(true);
  });

  it("only live job types are built; a planned category is never a job type", () => {
    const live = new Set(JOB_TYPES.map((t) => t.value));
    for (const c of JOB_CATEGORIES) expect(c.status === "planned" ? c.type === undefined : live.has(c.type!)).toBe(true);
  });

  it("a candidate canvass is in development; every other live job is built; malformed disclosure never promotes or demotes", () => {
    expect(categoryStatusOf("CANVASS", candidate)).toBe("in_development");
    expect(categoryStatusOf("CANVASS", ballot)).toBe("built");
    // Party committee and issue advocacy drives are door-to-door canvassing, which is built (roadmap row 2).
    expect(categoryStatusOf("CANVASS", { ...ballot, campaignType: "party_committee", affiliation: "republican" })).toBe("built");
    expect(categoryStatusOf("CANVASS", { ...ballot, campaignType: "issue_advocacy" })).toBe("built");
    expect(categoryStatusOf("PETITION", candidate)).toBe("built");
    expect(categoryStatusOf("CANVASS", null)).toBe("built");
    expect(categoryStatusOf("CANVASS", { campaignType: "candidate" })).toBe("built"); // incomplete disclosure reads as none
  });

  it("built carries no tag; the other two say so plainly", () => {
    expect(CATEGORY_STATUS_LABEL.built).toBeNull();
    expect(CATEGORY_STATUS_LABEL.in_development).toBe("In development");
    expect(CATEGORY_STATUS_LABEL.planned).toBe("Planned");
  });
});
