import { db } from "@/lib/db";
import { apiEmployer, badId, engagementResponse } from "@/lib/api-session";
import { inviteWorker } from "@/lib/engagements-data";

/** POST /api/jobs/:jobId/invitations { workerId } — approved organizations invite a worker. */
export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const auth = await apiEmployer();
  if ("error" in auth) return auth.error;
  if (!auth.session.orgApproved) return Response.json({ error: "Your organization is awaiting approval." }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { workerId?: unknown } | null;
  if (typeof body?.workerId !== "string") return Response.json({ error: "Send { workerId }." }, { status: 400 });
  const bad = badId(jobId, body.workerId);
  if (bad) return bad;
  const worker = await db().worker.findUnique({ where: { id: body.workerId }, select: { id: true } });
  if (!worker) return Response.json({ error: "Worker not found." }, { status: 404 });
  return engagementResponse(await inviteWorker(auth.session.orgId, auth.session.userId, jobId, worker.id));
}
