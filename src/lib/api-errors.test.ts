import { describe, expect, it } from "vitest";
import { failureResponse, failureStatus } from "./api-errors";

describe("failureStatus", () => {
  it("maps each code", () => {
    expect(failureStatus({ code: "not_found" })).toBe(404);
    expect(failureStatus({ code: "forbidden" })).toBe(403);
    expect(failureStatus({ code: "invalid" })).toBe(400);
    expect(failureStatus({ code: "conflict" })).toBe(409);
    expect(failureStatus({ code: "rate_limited" })).toBe(429);
  });
  it("a code wins over the wording", () => {
    expect(failureStatus({ code: "conflict", reason: "Shift not found." })).toBe(409);
  });
  it("field errors mean 400, else the fallback", () => {
    expect(failureStatus({ errors: { a: "x" } })).toBe(400);
    expect(failureStatus({})).toBe(409);
    expect(failureStatus({}, 400)).toBe(400);
  });
  it("still recognises legacy un-coded not-found wording", () => {
    expect(failureStatus({ reason: "Job not found." })).toBe(404);
  });
});

describe("failureResponse", () => {
  it("keeps the body shape and adds the code", async () => {
    const res = failureResponse({ ok: false, code: "not_found", reason: "Shift not found." });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Shift not found.", code: "not_found" });
  });
});
