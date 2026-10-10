import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  getSessionProfile: vi.fn(),
  openProof: vi.fn(),
  check: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSessionProfile: m.getSessionProfile }));
vi.mock("@/lib/proof-data", () => ({ openProof: m.openProof }));
vi.mock("@/lib/rate-limit", () => ({ check: m.check }));

import { GET, HEAD } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const req = (qs = "") => ({ nextUrl: new URL(`https://turf-cut.vercel.app/api/credential-proofs/${ID}${qs}`) }) as unknown as NextRequest;
const params = Promise.resolve({ proofId: ID });
const worker = { userId: "w1", role: "WORKER", workerId: "w1", orgId: null };
const staff = { userId: "s1", role: "COMPLIANCE", workerId: null, orgId: "o1" };

describe("GET /api/credential-proofs/[proofId]", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("CREDENTIAL_PROOF_KEY", Buffer.alloc(32, 7).toString("base64"));
    m.getSessionProfile.mockReset();
    m.openProof.mockReset();
    m.check.mockReset().mockResolvedValue("ok");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("asks a stranger to sign in, without touching the photo", async () => {
    m.getSessionProfile.mockResolvedValue(null);
    const r = await GET(req(), { params });
    expect(r.status).toBe(401);
    expect(m.openProof).not.toHaveBeenCalled();
  });

  it("says not found to someone who may not see it, and to a signed-in account that is neither worker nor organization member", async () => {
    m.getSessionProfile.mockResolvedValue(staff);
    m.openProof.mockResolvedValue(null);
    expect((await GET(req(), { params })).status).toBe(404);
    m.getSessionProfile.mockResolvedValue({ userId: "x", role: "RECRUITER", workerId: null, orgId: null });
    expect((await GET(req(), { params })).status).toBe(404);
    expect(m.openProof).toHaveBeenCalledTimes(1);
  });

  it("says photos aren't available when the server isn't configured, before any access check", async () => {
    vi.stubEnv("CREDENTIAL_PROOF_KEY", "not-a-key");
    m.getSessionProfile.mockResolvedValue(worker);
    const r = await GET(req(), { params });
    expect(r.status).toBe(503);
    expect(m.openProof).not.toHaveBeenCalled();
  });

  it("serves the photo inline or as a download, never cached, with no referrer", async () => {
    m.getSessionProfile.mockResolvedValue(staff);
    m.openProof.mockResolvedValue({ bytes: Buffer.from([0xff, 0xd8, 0xff]), filename: "turfcut-certificate-front.jpg" });
    const r = await GET(req(), { params });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/jpeg");
    expect(r.headers.get("Content-Disposition")).toBe('inline; filename="turfcut-certificate-front.jpg"');
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(r.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(m.openProof).toHaveBeenLastCalledWith({ kind: "staff", profileId: "s1", orgId: "o1", role: "COMPLIANCE" }, ID, "view");
    const d = await GET(req("?download=1"), { params });
    expect(d.headers.get("Content-Disposition")).toBe('attachment; filename="turfcut-certificate-front.jpg"');
    expect(m.openProof).toHaveBeenLastCalledWith(expect.anything(), ID, "download");
  });

  it("cuts off an organization member's loop of looks, but never limits the worker", async () => {
    m.check.mockResolvedValue("limited");
    m.getSessionProfile.mockResolvedValue(staff);
    expect((await GET(req(), { params })).status).toBe(429);
    expect(m.openProof).not.toHaveBeenCalled();
    m.getSessionProfile.mockResolvedValue(worker);
    m.openProof.mockResolvedValue({ bytes: Buffer.from([1]), filename: "x.jpg" });
    expect((await GET(req(), { params })).status).toBe(200);
    expect(m.check).toHaveBeenCalledTimes(1);
  });

  it("refuses HEAD, which would otherwise record a look that served nothing", async () => {
    const r = await HEAD();
    expect(r.status).toBe(405);
    expect(r.headers.get("Allow")).toBe("GET");
    expect(m.openProof).not.toHaveBeenCalled();
  });
});
