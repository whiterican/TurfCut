import { apiWorker, badId, resultResponse } from "@/lib/api-session";
import { workerShiftAction } from "@/lib/field-day-data";

/**
 * POST /api/shifts/:shiftId/check-in { lat?, lng? }
 * The position is compared with the staging point and discarded; only
 * "at staging: yes/no" and a distance band are stored.
 */
export async function POST(req: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const bad = badId(shiftId);
  if (bad) return bad;
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => ({}))) as { lat?: unknown; lng?: unknown };
  const device = typeof body.lat === "number" && typeof body.lng === "number" ? { lat: body.lat, lng: body.lng } : null;
  return resultResponse(await workerShiftAction({ workerId: auth.session.workerId, profileId: auth.session.userId }, shiftId, { kind: "check_in", device }));
}
