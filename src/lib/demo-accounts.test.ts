import { describe, expect, it } from "vitest";
import { demoEmail, emailDomainProblem, orgsMissingFinance, passwordProblem, planAccounts, projectProblem, projectRefOf, slug, strangers, type DemoOrgStaff } from "./demo-accounts";

const org = (name: string, roles: string[]): DemoOrgStaff => ({
  id: `org-${slug(name)}`,
  name,
  staff: roles.map((role, i) => ({ id: `${slug(name)}-${role}-${i}`, role, displayName: `${role} person (demo)` })),
});

describe("demo login emails", () => {
  it("drops the demo suffix and accents", () => {
    expect(slug("Cherry Creek Petition Co. (demo)")).toBe("cherry-creek-petition-co");
    expect(slug("Tomás Rivera (demo)")).toBe("tomas-rivera");
  });
  it("names the role and the organization on a reserved domain by default", () => {
    expect(demoEmail("OWNER", "Mile High Civic Works (demo)")).toBe("owner.mile-high-civic-works@example.com");
    expect(demoEmail("WORKER", "Maya Okafor (demo)", "demo.test")).toBe("worker.maya-okafor@demo.test");
  });
  it("refuses something that isn't a plain domain", () => {
    expect(emailDomainProblem("example.com")).toBeNull();
    expect(emailDomainProblem("a@b.com")).not.toBeNull();
    expect(emailDomainProblem("localhost")).not.toBeNull();
  });
});

describe("the demo password", () => {
  it("must be set, long enough and not a placeholder", () => {
    expect(passwordProblem(undefined)).toMatch(/DEMO_ACCOUNTS_PASSWORD/);
    expect(passwordProblem("short")).toMatch(/at least 12/);
    expect(passwordProblem("changeme-please-123")).toMatch(/placeholder/);
    expect(passwordProblem("rq7-Lantern-Basil-42")).toBeNull();
  });
});

describe("the demo project must be named on purpose", () => {
  it("reads the ref from a Supabase URL, or the host for a local one", () => {
    expect(projectRefOf("https://abcd1234.supabase.co")).toBe("abcd1234");
    expect(projectRefOf("http://127.0.0.1:54321")).toBe("127.0.0.1:54321");
    expect(projectRefOf("not a url")).toBeNull();
    expect(projectRefOf(undefined)).toBeNull();
  });
  it("refuses until TURFCUT_DEMO_PROJECT_REF matches the project the keys point at", () => {
    expect(projectProblem(undefined, "abcd1234")).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(projectProblem("https://abcd1234.supabase.co", undefined)).toMatch(/TURFCUT_DEMO_PROJECT_REF=abcd1234/);
    expect(projectProblem("https://abcd1234.supabase.co", "live5678")).toMatch(/doesn't match/);
    expect(projectProblem("https://abcd1234.supabase.co", " ABCD1234 ")).toBeNull();
  });
});

describe("who gets a demo login", () => {
  const orgs = [org("Mile High Civic Works (demo)", ["OWNER", "SUPERVISOR", "FINANCE"]), org("Platte Valley Outreach (demo)", ["OWNER", "SUPERVISOR"])];

  it("finds the organizations that still need a finance person", () => {
    expect(orgsMissingFinance(orgs).map((o) => o.name)).toEqual(["Platte Valley Outreach (demo)"]);
  });

  it("gives every demo organization an owner, a supervisor and a finance login, plus the demo worker", () => {
    const plan = planAccounts([orgs[0]], { profileId: "w1", displayName: "Maya Okafor (demo)" });
    expect(plan.map((a) => [a.role, a.email])).toEqual([
      ["OWNER", "owner.mile-high-civic-works@example.com"],
      ["SUPERVISOR", "supervisor.mile-high-civic-works@example.com"],
      ["FINANCE", "finance.mile-high-civic-works@example.com"],
      ["WORKER", "worker.maya-okafor@example.com"],
    ]);
    // At least two staff per organization, two of them able to approve pay: the two-person rule can be shown.
    const staff = plan.filter((a) => a.orgName);
    expect(staff.length).toBeGreaterThanOrEqual(2);
    expect(staff.filter((a) => a.role === "OWNER" || a.role === "FINANCE").length).toBe(2);
    // The login uses the existing profile's id: nothing is relinked.
    expect(plan[0].profileId).toBe(orgs[0].staff[0].id);
  });

  it("stops when a demo organization is missing a role, instead of skipping it", () => {
    expect(() => planAccounts(orgs, null)).toThrow(/Platte Valley Outreach \(demo\)" has no finance/);
  });

  it("treats anyone the seeds didn't make as a stranger", () => {
    expect(strangers(["a", "b", "c"], new Set(["a", "c"]))).toEqual(["b"]);
    expect(strangers([], new Set())).toEqual([]);
  });
});
