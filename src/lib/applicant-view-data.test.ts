import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The applicant loader (redesign §4.3, B1.6) with the real access map: the
 * guard is canUse itself, not a stand-in. Data loaders are mocked; the
 * database is a spy that must not be touched when access is refused.
 */
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({ db: () => ({ engagement: { findFirst } }) }));
const loadLatestPreference = vi.fn(async () => null);
vi.mock("@/lib/political-fit-data", () => ({ loadLatestPreference }));
const FIT = { shared: false } as const;
const loadOrgProfile = vi.fn<(...args: unknown[]) => Promise<Record<string, unknown>>>(async () => ({ displayName: "Ana", availability: "withheld", fit: FIT, scorecard: {}, credentials: [], experience: [], today: "2026-10-20" }));
vi.mock("@/lib/org-profile-data", () => ({ loadOrgProfile }));
vi.mock("@/lib/engagements-data", () => ({ loadPipelineFacts: async () => new Map() }));
vi.mock("@/lib/worker-access-data", () => ({ workerAccessFor: async () => ({ kind: "employer" }) }));
vi.mock("@/lib/availability-data", () => ({ loadAvailability: async () => null }));
vi.mock("@/lib/credentials-data", () => ({ loadOrgCredentials: async () => "withheld" }));

const { applicantForInspector, applicantForViewer } = await import("./applicant-view-data");

const ORG = "22222222-2222-2222-2222-222222222222";
const JOB = "33333333-3333-3333-3333-333333333333";
const ENG = "44444444-4444-4444-4444-444444444444";
const ref = { jobId: JOB, engagementId: ENG };
const viewer = (over: Record<string, unknown> = {}) => ({ userId: "u", role: "RECRUITER", workerId: null, orgId: ORG, staff: false, grants: null, ...over }) as never;
const row = {
  id: ENG, status: "APPLIED", createdAt: new Date("2026-10-01T00:00:00Z"), inviteExpiresAt: null,
  applicationSnapshot: { kind: "application", capturedAt: "2026-10-01", consentVersion: 1, fit: { shared: true, answers: ["…"] }, scorecard: { segments: [], showRate: null } },
  worker: { id: "55555555-5555-5555-5555-555555555555", displayName: "Ana", closedAt: null },
  job: { id: JOB, title: "Ward 3", status: "PUBLISHED", type: "CANVASS", startsAt: null, endsAt: null, requirements: null, campaignDisclosure: null, org: { approved: true }, jurisdiction: { state: "CO", rules: {} } },
};

describe("applicantForViewer: the access check lives in the loader", () => {
  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue(row);
    loadLatestPreference.mockClear();
    loadOrgProfile.mockClear();
  });

  it("refuses roles without hiring, before touching the database", async () => {
    for (const v of [viewer({ role: "FINANCE" }), viewer({ role: "COMPLIANCE" }), viewer({ role: "CUSTOM", grants: { desk: "full", jobs: "read" } }), viewer({ role: "CUSTOM", grants: { hiring: "read" } }), viewer({ orgId: null }), viewer({ role: "WORKER", orgId: null })]) {
      expect(await applicantForViewer(v, ref, { view: "page" })).toBeNull();
    }
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("refuses malformed ids without a query, and reads only the viewer's own organization's jobs", async () => {
    expect(await applicantForViewer(viewer(), { jobId: "x", engagementId: ENG }, { view: "page" })).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
    await applicantForViewer(viewer({ role: "CUSTOM", grants: { hiring: "full" } }), ref, { view: "page" });
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: ENG, jobId: JOB, job: { orgId: ORG } });
    findFirst.mockResolvedValue(null); // another organization's engagement: not found
    expect(await applicantForViewer(viewer(), ref, { view: "page" })).toBeNull();
  });

  it("the full page carries political fit the worker shares", async () => {
    const a = (await applicantForViewer(viewer(), ref, { view: "page" }))!;
    expect(loadLatestPreference).toHaveBeenCalledTimes(1);
    expect(loadOrgProfile.mock.calls[0][3]).toEqual({ fit: true });
    expect(a.profile).toHaveProperty("fit");
    expect(a.snapshot).toHaveProperty("fit");
  });

  it("the inspector never reads political fit and returns none of it, not even whether answers exist", async () => {
    const a = (await applicantForInspector(viewer(), ref))!;
    expect(loadLatestPreference).not.toHaveBeenCalled();
    expect(loadOrgProfile.mock.calls[0][3]).toEqual({ fit: false });
    expect(Object.keys(a.profile!).sort()).toEqual(["availability", "credentials", "displayName", "experience", "scorecard", "today"]);
    // consentVersion would say whether the worker answered the questionnaire.
    expect(Object.keys(a.snapshot!).sort()).toEqual(["capturedAt", "kind", "scorecard"]);
    expect(JSON.stringify(a)).not.toMatch(/answers|consentVersion|"fit"/);
  });
});

/** Every file under a directory, recursively. */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const SRC = join(__dirname, "..");
const source = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f) && !relative(SRC, f).startsWith("app/zz-preview"));

describe("inspector and preview boundaries (redesign §4.3, §6.1)", () => {
  it("no inspector file reads the database or political fit: it gets its data from applicantForInspector (and its kin)", () => {
    // None exist yet (B2 adds them); from then on every one is held to this.
    const inspectors = source.filter((f) => /inspector/i.test(relative(SRC, f)) && !/\.test\.tsx?$/.test(f));
    const banned = /(?:from\s+|import\(\s*)["'](?:@\/lib\/(?:db|political-fit-data|org-profile-data)|[./]+(?:lib\/)?(?:db|political-fit-data|org-profile-data))["']|applicantForViewer|view:\s*["']page["']/;
    for (const f of inspectors) expect({ f, banned: banned.test(readFileSync(f, "utf8")) }).toEqual({ f, banned: false });
  });

  it("the local preview harness is never committed and nothing imports it", () => {
    let tracked: string | null = null;
    try {
      tracked = execSync("git ls-files -- src/app/zz-preview", { cwd: join(SRC, ".."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      // No git here (a tarball or build context): only the import check can run.
    }
    if (tracked !== null) expect(tracked).toBe("");
    // Other tests name the folder only to skip it; an import is what must never happen.
    const imports = /(?:from\s+|import\(\s*|require\(\s*)["'][^"']*zz-preview/;
    for (const f of source) expect({ f, imports: imports.test(readFileSync(f, "utf8")) }).toEqual({ f, imports: false });
  });
});
