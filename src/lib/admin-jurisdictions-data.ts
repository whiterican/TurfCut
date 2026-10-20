import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { rolesFor } from "@/lib/access";
import { recordAdminAction, staffLabel, type StaffActor } from "@/lib/admin-data";
import { checkReason } from "@/lib/admin-reason";
import { compensationProblem, jurisdictionLabel, jurisdictionProblems, type CompensationMethod } from "@/lib/jobs";
import { readPlace, readRules, rulesProblems, type JurisdictionRules } from "@/lib/jurisdiction-rules";

type Tx = Prisma.TransactionClient;

/** A version's place in its lineage: in force, proposed and awaiting approval, or replaced (or retired unapproved). */
export type VersionStanding = "current" | "proposed" | "superseded";
export function versionStanding(j: { isCurrent: boolean; supersededAt: Date | null }): VersionStanding {
  if (j.isCurrent) return "current";
  return j.supersededAt ? "superseded" : "proposed";
}

const SELECT = {
  id: true, state: true, locality: true, version: true, isCurrent: true, approved: true, approvedAt: true, approvedById: true,
  createdById: true, effectiveFrom: true, approvalExpiresAt: true, supersededAt: true, rules: true, createdAt: true,
} satisfies Prisma.JurisdictionProfileSelect;
type Row = Prisma.JurisdictionProfileGetPayload<{ select: typeof SELECT }>;

export interface AdminJurisdictionRow extends Row {
  label: string;
  standing: VersionStanding;
  /** Why the publish gate refuses it right now (empty = usable). */
  problems: string[];
  /** Open jobs filed under it. */
  jobs: number;
  rulesRead: JurisdictionRules;
}
export interface AdminJurisdictionPlace {
  state: string;
  locality: string | null;
  versions: AdminJurisdictionRow[];
}

const toRow = (j: Row, jobs: number, now: Date): AdminJurisdictionRow => ({ ...j, label: jurisdictionLabel(j), standing: versionStanding(j), problems: jurisdictionProblems(j, now), jobs, rulesRead: readRules(j.rules) });

/** Every profile, grouped by place, newest version first (M10.3). */
export async function listJurisdictionsForAdmin(now = new Date()): Promise<AdminJurisdictionPlace[]> {
  const [rows, jobs] = await Promise.all([
    db().jurisdictionProfile.findMany({ select: SELECT, orderBy: [{ state: "asc" }, { locality: "asc" }, { version: "desc" }] }),
    db().job.groupBy({ by: ["jurisdictionId"], where: { status: { not: "CLOSED" } }, _count: { _all: true } }),
  ]);
  const count = new Map(jobs.map((j) => [j.jurisdictionId, j._count._all]));
  const places = new Map<string, AdminJurisdictionPlace>();
  for (const r of rows) {
    const key = `${r.state}|${r.locality ?? ""}`;
    const place = places.get(key) ?? { state: r.state, locality: r.locality, versions: [] };
    place.versions.push(toRow(r, count.get(r.id) ?? 0, now));
    places.set(key, place);
  }
  return [...places.values()];
}

export interface AdminJurisdictionJob {
  id: string;
  title: string;
  status: string;
  compensationMethod: CompensationMethod;
  orgId: string;
  orgName: string;
  /** The gate refuses new shifts and seats on it: the profile's own problems, or a pay method these rules don't allow. */
  problems: string[];
}
export interface AdminJurisdictionHistoryRow {
  id: string;
  action: string;
  reason: string;
  staffName: string;
  createdAt: Date;
}
export interface AdminJurisdictionDetail extends AdminJurisdictionRow {
  jobList: AdminJurisdictionJob[];
  siblings: AdminJurisdictionRow[];
  history: AdminJurisdictionHistoryRow[];
}

/** One version with its open jobs (and what freezes each), the other versions of its place, and Turfcut's decisions on it. */
export async function loadJurisdictionForAdmin(id: string, now = new Date()): Promise<AdminJurisdictionDetail | null> {
  const j = await db().jurisdictionProfile.findUnique({ where: { id }, select: SELECT });
  if (!j) return null;
  const [jobs, siblings, history, siblingCounts] = await Promise.all([
    db().job.findMany({ where: { jurisdictionId: id, status: { not: "CLOSED" } }, select: { id: true, title: true, status: true, compensationMethod: true, org: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db().jurisdictionProfile.findMany({ where: { state: j.state, locality: j.locality, id: { not: id } }, select: SELECT, orderBy: { version: "desc" } }),
    db().adminAction.findMany({
      where: { targetType: "JurisdictionProfile", targetId: id },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 20,
      select: { id: true, action: true, reason: true, createdAt: true, staff: { select: { id: true, displayName: true, worker: { select: { displayName: true } } } } },
    }),
    db().job.groupBy({ by: ["jurisdictionId"], where: { status: { not: "CLOSED" }, jurisdiction: { state: j.state, locality: j.locality } }, _count: { _all: true } }),
  ]);
  const count = new Map(siblingCounts.map((c) => [c.jurisdictionId, c._count._all]));
  const own = jurisdictionProblems(j, now);
  return {
    ...toRow(j, jobs.length, now),
    jobList: jobs.map((job) => {
      const pay = compensationProblem(job.compensationMethod, j.rules);
      return { id: job.id, title: job.title, status: job.status, compensationMethod: job.compensationMethod, orgId: job.org.id, orgName: job.org.name, problems: pay ? [...own, pay] : own };
    }),
    siblings: siblings.map((s) => toRow(s, count.get(s.id) ?? 0, now)),
    history: history.map((h) => ({ id: h.id, action: h.action, reason: h.reason, staffName: staffLabel(h.staff), createdAt: h.createdAt })),
  };
}

/** Tells the owners and recruiters of these organizations that a rule change froze some of their jobs (one notice per person, whatever the count). */
async function notifyJobsFrozen(tx: Tx, orgIds: string[], now: Date): Promise<number> {
  if (!orgIds.length) return 0;
  const people = await tx.profile.findMany({ where: { orgId: { in: orgIds }, role: { in: rolesFor("jobsEdit") }, closedAt: null }, select: { id: true } });
  if (!people.length) return 0;
  await tx.notification.createMany({ data: people.map((p) => ({ recipientId: p.id, kind: "ORG_JOBS_FROZEN" as const, createdAt: now })) });
  return people.length;
}

export interface ProposeInput {
  state: unknown;
  locality: unknown;
  rules: JurisdictionRules;
  effectiveFrom: Date | null;
  reason: unknown;
}

/**
 * A new version of a place's rules (M10.3), awaiting counsel approval:
 * version N+1 of that place, not current, not approved. Nothing changes for
 * jobs until it is approved. A place with no profile yet starts at version 1.
 */
export async function proposeJurisdictionVersion(staff: StaffActor, input: ProposeInput, now = new Date()): Promise<{ ok: true; id: string; version: number } | { ok: false; message: string }> {
  const place = readPlace(input.state, input.locality);
  if (!place.ok) return place;
  const problems = rulesProblems(input.rules);
  if (problems.length) return { ok: false, message: problems.join(" ") };
  if (input.effectiveFrom && Number.isNaN(input.effectiveFrom.getTime())) return { ok: false, message: "The effective date didn't make sense." };
  const r = checkReason(input.reason);
  if (!r.ok) return r;
  return db().$transaction(async (tx) => {
    const latest = await tx.jurisdictionProfile.findFirst({ where: { state: place.state, locality: place.locality }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (latest?.version ?? 0) + 1;
    const created = await tx.jurisdictionProfile.create({
      data: { state: place.state, locality: place.locality, version, isCurrent: false, approved: false, effectiveFrom: input.effectiveFrom, rules: input.rules as unknown as Prisma.InputJsonValue, createdById: staff.userId, createdAt: now },
      select: { id: true },
    });
    await recordAdminAction(tx, { staff, action: "jurisdiction.version_proposed", targetType: "JurisdictionProfile", targetId: created.id, reason: r.reason, metadata: { state: place.state, locality: place.locality, version } }, now);
    return { ok: true, id: created.id, version };
  });
}

export type JurisdictionDecision = "approve" | "withdraw" | "retire";
export const isJurisdictionDecision = (raw: unknown): raw is JurisdictionDecision => raw === "approve" || raw === "withdraw" || raw === "retire";

export interface ApproveResult {
  ok: true;
  /** Jobs moved from the previous version because their terms fit the new rules. */
  moved: number;
  /** Jobs left on the superseded version, frozen, because their pay method isn't allowed by the new rules. */
  frozen: number;
}

/**
 * Counsel approval of a version (M10.3). A proposed version becomes current
 * and supersedes the place's current one; open jobs on the old version move
 * to it when their pay method fits the new rules, and stay frozen on the old
 * one otherwise (their organizations are told). A current version whose
 * approval lapsed is renewed in place. Approving a superseded version is
 * refused: propose a new one.
 */
export async function approveJurisdictionVersion(staff: StaffActor, id: string, input: { approvalExpiresAt: Date | null; reason: unknown }, now = new Date()): Promise<ApproveResult | { ok: false; message: string }> {
  const r = checkReason(input.reason);
  if (!r.ok) return r;
  if (input.approvalExpiresAt && Number.isNaN(input.approvalExpiresAt.getTime())) return { ok: false, message: "The expiry date didn't make sense." };
  if (input.approvalExpiresAt && input.approvalExpiresAt <= now) return { ok: false, message: "An expiry has to be in the future. To stop a profile now, withdraw its approval." };
  return db().$transaction(async (tx) => {
    const j = await tx.jurisdictionProfile.findUnique({ where: { id }, select: SELECT });
    if (!j) return { ok: false, message: "That profile no longer exists." };
    if (versionStanding(j) === "superseded") return { ok: false, message: "This version was superseded. Propose a new version instead." };
    const previous = j.isCurrent ? null : await tx.jurisdictionProfile.findFirst({ where: { state: j.state, locality: j.locality, isCurrent: true }, select: { id: true, version: true } });
    await tx.jurisdictionProfile.update({ where: { id }, data: { approved: true, approvedAt: now, approvedById: staff.userId, approvalExpiresAt: input.approvalExpiresAt, isCurrent: true } });
    let moved = 0;
    const frozenByOrg = new Map<string, number>();
    if (previous) {
      await tx.jurisdictionProfile.update({ where: { id: previous.id }, data: { isCurrent: false, supersededAt: now } });
      const jobs = await tx.job.findMany({ where: { jurisdictionId: previous.id, status: { not: "CLOSED" } }, select: { id: true, orgId: true, compensationMethod: true } });
      for (const job of jobs) {
        if (compensationProblem(job.compensationMethod, j.rules) === null) {
          await tx.job.update({ where: { id: job.id }, data: { jurisdictionId: id } });
          await tx.auditEvent.create({ data: { actorId: null, action: "job.jurisdiction_moved", entityType: "Job", entityId: job.id, metadata: { from: previous.id, to: id, fromVersion: previous.version, toVersion: j.version }, createdAt: now } });
          moved++;
        } else {
          frozenByOrg.set(job.orgId, (frozenByOrg.get(job.orgId) ?? 0) + 1);
        }
      }
    }
    const frozen = [...frozenByOrg.values()].reduce((a, b) => a + b, 0);
    await recordAdminAction(tx, {
      staff, action: j.isCurrent ? "jurisdiction.approval_renewed" : "jurisdiction.version_approved", targetType: "JurisdictionProfile", targetId: id, reason: r.reason,
      metadata: { version: j.version, supersededId: previous?.id ?? null, moved, frozen, approvalExpiresAt: input.approvalExpiresAt?.toISOString() ?? null },
    }, now);
    await notifyJobsFrozen(tx, [...frozenByOrg.keys()], now);
    return { ok: true, moved, frozen };
  });
}

/** Approval withdrawn (M10.3): everything under the version freezes until it is approved again or a new version is; its organizations are told. */
export async function withdrawJurisdictionApproval(staff: StaffActor, id: string, reason: unknown, now = new Date()): Promise<{ ok: true; frozen: number } | { ok: false; message: string }> {
  const r = checkReason(reason);
  if (!r.ok) return r;
  return db().$transaction(async (tx) => {
    const j = await tx.jurisdictionProfile.findUnique({ where: { id }, select: { approved: true, version: true } });
    if (!j) return { ok: false, message: "That profile no longer exists." };
    if (!j.approved) return { ok: false, message: "This version isn't approved, so there is nothing to withdraw." };
    await tx.jurisdictionProfile.update({ where: { id }, data: { approved: false } });
    const jobs = await tx.job.findMany({ where: { jurisdictionId: id, status: { not: "CLOSED" } }, select: { orgId: true } });
    await recordAdminAction(tx, { staff, action: "jurisdiction.approval_withdrawn", targetType: "JurisdictionProfile", targetId: id, reason: r.reason, metadata: { version: j.version, frozen: jobs.length } }, now);
    await notifyJobsFrozen(tx, [...new Set(jobs.map((x) => x.orgId))], now);
    return { ok: true, frozen: jobs.length };
  });
}

/** A proposal that won't be approved is retired (M10.3): it never was current, so nothing under it changes. */
export async function retireJurisdictionProposal(staff: StaffActor, id: string, reason: unknown, now = new Date()): Promise<{ ok: true } | { ok: false; message: string }> {
  const r = checkReason(reason);
  if (!r.ok) return r;
  return db().$transaction(async (tx) => {
    const j = await tx.jurisdictionProfile.findUnique({ where: { id }, select: { isCurrent: true, supersededAt: true, version: true } });
    if (!j) return { ok: false, message: "That profile no longer exists." };
    if (versionStanding(j) !== "proposed") return { ok: false, message: "Only a proposed version can be retired. A current one is withdrawn instead." };
    await tx.jurisdictionProfile.update({ where: { id }, data: { supersededAt: now } });
    await recordAdminAction(tx, { staff, action: "jurisdiction.proposal_retired", targetType: "JurisdictionProfile", targetId: id, reason: r.reason, metadata: { version: j.version } }, now);
    return { ok: true };
  });
}
