import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftInput } from "./jobs";

const tx = {
  job: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  auditEvent: { create: vi.fn() },
  $executeRaw: vi.fn(),
};
const client = { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) };
vi.mock("@/lib/db", () => ({ db: () => client }));
vi.mock("@/lib/notifications-data", () => ({ notifyJobChanged: vi.fn() }));
vi.mock("@/lib/political-fit-data", () => ({ loadLatestPreference: vi.fn() }));

const { saveDraftProgress } = await import("./jobs-data");

const ORG = "22222222-2222-2222-2222-222222222222";
const ME = "33333333-3333-3333-3333-333333333333";
const JOB = "44444444-4444-4444-4444-444444444444";
const JUR = "55555555-5555-5555-5555-555555555555";
const first: DraftInput = { type: "PETITION", title: "Denver signature drive", jurisdictionId: JUR, description: null, launch: null, tools: null };
const stored = {
  id: JOB, orgId: ORG, status: "DRAFT", type: "PETITION", title: "Denver signature drive", jurisdictionId: JUR, description: null,
  startsAt: null, endsAt: null, geography: null, compensationMethod: "HOURLY", payRateCents: null, headcount: null, hiringMethod: null,
  requirements: null, campaignDisclosure: null, supportContacts: null, measureIds: [], cancellationNoticeHours: 24, launch: null, tools: null,
};

describe("saveDraftProgress (job-builder autosave, P0 3)", () => {
  beforeEach(() => {
    for (const m of [tx.job.create, tx.job.findFirst, tx.job.updateMany, tx.auditEvent.create, tx.$executeRaw]) m.mockReset();
    tx.auditEvent.create.mockResolvedValue({});
    tx.$executeRaw.mockResolvedValue(1);
  });

  it("creates a draft from the first step with only what the builder has, and records it", async () => {
    tx.job.create.mockResolvedValue({ id: JOB });
    const r = await saveDraftProgress(ORG, ME, null, first);
    expect(r).toEqual({ id: JOB, created: true, changed: ["title", "type of work", "rule profile"] });
    const data = tx.job.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orgId: ORG, status: "DRAFT", type: "PETITION", title: "Denver signature drive", jurisdictionId: JUR, description: null });
    // Nothing invented for the parts not entered yet: the publish gate lists them as blockers later.
    for (const k of ["payRateCents", "headcount", "startsAt", "endsAt", "geography", "campaignDisclosure", "supportContacts", "hiringMethod", "launch"]) expect(data).not.toHaveProperty(k);
    expect(tx.auditEvent.create.mock.calls[0][0].data).toMatchObject({ actorId: ME, action: "job.created", entityId: JOB, metadata: { status: "DRAFT", autosaved: true } });
  });

  it("updates a draft with only the parts that changed, under the job's lock, with one audit event naming them", async () => {
    tx.job.findFirst.mockResolvedValue(stored);
    tx.job.updateMany.mockResolvedValue({ count: 1 });
    const r = await saveDraftProgress(ORG, ME, JOB, { ...first, payRateCents: 2500, headcount: 10, city: "Denver", state: "CO" });
    expect(r).toEqual({ id: JOB, created: false, changed: ["location", "pay", "headcount"] });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.job.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: JOB, orgId: ORG, status: "DRAFT" }, data: { payRateCents: 2500, headcount: 10, geography: { city: "Denver", state: "CO" } } });
    expect(tx.auditEvent.create.mock.calls[0][0].data).toMatchObject({ action: "job.draft_autosaved", entityId: JOB, metadata: { changed: ["location", "pay", "headcount"] } });
  });

  it("writes nothing when nothing changed", async () => {
    tx.job.findFirst.mockResolvedValue(stored);
    const r = await saveDraftProgress(ORG, ME, JOB, first);
    expect(r).toEqual({ id: JOB, created: false, changed: [] });
    expect(tx.job.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });

  it("never touches a published or paused job, another organization's job, or a bad id", async () => {
    tx.job.findFirst.mockResolvedValue(null); // the DRAFT-scoped read finds nothing for a live job or another org's
    expect(await saveDraftProgress(ORG, ME, JOB, { ...first, title: "Changed" })).toBeNull();
    expect(tx.job.updateMany).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(await saveDraftProgress(ORG, ME, "not-a-job", first)).toBeNull();
    expect(tx.job.findFirst).toHaveBeenCalledTimes(1);
  });

  it("keeps a pre-C4 draft's unset launch when the builder sends only its default (staged, no points)", async () => {
    tx.job.findFirst.mockResolvedValue(stored);
    const r = await saveDraftProgress(ORG, ME, JOB, { ...first, launch: { mode: "STAGED", points: [] } });
    expect(r).toEqual({ id: JOB, created: false, changed: [] });
    expect(tx.job.updateMany).not.toHaveBeenCalled();
  });
});
