import { describe, expect, it } from "vitest";
import { geoTables, milesBetween, placeKey, resolveArea } from "./geo";
import { placeKey as buildKey } from "../../scripts/geo/place-key.mjs";

describe("geo", () => {
  it("place keys match the build script's", () => {
    for (const n of ["Bayamón zona urbana", "Cañon City city", "Denver city", "Highlands Ranch CDP", "St. Louis city", "Saint Paul city", "Fort Collins city", "Mount Vernon town", "Winston-Salem city", "Nashville-Davidson metropolitan government (balance)", "Coeur d'Alene city"]) {
      for (const k of [0, 1, 3]) expect(placeKey(n, k)).toBe(buildKey(n, k));
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
    // Places the Census names differently: consolidated city-counties, "Urban Honolulu", "San Buenaventura (Ventura)".
    for (const c of ["Nashville, TN", "Honolulu, HI", "Lexington, KY", "Augusta, GA", "Athens, GA", "Macon, GA", "Ventura, CA", "Louisville, KY"]) {
      expect(resolveArea(c, t), c).not.toBeNull();
    }
    // Same-name places in one state are never guessed between (Franklin city and borough, PA; El
    // Cerrito city and a CDP 389 miles away, CA), unless a town's same-name CDP is effectively the
    // same place (Chevy Chase town and CDP, MD).
    expect(resolveArea("Franklin, PA", t)).toBeNull();
    expect(resolveArea("El Cerrito, CA", t)).toBeNull();
    expect(resolveArea("Chevy Chase, MD", t)).toMatchObject({ state: "MD" });
    // A bare name left out in one state isn't "unique" elsewhere (Plantation FL vs Plantation KY).
    for (const bare of ["Plantation", "Rice Lake", "Cold Springs", "Middlebury"]) expect(resolveArea(bare, t), bare).toBeNull();
    expect(resolveArea("Plantation, KY", t)).toMatchObject({ state: "KY" });
    // A place's own name beats a looser form of another's ("Goodyear city" vs "Goodyear Village CDP").
    expect(resolveArea("Goodyear, AZ", t)).not.toEqual(resolveArea("Goodyear Village, AZ", t));
    expect(resolveArea("Boise, ID", t)).toEqual(resolveArea("Boise City, ID", t));
    // Accents don't matter.
    expect(resolveArea("Canon City, CO", t)).toEqual(resolveArea("Cañon City, CO", t));
    // (Bayamón's zona urbana and its same-name comunidad are far apart, so that name is left out; a ZIP works.)
    expect(resolveArea("00961", t)).toMatchObject({ state: "PR" });
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

describe("match distance bands", async () => {
  const { distanceBand } = await import("./matches-data");
  it("only 5-mile bands, as text and as the sort value", () => {
    expect(distanceBand(0.4)).toEqual({ text: "under 5 mi", band: 0 });
    expect(distanceBand(4.9)).toEqual({ text: "under 5 mi", band: 0 });
    expect(distanceBand(12.2)).toEqual({ text: "about 10 mi", band: 2 });
    expect(distanceBand(13)).toEqual({ text: "about 15 mi", band: 3 });
    // Two workers 1 mile apart in one band can't be told apart.
    expect(distanceBand(11).band).toBe(distanceBand(12).band);
  });
});
