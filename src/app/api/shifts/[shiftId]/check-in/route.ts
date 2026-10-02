import { apiWorker, badId, resultResponse } from "@/lib/api-session";
import { workerShiftAction } from "@/lib/field-day-data";
import { readLocationCheck } from "@/lib/offline-sync";

/**
 * POST /api/shifts/:shiftId/check-in { location? }
 * `location` is the phone's own staging check — { checked: true, atStaging,
 * distance: "under 250 m" | "250 m – 1 km" | "over 1 km" } or { checked:
 * false } — made on the device (lib/offline-sync stagingCheck). The server
 * never takes a position: a request with coordinates is refused.
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
