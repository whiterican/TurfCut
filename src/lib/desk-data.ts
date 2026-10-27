import { db } from "@/lib/db";
import type { Role } from "@/lib/auth";
import type { Grants } from "@/lib/access";
import { ACCEPTED_STATUSES } from "@/lib/engagements";
import { loadOps } from "@/lib/field-day-data";
import { loadOrgPay } from "@/lib/pay-data";
import { disputeCounts, noteOverdueDisputes } from "@/lib/dispute-thread-data";
import { openJobsEndAfter } from "@/lib/jobs";
import { money } from "@/lib/pay";
import { applicationsByJob, deskParts, shortOfHeadcount, weekAhead, type DeskParts, type WeekRow } from "@/lib/desk";

/** One row in "Needs you": what, what it's about, since when, and the next step with where to take it. */
export interface DeskItem {
  key: string;
  title: string;
  sub: string;
  tag: string;
  badge: "badge-coral" | "badge-butter" | "badge-sky" | "badge-neutral" | "badge-accent";
  href: string;
  /** The next step, as the link's words ("Open shift"). */
  action: string;
  /** The time the item rests on, from the record itself (never estimated). */
  when?: { label: string; at: Date };
}

export interface Desk {
  parts: DeskParts;
  needs: DeskItem[];
  today: Awaited<ReturnType<typeof loadOps>> | null;
  week: WeekRow[] | null;
  /** Read-only roles: live jobs and today's totals (no names). */
  live: Array<{ id: string; title: string; startsAt: Date | null; endsAt: Date | null }> | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Everything a role's Desk shows, from data that exists today (C1.3). */
export async function loadDesk(actor: { profileId: string; orgId: string; role: Role; grants?: Grants | null }, now = new Date()): Promise<Desk> {
  const parts = deskParts(actor);
  const orgId = actor.orgId;
  const needsOps = parts.today || parts.field || parts.readOnly;
  const needsJobs = parts.hiring || parts.week || parts.readOnly;
  // Live = published and not past its end (the same rule as the worker feed);
  // ended jobs stay PUBLISHED until someone closes them, so filter here.
  const live = { status: "PUBLISHED" as const, OR: [{ endsAt: null }, { endsAt: { gt: openJobsEndAfter(now) } }] };
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);

  const [ops, jobs, apps, upcoming, pay, disputes] = await Promise.all([
    needsOps ? loadOps(orgId, now) : null,
    needsJobs
      ? db().job.findMany({
          where: { orgId, ...live },
          select: { id: true, title: true, headcount: true, startsAt: true, endsAt: true, _count: { select: { engagements: { where: { status: { in: ACCEPTED_STATUSES } } } } } },
          orderBy: { startsAt: "asc" },
        })
      : null,
    parts.hiring
      ? // Only jobs that can still accept: the job page refuses on paused, closed or ended ones.
        db().engagement.findMany({ where: { status: "APPLIED", job: { orgId, ...live } }, select: { jobId: true, createdAt: true, job: { select: { title: true } } } })
      : null,
    parts.week
      ? db().shift.findMany({
          where: { status: { not: "CANCELLED" }, endsAt: { gt: now }, startsAt: { lt: weekEnd }, engagement: { job: { orgId } } },
          select: { startsAt: true, endsAt: true, engagement: { select: { jobId: true, workerId: true } } },
        })
      : null,
    parts.pay ? loadOrgPay(actor) : null,
    parts.pay ? noteOverdueDisputes(orgId, now).catch(() => 0).then(() => disputeCounts(orgId, now)) : null,
  ]);

  // A closed job still has its hires' shifts (C3.5): the week ahead shows those jobs too.
  const known = new Set((jobs ?? []).map((j) => j.id));
  const missing = [...new Set((upcoming ?? []).map((s) => s.engagement.jobId))].filter((id) => !known.has(id));
  const closedWithShifts = parts.week && missing.length
    ? await db().job.findMany({
        where: { id: { in: missing }, orgId },
        select: { id: true, title: true, headcount: true, startsAt: true, endsAt: true, _count: { select: { engagements: { where: { status: { in: ACCEPTED_STATUSES } } } } } },
      })
    : [];

  const needs: DeskItem[] = [];
  if (parts.field && ops) {
    for (const r of ops.late) needs.push({ key: `late-${r.shift.id}`, title: `${r.shift.engagement.worker.displayName} hasn't checked in`, sub: r.shift.engagement.job.title, tag: "Late", badge: "badge-coral", href: `/shifts/${r.shift.id}`, action: "Open shift", when: { label: "Started", at: r.shift.startsAt } });
    for (const r of ops.awaitingReview) needs.push({ key: `review-${r.shift.id}`, title: `Review ${r.shift.engagement.worker.displayName}'s shift`, sub: r.shift.engagement.job.title, tag: "Review", badge: "badge-butter", href: `/shifts/${r.shift.id}`, action: "Review shift", when: r.state.checkedOutAt ? { label: "Checked out", at: r.state.checkedOutAt } : undefined });
  }
  if (parts.hiring && apps && jobs) {
    for (const g of applicationsByJob(apps.map((a) => ({ jobId: a.jobId, title: a.job.title, appliedAt: a.createdAt })))) {
      needs.push({ key: `apps-${g.jobId}`, title: `${plural(g.count, "application")} waiting`, sub: g.title, tag: "Applied", badge: "badge-sky", href: `/hiring/${g.jobId}/applicants`, action: "See applicants", when: { label: "Oldest", at: g.oldest } });
    }
    for (const j of shortOfHeadcount(jobs.map((j) => ({ id: j.id, title: j.title, headcount: j.headcount, hired: j._count.engagements, startsAt: j.startsAt })))) {
      needs.push({ key: `short-${j.id}`, title: `${j.short} of ${j.headcount} ${j.headcount === 1 ? "seat" : "seats"} open`, sub: j.title, tag: "Short", badge: "badge-neutral", href: `/jobs/${j.id}`, action: "Open job", when: j.startsAt ? { label: "Starts", at: j.startsAt } : undefined });
    }
  }
  if (parts.pay && pay && disputes !== null) {
    if (pay.awaiting.length) {
      const cents = pay.awaiting.reduce((n, l) => n + l.line.amountCents, 0);
      needs.push({ key: "pay-approve", title: `${plural(pay.awaiting.length, "pay line")} to approve`, sub: `${money(cents)} in total`, tag: "Approve", badge: "badge-accent", href: "/pay?tab=approve", action: "Approve pay" });
    }
    if (disputes.overdue) needs.push({ key: "pay-disputes-overdue", title: `${plural(disputes.overdue, "dispute")} overdue`, sub: "A reply or a resolution is past its deadline", tag: "Overdue", badge: "badge-coral", href: "/pay?tab=disputes", action: "Open disputes" });
    if (disputes.dueToday) needs.push({ key: "pay-disputes-today", title: `${plural(disputes.dueToday, "dispute")} due today`, sub: "Reply or resolve before the day ends", tag: "Due", badge: "badge-butter", href: "/pay?tab=disputes", action: "Open disputes" });
    const rest = disputes.open - disputes.overdue - disputes.dueToday;
    if (rest) needs.push({ key: "pay-disputes", title: `${plural(rest, "open dispute")}`, sub: "Workers questioning their pay", tag: "Dispute", badge: "badge-coral", href: "/pay?tab=disputes", action: "Open disputes" });
  }

  return {
    parts,
    needs,
    today: parts.today || parts.readOnly ? ops : null,
    // The week ahead: live jobs that run during the next 7 days (undated ones too).
    week: parts.week && jobs && upcoming
      ? weekAhead(
          [...jobs.filter((j) => !j.startsAt || j.startsAt < weekEnd), ...closedWithShifts],
          upcoming.map((s) => ({ jobId: s.engagement.jobId, workerId: s.engagement.workerId, startsAt: s.startsAt, endsAt: s.endsAt })),
          now,
        )
      : null,
    live: parts.readOnly && jobs ? jobs.map((j) => ({ id: j.id, title: j.title, startsAt: j.startsAt, endsAt: j.endsAt })) : null,
  };
}
