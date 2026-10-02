import { db } from "@/lib/db";
import { apiEmployer, apiWorker, badId, engagementResponse } from "@/lib/api-session";
import { applyToJob } from "@/lib/engagements-data";

/** POST /api/jobs/:jobId/applications — the signed-in worker applies. */
export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const bad = badId(jobId);
  if (bad) return bad;
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  return engagementResponse(await applyToJob(auth.session.workerId, auth.session.userId, jobId));
}

/**
 * GET /api/jobs/:jobId/applications — the job's engagements, each with the
 * hiring snapshot frozen when it was created (owners and recruiters only).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const bad = badId(jobId);
  if (bad) return bad;
  const auth = await apiEmployer();
  if ("error" in auth) return auth.error;
  const job = await db().job.findFirst({ where: { id: jobId, orgId: auth.session.orgId }, select: { id: true } });
  if (!job) return Response.json({ error: "Job not found." }, { status: 404 });
  const engagements = await db().engagement.findMany({
    where: { jobId },
    select: { id: true, status: true, createdAt: true, applicationSnapshot: true, worker: { select: { id: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
  });
  return Response.json({ engagements });
}
