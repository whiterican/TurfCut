import { decodeCursor, page, parseLimit } from "@/lib/pagination";
import { failureResponse } from "@/lib/api-errors";
import { apiArea, apiWorker, badId } from "@/lib/api-session";
import { shiftState } from "@/lib/field-day";
import { facts, loadWorkerShifts, scheduleShift } from "@/lib/field-day-data";

/**
 * GET /api/shifts?limit=&cursor= — the signed-in worker's shifts across every
 * campaign, upcoming first. `limit` defaults to 100 (max 200); when there is
 * more, `nextCursor` is set: pass it back as `cursor` for the next page.
 */
export async function GET(req: Request) {
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  const q = new URL(req.url).searchParams;
  const limit = parseLimit(q.get("limit"));
  const after = decodeCursor(q.get("cursor"));
  if (after === null) return Response.json({ error: "That cursor isn't valid.", code: "invalid" }, { status: 400 });
  const { items: shifts, nextCursor } = page(await loadWorkerShifts(auth.session.workerId, new Date(), { limit: limit + 1, after }), limit, (s) => s.startsAt);
  return Response.json({
    nextCursor,
    shifts: shifts.map((s) => {
      const st = shiftState(facts(s));
      return {
        id: s.id,
        jobId: s.engagement.job.id,
        jobTitle: s.engagement.job.title,
        organization: s.engagement.job.org.name,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        status: s.status,
        stagingLocation: s.stagingLocation,
        checkedInAt: st.checkedInAt,
        checkedOutAt: st.checkedOutAt,
        review: st.closeout ? { status: st.closeout.status, reason: st.closeout.reason } : null,
      };
    }),
  });
}

/**
 * POST /api/shifts { engagementId, startsAt, endsAt (ISO), stagingLocation?,
 * stagingLat?, stagingLng?, supervisorId?, turfArea? (GeoJSON Polygon) }
 * Refused while the job's jurisdiction profile is frozen, or if the worker
 * already has an overlapping shift on any campaign.
 */
export async function POST(req: Request) {
  const auth = await apiArea("scheduling");
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || typeof body.engagementId !== "string") return Response.json({ error: "Send { engagementId, startsAt, endsAt, … }." }, { status: 400 });
  const bad = badId(body.engagementId);
  if (bad) return bad;
  const raw: Record<string, unknown> = { ...body, ...(body.turfArea && typeof body.turfArea === "object" ? { turfArea: JSON.stringify(body.turfArea) } : {}) };
  for (const k of ["stagingLat", "stagingLng"]) if (typeof raw[k] === "number") raw[k] = String(raw[k]);
  const r = await scheduleShift({ profileId: auth.session.userId, orgId: auth.session.orgId }, body.engagementId, raw);
  if (r.ok) return Response.json({ shiftId: r.shiftId }, { status: 201 });
  return failureResponse(r);
}
