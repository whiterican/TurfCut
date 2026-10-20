import { describe, expect, it } from "vitest";
import { checkReason, recordAdminAction, REASON_MAX, staffLabel, type AdminActionInput } from "./admin-data";

/** A transaction that only records what it was asked to create. */
function fakeTx() {
  const created: unknown[] = [];
  const tx = { adminAction: { create: async (args: { data: unknown }) => { created.push(args.data); return { id: "row-1" }; } } };
  return { tx: tx as unknown as Parameters<typeof recordAdminAction>[0], created };
}

const base: AdminActionInput = { staff: { userId: "11111111-1111-1111-1111-111111111111", staff: true }, action: "org.approved", targetType: "Organization", targetId: "22222222-2222-2222-2222-222222222222", orgId: "22222222-2222-2222-2222-222222222222", reason: "  Pilot partner, terms signed on the call  " };

describe("the staff ledger (M10.1)", () => {
  it("needs a reason in words: blank, whitespace, two letters or a non-string are refused with what to say", () => {
    for (const bad of ["", "   ", "ok", 42, null, undefined]) {
      const r = checkReason(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/Say why/);
    }
    const long = checkReason("x".repeat(REASON_MAX + 1));
    expect(long).toEqual({ ok: false, message: `Keep the reason to ${REASON_MAX} characters or fewer.` });
    expect(checkReason("x".repeat(REASON_MAX)).ok).toBe(true);
    expect(checkReason("  Pilot partner  ")).toEqual({ ok: true, reason: "Pilot partner" });
  });

  it("records who, what, on which record, for which organization and why, trimmed, at the given time", async () => {
    const { tx, created } = fakeTx();
    const now = new Date("2026-10-20T15:00:00Z");
    await expect(recordAdminAction(tx, base, now)).resolves.toEqual({ id: "row-1" });
    expect(created).toEqual([{ staffId: base.staff.userId, action: "org.approved", targetType: "Organization", targetId: base.targetId, orgId: base.orgId, reason: "Pilot partner, terms signed on the call", metadata: undefined, createdAt: now }]);
  });

  it("never writes a row without a reason, whatever the caller passes", async () => {
    const { tx, created } = fakeTx();
    await expect(recordAdminAction(tx, { ...base, reason: "   " })).rejects.toThrow(/without a reason/);
    await expect(recordAdminAction(tx, { ...base, reason: undefined as unknown as string })).rejects.toThrow(/without a reason/);
    expect(created).toEqual([]);
  });

  it("names staff by their worker name, else their chat name, else a short id, never an email", () => {
    expect(staffLabel({ id: "abcdef12-0000-0000-0000-000000000000", displayName: "Maya Chen" })).toBe("Maya Chen");
    expect(staffLabel({ id: "abcdef12-0000-0000-0000-000000000000", displayName: null, worker: { displayName: "Alex Rivera" } })).toBe("Alex Rivera");
    expect(staffLabel({ id: "abcdef12-0000-0000-0000-000000000000", displayName: "", worker: null })).toBe("Staff abcdef12");
    expect(staffLabel({ id: "abcdef12-0000-0000-0000-000000000000", displayName: null })).toBe("Staff abcdef12");
  });
});
