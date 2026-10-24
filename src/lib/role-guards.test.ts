import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The plan's acceptance line for custom roles (M10.6): the access map
 * enforces a role on a page (requireArea), a server action
 * (requireJobEditor) and an API route (apiEmployer / apiArea): a role with
 * read on Jobs sees the list and cannot publish.
 */
const session = vi.hoisted(() => ({ current: null as unknown }));
const redirect = vi.hoisted(() => vi.fn((to: string) => {
  throw new Error(`redirect:${to}`);
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/db", () => ({ db: () => ({ organization: { findUnique: async () => ({ approved: true }) } }) }));
vi.mock("@/lib/auth", () => ({
  requireAuth: async () => session.current,
  requireRole: async () => session.current,
  getSessionProfile: async () => session.current,
}));

const { requireArea, requireEmployer, requireJobEditor } = await import("./employer-session");
const { apiArea, apiEmployer } = await import("./api-session");
const { canUse } = await import("./access");

const member = (over: Record<string, unknown>) => ({ userId: "u", email: undefined, role: "CUSTOM", workerId: null, orgId: "org", staff: false, grants: {}, roleName: "Viewer", ...over });

describe("custom roles on a page, a server action and an API route (M10.6)", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("a role with read on Jobs sees the list but can't create or publish", async () => {
    session.current = member({ grants: { desk: "full", jobs: "read" } });
    expect(canUse(session.current as never, "jobs", "read")).toBe(true);
    await expect(requireArea("jobs", "read")).resolves.toMatchObject({ orgId: "org" });
    await expect(requireJobEditor()).rejects.toThrow("redirect:/dashboard");
    await expect(requireArea("jobsEdit")).rejects.toThrow("redirect:/dashboard");
    const denied = await apiEmployer("jobsEdit");
    expect("error" in denied && denied.error.status).toBe(403);
  });

  it("a role granted job editing may publish, and one granted hiring works applicants, each on its own area", async () => {
    session.current = member({ grants: { desk: "full", jobs: "read", jobsEdit: "full" } });
    await expect(requireJobEditor()).resolves.toMatchObject({ orgId: "org", orgApproved: true });
    await expect(requireEmployer()).rejects.toThrow("redirect:/dashboard");
    session.current = member({ grants: { desk: "full", jobs: "read", hiring: "full" } });
    await expect(requireEmployer()).resolves.toMatchObject({ orgId: "org" });
    await expect(requireJobEditor()).rejects.toThrow("redirect:/dashboard");
    const ok = await apiEmployer("hiring");
    expect("session" in ok).toBe(true);
  });

  it("API routes answer 403 for an area the role lacks and 200-path for one it holds", async () => {
    session.current = member({ grants: { desk: "full", pay: "full" } });
    expect("session" in (await apiArea("pay"))).toBe(true);
    const no = await apiArea("campaigns");
    expect("error" in no && no.error.status).toBe(403);
    session.current = null;
    const out = await apiArea("pay");
    expect("error" in out && out.error.status).toBe(401);
  });

  it("a custom role with no grants, an archived role and a removed member reach nothing", async () => {
    session.current = member({ grants: {} });
    await expect(requireArea("desk")).rejects.toThrow("redirect:/dashboard");
    session.current = member({ orgId: null, grants: { desk: "full" } });
    await expect(requireArea("desk")).rejects.toThrow("redirect:/dashboard");
  });

  it("built-in roles are unchanged: an owner reaches everything the map gives it, a supervisor doesn't reach pay", async () => {
    session.current = member({ role: "OWNER", grants: null, roleName: null });
    await expect(requireJobEditor()).resolves.toBeTruthy();
    session.current = member({ role: "SUPERVISOR", grants: null, roleName: null });
    await expect(requireArea("pay")).rejects.toThrow("redirect:/dashboard");
    await expect(requireArea("field")).resolves.toBeTruthy();
  });
});
