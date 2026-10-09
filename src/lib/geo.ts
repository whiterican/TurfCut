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
export function placeKey(name: string): string {
  let s = String(name).toLowerCase().replace(/\(.*?\)/g, " ").replace(/[.'’]/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) s = s.replace(SUFFIX, "").trim();
  s = s.replace(/\bsaint\b/g, "st").replace(/\bfort\b/g, "ft").replace(/\bmount\b/g, "mt").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

type Zcta = Record<string, [number, number, string]>;
type Places = Record<string, Record<string, [number, number]>>;
let tables: Promise<{ zcta: Zcta; places: Places }> | null = null;
/** Loaded on first use only (about 2 MB), so pages that never match don't pay for them. */
export function geoTables() {
  tables ??= Promise.all([import("@/data/geo/zcta.json"), import("@/data/geo/places.json")]).then(([z, p]) => ({
    zcta: (z.default ?? z) as unknown as Zcta,
    places: (p.default ?? p) as unknown as Places,
  }));
  return tables;
}

const ZIP = /^(\d{5})(?:-\d{4})?$/;
const CITY_STATE = /^(.+?)[,\s]+([A-Za-z]{2})$/;

/**
 * A typed home area: a ZIP ("80202"), "City, ST", or a city alone when its
 * name is unique in the US or in `stateHint`. null when it can't be placed
 * (unknown or ambiguous): such a worker isn't matched, never guessed.
 */
export function resolveArea(text: string | null | undefined, t: { zcta: Zcta; places: Places }, stateHint?: string): Point | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const zip = ZIP.exec(s);
  if (zip) {
    const z = t.zcta[zip[1]];
    return z ? { lat: z[0], lon: z[1], state: z[2] } : null;
  }
  const cs = CITY_STATE.exec(s);
  if (cs) {
    const st = cs[2].toUpperCase();
    const hit = t.places[st]?.[placeKey(cs[1])];
    if (hit) return { lat: hit[0], lon: hit[1], state: st };
  }
  const key = placeKey(s);
  if (stateHint && t.places[stateHint]?.[key]) {
    const h = t.places[stateHint][key];
    return { lat: h[0], lon: h[1], state: stateHint };
  }
  const found = Object.entries(t.places).filter(([, ps]) => ps[key]);
  if (found.length !== 1) return null;
  const [st, ps] = found[0];
  return { lat: ps[key][0], lon: ps[key][1], state: st };
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
