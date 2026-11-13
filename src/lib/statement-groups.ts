/*
 * A statement's lines, gathered under their jobs (follow-up to #136): an owner reconciles a month job by job, and
 * the lines used to be listed only in the order they were recorded. No server imports: the view and its tests use this.
 */

export interface GroupableLine {
  jobId: string | null;
}
export interface JobTotal {
  jobId: string | null;
  title: string;
  grossCents: number;
  feeCents: number;
  lineCount: number;
}
export interface JobGroup<L> extends JobTotal {
  /** Where the "By campaign" row for this job jumps to. */
  anchor: string;
  /** The job's lines, in the order they were recorded. A line withdrawn in the month is listed too, though the totals leave it out. */
  lines: L[];
}

/** The page anchor of a job's lines: its id, or "other" for pay that belongs to no job. */
export const jobAnchor = (jobId: string | null) => `lines-${jobId ?? "other"}`;

/**
 * The lines under their jobs, in the order of the statement's own per-job totals (largest first), each carrying that
 * total. The totals are the statement's, never re-added here: one sum, in one place. A job whose every line was
 * withdrawn in the month has no total of its own; it comes last, with zeros, so no line goes unlisted.
 */
export function groupLinesByJob<L extends GroupableLine>(lines: L[], totals: JobTotal[], titleOf: (line: L) => string): JobGroup<L>[] {
  const byJob = new Map<string, L[]>();
  for (const l of lines) {
    const key = l.jobId ?? "";
    const list = byJob.get(key);
    if (list) list.push(l);
    else byJob.set(key, [l]);
  }
  const groups: JobGroup<L>[] = [];
  for (const t of totals) {
    const key = t.jobId ?? "";
    const own = byJob.get(key);
    if (!own) continue;
    groups.push({ ...t, anchor: jobAnchor(t.jobId), lines: own });
    byJob.delete(key);
  }
  for (const [key, own] of byJob) groups.push({ jobId: key || null, title: titleOf(own[0]), grossCents: 0, feeCents: 0, lineCount: 0, anchor: jobAnchor(key || null), lines: own });
  return groups;
}
