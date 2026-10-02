import { apiEmployer, badId } from "@/lib/api-session";
import { publishJob } from "@/lib/jobs-data";

/** POST /api/jobs/:jobId/publish — runs the publish gate; 422 with every blocking reason if it fails. */
export async function POST(_req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const bad = badId(jobId);
  if (bad) return bad;
  const auth = await apiEmployer();
  if ("error" in auth) return auth.error;
  const r = await publishJob(jobId, auth.session.orgId, auth.session.userId);
  if (r.ok) return Response.json({ status: "PUBLISHED" });
  const notFound = r.reasons.length === 1 && r.reasons[0] === "Job not found.";
  return Response.json({ error: "This job can't publish.", reasons: r.reasons }, { status: notFound ? 404 : 422 });
}
