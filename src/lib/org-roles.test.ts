import { describe, expect, it } from "vitest";
import { ROLE_LABELS, presetGrants } from "./access";
import { AREA_LABELS, coherentGrants, customChoice, parseRoleChoice, roleName, ROLE_NAME_MAX, validateRole, withinReach } from "./org-roles";
import { AREAS } from "./access";

const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] });
const ID = "5b1f0c1e-2f64-4d0e-9a67-8d3a8f8c9b10";

describe("custom roles (M10.6)", () => {
  it("names every area of the access map for the people who build roles", () => {
    expect(Object.keys(AREA_LABELS).sort()).toEqual([...AREAS].sort());
  });

  it("reads a role form into a trimmed name, a preset and grants", () => {
    const r = validateRole(form({ name: "  Field   lead ", description: " Runs a turf ", basedOn: "SUPERVISOR", "area:desk": "full", "area:jobs": "read", "area:field": "full", "area:pay": "none" }));
    expect(r).toEqual({ ok: true, value: { name: "Field lead", description: "Runs a turf", basedOn: "SUPERVISOR", grants: { desk: "full", jobs: "read", field: "full" } } });
    expect(validateRole(form({ name: "X", "area:desk": "full", basedOn: "CUSTOM" }))).toMatchObject({ ok: true, value: { basedOn: null } });
  });

  it("refuses a blank or long name, no areas, a level an area isn't offered at, and nonsense", () => {
    expect(validateRole(form({ "area:desk": "full" }))).toMatchObject({ ok: false, errors: { name: "Name the role." } });
    expect(validateRole(form({ name: "x".repeat(ROLE_NAME_MAX + 1), "area:desk": "full" }))).toMatchObject({ ok: false, errors: { name: expect.stringMatching(/characters/) } });
    expect(validateRole(form({ name: "X" }))).toMatchObject({ ok: false, errors: { grants: "Give the role access to at least one area." } });
    expect(validateRole(form({ name: "X", "area:pay": "read" }))).toMatchObject({ ok: false, errors: { grants: expect.stringMatching(/can't be granted at read/) } });
    expect(validateRole(form({ name: "X", "area:desk": "sometimes" }))).toMatchObject({ ok: false, errors: { grants: "Pick none, read or full for each area." } });
    expect(validateRole(form({ name: "X", description: "d".repeat(301), "area:desk": "full" }))).toMatchObject({ ok: false, errors: { description: expect.any(String) } });
  });

  it("holds a delegate to what they hold: read never reaches full, an area they lack is out of reach", () => {
    expect(withinReach({ jobs: "full", desk: "full" }, { jobs: "read" })).toBe(true);
    expect(withinReach({ jobs: "read" }, { jobs: "full" })).toBe(false);
    expect(withinReach({ desk: "full" }, { pay: "full" })).toBe(false);
    expect(withinReach({}, {})).toBe(true);
    expect(withinReach(presetGrants("OWNER"), presetGrants("FINANCE"))).toBe(true);
    expect(withinReach(presetGrants("SUPERVISOR"), presetGrants("RECRUITER"))).toBe(false);
  });

  it("reads a role select: a built-in role that is offered, or custom:<id>, and nothing else", () => {
    const offered = ["OWNER", "RECRUITER", "SUPERVISOR", "FINANCE", "PUBLISHER"];
    expect(parseRoleChoice("RECRUITER", offered)).toEqual({ role: "RECRUITER", orgRoleId: null });
    expect(parseRoleChoice(customChoice(ID), offered)).toEqual({ role: "CUSTOM", orgRoleId: ID });
    expect(parseRoleChoice("COMPLIANCE", offered)).toBeNull();
    expect(parseRoleChoice("WORKER", offered)).toBeNull();
    expect(parseRoleChoice("CUSTOM", offered)).toBeNull();
    expect(parseRoleChoice("custom:nope", offered)).toBeNull();
    expect(parseRoleChoice(undefined, offered)).toBeNull();
  });

  it("names a member's role: the organization's own name for a custom one, the built-in label otherwise", () => {
    expect(roleName({ role: "CUSTOM", roleName: "Field lead" }, ROLE_LABELS)).toBe("Field lead");
    expect(roleName({ role: "CUSTOM", roleName: null }, ROLE_LABELS)).toBe("Custom role");
    expect(roleName({ role: "FINANCE" }, ROLE_LABELS)).toBe("Finance");
  });

  it("gives every role the Desk and the job list it needs, and leaves a complete role alone", () => {
    expect(coherentGrants({ pay: "full" })).toEqual({ pay: "full", desk: "full" });
    expect(coherentGrants({ hiring: "full" })).toEqual({ hiring: "full", desk: "full", jobs: "read" });
    expect(coherentGrants({ jobsEdit: "full", jobs: "full" })).toEqual({ jobsEdit: "full", jobs: "full", desk: "full" });
    expect(coherentGrants({ desk: "read", jobs: "read", scheduling: "full" })).toEqual({ desk: "read", jobs: "read", scheduling: "full" });
    expect(coherentGrants({})).toEqual({});
    expect(validateRole(form({ name: "Cashier", "area:pay": "full" }))).toMatchObject({ ok: true, value: { grants: { pay: "full", desk: "full" } } });
  });
});
