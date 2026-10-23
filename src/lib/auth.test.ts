import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from "@supabase/supabase-js";

const findUnique = vi.fn();
const getUser = vi.fn();
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ profile: { findUnique } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser } }) }));
vi.mock("@/lib/account", () => ({ ensureAccount: vi.fn(async () => false) }));

const { getAuthUser, getSessionProfile } = await import("./auth");
const { ServiceUnavailableError } = await import("./outage");

describe("session profile", () => {
  beforeEach(() => {
    findUnique.mockReset();
    getUser.mockReset();
  });

  it("loads the profile and the worker link in one query", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "a@b.org" } } });
    findUnique.mockResolvedValue({ id: "u1", role: "WORKER", orgId: null, closedAt: null, staffSince: null, worker: { id: "w1" } });
    expect(await getSessionProfile()).toEqual({ userId: "u1", email: "a@b.org", role: "WORKER", workerId: "w1", orgId: null, staff: false, grants: null, roleName: null });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(findUnique.mock.calls[0][0]).toMatchObject({ where: { id: "u1" }, include: { worker: { select: { id: true } }, orgRole: { select: { name: true, archivedAt: true } } } });
  });

  it("marks Turfcut staff from the profile's flag, whatever the role (M10)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u4", email: "s@turfcut.test" } } });
    findUnique.mockResolvedValueOnce({ id: "u4", role: "WORKER", orgId: null, closedAt: null, staffSince: new Date("2026-10-20"), worker: { id: "w4" } });
    expect(await getSessionProfile()).toMatchObject({ role: "WORKER", workerId: "w4", staff: true });
    findUnique.mockResolvedValueOnce({ id: "u4", role: "OWNER", orgId: "org", closedAt: null, staffSince: null, worker: null });
    expect(await getSessionProfile()).toMatchObject({ role: "OWNER", staff: false });
  });

  it("resolves a custom role's grants once, with the session; an archived or missing role has none (M10.6)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u5", email: "c@b.org" } } });
    const base = { id: "u5", role: "CUSTOM", orgId: "org", closedAt: null, staffSince: null, worker: null };
    findUnique.mockResolvedValueOnce({ ...base, orgRole: { name: "Field lead", orgId: "org", archivedAt: null, grants: [{ area: "jobs", level: "READ" }, { area: "field", level: "FULL" }, { area: "nonsense", level: "FULL" }, { area: "pay", level: "READ" }] } });
    expect(await getSessionProfile()).toMatchObject({ role: "CUSTOM", roleName: "Field lead", grants: { jobs: "read", field: "full" } });
    findUnique.mockResolvedValueOnce({ ...base, orgRole: { name: "Old", orgId: "org", archivedAt: new Date(), grants: [{ area: "jobs", level: "READ" }] } });
    expect(await getSessionProfile()).toMatchObject({ role: "CUSTOM", grants: {} });
    // A role that belongs to another organization than the member's reaches nothing.
    findUnique.mockResolvedValueOnce({ ...base, orgRole: { name: "Theirs", orgId: "other-org", archivedAt: null, grants: [{ area: "pay", level: "FULL" }] } });
    expect(await getSessionProfile()).toMatchObject({ role: "CUSTOM", grants: {} });
    findUnique.mockResolvedValueOnce({ ...base, orgRole: null });
    expect(await getSessionProfile()).toMatchObject({ role: "CUSTOM", grants: {}, roleName: null });
    findUnique.mockResolvedValueOnce({ id: "u5", role: "FINANCE", orgId: "org", closedAt: null, staffSince: null, worker: null, orgRole: null });
    expect(await getSessionProfile()).toMatchObject({ role: "FINANCE", grants: null, roleName: null });
  });

  it("gives organization roles no worker id, and closed accounts no session", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u2", email: "o@b.org" } } });
    findUnique.mockResolvedValueOnce({ id: "u2", role: "OWNER", orgId: "org", closedAt: null, worker: null });
    expect((await getSessionProfile())?.workerId).toBeNull();
    findUnique.mockResolvedValueOnce({ id: "u2", role: "WORKER", orgId: null, closedAt: new Date(), worker: { id: "w" } });
    expect(await getSessionProfile()).toBeNull();
  });

  it("treats a missing database setting as signed out (the sign-in form names it)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u3" } } });
    findUnique.mockRejectedValue(new Error("[turfcut] Missing environment variable DATABASE_URL. Copy .env.example…"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getSessionProfile()).toBeNull();
    log.mockRestore();
  });

  it("throws on any other database failure for a confirmed user: pool timeout, too many connections, a panic", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u5" } } });
    for (const code of ["P2024", "P2037"]) {
      findUnique.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("busy", { code, clientVersion: "6" }));
      await expect(getSessionProfile()).rejects.toBeInstanceOf(ServiceUnavailableError);
    }
    findUnique.mockRejectedValue(new Prisma.PrismaClientRustPanicError("panic", "6"));
    await expect(getSessionProfile()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("passes an Auth outage on rather than reading it as signed out", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(getSessionProfile()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it("throws when the database can't be reached: an outage, not a sign-out", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u4" } } });
    findUnique.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Can't reach database server", { code: "P1001", clientVersion: "6" }));
    await expect(getSessionProfile()).rejects.toBeInstanceOf(ServiceUnavailableError);
    findUnique.mockRejectedValue(new Prisma.PrismaClientInitializationError("Authentication failed", "6"));
    await expect(getSessionProfile()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});

describe("the auth user", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("is null for a missing or rejected session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
    expect(await getAuthUser()).toBeNull();
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("Session not found", 403, "session_not_found") });
    expect(await getAuthUser()).toBeNull();
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("JWT expired", 401, "bad_jwt") });
    expect(await getAuthUser()).toBeNull();
  });

  it("throws when Supabase Auth can't be reached or fails on its side", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError("fetch failed", 0) });
    await expect(getAuthUser()).rejects.toBeInstanceOf(ServiceUnavailableError);
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("upstream", 503, undefined) });
    await expect(getAuthUser()).rejects.toBeInstanceOf(ServiceUnavailableError);
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthUnknownError("<html>Bad gateway</html>", null) });
    await expect(getAuthUser()).rejects.toBeInstanceOf(ServiceUnavailableError);
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError("slow down", 429, "over_request_rate_limit") });
    await expect(getAuthUser()).rejects.toBeInstanceOf(ServiceUnavailableError);
    getUser.mockImplementation(() => {
      throw new TypeError("network");
    });
    await expect(getAuthUser()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
