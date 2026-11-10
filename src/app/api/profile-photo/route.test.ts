import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ session: vi.fn(), keyOf: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionProfile: m.session }));
vi.mock("@/lib/profile-photo-data", () => ({ photoRecords: () => ({ keyOf: m.keyOf, swapKey: vi.fn() }) }));
vi.mock("@/lib/profile-photo", async (orig) => ({ ...(await orig<typeof import("@/lib/profile-photo")>()), supabasePhotoStore: () => ({ get: m.get, put: vi.fn(), remove: vi.fn(), sweep: vi.fn() }) }));

import { GET } from "./route";

const req = (headers: Record<string, string> = {}, url = "https://turf-cut.vercel.app/api/profile-photo") => new Request(url, { headers });

describe("GET /api/profile-photo", () => {
  beforeEach(() => {
    m.session.mockReset().mockResolvedValue({ userId: "p1" });
    m.keyOf.mockReset().mockImplementation(async (id: string) => (id === "p1" ? "p1/tag1.jpg" : "p2/theirs.jpg"));
    m.get.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("refuses anyone not signed in (a closed account has no session), and reads nothing", async () => {
    m.session.mockResolvedValue(null);
    const r = await GET(req());
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(m.keyOf).not.toHaveBeenCalled();
    expect(m.get).not.toHaveBeenCalled();
  });

  it("serves the signed-in person's own photo whatever the address says, as a picture the browser must re-ask for", async () => {
    const r = await GET(req({}, "https://turf-cut.vercel.app/api/profile-photo?v=tag1&id=p2&profileId=p2"));
    expect(r.status).toBe(200);
    expect(m.keyOf).toHaveBeenCalledWith("p1");
    expect(m.get).toHaveBeenCalledWith("p1/tag1.jpg");
    expect(r.headers.get("content-type")).toBe("image/jpeg");
    expect(r.headers.get("cache-control")).toBe("private, no-cache");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("vary")).toBe("Cookie");
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it("answers 304 without reading storage when the browser holds the current photo, and the photo again when it holds an old one", async () => {
    const same = await GET(req({ "if-none-match": '"tag1"' }));
    expect(same.status).toBe(304);
    expect(m.get).not.toHaveBeenCalled();
    expect((await GET(req({ "if-none-match": '"older"' }))).status).toBe(200);
  });

  it("is 404 with no photo, and 503 (not a crash) when storage is down", async () => {
    m.keyOf.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(404);
    m.keyOf.mockResolvedValue("p1/tag1.jpg");
    m.get.mockRejectedValue(new Error("storage down"));
    const r = await GET(req());
    expect(r.status).toBe(503);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});
