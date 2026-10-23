import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionProfile = vi.fn();
const notFound = vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); });
vi.mock("@/lib/auth", () => ({ getSessionProfile }));
vi.mock("next/navigation", () => ({ notFound }));

const { requireStaff } = await import("./staff-session");

const base = { userId: "u1", email: "a@b.c", role: "OWNER" as const, workerId: null, orgId: "o1" };

describe("the staff gate (M10.1)", () => {
  beforeEach(() => { getSessionProfile.mockReset(); notFound.mockClear(); });

  it("answers 404, not a redirect, to the signed-out and to every non-staff role", async () => {
    for (const session of [null, { ...base, staff: false }, { ...base, role: "WORKER" as const, workerId: "w1", orgId: null, staff: false }]) {
      getSessionProfile.mockResolvedValueOnce(session);
      await expect(requireStaff()).rejects.toThrow("NEXT_NOT_FOUND");
    }
    expect(notFound).toHaveBeenCalledTimes(3);
  });

  it("lets staff through with the session, whatever their role", async () => {
    getSessionProfile.mockResolvedValueOnce({ ...base, role: "WORKER", workerId: "w1", orgId: null, staff: true });
    await expect(requireStaff()).resolves.toMatchObject({ userId: "u1", role: "WORKER", staff: true });
    expect(notFound).not.toHaveBeenCalled();
  });
});
