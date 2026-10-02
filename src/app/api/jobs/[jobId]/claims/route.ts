import { apiWorker, badId, engagementResponse } from "@/lib/api-session";
import { claimJob } from "@/lib/engagements-data";

/** POST /api/jobs/:jobId/claims — instant claim; 409 once every spot is taken. */
export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const bad = badId(jobId);
  if (bad) return bad;
  const auth = await apiWorker();
  if ("error" in auth) return auth.error;
  return engagementResponse(await claimJob(auth.session.workerId, auth.session.userId, jobId));
}
