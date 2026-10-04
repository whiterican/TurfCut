import { describe, expect, it } from "vitest";
import { isOrgRole, normalizeEmail } from "./members-data";
import { INVITE_ROLES, ORG_ROLES, ROLE_HELP, ROLE_LABELS } from "./access";

describe("member invites", () => {
  it("normalizes emails and refuses malformed ones", () => {
    expect(normalizeEmail("  Riley@Example.ORG ")).toBe("riley@example.org");
    for (const bad of ["", "riley", "a@b", "a b@c.org", null, 42, `${"x".repeat(250)}@e.org`]) expect(normalizeEmail(bad)).toBeNull();
  });
  it("only organization roles can be invited or assigned", () => {
    expect(isOrgRole("WORKER")).toBe(false);
    expect(isOrgRole("ADMIN")).toBe(false);
    expect(isOrgRole(undefined)).toBe(false);
    for (const r of ORG_ROLES) expect(isOrgRole(r)).toBe(true);
    expect(INVITE_ROLES).not.toContain("WORKER");
  });
  it("names and explains every invitable role", () => {
    for (const r of INVITE_ROLES) {
      expect(ROLE_LABELS[r]).toBeTruthy();
      expect(ROLE_HELP[r]).toBeTruthy();
    }
  });
});
