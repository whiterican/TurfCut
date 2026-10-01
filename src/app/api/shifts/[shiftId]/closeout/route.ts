import { FIELD_ROLES } from "@/lib/access";
import { apiOrgRole, badId, resultResponse } from "@/lib/api-session";
import { supervisorShiftAction } from "@/lib/field-day-data";

/**
 * POST /api/shifts/:shiftId/closeout { status: "APPROVED" | "REJECTED", reason? }
 * Appends a review; a later review supersedes an earlier one. A shift that
 * isn't approved needs a reason, which the worker sees.
 */
export async function POST(req: Request, { params }: { params: Promise<{ shiftId: string }> }) {
  const { shiftId } = await params;
  const bad = badId(shiftId);
  if (bad) return bad;
  const auth = await apiOrgRole(FIELD_ROLES);
  if ("error" in auth) return auth.error;
  const b = (await req.json().catch(() => null)) as { status?: unknown; reason?: unknown } | null;
  if (b?.status !== "APPROVED" && b?.status !== "REJECTED") return Response.json({ error: "status must be APPROVED or REJECTED." }, { status: 400 });
  return resultResponse(
    await supervisorShiftAction({ profileId: auth.session.userId, orgId: auth.session.orgId }, shiftId, {
      kind: "closeout",
      status: b.status,
      reason: typeof b.reason === "string" ? b.reason : null,
    })
  );
}
