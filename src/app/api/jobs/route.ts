import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSessionProfile } from "@/lib/auth";
import { ORG_ROLES } from "@/lib/access";
import { apiEmployer } from "@/lib/api-session";
import { parseFeedFilters, validateJob } from "@/lib/jobs";
import { createJob, loadFeed } from "@/lib/jobs-data";

/**
 * GET /api/jobs
 * - Workers: published jobs (filters: type, minRate, startsBefore, noCredentials),
 *   plus `hidden` — jobs their own do-not-match answers exclude, with reasons.
 * - Organization members: their organization's jobs, any status.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionProfile();
  if (!session) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (session.role === "WORKER" && session.workerId) {
    const { jobs, hidden } = await loadFeed(session.workerId, parseFeedFilters(req.nextUrl.searchParams));
    // Jurisdiction rules stay server-side; the job card already folds them in.
    return Response.json({ jobs: jobs.map((j) => ({ ...j, jurisdiction: undefined })), hidden });
  }
  if (ORG_ROLES.includes(session.role) && session.orgId) {
    const jobs = await db().job.findMany({ where: { orgId: session.orgId }, orderBy: { createdAt: "desc" } });
    return Response.json({ jobs });
  }
  return Response.json({ error: "No worker profile or organization on this account." }, { status: 403 });
}

/** POST /api/jobs — creates a DRAFT from the job-builder fields (JSON). Publishing is separate. */
export async function POST(req: NextRequest) {
  const auth = await apiEmployer();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Send the job as a JSON object." }, { status: 400 });
  }
  const v = validateJob(body as Record<string, unknown>);
  if (!v.ok) return Response.json({ error: "Invalid job.", errors: v.errors }, { status: 400 });
  const jurisdiction = await db().jurisdictionProfile.findUnique({ where: { id: v.value.jurisdictionId }, select: { id: true } });
  if (!jurisdiction) return Response.json({ error: "Invalid job.", errors: { jurisdictionId: "That jurisdiction doesn't exist." } }, { status: 400 });
  const job = await createJob(auth.session.orgId, auth.session.userId, v.value);
  return Response.json({ job }, { status: 201 });
}
