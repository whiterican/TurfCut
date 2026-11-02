import { describe, expect, it, vi } from "vitest";

const requireEmployer = vi.fn<(area: string) => Promise<{ orgId: string }>>(async () => ({ orgId: "org" }));
vi.mock("@/lib/employer-session", () => ({ requireEmployer: (area: string) => requireEmployer(area) }));

const { placeOfCity } = await import("./place-actions");

describe("placeOfCity: the staging map's starting point", () => {
  it("only for someone who can edit jobs", async () => {
    await placeOfCity("Denver", "CO");
    expect(requireEmployer).toHaveBeenCalledWith("jobsEdit");
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
    // A ZIP typed as a city is placed by the ZIP; a ZIP in another state isn't this job's city.
    expect(await placeOfCity("10001", "CO")).toBeNull();
  });
});
