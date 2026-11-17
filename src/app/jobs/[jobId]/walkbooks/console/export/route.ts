import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { canUse } from "@/lib/access";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { check, retryAfter } from "@/lib/rate-limit";
import { exportCsv, parseConsoleQuery } from "@/lib/stop-console";
import { loadExportRows } from "@/lib/stop-console-data";

/**
 * Walkbook export (W3): the stops of a job, as CSV, narrowed by the same
 * filters as the console. It holds addresses, so it is for the people who run
 * the field (full access to that area, not view-only). Every attempt is
 * written to the audit log, refusals included, with what was asked for and how
 * many rows went out, never their contents. Ten an hour per organization.
 */
export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const s = await getSessionProfile();
  if (!s) return new NextResponse("Sign in to export walkbooks.", { status: 401 });
  const { jobId } = await params;
  const job = jobId.toLowerCase();
  const q = parseConsoleQuery(Object.fromEntries(new URL(req.url).searchParams));
  const asked = { outcome: q.outcome, bookId: q.bookId, holderId: q.holderId };
  const audit = (result: string, rows = 0) =>
    db().auditEvent.create({ data: { actorId: s.userId, action: "walkbook.exported", entityType: "Job", entityId: UUID_RE.test(job) ? job : "invalid", metadata: { result, rows, ...asked } } });

  if (!s.orgId || !canUse(s, "field")) {
    await audit("refused: no access");
    return new NextResponse("Only people who run the field can export walkbooks.", { status: 403 });
  }
  if (!UUID_RE.test(job)) return new NextResponse("Job not found.", { status: 404 });
  const verdict = await check("walkbook-export", s.orgId);
  if (verdict !== "ok") {
    await audit(`refused: ${verdict}`);
    if (verdict === "unavailable") return new NextResponse("Exports are unavailable right now. Try again in a moment.", { status: 503 });
    return new NextResponse("Too many exports. Try again later.", { status: 429, headers: { "Retry-After": String(await retryAfter("walkbook-export", s.orgId)) } });
  }
  const r = await loadExportRows(s.orgId, job, q);
  if (!r.ok) {
    await audit(`refused: ${r.reason}`);
    return new NextResponse(r.reason, { status: r.reason === "Job not found." ? 404 : 400 });
  }
  await audit("exported", r.rows.length);
  return new NextResponse(exportCsv(r.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="turfcut-walkbooks-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
