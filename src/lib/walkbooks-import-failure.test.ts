import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * A database refusal can quote the row it refused: names, phone numbers,
 * party. The import must turn that into a plain "nothing was saved", and
 * nothing from the message may reach a log.
 */
const m = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: () => ({ $transaction: m.transaction }) }));

import { importAddresses } from "@/lib/walkbooks-data";

const META = { fileName: "a.csv", recordSource: "Own list", purpose: "Canvassing", license: "Own list", authorized: "on" };
const FILE = "First Name,Phone,address,city,state,zip\nAda Lovelace,555-0100,1 Oak St,Denver,CO,80202\n";

describe("importAddresses when the database refuses a row", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says nothing was saved, and logs the error's code and nothing from its text", async () => {
    const leak = 'new row for relation "ImportedAddress" violates check constraint\nDETAIL:  Failing row contains (Ada Lovelace, 555-0100, DEM).';
    m.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(leak, { code: "P2004", clientVersion: "x" }));
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" ")));
    const r = await importAddresses({ profileId: "p", orgId: "o" }, META, FILE);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/nothing was imported/);
    expect(JSON.stringify(r)).not.toMatch(/Lovelace|555-0100|DEM|Failing row/);
    expect(logged.join(" ")).toMatch(/P2004/);
    expect(logged.join(" ")).not.toMatch(/Lovelace|555-0100|DEM|Failing row/);
  });

  it("does the same for an error that isn't a Prisma one", async () => {
    m.transaction.mockRejectedValue(new Error("connection quoted Ada Lovelace"));
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logged.push(a.map(String).join(" ")));
    const r = await importAddresses({ profileId: "p", orgId: "o" }, META, FILE);
    expect(r.ok).toBe(false);
    expect(logged.join(" ")).not.toMatch(/Lovelace/);
  });
});
