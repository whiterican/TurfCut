import { beforeEach, describe, expect, it, vi } from "vitest";

// The Field map's job filter (#113 review, P1): every loader narrows inside its own query, before its cap,
// and inside the organization. Never a filter applied to a capped organization result.
const client = { shift: { findMany: vi.fn(async () => [] as unknown[]) }, workEvent: { findMany: vi.fn(async () => [] as unknown[]) } };
vi.mock("@/lib/db", () => ({ db: () => client }));

const { loadReviewCandidates, heldPackets, REVIEW_CAP } = await import("./field-day-data");
const ORG = "00000000-0000-0000-0000-0000000000a1";
const JOB = "00000000-0000-0000-0000-0000000000b2";
const now = new Date("2026-10-30T19:00:00Z");
type Where = { engagement: { job: Record<string, unknown> }; startsAt?: unknown };
const lastWhere = () => (client.shift.findMany.mock.calls.at(-1) as unknown as [{ where: Where; take?: number }])[0];

describe("review candidates for the Field map", () => {
  beforeEach(() => client.shift.findMany.mockClear());

  it("without a job: the organization, capped", async () => {
    await loadReviewCandidates(ORG, now);
    const q = lastWhere();
    expect(q.where.engagement.job).toEqual({ orgId: ORG });
    expect(q.take).toBe(REVIEW_CAP);
  });

  it("with a job: the job inside the organization, in the query, before the same cap", async () => {
    await loadReviewCandidates(ORG, now, 30, { jobId: JOB });
    const q = lastWhere();
    expect(q.where.engagement.job).toEqual({ orgId: ORG, id: JOB });
    expect(q.take).toBe(REVIEW_CAP);
  });
});

describe("kept packets for the Field map", () => {
  beforeEach(() => client.shift.findMany.mockClear());

  it("organization-wide keeps the recent window", async () => {
    await heldPackets(client as never, { orgId: ORG });
    const q = lastWhere();
    expect(q.where.engagement.job).toEqual({ orgId: ORG });
    expect(q.where.startsAt).toBeDefined();
  });

  it("one job on the Field map keeps the same window, inside the organization", async () => {
    await heldPackets(client as never, { orgId: ORG, jobId: JOB, recent: true });
    const q = lastWhere();
    expect(q.where.engagement.job).toEqual({ orgId: ORG, id: JOB });
    expect(q.where.startsAt).toBeDefined();
  });

  it("a job's own page (no organization, no window) is unchanged", async () => {
    await heldPackets(client as never, { jobId: JOB });
    const q = lastWhere();
    expect(q.where.engagement.job).toEqual({ id: JOB });
    expect(q.where.startsAt).toBeUndefined();
  });
});
