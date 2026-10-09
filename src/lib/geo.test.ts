import { describe, expect, it } from "vitest";
import { geoTables, milesBetween, placeKey, resolveArea } from "./geo";
import { placeKey as buildKey } from "../../scripts/geo/place-key.mjs";

describe("geo", () => {
  it("place keys match the build script's", () => {
    for (const n of ["Denver city", "Highlands Ranch CDP", "St. Louis city", "Saint Paul city", "Fort Collins city", "Mount Vernon town", "Winston-Salem city", "Nashville-Davidson metropolitan government (balance)", "Coeur d'Alene city"]) {
      expect(placeKey(n)).toBe(buildKey(n));
    }
    expect(placeKey("Denver city")).toBe("denver");
    expect(placeKey("Saint Louis")).toBe(placeKey("St. Louis city"));
  });
  it("resolves a ZIP, 'City, ST', a unique city, and refuses an ambiguous one", async () => {
    const t = await geoTables();
    expect(resolveArea("80202", t)).toMatchObject({ state: "CO" });
    expect(resolveArea("80202-1234", t)).toMatchObject({ state: "CO" });
    expect(resolveArea("Aurora, CO", t)).toMatchObject({ state: "CO" });
    expect(resolveArea("aurora co", t)).toMatchObject({ state: "CO" });
    expect(resolveArea("Aurora", t)).toBeNull(); // Aurora is in several states
    expect(resolveArea("Aurora", t, "CO")).toMatchObject({ state: "CO" });
    expect(resolveArea("99999", t)).toBeNull();
    expect(resolveArea("", t)).toBeNull();
    expect(resolveArea("Nowhere Special, CO", t)).toBeNull();
  });
  it("measures straight-line miles", async () => {
    const t = await geoTables();
    const denver = resolveArea("Denver, CO", t)!;
    const boulder = resolveArea("Boulder, CO", t)!;
    const d = milesBetween(denver, boulder);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(30);
    expect(milesBetween(denver, denver)).toBe(0);
  });
});
