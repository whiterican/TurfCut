import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ purgeDueImports: vi.fn() }));
vi.mock("@/lib/walkbooks-data", () => ({ purgeDueImports: m.purgeDueImports }));

import { GET } from "./route";

const req = (auth?: string) => new Request("https://turf-cut.vercel.app/api/cron/purge-imports", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/purge-imports", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    m.purgeDueImports.mockReset().mockResolvedValue({ purged: 2, addresses: 1200, failed: 0 });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("runs only with the cron secret, and reads as not found otherwise", async () => {
    expect((await GET(req())).status).toBe(404);
    expect((await GET(req("Bearer wrong"))).status).toBe(404);
    expect((await GET(req("Bearer s3cret-valu"))).status).toBe(404);
    expect((await GET(req("Bearer s3cret-value-and-more"))).status).toBe(404);
    expect(m.purgeDueImports).not.toHaveBeenCalled();
    const ok = await GET(req("Bearer s3cret-value"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ purged: 2, addresses: 1200, failed: 0 });
  });

  it("refuses to run on a server without the secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(503);
    expect(m.purgeDueImports).not.toHaveBeenCalled();
  });

  it("answers 500 when a file couldn't be purged, so the failure is seen, and logs counts only", async () => {
    m.purgeDueImports.mockResolvedValue({ purged: 1, addresses: 10, failed: 1 });
    const r = await GET(req("Bearer s3cret-value"));
    expect(r.status).toBe(500);
    const logged = (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().join(" ");
    expect(logged).toMatch(/1 files, 10 addresses deleted, 1 failed/);
  });
});
