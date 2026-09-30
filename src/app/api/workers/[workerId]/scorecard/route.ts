import type { NextRequest } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { workerAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { loadScorecard } from "@/lib/scorecard-data";

/**
 * GET /api/workers/:workerId/scorecard
 * Scorecard derived from work_events. Each metric carries its formula,
 * numerator, denominator and evidence. There is no overall score.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  const { workerId } = await params;

  const session = await getSessionProfile();
  if (!session) {
    return Response.json({ error: "Sign in required." }, { status: 401 });
  }

  const org = session.orgId
    ? await db().organization.findUnique({
        where: { id: session.orgId },
        select: { approved: true },
      })
    : null;
  const access = workerAccess(session, workerId, org?.approved ?? false);
  if (access.kind === "denied") {
    return Response.json({ error: access.reason }, { status: 403 });
  }

  const worker = await db().worker.findUnique({
    where: { id: workerId },
    select: { id: true },
  });
  if (!worker) {
    return Response.json({ error: "Worker not found." }, { status: 404 });
  }

  const scorecard = await loadScorecard(workerId);
  return Response.json({ workerId, ...scorecard });
}
