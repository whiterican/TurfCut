/**
 * Where a worker's typed home area and a job's city are, for Matches (C3.4).
 * From the bundled Census tables (scripts/geo/build-geo.mjs): a ZIP's
 * centroid and state, or a place's centroid by name and state. Nothing here
 * uses a device location. Distances are straight-line miles; Matches rounds
 * what it shows.
 */
export type Point = { lat: number; lon: number; state: string };

/** Must match scripts/geo/place-key.mjs (the build uses that one; geo.test.ts checks they agree). */
const SUFFIX = /\s+(city and borough|consolidated government|metropolitan government|unified government|urban county|municipality|comunidad|zona urbana|plantation|borough|village|city|town|township|cdp|corporation)$/;
export function placeKey(name: string, strips = 3): string {
  let s = String(name).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[.'’]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < strips; i++) s = s.replace(SUFFIX, "").trim();
  s = s.replace(/\bsaint\b/g, "st").replace(/\bfort\b/g, "ft").replace(/\bmount\b/g, "mt").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

type Zcta = Record<string, [number, number, string]>;
/** null = a name several places share in that state: known, but never placed. */
type Places = Record<string, Record<string, [number, number] | null>>;
let tables: Promise<{ zcta: Zcta; places: Places }> | null = null;
/** Loaded on first use only (about 2 MB), so pages that never match don't pay for them. */
export function geoTables() {
  tables ??= Promise.all([import("@/data/geo/zcta.json"), import("@/data/geo/places.json")]).then(
    ([z, p]) => ({ zcta: (z.default ?? z) as unknown as Zcta, places: (p.default ?? p) as unknown as Places }),
    (err) => {
      tables = null; // a failed load is tried again next time, not remembered
      throw err;
    }
  );
  return tables;
}

const ZIP = /^(\d{5})(?:-\d{4})?$/;
const CITY_STATE = /^(.+?)[,\s]+([A-Za-z]{2})$/;

/**
 * A typed place: a ZIP ("80202"), "City, ST", or a city alone when its name
 * is unique in the US. null when it can't be placed for certain (unknown,
 * or a name several places share — never settled by guessing a state).
 */
export function resolveArea(text: string | null | undefined, t: { zcta: Zcta; places: Places }): Point | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const zip = ZIP.exec(s);
  if (zip) {
    const z = t.zcta[zip[1]];
    return z ? { lat: z[0], lon: z[1], state: z[2] } : null;
  }
  // The least-stripped form that names a place wins ("Goodyear Village" before "Goodyear").
  const keys = (text: string) => [...new Set([0, 1, 2, 3].map((n) => placeKey(text, n)))];
  const cs = CITY_STATE.exec(s);
  if (cs) {
    const st = cs[2].toUpperCase();
    for (const key of keys(cs[1])) {
      const hit = t.places[st]?.[key];
      if (hit === null) return null; // shared by several places there
      if (hit) return { lat: hit[0], lon: hit[1], state: st };
    }
  }
  for (const key of keys(s)) {
    // Every state where the name is taken counts, placed or not.
    const found = Object.entries(t.places).filter(([, ps]) => key in ps);
    if (found.length > 1) return null; // a name several states share: never guessed
    if (found.length === 1) {
      const [st, ps] = found[0];
      const hit = ps[key];
      return hit ? { lat: hit[0], lon: hit[1], state: st } : null;
    }
  }
  return null;
}

/** Great-circle distance in miles. */
export function milesBetween(a: Point, b: Point): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
