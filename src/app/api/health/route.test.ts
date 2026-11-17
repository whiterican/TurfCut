import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ $queryRaw: m.query }) }));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    m.query.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("says ok when the database answers, and carries nothing else", async () => {
    m.query.mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 when the query fails, logs why, and tells the caller nothing about it", async () => {
    m.query.mockRejectedValue(new Error("DATABASE_URL is not set (password=hunter2)"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).toContain("health");
  });

  it("answers 503 when the database does not answer in time", async () => {
    vi.useFakeTimers();
    m.query.mockReturnValue(new Promise(() => {}));
    const pending = GET();
    await vi.advanceTimersByTimeAsync(4001);
    const res = await pending;
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false });
  });
});
