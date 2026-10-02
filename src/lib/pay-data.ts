import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { PAY_ROLES } from "@/lib/access";
import type { Role } from "@/lib/auth";
import { verifiedWork } from "@/lib/scorecard";
import {
  computeShiftPay,
  disputeProblem,
  lineActionProblem,
  lineState,
  payableTotal,
  platformFee,
  readBasis,
  reReviewProblem,
  resolutionProblem,
  sortEvents,
  wageFlag,
  type LineState,
  type PayEventFact,
  type PayResult,
  type Resolution,
} from "@/lib/pay";

type Tx = Prisma.TransactionClient;
type Client = Tx | ReturnType<typeof db>;
type Result = { ok: true } | { ok: false; reason: string };

const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
/**
 * Every change to a worker's pay lines — review, approval, hold, dispute,
 * pay run — holds this lock. Order: a shift lock (if any) first, then this,
 * so they can't deadlock.
 */
export const payLock = (tx: Tx, workerId: string) => lock(tx, `pay:${workerId}`);

const asFacts = (events: Array<{ type: string; createdAt: Date; reason: string | null; transferId: string | null; providerRef: string | null }>): PayEventFact[] =>
  events.map((e) => ({ type: e.type as PayEventFact["type"], createdAt: e.createdAt, reason: e.reason, transferId: e.transferId, providerRef: e.providerRef }));

/**
 * A time after every existing event of these lines, so each line's history
 * replays in the order it was written. Callers hold payLock for the lines'
 * worker — every PayoutEvent writer does.
 */
export async function eventAt(tx: Tx, payoutIds: string[], now: Date): Promise<Date> {
  if (!payoutIds.length) return now;
  const last = await tx.payoutEvent.aggregate({ where: { payoutId: { in: payoutIds } }, _max: { createdAt: true } });
  const max = last._max.createdAt;
  return max && max >= now ? new Date(max.getTime() + 1) : now;
}

/** Shifts with a dispute that has no resolution yet. */
async function openDisputeShifts(c: Client, where: Prisma.PayDisputeWhereInput): Promise<Set<string>> {
  const open = await c.payDispute.findMany({ where: { ...where, resolution: { is: null } }, select: { shiftId: true } });
  return new Set(open.map((d) => d.shiftId));
}

// ---------------------------------------------------------------------------
// Supervisor review → pay line
// ---------------------------------------------------------------------------

export interface ReviewShift {
  id: string;
  engagement: {
    id: string;
    workerId: string;
    job: { orgId: string; type: "PETITION" | "CANVASS"; compensationMethod: "HOURLY" | "SHIFT_RATE" | "PER_UNIT"; payRateCents: number | null; jurisdiction: { version: number } };
  };
  events: Array<{ id: string; type: string; payload: Prisma.JsonValue; createdAt: Date }>;
  validations: Array<{ workEventId: string | null; status: "APPROVED" | "REJECTED" | "FLAGGED"; createdAt: Date }>;
}

export type ReviewPlan =
  | { ok: false; reason: string }
  | { ok: true; pay: (PayResult & { ok: true }) | null; voidIds: string[]; keepId: string | null; heldReason: string | null };

/**
 * What a supervisor's review does to pay, decided before anything is
 * written (runs inside the shift lock):
 * - Approving needs pay that can be calculated (e.g. a per-signature shift
 *   needs its batch count).
 * - A review can change only while the shift's pay awaits approval; the old
 *   line is then voided and replaced. Re-approving with the same pay keeps it.
 */
export async function planReview(tx: Tx, s: ReviewShift, status: "APPROVED" | "REJECTED"): Promise<ReviewPlan> {
  await payLock(tx, s.engagement.workerId);
  // Every line on the shift counts: an approved adjustment also makes the review final.
  const lines = await tx.payout.findMany({ where: { shiftId: s.id }, include: { events: true } });
  const states = lines.map((l) => ({ line: l, state: lineState(l, asFacts(l.events), false) }));
  const blocked = reReviewProblem(states.map((x) => x.state));
  if (blocked) return { ok: false, reason: blocked };
  const active = states.filter((x) => x.line.kind === "SHIFT" && x.state.status !== "VOIDED");
  const heldReason = active.find((x) => x.state.status === "HELD")?.state.heldReason ?? null;
  if (status === "REJECTED") return { ok: true, pay: null, voidIds: active.map((x) => x.line.id), keepId: null, heldReason: null };
  const job = s.engagement.job;
  const pay = computeShiftPay({
    method: job.compensationMethod,
    rateCents: job.payRateCents,
    workType: job.type,
    work: verifiedWork(s.events, s.validations),
    jurisdictionVersion: job.jurisdiction.version,
  });
  if (!pay.ok) return { ok: false, reason: `Can't approve yet: ${pay.reason}` };
  // Re-approving with the same calculation keeps the line (a double-click is harmless).
  const sameAs = (l: (typeof lines)[number]) => {
    const b = (l.basis ?? {}) as Record<string, unknown>;
    return l.amountCents === pay.amountCents && b.formula === pay.basis.formula && b.jurisdictionVersion === pay.basis.jurisdictionVersion;
  };
  const same = active.length === 1 && sameAs(active[0].line) ? active[0].line : null;
  return { ok: true, pay, voidIds: active.filter((x) => x.line !== same).map((x) => x.line.id), keepId: same?.id ?? null, heldReason: same ? null : heldReason };
}

/** Why the shift's review (or batch count, which changes pay) is final, or null. */
export async function reviewLockProblem(tx: Tx, shiftId: string): Promise<string | null> {
  const lines = await tx.payout.findMany({ where: { shiftId }, include: { events: true } });
  return reReviewProblem(lines.map((l) => lineState(l, asFacts(l.events), false)));
}

/** Applies a plan after the review's Validation row is written. */
export async function applyReviewPlan(tx: Tx, s: ReviewShift, plan: ReviewPlan & { ok: true }, validationId: string, actorId: string, now: Date): Promise<void> {
  const at = await eventAt(tx, plan.voidIds, now);
  for (const id of plan.voidIds) {
    await tx.payoutEvent.create({ data: { payoutId: id, type: "VOIDED", actorId, reason: "The shift was re-reviewed.", createdAt: at } });
    await tx.auditEvent.create({ data: { actorId, action: "payout.voided", entityType: "Payout", entityId: id, metadata: { shiftId: s.id, validationId } } });
  }
  if (!plan.pay || plan.keepId) return;
  const line = await tx.payout.create({
    data: {
      workerId: s.engagement.workerId,
      orgId: s.engagement.job.orgId,
      engagementId: s.engagement.id,
      shiftId: s.id,
      validationId,
      kind: "SHIFT",
      amountCents: plan.pay.amountCents,
      feeCents: plan.pay.feeCents,
      basis: plan.pay.basis as unknown as Prisma.InputJsonObject,
      createdById: actorId,
      createdAt: now,
    },
  });
  // A hold finance placed on the replaced line stays until they release it.
  if (plan.heldReason) {
    await tx.payoutEvent.create({ data: { payoutId: line.id, type: "HELD", actorId, reason: plan.heldReason, createdAt: now } });
  }
  await tx.auditEvent.create({
    data: {
      actorId,
      action: "payout.created",
      entityType: "Payout",
      entityId: line.id,
      metadata: { shiftId: s.id, validationId, amountCents: line.amountCents, feeCents: line.feeCents, formula: plan.pay.basis.formula, replaces: plan.voidIds },
    },
  });
}

/** The shift's pay as the shift page shows it: the current shift line, if any. */
export async function shiftPay(shiftId: string): Promise<{ amountCents: number; formula: string; state: LineState } | null> {
  if (!UUID_RE.test(shiftId)) return null;
  const [lines, open] = await Promise.all([
    db().payout.findMany({ where: { shiftId }, include: { events: true }, orderBy: { createdAt: "asc" } }),
    openDisputeShifts(db(), { shiftId }),
  ]);
  const live = lines.map((l) => ({ l, state: lineState(l, asFacts(l.events), open.has(shiftId)) })).filter((x) => x.state.status !== "VOIDED");
  const main = live.find((x) => x.l.kind === "SHIFT");
  if (!main) return null;
  const total = live.reduce((n, x) => n + x.l.amountCents, 0);
  const basis = (main.l.basis ?? {}) as Record<string, unknown>;
  return { amountCents: total, formula: typeof basis.formula === "string" ? basis.formula : "", state: main.state };
}

// ---------------------------------------------------------------------------
// Worker earnings
// ---------------------------------------------------------------------------

export interface EarningLine {
  id: string;
  kind: "SHIFT" | "ADJUSTMENT";
  amountCents: number;
  formula: string;
  reason: string | null;
  state: LineState;
  createdAt: Date;
}

export interface EarningShift {
  shiftId: string;
  startsAt: Date;
  /** Latest review of the shift. */
  review: { status: "APPROVED" | "REJECTED" | "FLAGGED"; reason: string | null } | null;
  lines: EarningLine[];
  /** Sum of the shift's live (not replaced) lines. */
  totalCents: number;
  disputes: Array<{ id: string; reason: string; createdAt: Date; resolution: { outcome: string; response: string; createdAt: Date } | null }>;
  canDispute: boolean;
}

export interface EarningCampaign {
  jobId: string;
  title: string;
  orgName: string;
  shifts: EarningShift[];
  totals: Totals;
}

export interface Totals {
  paid: number;
  onTheWay: number;
  awaiting: number;
  stopped: number;
}

const emptyTotals = (): Totals => ({ paid: 0, onTheWay: 0, awaiting: 0, stopped: 0 });

function addTo(t: Totals, l: EarningLine) {
  switch (l.state.status) {
    case "PAID":
      t.paid += l.amountCents;
      break;
    case "APPROVED":
    case "PROCESSING":
      t.onTheWay += l.amountCents;
      break;
    case "AWAITING_APPROVAL":
      t.awaiting += l.amountCents;
      break;
    case "HELD":
    case "DISPUTED":
      t.stopped += l.amountCents;
      break;
  }
}

/** A worker's own pay, by campaign. Only ever loaded for the signed-in worker. */
export async function loadWorkerEarnings(workerId: string): Promise<{ campaigns: EarningCampaign[]; totals: Totals }> {
  const jobSel = { select: { id: true, title: true, org: { select: { name: true } } } } as const;
  const [lines, disputes, reviewed] = await Promise.all([
    db().payout.findMany({ where: { workerId }, include: { events: true }, orderBy: { createdAt: "asc" } }),
    db().payDispute.findMany({ where: { workerId }, include: { resolution: true }, orderBy: { createdAt: "asc" } }),
    db().shift.findMany({
      where: { engagement: { workerId }, validations: { some: { workEventId: null } } },
      select: {
        id: true,
        startsAt: true,
        validations: { where: { workEventId: null }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, reason: true } },
        engagement: { select: { job: jobSel } },
      },
      orderBy: { startsAt: "desc" },
    }),
  ]);
  const open = new Set(disputes.filter((d) => !d.resolution).map((d) => d.shiftId));
  const reasonOf = new Map(disputes.filter((d) => d.resolution?.adjustmentId).map((d) => [d.resolution!.adjustmentId!, d.resolution!.response]));
  const byShift = new Map<string, EarningLine[]>();
  for (const l of lines) {
    if (!l.shiftId) continue; // every M5 line has a shift; pre-M5 lines without one are shown nowhere else
    const basis = (l.basis ?? {}) as Record<string, unknown>;
    const line: EarningLine = {
      id: l.id,
      kind: l.kind,
      amountCents: l.amountCents,
      formula: typeof basis.formula === "string" ? basis.formula : "",
      reason: reasonOf.get(l.id) ?? null,
      state: lineState(l, asFacts(l.events), open.has(l.shiftId)),
      createdAt: l.createdAt,
    };
    byShift.set(l.shiftId, [...(byShift.get(l.shiftId) ?? []), line]);
  }

  const campaigns = new Map<string, EarningCampaign>();
  const totals = emptyTotals();
  for (const s of reviewed) {
    const job = s.engagement.job;
    const c = campaigns.get(job.id) ?? { jobId: job.id, title: job.title, orgName: job.org.name, shifts: [], totals: emptyTotals() };
    campaigns.set(job.id, c);
    const shiftLines = (byShift.get(s.id) ?? []).filter((l) => l.state.status !== "VOIDED");
    const ds = disputes.filter((d) => d.shiftId === s.id);
    for (const l of shiftLines) {
      addTo(c.totals, l);
      addTo(totals, l);
    }
    c.shifts.push({
      shiftId: s.id,
      startsAt: s.startsAt,
      review: s.validations[0] ?? null,
      lines: shiftLines,
      totalCents: shiftLines.reduce((n, l) => n + l.amountCents, 0),
      disputes: ds.map((d) => ({
        id: d.id,
        reason: d.reason,
        createdAt: d.createdAt,
        resolution: d.resolution ? { outcome: d.resolution.outcome, response: d.resolution.response, createdAt: d.resolution.createdAt } : null,
      })),
      canDispute: disputeProblem({ reviewed: true, openDispute: open.has(s.id), disputes: ds.length, reason: "x".repeat(10) }) === null,
    });
  }
  return { campaigns: [...campaigns.values()], totals };
}

/** Today's card: totals only. */
export async function workerPayTotals(workerId: string): Promise<Totals> {
  return (await loadWorkerEarnings(workerId)).totals;
}

// ---------------------------------------------------------------------------
// Disputes (worker side)
// ---------------------------------------------------------------------------

/** `paymentWaits`: the disputed pay hadn't gone out, so it now waits for the outcome. */
export async function openDispute(
  actor: { workerId: string; profileId: string },
  shiftId: string,
  reason: unknown,
  now = new Date()
): Promise<{ ok: true; paymentWaits: boolean } | { ok: false; reason: string }> {
  if (!UUID_RE.test(shiftId)) return { ok: false, reason: "Shift not found." };
  const text = typeof reason === "string" ? reason.trim() : "";
  return db().$transaction(async (tx) => {
    await lock(tx, `shift:${shiftId}`);
    const s = await tx.shift.findUnique({
      where: { id: shiftId },
      select: {
        engagement: { select: { id: true, workerId: true, job: { select: { orgId: true } } } },
        validations: { where: { workEventId: null }, select: { id: true } },
        payDisputes: { select: { id: true, resolution: { select: { id: true } } } },
        payouts: { where: { kind: "SHIFT" }, include: { events: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!s || s.engagement.workerId !== actor.workerId) return { ok: false as const, reason: "Shift not found." };
    await payLock(tx, actor.workerId);
    const problem = disputeProblem({
      reviewed: s.validations.length > 0,
      openDispute: s.payDisputes.some((d) => !d.resolution),
      disputes: s.payDisputes.length,
      reason: text,
    });
    if (problem) return { ok: false as const, reason: problem };
    const states = s.payouts.map((l) => ({ l, st: lineState(l, asFacts(l.events), false) }));
    const current = states.find((x) => x.st.status !== "VOIDED");
    const line = current?.l;
    const d = await tx.payDispute.create({
      data: { shiftId, workerId: actor.workerId, orgId: s.engagement.job.orgId, payoutId: line?.id ?? null, openedById: actor.profileId, reason: text, createdAt: now },
    });
    await tx.auditEvent.create({
      data: { actorId: actor.profileId, action: "pay.dispute_opened", entityType: "PayDispute", entityId: d.id, metadata: { shiftId, payoutId: line?.id ?? null } },
    });
    return { ok: true as const, paymentWaits: !!current && current.st.status !== "PAID" && current.st.status !== "PROCESSING" && current.l.amountCents !== 0 };
  });
}

// ---------------------------------------------------------------------------
// Finance (owners and finance): approve, hold, release, disputes, ledger
// ---------------------------------------------------------------------------

export interface PayActor {
  profileId: string;
  orgId: string;
  role: Role;
}

const notPayRole = (a: PayActor) => !PAY_ROLES.includes(a.role);

const LINE_INCLUDE = {
  events: true,
  worker: { select: { id: true, displayName: true, stripeAccountId: true, payoutsEnabled: true } },
  shift: { select: { id: true, startsAt: true } },
  engagement: { select: { job: { select: { id: true, title: true, type: true, measureIds: true, jurisdiction: { select: { rules: true } } } } } },
  validation: { select: { reviewerId: true, createdAt: true } },
} satisfies Prisma.PayoutInclude;

type LoadedLine = Prisma.PayoutGetPayload<{ include: typeof LINE_INCLUDE }>;

export interface OrgLine {
  line: LoadedLine;
  state: LineState;
  formula: string;
  wageFlag: string | null;
}

async function orgLines(c: Client, where: Prisma.PayoutWhereInput): Promise<OrgLine[]> {
  const lines = await c.payout.findMany({ where, include: LINE_INCLUDE, orderBy: { createdAt: "asc" } });
  const open = await openDisputeShifts(c, { shiftId: { in: lines.map((l) => l.shiftId).filter((x): x is string => !!x) } });
  return lines.map((line) => {
    const b = readBasis(line.basis);
    return {
      line,
      state: lineState(line, asFacts(line.events), !!line.shiftId && open.has(line.shiftId)),
      formula: b.formula,
      wageFlag: line.kind === "SHIFT" ? wageFlag(b.effectiveHourlyCents, line.engagement?.job.jurisdiction.rules) : null,
    };
  });
}

type LineAction = "approve" | "hold" | "release";

/**
 * Approve, hold or release pay lines. All lines must belong to the actor's
 * organization and be in a state that allows the action; otherwise nothing
 * is written.
 */
export async function lineAction(actor: PayActor, payoutIds: string[], action: LineAction, reason: string | null = null, now = new Date()): Promise<Result & { count?: number }> {
  if (notPayRole(actor)) return { ok: false, reason: "Only owners and finance can approve or hold pay." };
  const unique = [...new Set(payoutIds)];
  const ids = unique.filter((id) => UUID_RE.test(id));
  if (!ids.length || ids.length !== unique.length) return { ok: false, reason: "Pick at least one pay line." };
  if (ids.length > 200) return { ok: false, reason: "Up to 200 lines at a time." };
  const why = reason?.trim().slice(0, 300) || null;
  return db().$transaction(async (tx) => {
    const owners = await tx.payout.findMany({ where: { id: { in: ids } }, select: { workerId: true, orgId: true } });
    if (owners.length !== ids.length || owners.some((o) => o.orgId !== actor.orgId)) return { ok: false as const, reason: "Pay line not found." };
    for (const w of [...new Set(owners.map((o) => o.workerId))].sort()) await payLock(tx, w);
    const lines = await orgLines(tx, { id: { in: ids } });
    for (const l of lines) {
      const problem = lineActionProblem(l.state, action, why);
      if (problem) return { ok: false as const, reason: lines.length > 1 ? `${l.line.worker.displayName}: ${problem}` : problem };
    }
    const at = await eventAt(tx, ids, now);
    const type = action === "approve" ? "APPROVED" : action === "hold" ? "HELD" : "RELEASED";
    await tx.payoutEvent.createMany({ data: ids.map((payoutId) => ({ payoutId, type, actorId: actor.profileId, reason: why, createdAt: at })) });
    await tx.auditEvent.create({
      data: { actorId: actor.profileId, action: `payout.${action === "approve" ? "approved" : action === "hold" ? "held" : "released"}`, entityType: "Payout", entityId: ids[0], metadata: { payoutIds: ids, reason: why } },
    });
    return { ok: true as const, count: ids.length };
  });
}

export interface DisputeView {
  id: string;
  reason: string;
  createdAt: Date;
  worker: string;
  workerId: string;
  shiftId: string;
  shiftStartsAt: Date;
  jobTitle: string;
  line: { amountCents: number; formula: string } | null;
  review: { status: string; reason: string | null; at: Date } | null;
  resolution: { outcome: string; response: string; createdAt: Date } | null;
}

export async function loadOrgDisputes(orgId: string, open: boolean): Promise<DisputeView[]> {
  const ds = await db().payDispute.findMany({
    where: { orgId, resolution: open ? { is: null } : { isNot: null } },
    include: {
      resolution: true,
      worker: { select: { displayName: true } },
      payout: true,
      shift: {
        select: {
          startsAt: true,
          engagement: { select: { job: { select: { title: true } } } },
          validations: { where: { workEventId: null }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: open ? "asc" : "desc" },
    take: open ? 200 : 10,
  });
  return ds.map((d) => {
    const v = d.shift.validations[0];
    return {
      id: d.id,
      reason: d.reason,
      createdAt: d.createdAt,
      worker: d.worker.displayName,
      workerId: d.workerId,
      shiftId: d.shiftId,
      shiftStartsAt: d.shift.startsAt,
      jobTitle: d.shift.engagement.job.title,
      line: d.payout ? { amountCents: d.payout.amountCents, formula: readBasis(d.payout.basis).formula } : null,
      review: v ? { status: v.status, reason: v.reason, at: v.createdAt } : null,
      resolution: d.resolution ? { outcome: d.resolution.outcome, response: d.resolution.response, createdAt: d.resolution.createdAt } : null,
    };
  });
}

/**
 * Close a dispute: keep the pay (with a response), adjust it (a new
 * ADJUSTMENT line, approved by whoever resolves it), or record that a
 * supervisor re-reviewed the shift after the dispute.
 */
export async function resolveDispute(actor: PayActor, disputeId: string, r: Resolution, now = new Date()): Promise<Result> {
  if (notPayRole(actor)) return { ok: false, reason: "Only owners and finance can close pay disputes." };
  if (!UUID_RE.test(disputeId)) return { ok: false, reason: "Dispute not found." };
  const head = await db().payDispute.findUnique({ where: { id: disputeId }, select: { shiftId: true, workerId: true, orgId: true } });
  if (!head || head.orgId !== actor.orgId) return { ok: false, reason: "Dispute not found." };
  return db().$transaction(async (tx) => {
    await lock(tx, `shift:${head.shiftId}`);
    await payLock(tx, head.workerId);
    const d = await tx.payDispute.findUniqueOrThrow({
      where: { id: disputeId },
      include: {
        resolution: true,
        shift: { select: { engagementId: true, validations: { where: { workEventId: null }, orderBy: { createdAt: "desc" }, take: 1 } } },
      },
    });
    if (d.resolution) return { ok: false as const, reason: "This dispute is already closed." };
    const latest = d.shift.validations[0];
    const problem = resolutionProblem(r, { reviewedSinceDispute: !!latest && latest.createdAt > d.createdAt });
    if (problem) return { ok: false as const, reason: problem };
    const response = r.response.trim();
    let adjustmentId: string | null = null;
    if (r.outcome === "ADJUSTED") {
      const adj = await tx.payout.create({
        data: {
          workerId: d.workerId,
          orgId: d.orgId,
          engagementId: d.shift.engagementId,
          shiftId: d.shiftId,
          kind: "ADJUSTMENT",
          amountCents: r.amountCents,
          feeCents: platformFee(r.amountCents),
          basis: { formula: `Dispute adjustment: ${response}`, disputeId } as Prisma.InputJsonObject,
          adjustsId: d.payoutId,
          createdById: actor.profileId,
          createdAt: now,
        },
      });
      // Deciding the adjustment is its approval.
      await tx.payoutEvent.create({ data: { payoutId: adj.id, type: "APPROVED", actorId: actor.profileId, reason: "Approved when the dispute was resolved", createdAt: now } });
      adjustmentId = adj.id;
    }
    await tx.payDisputeResolution.create({
      data: { disputeId, outcome: r.outcome, response, resolvedById: actor.profileId, adjustmentId, createdAt: now },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.profileId,
        action: "pay.dispute_resolved",
        entityType: "PayDispute",
        entityId: disputeId,
        metadata: { outcome: r.outcome, adjustmentId, amountCents: r.outcome === "ADJUSTED" ? r.amountCents : null },
      },
    });
    return { ok: true as const };
  });
}

export interface WorkerToPay {
  workerId: string;
  name: string;
  amountCents: number;
  feeCents: number;
  lines: number;
  items: OrgLine[];
  /** Why this worker can't be paid right now, or null. */
  blocked: string | null;
}

/** Everything the Pay page shows for one organization. */
export async function loadOrgPay(orgId: string) {
  const lines = await orgLines(db(), { orgId });
  const live = lines.filter((l) => l.state.status !== "VOIDED");
  const byWorker = new Map<string, OrgLine[]>();
  for (const l of live.filter((x) => x.state.payable)) byWorker.set(l.line.workerId, [...(byWorker.get(l.line.workerId) ?? []), l]);
  const toPay: WorkerToPay[] = [...byWorker.values()].map((ls) => {
    const t = payableTotal(ls.map((l) => ({ amountCents: l.line.amountCents, feeCents: l.line.feeCents, state: l.state })));
    const w = ls[0].line.worker;
    return {
      workerId: w.id,
      name: w.displayName,
      amountCents: t.amountCents,
      feeCents: t.feeCents,
      lines: t.count,
      items: ls,
      blocked:
        t.amountCents <= 0
          ? "Deductions cover this worker's approved pay; nothing to send yet."
          : !w.stripeAccountId || !w.payoutsEnabled
            ? "Hasn't finished setting up payouts with Stripe yet."
            : null,
    };
  });
  const reviewerIds = [...new Set(live.flatMap((l) => [l.line.validation?.reviewerId, l.line.createdById]).filter((x): x is string => !!x))];
  const names = new Map((await db().profile.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName ?? "Staff"]));
  return {
    awaiting: live.filter((l) => l.state.status === "AWAITING_APPROVAL"),
    held: live.filter((l) => l.state.status === "HELD"),
    disputed: live.filter((l) => l.state.status === "DISPUTED"),
    conflicts: live.filter((l) => l.state.conflict),
    processing: live.filter((l) => l.state.status === "PROCESSING"),
    toPay: toPay.sort((a, b) => a.name.localeCompare(b.name)),
    paid: live.filter((l) => l.state.status === "PAID").reverse().slice(0, 50),
    names,
  };
}

// ---------------------------------------------------------------------------
// Finance export (spec p.11, p.15): one row per pay line
// ---------------------------------------------------------------------------

const PURPOSE: Record<string, string> = { PETITION: "Petition circulation", CANVASS: "Canvassing" };

/** CSV cell: quoted, and never read as a formula by a spreadsheet. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const usd = (cents: number) => (cents / 100).toFixed(2);

export async function exportLedger(orgId: string, from: Date, to: Date): Promise<string> {
  const lines = await orgLines(db(), { orgId, createdAt: { gte: from, lt: to } });
  const people = new Set<string>();
  for (const l of lines) {
    if (l.line.validation?.reviewerId) people.add(l.line.validation.reviewerId);
    if (l.line.createdById) people.add(l.line.createdById);
    for (const e of l.line.events) if (e.actorId) people.add(e.actorId);
  }
  const names = new Map((await db().profile.findMany({ where: { id: { in: [...people] } }, select: { id: true, displayName: true, role: true } })).map((p) => [p.id, p.displayName ?? p.role]));
  const header = [
    "line_id", "kind", "status", "payee", "payee_worker_id", "project", "purpose", "measure_ids", "shift_date",
    "calculation", "gross_usd", "platform_fee_usd", "org_cost_usd", "reviewed_by", "approved_at", "approved_by",
    "paid_at", "stripe_transfer", "adjusts_line", "recorded_at",
  ];
  const rows = lines.map((l) => {
    const approval = sortEvents(asFacts(l.line.events).map((e, i) => ({ ...e, i }))).find((e) => e.type === "APPROVED");
    const approver = approval ? l.line.events[approval.i].actorId : null;
    const job = l.line.engagement?.job;
    return [
      l.line.id,
      l.line.kind,
      l.state.status,
      l.line.worker.displayName,
      l.line.workerId,
      job?.title ?? "",
      job ? PURPOSE[job.type] : "",
      job?.measureIds.join(" ") ?? "",
      l.line.shift ? l.line.shift.startsAt.toISOString().slice(0, 10) : "",
      l.formula,
      usd(l.line.amountCents),
      usd(l.line.feeCents),
      usd(l.line.amountCents + l.line.feeCents),
      l.line.validation?.reviewerId ? names.get(l.line.validation.reviewerId) ?? "" : "",
      l.state.approvedAt?.toISOString() ?? "",
      approver ? names.get(approver) ?? "" : "",
      l.state.paidAt?.toISOString() ?? "",
      l.state.paidRef ?? "",
      l.line.adjustsId ?? "",
      l.line.createdAt.toISOString(),
    ].map(csvCell).join(",");
  });
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}
