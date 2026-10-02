import { SCHEDULING_ROLES } from "@/lib/access";
import { apiOrgRole, apiWorker, badId } from "@/lib/api-session";
import { shiftState } from "@/lib/field-day";
import { facts, loadWorkerShifts, scheduleShift } from "@/lib/field-day-data";

/** GET /api/shifts — the signed-in worker's shifts across every campaign. */
export async function GET() {
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  const shifts = await loadWorkerShifts(auth.session.workerId);
  return Response.json({
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
  const auth = await apiOrgRole(SCHEDULING_ROLES);
  if ("error" in auth) return auth.error;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || typeof body.engagementId !== "string") return Response.json({ error: "Send { engagementId, startsAt, endsAt, … }." }, { status: 400 });
  const bad = badId(body.engagementId);
  if (bad) return bad;
  const raw: Record<string, unknown> = { ...body, ...(body.turfArea && typeof body.turfArea === "object" ? { turfArea: JSON.stringify(body.turfArea) } : {}) };
  for (const k of ["stagingLat", "stagingLng"]) if (typeof raw[k] === "number") raw[k] = String(raw[k]);
  const r = await scheduleShift({ profileId: auth.session.userId, orgId: auth.session.orgId }, body.engagementId, raw);
  if (r.ok) return Response.json({ shiftId: r.shiftId }, { status: 201 });
  return Response.json({ error: r.reason, errors: r.errors }, { status: r.errors ? 400 : /not found/i.test(r.reason) ? 404 : 409 });
}
