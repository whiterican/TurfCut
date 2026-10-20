import { describe, expect, it } from "vitest";
import { activeAdminSection, ADMIN_SECTIONS } from "./admin-nav";

describe("the admin console's sections (M10)", () => {
  it("lists only sections that have a page, and picks the longest matching one", () => {
    expect(ADMIN_SECTIONS.map((s) => s.href)).toEqual(["/admin"]);
    expect(activeAdminSection("/admin")).toBe("/admin");
    expect(activeAdminSection("/admin/organizations/abc")).toBe("/admin");
    expect(activeAdminSection("/administration")).toBeNull();
  });
});
