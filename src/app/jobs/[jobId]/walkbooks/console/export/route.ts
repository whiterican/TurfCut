import { NextResponse } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { canUse } from "@/lib/access";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { allow, check, retryAfter } from "@/lib/rate-limit";
import { exportCsv, parseConsoleQuery } from "@/lib/stop-console";
import { exportProblem, loadExportRows } from "@/lib/stop-console-data";

/**
 * Walkbook export (W3): the stops of a job, as CSV, narrowed by the same
 * filters as the console. It holds addresses, so it is for the people who run
 * the field (full access to that area, not view-only).
 *
 * Every attempt by a member of an organization is written to the audit log,
 * refusals included, with what was asked for and how many rows went out,
 * never their contents. Refusals are written at most 20 an hour per person,
 * so nobody can fill the log by hammering the URL; people with no
 * organization are refused without a row. Ten exports an hour per
 * organization, counted only for jobs the organization owns.
 *
 * A GET that writes state, so a request that comes from another site is
 * refused: a link elsewhere can't use up an organization's exports.
 */
export async function GET(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return new NextResponse("Open the export from Turfcut.", { status: 403 });
  const s = await getSessionProfile();
  if (!s) return new NextResponse("Sign in to export walkbooks.", { status: 401 });
  const { jobId } = await params;
  const job = jobId.toLowerCase();
  const q = parseConsoleQuery(Object.fromEntries(new URL(req.url).searchParams));
  const asked = { outcome: q.outcome, bookId: q.bookId, holderId: q.holderId };
  const audit = async (result: string, rows = 0, pollQuestions = 0) => {
    if (!s.orgId) return;
    if (result.startsWith("refused") && !(await allow("walkbook-export-denied", s.userId))) return;
    await db().auditEvent.create({ data: { actorId: s.userId, action: "walkbook.exported", entityType: "Job", entityId: UUID_RE.test(job) ? job : "invalid", metadata: { result, rows, pollQuestions, ...asked } } });
  };

  if (!s.orgId || !canUse(s, "field")) {
    await audit("refused: no access");
    return new NextResponse("Only people who run the field can export walkbooks.", { status: 403 });
  }
  if (!UUID_RE.test(job)) {
    await audit("refused: bad job id");
    return new NextResponse("Job not found.", { status: 404 });
  }
  // The cheap check first: a job that isn't this organization's costs it no export.
  if (!(await db().job.findFirst({ where: { id: job, orgId: s.orgId }, select: { id: true } }))) {
    await audit("refused: job not found");
    return new NextResponse("Job not found.", { status: 404 });
  }
  // Refusals that don't depend on the limit come before it, so they cost the organization no export: too many
  // stops, or a poll job narrowed to one worker (residents' answers are never broken down by worker, rule 5).
  const problem = await exportProblem(s.orgId, job, q, true);
  if (problem) {
    await audit(`refused: ${problem}`);
    return new NextResponse(problem, { status: problem === "Job not found." ? 404 : 400 });
  }
  const verdict = await check("walkbook-export", s.orgId);
  if (verdict !== "ok") {
    await audit(`refused: ${verdict}`);
    if (verdict === "unavailable") return new NextResponse("Exports are unavailable right now. Try again in a moment.", { status: 503, headers: { "Retry-After": "30" } });
    return new NextResponse("Too many exports. Try again later.", { status: 429, headers: { "Retry-After": String(await retryAfter("walkbook-export", s.orgId)) } });
  }
  // The export route already requires full access to the field area, which is who may read poll answers.
  const r = await loadExportRows(s.orgId, job, q, true);
  if (!r.ok) {
    await audit(`refused: ${r.reason}`);
    return new NextResponse(r.reason, { status: r.reason === "Job not found." ? 404 : 400 });
  }
  await audit("exported", r.rows.length, r.pollColumns.length);
  return new NextResponse(exportCsv(r.rows, r.pollColumns), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="turfcut-walkbooks-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
