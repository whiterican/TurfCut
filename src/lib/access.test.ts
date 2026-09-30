import { describe, expect, it } from "vitest";
import { workerAccess } from "./access";

const W = "worker-1";

describe("workerAccess", () => {
  it("lets a worker see only their own profile", () => {
    expect(workerAccess({ role: "WORKER", workerId: W, orgId: null }, W, false)).toEqual({ kind: "self" });
    expect(workerAccess({ role: "WORKER", workerId: "other", orgId: null }, W, false).kind).toBe("denied");
  });

  it("lets staff of an approved org view any worker", () => {
    for (const role of ["OWNER", "RECRUITER", "COMPLIANCE", "SUPERVISOR", "FINANCE"] as const) {
      expect(workerAccess({ role, workerId: null, orgId: "org" }, W, true)).toEqual({ kind: "employer", orgId: "org" });
    }
  });

  it("denies unapproved orgs and org roles with no org", () => {
    expect(workerAccess({ role: "RECRUITER", workerId: null, orgId: "org" }, W, false).kind).toBe("denied");
    expect(workerAccess({ role: "OWNER", workerId: null, orgId: null }, W, true).kind).toBe("denied");
  });
});
