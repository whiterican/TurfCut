import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ purgeProofs: vi.fn() }));
vi.mock("@/lib/proof-data", () => ({ purgeProofs: m.purgeProofs }));

import { GET } from "./route";

const req = (auth?: string) => new Request("https://turf-cut.vercel.app/api/cron/purge-proofs", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/cron/purge-proofs", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("CREDENTIAL_PROOF_KEY", Buffer.alloc(32, 7).toString("base64"));
    m.purgeProofs.mockReset().mockResolvedValue({ deleted: 2, orphans: 1, filesRemoved: 3 });
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
    expect(m.purgeProofs).not.toHaveBeenCalled();
    const ok = await GET(req("Bearer s3cret-value"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ deleted: 2, orphans: 1, filesRemoved: 3 });
  });

  it("refuses to run on a server without the secret or the photo settings", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("Bearer "))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    vi.stubEnv("CREDENTIAL_PROOF_KEY", "");
    expect((await GET(req("Bearer s3cret-value"))).status).toBe(503);
    expect(m.purgeProofs).not.toHaveBeenCalled();
  });
});
