import { describe, expect, it, vi } from "vitest";

type Session = { role: string; orgId: string | null; grants?: null } | null;
let session: Session = { role: "OWNER", orgId: "org" };
vi.mock("@/lib/auth", () => ({ getSessionProfile: async () => session }));

const { placeOfCity } = await import("./place-actions");

describe("placeOfCity: the staging map's starting point", () => {
  it("only for someone who can edit jobs, and softly: nothing (never a redirect) for anyone else", async () => {
    expect(await placeOfCity("Denver", "CO")).not.toBeNull();
    session = { role: "SUPERVISOR", orgId: "org" };
    expect(await placeOfCity("Denver", "CO")).toBeNull();
    session = null;
    expect(await placeOfCity("Denver", "CO")).toBeNull();
    session = { role: "RECRUITER", orgId: "org" };
    expect(await placeOfCity("Denver", "CO")).not.toBeNull();
    session = { role: "OWNER", orgId: "org" };
  });

  it("places a city in its state from the bundled Census tables", async () => {
    const p = await placeOfCity("  Denver ", "co");
    expect(p).toMatchObject({ label: "Denver, CO" });
    // Downtown Denver is about 39.74, -104.99.
    expect(Math.abs(p!.lat - 39.74)).toBeLessThan(0.3);
    expect(Math.abs(p!.lng + 104.99)).toBeLessThan(0.3);
  });

  it("nothing for a place it can't be sure of, or input it shouldn't read", async () => {
    expect(await placeOfCity("Capitol Hil", "CO")).toBeNull();
    expect(await placeOfCity("Denver", "")).toBeNull();
    expect(await placeOfCity("Denver", "Colorado")).toBeNull();
    expect(await placeOfCity("", "CO")).toBeNull();
    expect(await placeOfCity("x".repeat(81), "CO")).toBeNull();
    // The city field takes a city: a ZIP there isn't looked up.
    expect(await placeOfCity("80202", "CO")).toBeNull();
  });
});
