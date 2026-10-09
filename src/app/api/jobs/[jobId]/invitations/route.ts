import { apiEmployer, badId, engagementResponse } from "@/lib/api-session";
import { inviteWorker } from "@/lib/engagements-data";

/**
 * POST /api/jobs/:jobId/invitations { workerId, note? } — approved
 * organizations invite a worker who has already engaged with one of their
 * jobs. The note (up to 500 characters) is shown to the worker; the
 * invitation lasts 7 days; at most 3 a week per worker (409 beyond that).
 */
export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const auth = await apiEmployer();
  if ("error" in auth) return auth.error;
  if (!auth.session.orgApproved) return Response.json({ error: "Your organization is awaiting approval." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { workerId?: unknown; note?: unknown } | null;
  if (typeof body?.workerId !== "string") return Response.json({ error: "Send { workerId }." }, { status: 400 });
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") return Response.json({ error: "note must be text." }, { status: 400 });
  const bad = badId(jobId, body.workerId);
  if (bad) return bad;
  return engagementResponse(await inviteWorker(auth.session.orgId, auth.session.userId, jobId, body.workerId, undefined, { note: typeof body.note === "string" ? body.note : undefined }));
}
