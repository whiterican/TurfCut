import { apiWorker, badId, resultResponse } from "@/lib/api-session";
import { workerShiftAction } from "@/lib/field-day-data";
import { readLocationCheck } from "@/lib/offline-sync";

/**
 * POST /api/shifts/:shiftId/check-in { location? }
 * `location` is the phone's own staging check — { checked: true, atStaging,
 * distance: "under R m" | "R m – 1 km" | "over R m" | "over 1 km", R the
 * shift's staging radius (C4.2) } or { checked: false } — made on the device
 * (lib/offline-sync stagingCheck). The server never takes a position: a
 * request with coordinates is refused, and a band naming another radius is.
 */
export async function POST(req: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const bad = badId(shiftId);
  if (bad) return bad;
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as { lat?: unknown; lng?: unknown; location?: unknown };
  if (body.lat !== undefined || body.lng !== undefined) {
    return Response.json({ error: "Turfcut doesn't take positions. Compare with the staging point on the device and send { location }." }, { status: 400 });
  }
  const location = body.location === undefined ? { checked: false as const } : readLocationCheck(body.location);
  if (!location) return Response.json({ error: "location must be { checked: false } or { checked: true, atStaging, distance }." }, { status: 400 });
  return resultResponse(await workerShiftAction({ workerId: auth.session.workerId, profileId: auth.session.userId }, shiftId, { kind: "check_in", location }));
}
