import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { connectAccountProblem, connectLinkPlan, databaseUrlProblem, demoAccountsYesProblem, demoEmail, emailDomainProblem, orgsMissingFinance, passwordProblem, planAccounts, projectProblem, projectRefOf, slug, strangers, strayAuthLoginsProblem, stripeKeyMode, stripeKeyProblem, type DemoOrgStaff } from "./demo-accounts";

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
    expect(passwordProblem("xx-password-1234")).toMatch(/placeholder/);
    expect(passwordProblem("please-changeme-now")).toMatch(/placeholder/);
    expect(passwordProblem("my-demo-login-99")).toMatch(/placeholder/);
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
  it("refuses until TURFCUT_DEMO_PROJECT_REF matches the project the keys point at, without echoing the expected ref", () => {
    expect(projectProblem(undefined, "abcd1234")).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
    const unset = projectProblem("https://abcd1234.supabase.co", undefined);
    expect(unset).toMatch(/TURFCUT_DEMO_PROJECT_REF/);
    expect(unset).not.toMatch(/abcd1234/);
    expect(projectProblem("https://abcd1234.supabase.co", "live5678")).toMatch(/doesn't match/);
    expect(projectProblem("https://abcd1234.supabase.co", " ABCD1234 ")).toBeNull();
  });
  it("refuses a confirmed ref that is only a substring of the project ref", () => {
    expect(projectProblem("https://abcd1234.supabase.co", "abcd")).toMatch(/doesn't match/);
  });
  it("always refuses the live Turfcut project, even when the ref is confirmed", () => {
    expect(projectProblem("https://txzxtvsfzxfhgfiurufq.supabase.co", "txzxtvsfzxfhgfiurufq")).toMatch(/live Turfcut project/);
    expect(projectProblem("https://txzxtvsfzxfhgfiurufq.supabase.co", undefined)).toMatch(/live Turfcut project/);
  });
  it("for a hosted Supabase project, requires DATABASE_URL to be the same project", () => {
    const url = "https://abcd1234.supabase.co";
    expect(databaseUrlProblem(url, "postgresql://postgres:pw@db.abcd1234.supabase.co:5432/postgres")).toBeNull();
    expect(databaseUrlProblem(url, "postgresql://postgres.abcd1234:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres")).toBeNull();
    expect(databaseUrlProblem(url, "postgresql://postgres:pw@localhost:5432/turfcut")).toMatch(/same Supabase project/);
    expect(databaseUrlProblem(url, "postgresql://postgres.abcd:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres")).toMatch(/same Supabase project/);
    expect(databaseUrlProblem(url, "postgresql://postgres:pw@db.otherref.supabase.co:5432/postgres")).toMatch(/same Supabase project/);
    expect(databaseUrlProblem(url, undefined)).toMatch(/DATABASE_URL/);
    expect(databaseUrlProblem("http://127.0.0.1:54321", "postgresql://postgres@localhost:5432/turfcut")).toBeNull();
  });
  it("accepts postgres.<ref> only on a *.pooler.supabase.com host", () => {
    const url = "https://abcd1234.supabase.co";
    expect(databaseUrlProblem(url, "postgresql://postgres.abcd1234:pw@evil.example.com:6543/postgres")).toMatch(/same Supabase project/);
    expect(databaseUrlProblem(url, "postgresql://postgres.abcd1234:pw@localhost:5432/postgres")).toMatch(/same Supabase project/);
    expect(databaseUrlProblem(url, "postgresql://postgres.abcd1234:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres")).toBeNull();
  });
  it("refuses db.<x>.supabase.co when x isn't the project ref, even with a matching user", () => {
    const url = "https://abcd1234.supabase.co";
    expect(databaseUrlProblem(url, "postgresql://postgres.abcd1234:pw@db.other99.supabase.co:5432/postgres")).toMatch(/same Supabase project/);
    expect(databaseUrlProblem(url, "postgresql://postgres:pw@db.abcd.supabase.co:5432/postgres")).toMatch(/same Supabase project/);
  });
  it("refuses the live project's ref anywhere in DATABASE_URL", () => {
    const url = "https://abcd1234.supabase.co";
    expect(databaseUrlProblem(url, "postgresql://postgres:pw@db.txzxtvsfzxfhgfiurufq.supabase.co:5432/postgres")).toMatch(/live Turfcut project/);
    expect(databaseUrlProblem(url, "postgresql://postgres.txzxtvsfzxfhgfiurufq:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres")).toMatch(/live Turfcut project/);
    expect(databaseUrlProblem(url, "postgresql://postgres:pw@localhost:5432/postgres?x=TXZXTVSFZXFHGFIURUFQ")).toMatch(/live Turfcut project/);
    expect(databaseUrlProblem("http://127.0.0.1:54321", "postgresql://postgres:pw@localhost:5432/txzxtvsfzxfhgfiurufq")).toMatch(/live Turfcut project/);
  });
  describe("the whole --yes decision", () => {
    const good = {
      supabaseUrl: "https://abcd1234.supabase.co",
      confirmedRef: "abcd1234",
      databaseUrl: "postgresql://postgres.abcd1234:pw@aws-0-us-east-2.pooler.supabase.com:6543/postgres",
      password: "rq7-Lantern-Basil-42",
      serviceRoleKey: "service",
      authUserIds: ["a", "b"] as string[] | null,
      plannedProfileIds: new Set(["a", "b"]),
    };
    it("passes a dedicated demo project with only demo logins", () => {
      expect(demoAccountsYesProblem(good)).toBeNull();
      expect(demoAccountsYesProblem({ ...good, authUserIds: null })).toBeNull();
    });
    it("refuses a login in Auth that isn't a planned demo login", () => {
      expect(demoAccountsYesProblem({ ...good, authUserIds: ["a", "b", "real-user"] })).toMatch(/1 login\(s\) that aren't demo logins/);
    });
    it("refuses a DATABASE_URL for another project before Auth is listed", () => {
      expect(demoAccountsYesProblem({ ...good, authUserIds: null, databaseUrl: "postgresql://postgres:pw@db.other99.supabase.co:5432/postgres" })).toMatch(/same Supabase project/);
    });
    it("refuses the live project, an unconfirmed ref, a placeholder password and a missing secret key", () => {
      expect(demoAccountsYesProblem({ ...good, supabaseUrl: "https://txzxtvsfzxfhgfiurufq.supabase.co", confirmedRef: "txzxtvsfzxfhgfiurufq" })).toMatch(/live Turfcut project/);
      expect(demoAccountsYesProblem({ ...good, confirmedRef: undefined })).toMatch(/TURFCUT_DEMO_PROJECT_REF/);
      expect(demoAccountsYesProblem({ ...good, password: "xx-password-1234" })).toMatch(/placeholder/);
      expect(demoAccountsYesProblem({ ...good, serviceRoleKey: undefined })).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    });
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

  it("refuses Auth logins that aren't the planned demo accounts", () => {
    expect(strayAuthLoginsProblem(["a", "b"], new Set(["a", "b"]))).toBeNull();
    expect(strayAuthLoginsProblem([], new Set(["a"]))).toBeNull();
    expect(strayAuthLoginsProblem(["a", "x"], new Set(["a", "b"]))).toMatch(/1 login\(s\) that aren't demo logins/);
    expect(strayAuthLoginsProblem(["x", "y"], new Set(["a"]))).toMatch(/2 login\(s\)/);
  });

  it("the seed script stops on the --yes decision before and after listing Auth logins", () => {
    const src = readFileSync(new URL("../../prisma/demo-accounts.ts", import.meta.url), "utf8");
    expect(src).toMatch(/const before = demoAccountsYesProblem\(\{ \.\.\.yesInput, authUserIds: null \}\);\s*if \(before\) stop\(before\);/);
    expect(src).toMatch(/const after = demoAccountsYesProblem\(\{ \.\.\.yesInput, authUserIds: logins \}\);\s*if \(after\) stop\(after\);/);
    expect(src).toMatch(/databaseUrl: process\.env\.DATABASE_URL/);
  });
});

describe("Pay now in the demo: Stripe test mode only", () => {
  it("tells test keys from live ones", () => {
    expect(stripeKeyMode(undefined)).toBe("none");
    expect(stripeKeyMode("sk_test_abc")).toBe("test");
    expect(stripeKeyMode("rk_test_abc")).toBe("test");
    expect(stripeKeyMode("sk_live_abc")).toBe("live");
    expect(stripeKeyMode("pk_test_abc")).toBe("unknown");
  });
  it("refuses a live key and anything that isn't a secret key", () => {
    expect(stripeKeyProblem("sk_live_abc")).toMatch(/LIVE key/);
    expect(stripeKeyProblem("pk_test_abc")).toMatch(/isn't a Stripe secret key/);
    expect(stripeKeyProblem("sk_test_abc")).toBeNull();
    expect(stripeKeyProblem(undefined)).toBeNull();
  });
  it("checks the test account id's shape", () => {
    expect(connectAccountProblem(undefined)).toBeNull();
    expect(connectAccountProblem("acct_1AbCdEfGhIjK")).toBeNull();
    expect(connectAccountProblem("ba_123")).toMatch(/isn't a Stripe account id/);
  });
  it("links the account once, never replaces another, and never shares one between workers", () => {
    const acct = "acct_1AbCdEfGhIjK";
    expect(connectLinkPlan(acct, { id: "w1", stripeAccountId: null }, null)).toEqual({ action: "link" });
    expect(connectLinkPlan(acct, { id: "w1", stripeAccountId: acct }, { id: "w1" })).toEqual({ action: "keep" });
    expect(connectLinkPlan(acct, { id: "w1", stripeAccountId: "acct_other123456" }, null)).toMatchObject({ action: "refuse" });
    expect(connectLinkPlan(acct, { id: "w1", stripeAccountId: null }, { id: "w2" })).toMatchObject({ action: "refuse" });
  });
});
