import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { accessTo, can, HIRING_ROLES, rolesFor, workerAccess, type AccessLevel, type Area } from "./access";
import { CHAT_STAFF_ROLES } from "./chat";

const W = "worker-1";

describe("workerAccess", () => {
  it("lets a worker see only their own profile", () => {
    expect(workerAccess({ role: "WORKER", workerId: W, orgId: null }, W, false)).toEqual({ kind: "self" });
    expect(workerAccess({ role: "WORKER", workerId: "other", orgId: null }, W, false).kind).toBe("denied");
  });

  it("lets owners and recruiters of an approved org view the hiring profile", () => {
    for (const role of ["OWNER", "RECRUITER"] as const) {
      expect(workerAccess({ role, workerId: null, orgId: "org" }, W, true)).toEqual({ kind: "employer", orgId: "org" });
    }
  });

  it("keeps compliance, supervisor and finance seats out of the hiring profile", () => {
    for (const role of ["COMPLIANCE", "SUPERVISOR", "FINANCE", "PUBLISHER"] as const) {
      expect(workerAccess({ role, workerId: null, orgId: "org" }, W, true).kind).toBe("denied");
    }
  });

  it("denies unapproved orgs and org roles with no org", () => {
    expect(workerAccess({ role: "RECRUITER", workerId: null, orgId: "org" }, W, false).kind).toBe("denied");
    expect(workerAccess({ role: "OWNER", workerId: null, orgId: null }, W, true).kind).toBe("denied");
  });
});

describe("the C1 access map", () => {
  // The approved C1 table: route → role → full / read / none. Desk is for
  // every org role; compliance keeps exactly what it had before C1.
  const T: Record<string, { area: Area; owner: AccessLevel | null; recruiter: AccessLevel | null; supervisor: AccessLevel | null; finance: AccessLevel | null; publisher: AccessLevel | null }> = {
    "/hiring": { area: "hiring", owner: "full", recruiter: "full", supervisor: null, finance: null, publisher: null },
    "/jobs": { area: "jobs", owner: "full", recruiter: "full", supervisor: "read", finance: "read", publisher: "read" },
    "/jobs/new, edit": { area: "jobsEdit", owner: "full", recruiter: "full", supervisor: null, finance: null, publisher: null },
    "/field, /shifts/[id]": { area: "field", owner: "full", recruiter: "read", supervisor: "full", finance: null, publisher: null },
    "/pay": { area: "pay", owner: "full", recruiter: null, supervisor: null, finance: "full", publisher: null },
    "/messages": { area: "messages", owner: "full", recruiter: "full", supervisor: "full", finance: null, publisher: null },
    "/org/settings": { area: "orgSettings", owner: "full", recruiter: "read", supervisor: "read", finance: "read", publisher: "read" },
    "/org/settings/members": { area: "orgMembers", owner: "full", recruiter: null, supervisor: null, finance: null, publisher: null },
    "/campaigns": { area: "campaigns", owner: "full", recruiter: null, supervisor: null, finance: null, publisher: "full" },
  };
  it("matches the approved table for every route and role", () => {
    for (const [route, row] of Object.entries(T)) {
      const got = {
        owner: accessTo("OWNER", row.area),
        recruiter: accessTo("RECRUITER", row.area),
        supervisor: accessTo("SUPERVISOR", row.area),
        finance: accessTo("FINANCE", row.area),
        publisher: accessTo("PUBLISHER", row.area),
      };
      const want = { owner: row.owner, recruiter: row.recruiter, supervisor: row.supervisor, finance: row.finance, publisher: row.publisher };
      expect({ route, ...got }).toEqual({ route, ...want });
    }
  });
  it("gives every organization role a desk, and workers no organization area", () => {
    for (const role of ["OWNER", "RECRUITER", "COMPLIANCE", "SUPERVISOR", "FINANCE", "PUBLISHER"] as const) expect(can(role, "desk")).toBe(true);
    for (const area of Object.keys(T).map((k) => T[k].area)) expect(accessTo("WORKER", area)).toBeNull();
  });
  it("read access admits full, never the other way round", () => {
    expect(can("SUPERVISOR", "jobs", "read")).toBe(true);
    expect(can("SUPERVISOR", "jobs", "full")).toBe(false);
    expect(can("OWNER", "jobs", "read")).toBe(true);
  });
  it("derives the role lists from the map", () => {
    expect(HIRING_ROLES).toEqual(["OWNER", "RECRUITER"]);
    expect(rolesFor("orgMembers")).toEqual(["OWNER"]);
  });
  it("chat staff match the roles the database trigger keeps as managers", () => {
    const sql = readFileSync(join(__dirname, "../../prisma/m4-migration.sql"), "utf8");
    const m = /NOT IN \(('OWNER', 'RECRUITER', 'SUPERVISOR')\)/.exec(sql);
    expect(m).not.toBeNull();
    expect(CHAT_STAFF_ROLES).toEqual(["OWNER", "RECRUITER", "SUPERVISOR"]);
  });
});
