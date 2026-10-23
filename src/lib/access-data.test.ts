import { describe, expect, it } from "vitest";
import { areaMembers } from "./access-data";

describe("members who reach an area (M10.6)", () => {
  it("is the built-in roles the map gives the area to, or a custom role on a live grant that admits the level", () => {
    expect(areaMembers("pay")).toEqual({
      OR: [{ role: { in: ["OWNER", "FINANCE"] } }, { role: "CUSTOM", orgRole: { archivedAt: null, grants: { some: { area: "pay", level: { in: ["FULL"] } } } } }],
    });
    expect(areaMembers("jobs", "read")).toMatchObject({ OR: [{ role: { in: ["OWNER", "RECRUITER", "COMPLIANCE", "SUPERVISOR", "FINANCE", "PUBLISHER"] } }, { orgRole: { grants: { some: { area: "jobs", level: { in: ["FULL", "READ"] } } } } }] });
  });
});
