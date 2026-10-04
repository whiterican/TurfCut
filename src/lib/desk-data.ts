import { db } from "@/lib/db";
import type { Role } from "@/lib/auth";
import { ACCEPTED_STATUSES } from "@/lib/engagements";
import { loadOps } from "@/lib/field-day-data";
import { loadOrgDisputes, loadOrgPay } from "@/lib/pay-data";
import { money } from "@/lib/pay";
import { applicationsByJob, deskParts, shortOfHeadcount, weekAhead, type DeskParts, type WeekRow } from "@/lib/desk";

/** One line in "Needs you": what, where it's from, and where to act on it. */
export interface DeskItem {
  key: string;
  title: string;
  sub: string;
  tag: string;
  badge: "badge-coral" | "badge-butter" | "badge-sky" | "badge-neutral";
  href: string;
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
export async function loadDesk(actor: { profileId: string; orgId: string; role: Role }, now = new Date()): Promise<Desk> {
  const parts = deskParts(actor.role);
  const orgId = actor.orgId;
  const needsOps = parts.today || parts.field || parts.readOnly;
  const needsJobs = parts.hiring || parts.week || parts.readOnly;

  const [ops, jobs, apps, upcoming, pay, disputes] = await Promise.all([
    needsOps ? loadOps(orgId, now) : null,
    needsJobs
      ? db().job.findMany({
          where: { orgId, status: "PUBLISHED" },
          select: { id: true, title: true, headcount: true, startsAt: true, endsAt: true, _count: { select: { engagements: { where: { status: { in: ACCEPTED_STATUSES } } } } } },
          orderBy: { startsAt: "asc" },
        })
      : null,
    parts.hiring
      ? db().engagement.findMany({ where: { status: "APPLIED", job: { orgId } }, select: { jobId: true, createdAt: true, job: { select: { title: true } } } })
      : null,
    parts.week
      ? db().shift.findMany({
          where: { status: { not: "CANCELLED" }, startsAt: { gte: now, lt: new Date(now.getTime() + 7 * 86_400_000) }, engagement: { job: { orgId } } },
          select: { startsAt: true, engagement: { select: { jobId: true, workerId: true } } },
        })
      : null,
    parts.pay ? loadOrgPay(actor) : null,
    parts.pay ? loadOrgDisputes(actor, true) : null,
  ]);

  const needs: DeskItem[] = [];
  if (parts.field && ops) {
    for (const r of ops.late) needs.push({ key: `late-${r.shift.id}`, title: `${r.shift.engagement.worker.displayName} hasn't checked in`, sub: r.shift.engagement.job.title, tag: "Late", badge: "badge-coral", href: `/shifts/${r.shift.id}` });
    for (const r of ops.awaitingReview) needs.push({ key: `review-${r.shift.id}`, title: `Review ${r.shift.engagement.worker.displayName}'s shift`, sub: r.shift.engagement.job.title, tag: "Review", badge: "badge-butter", href: `/shifts/${r.shift.id}` });
  }
  if (parts.hiring && apps && jobs) {
    for (const g of applicationsByJob(apps.map((a) => ({ jobId: a.jobId, title: a.job.title, appliedAt: a.createdAt })))) {
      needs.push({ key: `apps-${g.jobId}`, title: `${plural(g.count, "application")} waiting`, sub: g.title, tag: "Applied", badge: "badge-sky", href: `/jobs/${g.jobId}` });
    }
    for (const j of shortOfHeadcount(jobs.map((j) => ({ id: j.id, title: j.title, headcount: j.headcount, hired: j._count.engagements, startsAt: j.startsAt })))) {
      needs.push({ key: `short-${j.id}`, title: `${j.short} of ${j.headcount} ${j.headcount === 1 ? "seat" : "seats"} open`, sub: j.title, tag: "Short", badge: "badge-neutral", href: `/jobs/${j.id}` });
    }
  }
  if (parts.pay && pay && disputes) {
    if (pay.awaiting.length) {
      const cents = pay.awaiting.reduce((n, l) => n + l.line.amountCents, 0);
      needs.push({ key: "pay-approve", title: `${plural(pay.awaiting.length, "pay line")} to approve`, sub: `${money(cents)} in total`, tag: "Approve", badge: "badge-butter", href: "/payouts" });
    }
    if (disputes.length) needs.push({ key: "pay-disputes", title: `${plural(disputes.length, "open dispute")}`, sub: "Workers questioning their pay", tag: "Dispute", badge: "badge-coral", href: "/payouts" });
  }

  return {
    parts,
    needs,
    today: parts.today || parts.readOnly ? ops : null,
    week: parts.week && jobs && upcoming
      ? weekAhead(jobs, upcoming.map((s) => ({ jobId: s.engagement.jobId, workerId: s.engagement.workerId, startsAt: s.startsAt })), now)
      : null,
    live: parts.readOnly && jobs ? jobs.map((j) => ({ id: j.id, title: j.title, startsAt: j.startsAt, endsAt: j.endsAt })) : null,
  };
}
