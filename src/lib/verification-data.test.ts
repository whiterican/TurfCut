import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { checkFailure } from "./verification-data";

const v = { clientVersion: "test" };

describe("checkFailure", () => {
  it("maps a racing edit, a database refusal and a lock timeout to messages, and logs no row data", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(checkFailure(new Prisma.PrismaClientKnownRequestError("unique", { ...v, code: "P2002" }))?.reason).toMatch(/changed since you opened/);
    expect(checkFailure(new Prisma.PrismaClientKnownRequestError("timeout", { ...v, code: "P2028" }))?.reason).toMatch(/couldn't record/);
    const refused = new Prisma.PrismaClientUnknownRequestError('PostgresError { code: "23514", detail: Some("Failing row contains (CO-1234, secret)") }', v);
    expect(checkFailure(refused)?.reason).toMatch(/couldn't record/);
    expect(log.mock.calls.flat().join(" ")).not.toMatch(/Failing row|CO-1234|secret/);
    log.mockRestore();
  });

  it("leaves anything else to fail loudly", () => {
    expect(checkFailure(new Error("boom"))).toBeNull();
    expect(checkFailure(new Prisma.PrismaClientKnownRequestError("fk", { ...v, code: "P2003" }))).toBeNull();
    expect(checkFailure(new Prisma.PrismaClientUnknownRequestError("connection reset", v))).toBeNull();
    // Only the error's own code counts, not a row value that happens to read 23514.
    expect(checkFailure(new Prisma.PrismaClientUnknownRequestError('PostgresError { code: "23503", detail: Some("Failing row contains (23514)") }', v))).toBeNull();
  });
});
