import type { Role } from "@/lib/auth";
import { can, type AccessSubject } from "@/lib/access";

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

export function deskParts(member: Role | AccessSubject): DeskParts {
  const hiring = can(member, "hiring");
  const field = can(member, "field");
  const week = can(member, "scheduling");
  const pay = can(member, "pay");
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
  endsAt: Date;
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
  // A shift already under way still counts: its worker is scheduled this week.
  const inWindow = shifts.filter((s) => s.endsAt.getTime() > now.getTime() && s.startsAt.getTime() < end);
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

/**
 * "Needs you" order, most urgent first: what is going wrong right now (a
 * worker late to check in, a dispute past its deadline), then what has a
 * deadline today or blocks pay, then what is waiting on a person, then gaps
 * to fill. Within a kind, rows keep their own order (oldest or soonest first).
 */
export const URGENCY = { paused: -1, late: 0, noCheckout: 1, overdue: 2, review: 3, dueToday: 4, payApprove: 5, applications: 6, dispute: 7, short: 8, setup: 9 } as const;

/**
 * Shifts still checked in after their end ("No check-out received", redesign
 * §5 Desk): who may see what. Full field access sees each worker and time;
 * read access to the field (recruiters) and the read-only Desk (compliance,
 * publisher) see a count; everyone else (finance) nothing. The loader never
 * selects names for a count.
 */
export function noCheckoutVisibility(member: Role | AccessSubject): "names" | "count" | null {
  if (can(member, "field")) return "names";
  if (can(member, "field", "read") || deskParts(member).readOnly) return "count";
  return null;
}

/** Rows most urgent first; a stable sort, so each kind keeps its own order. */
export function byUrgency<T extends { rank: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.rank - b.rank);
}

/** An open-seats row's time: the job's start, said as past or future. */
export const seatsWhenLabel = (startsAt: Date, now: Date) => (startsAt > now ? "Starts" : "Started");

/** The organization's publish-gate records, as the Desk reads them. */
export interface OrgGate {
  approved: boolean;
  approvedAt: Date | null;
  contractorTermsSignedAt: Date | null;
  classificationReviewedAt: Date | null;
}

export interface SetupStep {
  key: "setup-approval" | "setup-terms" | "setup-review" | "setup-first-job";
  title: string;
  sub: string;
  tag: string;
  state: "pending" | "blocked";
  href: string;
  action: string;
}

/**
 * What still stands between the organization and its first published job,
 * from the same records the publish gate checks (org settings). Each step goes
 * only to a role that can act on it or read where it is explained, so a new
 * organization's Desk never says "nothing needs you" while nothing can
 * publish. A withdrawn approval is one of these steps too; setupRank ranks it first. `jobs`: how many jobs the organization has in any status.
 */
export function setupSteps(org: OrgGate, jobs: number, member: Role | AccessSubject): SetupStep[] {
  const steps: SetupStep[] = [];
  const settings = can(member, "orgSettings", "read");
  if (!org.approved && settings) {
    steps.push(
      org.approvedAt
        ? { key: "setup-approval", title: "Turfcut withdrew the approval", sub: "Publishing and hiring are paused until it is restored", tag: "Paused", state: "blocked", href: "/org/settings", action: "See why" }
        : { key: "setup-approval", title: "Waiting for Turfcut approval", sub: "Turfcut reviews every organization by hand during the pilot", tag: "Waiting", state: "pending", href: "/org/settings", action: "See what's left" },
    );
  }
  // Someone who publishes jobs but can't clear a step is told why nothing publishes, with a link only to a page
  // they can read: the settings page that lists the gate, else their jobs (each job page lists its blockers).
  const publishes = can(member, "jobsEdit");
  const why = settings
    ? { href: "/org/settings", action: "See what's left" }
    : can(member, "jobs", "read")
      ? { href: "/jobs", action: "Your jobs" }
      : null;
  const blocked = (key: SetupStep["key"], title: string, sub: string): SetupStep | null =>
    publishes && why ? { key, title, sub, tag: "Blocked", state: "blocked", ...why } : null;
  const push = (st: SetupStep | null) => st && steps.push(st);
  if (!org.contractorTermsSignedAt) {
    push(
      can(member, "orgSettings")
        ? { key: "setup-terms", title: "Sign the contractor terms", sub: "Needed before any job can publish", tag: "To do", state: "pending", href: "/org/settings", action: "Open settings" }
        : blocked("setup-terms", "Jobs can't publish yet: contractor terms not signed", "An owner signs them in organization settings"),
    );
  }
  if (!org.classificationReviewedAt) {
    push(
      can(member, "compliance") && settings
        ? { key: "setup-review", title: "Record the worker-classification review", sub: "Needed before any job can publish", tag: "To do", state: "pending", href: "/org/settings", action: "Open settings" }
        : blocked("setup-review", "Jobs can't publish yet: classification review not recorded", "An owner or compliance lead records it in organization settings"),
    );
  }
  if (jobs === 0 && publishes) steps.push({ key: "setup-first-job", title: "Post your first job", sub: "Start a draft. You can publish it after the checks pass.", tag: "To do", state: "pending", href: "/jobs/new", action: "Start a job" });
  return steps;
}

/** Where a setup step sorts: a withdrawn approval pauses live work, so it comes first; the rest wait behind live work. */
export function setupRank(step: SetupStep): number {
  return step.key === "setup-approval" && step.state === "blocked" ? URGENCY.paused : URGENCY.setup;
}
