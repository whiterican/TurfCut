import { beforeEach, describe, expect, it, vi } from "vitest";

type ShiftArgs = { where: Record<string, unknown>; select?: Record<string, unknown> };
const client = {
  job: { findMany: vi.fn(async () => []) },
  engagement: { findMany: vi.fn(async () => []) },
  shift: { findMany: vi.fn<(a: ShiftArgs) => Promise<unknown[]>>(async () => []), count: vi.fn<(a: ShiftArgs) => Promise<number>>(async () => 0) },
};
vi.mock("@/lib/db", () => ({ db: () => client }));
const emptyOps = { scheduled: 0, upcoming: 0, checkedIn: 0, signatures: 0, doors: 0, late: [], awaitingReview: [], rows: [] };
vi.mock("@/lib/field-day-data", () => ({ loadOps: async () => emptyOps }));
vi.mock("@/lib/pay-data", () => ({ loadOrgPay: async () => ({ awaiting: [] }) }));
vi.mock("@/lib/dispute-thread-data", () => ({ noteOverdueDisputes: async () => 0, disputeCounts: async () => ({ open: 0, overdue: 0, dueToday: 0 }) }));

const { loadDesk } = await import("./desk-data");

const ORG = "22222222-2222-2222-2222-222222222222";
const now = new Date("2026-10-20T16:00:00Z");
const actor = (role: "OWNER" | "COMPLIANCE" | "FINANCE") => ({ profileId: "p", orgId: ORG, role });
const stillInCall = () => client.shift.findMany.mock.calls.find(([a]) => (a.where.endsAt as { lt?: Date })?.lt);

describe("the Desk's no-check-out query (redesign §5)", () => {
  beforeEach(() => {
    client.shift.findMany.mockReset().mockResolvedValue([]);
    client.shift.count.mockReset().mockResolvedValue(0);
  });

  it("full field access: a named row per shift still checked in after its end, scoped to the organization", async () => {
    client.shift.findMany.mockImplementation(async (a: ShiftArgs) =>
      (a.where.endsAt as { lt?: Date })?.lt ? [{ id: "s1", endsAt: new Date("2026-10-19T23:00:00Z"), engagement: { worker: { displayName: "Ana" }, job: { title: "Ward 3" } } }] : []
    );
    const desk = await loadDesk(actor("OWNER"), now);
    const [args] = stillInCall()!;
    expect(args.where).toMatchObject({ status: "ACTIVE", checkInAt: { not: null }, checkOutAt: null, endsAt: { lt: now }, engagement: { job: { orgId: ORG } } });
    const row = desk.needs.find((n) => n.key === "nocheckout-s1")!;
    expect(row).toMatchObject({ title: "No check-out from Ana", state: "overdue", href: "/shifts/s1", when: { label: "Was due to end" } });
    expect(desk.noCheckoutCount).toBeNull();
    expect(client.shift.count).not.toHaveBeenCalled();
  });

  it("compliance: a count only; names are never read from the database", async () => {
    client.shift.count.mockResolvedValue(2);
    const desk = await loadDesk(actor("COMPLIANCE"), now);
    expect(desk.noCheckoutCount).toBe(2);
    expect(stillInCall()).toBeUndefined();
    expect(client.shift.count.mock.calls[0][0]).toMatchObject({ where: { engagement: { job: { orgId: ORG } } } });
    expect(JSON.stringify(desk)).not.toContain("displayName");
  });

  it("finance: nothing", async () => {
    const desk = await loadDesk(actor("FINANCE"), now);
    expect(desk.noCheckoutCount).toBeNull();
    expect(stillInCall()).toBeUndefined();
    expect(client.shift.count).not.toHaveBeenCalled();
    expect(desk.needs.some((n) => n.key.startsWith("nocheckout"))).toBe(false);
  });
});
