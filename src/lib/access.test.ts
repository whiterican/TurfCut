import { describe, expect, it } from "vitest";
import { workerAccess } from "./access";

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
    for (const role of ["COMPLIANCE", "SUPERVISOR", "FINANCE"] as const) {
      expect(workerAccess({ role, workerId: null, orgId: "org" }, W, true).kind).toBe("denied");
    }
  });

  it("denies unapproved orgs and org roles with no org", () => {
    expect(workerAccess({ role: "RECRUITER", workerId: null, orgId: "org" }, W, false).kind).toBe("denied");
    expect(workerAccess({ role: "OWNER", workerId: null, orgId: null }, W, true).kind).toBe("denied");
  });
});
