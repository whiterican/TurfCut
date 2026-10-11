/**
 * How a job's day starts (C4.2). Staged: workers report to one of the job's
 * staging points, and check-in compares the phone's position with that
 * point (yes/no within the point's radius; the position is dropped). Self-
 * launch: workers start from wherever they are, and check-in records no
 * location at all. Stored on Job.launch as JSON, read tolerantly, never
 * invented: a job without it is staged with no points, as before C4
 * (staging set per shift).
 */

export const LAUNCH_MODES = [
  { value: "STAGED", label: "Staged launch", hint: "Workers meet at a staging point you set; check-in compares their phone's position with it once." },
  { value: "SELF", label: "Self-launch", hint: "Workers start from wherever they are. Check-in records the time only, never a location." },
] as const;
export type LaunchMode = (typeof LAUNCH_MODES)[number]["value"];

export interface StagingPoint {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  /** Check-in counts as "at staging" within this many metres. */
  radiusM: number;
}

export interface JobLaunch {
  mode: LaunchMode;
  points: StagingPoint[];
}

export const DEFAULT_RADIUS_M = 250;
export const MIN_RADIUS_M = 50;
export const MAX_RADIUS_M = 2000;
export const MAX_POINTS = 10;
export const DEFAULT_LAUNCH: JobLaunch = { mode: "STAGED", points: [] };

const isLatLng = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Job.launch as stored, or the default for a job without it. Malformed points are left out, never guessed. */
export function readLaunch(v: unknown): JobLaunch {
  if (!v || typeof v !== "object" || Array.isArray(v)) return DEFAULT_LAUNCH;
  const o = v as Record<string, unknown>;
  const mode: LaunchMode = o.mode === "SELF" ? "SELF" : "STAGED";
  const points: StagingPoint[] = [];
  if (Array.isArray(o.points)) {
    for (const p of o.points) {
      if (!p || typeof p !== "object") continue;
      const q = p as Record<string, unknown>;
      if (typeof q.id !== "string" || typeof q.name !== "string" || !isLatLng(q.lat, q.lng)) continue;
      const radius = typeof q.radiusM === "number" && Number.isFinite(q.radiusM) ? Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(q.radiusM))) : DEFAULT_RADIUS_M;
      points.push({ id: q.id, name: q.name, address: typeof q.address === "string" && q.address ? q.address : null, lat: q.lat, lng: q.lng as number, radiusM: radius });
      if (points.length === MAX_POINTS) break;
    }
  }
  return { mode, points: mode === "SELF" ? [] : points };
}

export type LaunchErrors = Record<string, string>;

/** Whether a submission says anything about the launch at all (API callers from before C4 don't). */
export const hasLaunchFields = (raw: Record<string, unknown>) => "launchMode" in raw || Object.keys(raw).some((k) => k.startsWith("point_"));

/**
 * The builder's launch fields: `launchMode`, then `point_<i>_name`,
 * `_address`, `_lat`, `_lng`, `_radius` and `_id` for i from 0. Points with
 * every field blank are skipped (an empty row in the editor). Without a
 * launchMode the job is staged with no points (API callers from before
 * C4). Errors are keyed `points` or `point_<i>_<field>`.
 */
export function validateLaunch(raw: Record<string, unknown>): { ok: true; value: JobLaunch } | { ok: false; errors: LaunchErrors } {
  const errors: LaunchErrors = {};
  const t = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string).trim().replace(/\s+/g, " ") : "");
  const modeRaw = t("launchMode");
  if (modeRaw && !LAUNCH_MODES.some((m) => m.value === modeRaw)) errors.launchMode = "Pick staged or self-launch.";
  const mode: LaunchMode = modeRaw === "SELF" ? "SELF" : "STAGED";
  const points: StagingPoint[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const keys = ["name", "address", "lat", "lng", "radius", "id"].map((f) => `point_${i}_${f}`);
    if (!keys.some((k) => k in raw)) break;
    const [name, address, latS, lngS, radiusS, idS] = keys.map(t);
    if (!name && !address && !latS && !lngS) continue;
    if (points.length === MAX_POINTS) {
      errors.points = `Up to ${MAX_POINTS} staging points.`;
      break;
    }
    if (!name) errors[`point_${i}_name`] = "Name the staging point, e.g. \"Library steps\".";
    else if (name.length > 80) errors[`point_${i}_name`] = "Keep the name under 80 characters.";
    if (address.length > 200) errors[`point_${i}_address`] = "Keep the address under 200 characters.";
    const [lat, lng] = [Number(latS), Number(lngS)];
    if (!latS || !lngS || !isLatLng(lat, lng)) errors[`point_${i}_lat`] = "Pick the point on the map.";
    const radius = radiusS ? Number(radiusS) : DEFAULT_RADIUS_M;
    if (!/^\d*$/.test(radiusS) || radius < MIN_RADIUS_M || radius > MAX_RADIUS_M) errors[`point_${i}_radius`] = `Check-in radius: ${MIN_RADIUS_M}–${MAX_RADIUS_M} metres.`;
    const id = /^[0-9a-f-]{8,36}$/i.test(idS) ? idS : `p${i}-${Math.abs(Math.round((lat || 0) * 1e6) ^ Math.round((lng || 0) * 1e6)).toString(36)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!errors[`point_${i}_name`] && !errors[`point_${i}_lat`] && !errors[`point_${i}_radius`]) {
      points.push({ id, name, address: address || null, lat: round6(lat), lng: round6(lng), radiusM: radius });
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { mode, points: mode === "SELF" ? [] : points } };
}

/** The builder's defaults for a stored launch (the reverse of validateLaunch). */
export function launchToForm(launch: JobLaunch): Record<string, string> {
  const out: Record<string, string> = { launchMode: launch.mode };
  launch.points.forEach((p, i) => {
    out[`point_${i}_id`] = p.id;
    out[`point_${i}_name`] = p.name;
    out[`point_${i}_address`] = p.address ?? "";
    out[`point_${i}_lat`] = p.lat.toFixed(6);
    out[`point_${i}_lng`] = p.lng.toFixed(6);
    out[`point_${i}_radius`] = String(p.radiusM);
  });
  return out;
}

/** The job's staging point a shift was scheduled at (same place to a metre), or null when it isn't one of them. */
export function pointAt(launch: JobLaunch, staging: { lat: number | null; lng: number | null }): StagingPoint | null {
  if (staging.lat === null || staging.lng === null) return null;
  return launch.points.find((p) => Math.abs(p.lat - staging.lat!) < 1e-5 && Math.abs(p.lng - staging.lng!) < 1e-5) ?? null;
}

/** The check-in radius for a shift's staging point: the job's point's own, else the default. */
export function radiusFor(launch: JobLaunch, staging: { lat: number | null; lng: number | null }): number {
  return pointAt(launch, staging)?.radiusM ?? DEFAULT_RADIUS_M;
}

/** Why a job can't publish as launched, or null. */
export function launchBlocker(launch: JobLaunch): string | null {
  if (launch.mode === "STAGED" && launch.points.length === 0) return "Add at least one staging point, or switch the job to self-launch.";
  return null;
}
