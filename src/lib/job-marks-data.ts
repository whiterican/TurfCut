import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import type { Mark, Marks } from "@/lib/job-marks";

/**
 * P1.6: saving and hiding jobs, for the worker's own feed only. Rows are
 * never deleted: a mark ends with removedAt and a new one starts the next
 * time. Nothing here is read by matching, ranking or the scorecards, and no
 * organization ever sees it (job-marks-isolation.test.ts).
 */

/** The worker's open marks, as sets of job ids. */
export async function loadMarks(workerId: string): Promise<Marks> {
  const [saved, hidden] = await Promise.all([
    db().savedJob.findMany({ where: { workerId, removedAt: null }, select: { jobId: true } }),
    db().dismissedJob.findMany({ where: { workerId, removedAt: null }, select: { jobId: true } }),
  ]);
  return { saved: new Set(saved.map((r) => r.jobId)), hidden: new Set(hidden.map((r) => r.jobId)) };
}

/**
 * Applies a mark. Saving or hiding needs a published job; the opposite mark
 * of the same kind is a no-op (saving a saved job stays saved). Hiding a
 * saved job keeps the save: unhiding brings it back as saved.
 */
export async function markJob(workerId: string, jobId: string, mark: Mark, now = new Date()): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!UUID_RE.test(jobId)) return { ok: false, reason: "Job not found." };
  const p = db();
  const saving = mark === "save" || mark === "unsave";
  const where = { workerId, jobId, removedAt: null };
  if (mark === "save" || mark === "hide") {
    const job = await p.job.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job || job.status !== "PUBLISHED") return { ok: false, reason: "That job isn't open." };
    const open = saving ? await p.savedJob.findFirst({ where, select: { id: true } }) : await p.dismissedJob.findFirst({ where, select: { id: true } });
    if (open) return { ok: true };
    try {
      if (saving) await p.savedJob.create({ data: { workerId, jobId, createdAt: now } });
      else await p.dismissedJob.create({ data: { workerId, jobId, createdAt: now } });
    } catch (e) {
      // Two taps at once: the partial unique index keeps one open row; the other tap is already done.
      if (!(e instanceof Error && /unique/i.test(e.message))) throw e;
    }
    return { ok: true };
  }
  if (saving) await p.savedJob.updateMany({ where, data: { removedAt: now } });
  else await p.dismissedJob.updateMany({ where, data: { removedAt: now } });
  return { ok: true };
}
