import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const getUser = vi.fn();
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ profile: { findUnique } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/account", () => ({ ensureAccount: vi.fn(async () => false) }));

const { getSessionProfile } = await import("./auth");

describe("session profile", () => {
  beforeEach(() => {
    findUnique.mockReset();
    getUser.mockReset();
  });

  it("loads the profile and the worker link in one query", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.org" } } });
    findUnique.mockResolvedValue({ id: "u1", role: "WORKER", orgId: null, closedAt: null, worker: { id: "w1" } });
    expect(await getSessionProfile()).toEqual({ userId: "u1", email: "a@b.org", role: "WORKER", workerId: "w1", orgId: null });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique.mock.calls[0][0]).toMatchObject({ where: { id: "u1" }, include: { worker: { select: { id: true } } } });
  });

  it("gives organization roles no worker id, and closed accounts no session", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u2", email: "o@b.org" } } });
    findUnique.mockResolvedValueOnce({ id: "u2", role: "OWNER", orgId: "org", closedAt: null, worker: null });
    expect((await getSessionProfile())?.workerId).toBeNull();
    findUnique.mockResolvedValueOnce({ id: "u2", role: "WORKER", orgId: null, closedAt: new Date(), worker: { id: "w" } });
    expect(await getSessionProfile()).toBeNull();
  });

  it("treats a database failure as signed out instead of crashing the page", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u3" } } });
    findUnique.mockRejectedValue(new Error("db down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getSessionProfile()).toBeNull();
    log.mockRestore();
  });
});
