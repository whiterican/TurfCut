"use server";

import { canUse } from "@/lib/access";
import { getSessionProfile } from "@/lib/auth";
import { geoTables, resolveArea } from "@/lib/geo";

/**
 * Where a job's typed city is, for the staging-point map (C4.2): the bundled
 * Census place centroid, the same tables Matches uses. Nothing is sent
 * anywhere; null when the place can't be placed for certain (unknown, or a
 * name several places in that state share).
 * A convenience, so it fails soft: no session or no job-editing access gives
 * null rather than a redirect, which would navigate away from unsaved edits.
 */
export async function placeOfCity(city: string, state: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const session = await getSessionProfile().catch(() => null);
  if (!session?.orgId || !canUse(session, "jobsEdit")) return null;
  const c = typeof city === "string" ? city.trim().replace(/\s+/g, " ") : "";
  const st = typeof state === "string" ? state.trim().toUpperCase() : "";
  if (!c || c.length > 80 || !/^[A-Z]{2}$/.test(st)) return null;
  const p = resolveArea(`${c}, ${st}`, await geoTables());
  return p && p.state === st ? { lat: p.lat, lng: p.lon, label: `${c}, ${st}` } : null;
}
