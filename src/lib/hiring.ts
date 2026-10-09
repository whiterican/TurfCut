import { inviteLapsed, type EngagementStatus } from "@/lib/engagements";

/**
 * The hiring pipeline (C1.4): per open job, how many people sit at each
 * stage, from today's engagement statuses. No scores and no worker metrics
 * here: sorting people by numbers before they choose what to share would
 * undo C2's sharing settings.
 */
export interface PipelineRow {
  jobId: string;
  title: string;
  status: "PUBLISHED" | "PAUSED";
  headcount: number | null;
  applied: number;
  /** Offers waiting on the worker (C3). */
  offered: number;
  invited: number;
  /** Hired and not finished: CLAIMED or ACTIVE. */
  engaged: number;
  completed: number;
}

const STAGE: Partial<Record<EngagementStatus, keyof Pick<PipelineRow, "applied" | "offered" | "invited" | "engaged" | "completed">>> = {
  APPLIED: "applied",
  OFFERED: "offered",
  INVITED: "invited",
  CLAIMED: "engaged",
  ACTIVE: "engaged",
  COMPLETED: "completed",
  // CANCELLED, DECLINED and WITHDRAWN count nowhere.
};

export function pipeline(
  jobs: Array<{ id: string; title: string; status: "PUBLISHED" | "PAUSED"; headcount: number | null; startsAt: Date | null }>,
  engagements: Array<{ jobId: string; status: EngagementStatus; inviteExpiresAt?: Date | null }>,
  now = new Date()
): PipelineRow[] {
  const rows = new Map<string, PipelineRow>(
    jobs.map((j) => [j.id, { jobId: j.id, title: j.title, status: j.status, headcount: j.headcount, applied: 0, offered: 0, invited: 0, engaged: 0, completed: 0 }])
  );
  for (const e of engagements) {
    const row = rows.get(e.jobId);
    // A lapsed invitation is waiting on nobody: it counts nowhere (C3.3).
    const stage = inviteLapsed(e.status, e.inviteExpiresAt ?? null, now) ? undefined : STAGE[e.status];
    if (row && stage) row[stage]++;
  }
  // Waiting applications first, then soonest start.
  const start = new Map(jobs.map((j) => [j.id, j.startsAt?.getTime() ?? Number.POSITIVE_INFINITY]));
  return [...rows.values()].sort((a, b) => b.applied - a.applied || start.get(a.jobId)! - start.get(b.jobId)! || a.title.localeCompare(b.title));
}
