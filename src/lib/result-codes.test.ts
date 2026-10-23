import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ getSessionProfile: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({}) }));

const { engagementResponse, resultResponse } = await import("./api-session");
const { fail, codeOf } = await import("./result-codes");

describe("explicit result codes → HTTP status", () => {
  it("maps each code to its status", () => {
    expect(engagementResponse(fail("not_found", "Job not found.")).status).toBe(404);
    expect(engagementResponse(fail("forbidden", "x")).status).toBe(403);
    expect(engagementResponse(fail("rate_limited", "x")).status).toBe(429);
    expect(engagementResponse(fail("invalid", "x")).status).toBe(400);
    expect(resultResponse(fail("not_found", "Shift not found.")).status).toBe(404);
  });

  it("ignores the wording: an uncoded 'not found' message is a 409 refusal, a coded one is 404 whatever it says", () => {
    expect(resultResponse({ ok: false, reason: "Shift not found." }).status).toBe(409);
    expect(resultResponse(fail("not_found", "Gone.")).status).toBe(404);
  });

  it("success keeps its shape", async () => {
    const r = engagementResponse({ ok: true, engagementId: "e", status: "APPLIED" });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ engagementId: "e", status: "APPLIED" });
    expect(engagementResponse({ ok: true, engagementId: "e", status: "ACCEPTED" }, false).status).toBe(200);
  });

  it("rejects unknown codes", () => {
    expect(codeOf({ reason: "x", code: "teapot" })).toBe("conflict");
  });
});
