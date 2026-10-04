import type { Role } from "@/lib/auth";
import { can } from "@/lib/access";

/**
 * The Desk (C1.3): each organization role's home. Which parts a role sees
 * comes from the access map, so the Desk never shows a queue whose page
 * would refuse them. Built only from data that exists today.
 */
export interface DeskParts {
  /** Applications waiting, jobs short of headcount (hiring). */
  hiring: boolean;
  /** Shifts started without a check-in, closeouts waiting (field). */
  field: boolean;
  /** Today's field strip (owners and supervisors: full field access). */
  today: boolean;
  /** Scheduled shifts against headcount for the next 7 days (scheduling). */
  week: boolean;
  /** Pay lines to approve, open disputes (pay). */
  pay: boolean;
  /** Read-only live jobs and today's totals, for roles with none of the above. */
  readOnly: boolean;
}

export function deskParts(role: Role): DeskParts {
  const hiring = can(role, "hiring");
  const field = can(role, "field");
  const week = can(role, "scheduling");
  const pay = can(role, "pay");
  return { hiring, field, today: field, week, pay, readOnly: !hiring && !field && !week && !pay };
}

export interface JobHeadcount {
  id: string;
  title: string;
  /** null: the job sets no number of seats, so it's never short. */
  headcount: number | null;
  /** Engagements hired onto the job (ACCEPTED_STATUSES). */
  hired: number;
  startsAt: Date | null;
}

const when = (d: Date | null) => d?.getTime() ?? Number.POSITIVE_INFINITY;

/** Published jobs with fewer hires than seats, soonest start first (undated last). */
export function shortOfHeadcount(jobs: JobHeadcount[]): Array<JobHeadcount & { headcount: number; short: number }> {
  return jobs
    .filter((j): j is JobHeadcount & { headcount: number } => j.headcount !== null && j.hired < j.headcount)
    .map((j) => ({ ...j, short: j.headcount - j.hired }))
    .sort((a, b) => when(a.startsAt) - when(b.startsAt) || a.title.localeCompare(b.title));
}

export interface WeekShift {
  jobId: string;
  workerId: string;
  startsAt: Date;
}

export interface WeekRow {
  jobId: string;
  title: string;
  headcount: number | null;
  /** Distinct workers with a shift on the job in the window. */
  scheduled: number;
  shifts: number;
  /** Seats with nobody scheduled (never negative); null when the job sets no headcount. */
  gap: number | null;
}

/**
 * The week ahead: per job, how many different workers have a shift in the
 * next seven days against the job's headcount. Jobs with nothing scheduled
 * still appear, so a gap is visible.
 */
export function weekAhead(jobs: Array<{ id: string; title: string; headcount: number | null }>, shifts: WeekShift[], now: Date, days = 7): WeekRow[] {
  const end = now.getTime() + days * 86_400_000;
  const inWindow = shifts.filter((s) => s.startsAt.getTime() >= now.getTime() && s.startsAt.getTime() < end);
  return jobs
    .map((j) => {
      const mine = inWindow.filter((s) => s.jobId === j.id);
      const scheduled = new Set(mine.map((s) => s.workerId)).size;
      return { jobId: j.id, title: j.title, headcount: j.headcount, scheduled, shifts: mine.length, gap: j.headcount === null ? null : Math.max(0, j.headcount - scheduled) };
    })
    .sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1) || a.title.localeCompare(b.title));
}

/** Applications waiting, grouped by job, oldest waiting first within the list. */
export function applicationsByJob(apps: Array<{ jobId: string; title: string; appliedAt: Date }>): Array<{ jobId: string; title: string; count: number; oldest: Date }> {
  const by = new Map<string, { jobId: string; title: string; count: number; oldest: Date }>();
  for (const a of apps) {
    const g = by.get(a.jobId);
    if (!g) by.set(a.jobId, { jobId: a.jobId, title: a.title, count: 1, oldest: a.appliedAt });
    else {
      g.count++;
      if (a.appliedAt < g.oldest) g.oldest = a.appliedAt;
    }
  }
  return [...by.values()].sort((a, b) => a.oldest.getTime() - b.oldest.getTime());
}
