import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { PAY_ROLES } from "@/lib/access";
import type { Role } from "@/lib/auth";
import { ProviderError, type PayoutProvider, type ProviderEvent } from "@/lib/payout-provider";
import { verifiedWork } from "@/lib/scorecard";
import {
  computeShiftPay,
  disputeProblem,
  lineActionProblem,
  lineState,
  money,
  payableTotal,
  platformFee,
  readBasis,
  reReviewProblem,
  selfApprovalProblem,
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
  const blocked = reReviewProblem(states.map((x) => x.state)) ?? adjustedProblem(states);
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
  const states = lines.map((l) => ({ line: l, state: lineState(l, asFacts(l.events), false) }));
  return reReviewProblem(states.map((x) => x.state)) ?? adjustedProblem(states);
}

/**
 * A dispute adjustment was made against the shift's current pay; changing
 * the review under it could leave the shift paying a negative amount.
 */
function adjustedProblem(states: Array<{ line: { kind: string }; state: LineState }>): string | null {
  return states.some((x) => x.line.kind === "ADJUSTMENT" && x.state.status !== "VOIDED")
    ? "This shift's pay was adjusted in a dispute, so the review is final. Ask your owner or finance team for another adjustment."
    : null;
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

/**
 * The shift's pay as the shift page shows it: the live total, the current
 * shift line (its own amount and state), and whether the review is final —
 * the same rule the server applies (reReviewProblem over every line).
 */
export async function shiftPay(shiftId: string): Promise<{ amountCents: number; mainCents: number; formula: string; state: LineState; locked: boolean } | null> {
  if (!UUID_RE.test(shiftId)) return null;
  const [lines, open] = await Promise.all([
    db().payout.findMany({ where: { shiftId }, include: { events: true }, orderBy: { createdAt: "asc" } }),
    openDisputeShifts(db(), { shiftId }),
  ]);
  const states = lines.map((l) => ({ l, state: lineState(l, asFacts(l.events), open.has(shiftId)) }));
  const live = states.filter((x) => x.state.status !== "VOIDED");
  const main = live.find((x) => x.l.kind === "SHIFT");
  if (!main) return null;
  return {
    amountCents: live.reduce((n, x) => n + x.l.amountCents, 0),
    mainCents: main.l.amountCents,
    formula: readBasis(main.l.basis).formula,
    state: main.state,
    locked: (reReviewProblem(states.map((x) => x.state)) ?? adjustedProblem(states.map((x) => ({ line: x.l, state: x.state })))) !== null,
  };
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
    await payLock(tx, actor.workerId);
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
  shift: {
    select: {
      id: true,
      startsAt: true,
      // The latest review of the shift: the person who approves pay must not be its reviewer.
      validations: { where: { workEventId: null }, orderBy: { createdAt: "desc" }, take: 1, select: { reviewerId: true } },
    },
  },
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

/** The two-person rule for one loaded line (lib/pay selfApprovalProblem). */
export function selfApproval(l: OrgLine, actorId: string): string | null {
  return selfApprovalProblem(
    { kind: l.line.kind, createdById: l.line.createdById, hasShift: !!l.line.shift, amountCents: l.line.amountCents },
    l.line.shift?.validations[0]?.reviewerId ?? null,
    actorId
  );
}

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
      if (action === "approve") {
        const self = selfApproval(l, actor.profileId);
        if (self) return { ok: false as const, reason: `${l.line.worker.displayName}: ${self}` };
      }
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

function assertPayRole(actor: PayActor) {
  if (notPayRole(actor)) throw new Error("[turfcut] pay records are for owners and finance only");
}

export async function loadOrgDisputes(actor: PayActor, open: boolean): Promise<DisputeView[]> {
  assertPayRole(actor);
  const orgId = actor.orgId;
  const ds = await db().payDispute.findMany({
    where: { orgId, resolution: open ? { is: null } : { isNot: null } },
    include: {
      resolution: true,
      worker: { select: { displayName: true } },
      shift: {
        select: {
          startsAt: true,
          engagement: { select: { job: { select: { title: true } } } },
          validations: { where: { workEventId: null }, orderBy: { createdAt: "desc" }, take: 1 },
          payouts: { include: { events: true }, orderBy: { createdAt: "asc" } },
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
      line: (() => {
        // The shift's pay as it stands now (a re-review may have replaced the disputed line).
        const live = d.shift.payouts.filter((l) => lineState(l, asFacts(l.events), false).status !== "VOIDED");
        const main = live.find((l) => l.kind === "SHIFT");
        return live.length ? { amountCents: live.reduce((n, l) => n + l.amountCents, 0), formula: main ? readBasis(main.basis).formula : "adjustments only" } : null;
      })(),
      review: v ? { status: v.status, reason: v.reason, at: v.createdAt } : null,
      resolution: d.resolution ? { outcome: d.resolution.outcome, response: d.resolution.response, createdAt: d.resolution.createdAt } : null,
    };
  });
}

/**
 * Close a dispute: keep the pay (with a response), adjust it (a new
 * ADJUSTMENT line: a raise waits for someone else's approval, a deduction
 * on approved pay applies at once), or record that a
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
      const shiftLines = await tx.payout.findMany({ where: { shiftId: d.shiftId }, include: { events: true }, orderBy: { createdAt: "asc" } });
      const live = shiftLines.map((l) => ({ l, st: lineState(l, asFacts(l.events), false) })).filter((x) => x.st.status !== "VOIDED");
      const total = live.reduce((n, x) => n + x.l.amountCents, 0);
      // A dispute can't leave the worker owing money for the shift.
      if (total + r.amountCents < 0) return { ok: false as const, reason: `A deduction can't be more than this shift's pay (${money(total)}).` };
      const base = live.find((x) => x.l.kind === "SHIFT") ?? null;
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
          adjustsId: base?.l.id ?? null,
          createdById: actor.profileId,
          createdAt: now,
        },
      });
      // A raise waits for someone other than its maker (two people). A
      // deduction on pay that's approved or paid applies at once, so the
      // next payment can't go out without it. Either is held with a held line.
      const baseApproved = !!base && (base.st.approvedAt !== null || base.st.status === "PAID" || base.st.status === "PROCESSING");
      if (base?.st.status === "HELD") {
        await tx.payoutEvent.create({ data: { payoutId: adj.id, type: "HELD", actorId: actor.profileId, reason: base.st.heldReason, createdAt: now } });
      } else if (r.amountCents < 0 && baseApproved) {
        await tx.payoutEvent.create({ data: { payoutId: adj.id, type: "APPROVED", actorId: actor.profileId, reason: "Deduction applied when the dispute was resolved", createdAt: now } });
      }
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
export async function loadOrgPay(actor: PayActor) {
  assertPayRole(actor);
  const lines = await orgLines(db(), { orgId: actor.orgId });
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
  const reviewerIds = [...new Set(live.flatMap((l) => [l.line.shift?.validations[0]?.reviewerId, l.line.validation?.reviewerId, l.line.createdById]).filter((x): x is string => !!x))];
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

export async function exportLedger(actor: PayActor, from: Date, to: Date): Promise<string> {
  assertPayRole(actor);
  const lines = await orgLines(db(), { orgId: actor.orgId, createdAt: { gte: from, lt: to } });
  const people = new Set<string>();
  for (const l of lines) {
    const rv = l.line.shift?.validations[0]?.reviewerId ?? l.line.validation?.reviewerId;
    if (rv) people.add(rv);
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
      (() => {
        const rv = l.line.shift?.validations[0]?.reviewerId ?? l.line.validation?.reviewerId;
        return rv ? names.get(rv) ?? "" : "";
      })(),
      l.state.approvedAt?.toISOString() ?? "",
      approver ? names.get(approver) ?? "" : "",
      l.state.paidAt?.toISOString() ?? "",
      l.state.paidRef ?? "",
      l.line.adjustsId ?? "",
      l.line.createdAt.toISOString(),
    ].map(csvCell).join(",");
  });
  // The BOM tells spreadsheet apps it's UTF-8 (names with accents stay intact).
  return "\uFEFF" + [header.join(","), ...rows].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Stripe: worker payout accounts, pay runs, webhooks
// ---------------------------------------------------------------------------

/** The worker's Stripe account, created on first use (one per worker). */
export async function ensurePayoutAccount(workerId: string, provider: PayoutProvider): Promise<string> {
  const w = await db().worker.findUniqueOrThrow({ where: { id: workerId }, select: { stripeAccountId: true } });
  if (w.stripeAccountId) return w.stripeAccountId;
  // Idempotent at Stripe per worker, so two clicks get the same account.
  const id = await provider.createAccount({ workerId });
  await db().$transaction(async (tx) => {
    await lock(tx, `payout-account:${workerId}`);
    const again = await tx.worker.findUniqueOrThrow({ where: { id: workerId }, select: { stripeAccountId: true } });
    if (!again.stripeAccountId) await tx.worker.update({ where: { id: workerId }, data: { stripeAccountId: id, payoutsEnabled: false, payoutsCheckedAt: null } });
  });
  return id;
}

/**
 * The worker's payout setup for the Earnings page. Asks Stripe again when
 * they're back from Stripe's setup pages, or the cached "not yet" is over
 * five minutes old; a Stripe outage just keeps the cached answer.
 */
export async function payoutSetup(workerId: string, provider: PayoutProvider, justBack: boolean, now = new Date()) {
  const w = await db().worker.findUniqueOrThrow({ where: { id: workerId }, select: { stripeAccountId: true, payoutsEnabled: true, payoutsCheckedAt: true } });
  const stale = !w.payoutsCheckedAt || now.getTime() - w.payoutsCheckedAt.getTime() > 5 * 60_000;
  if (provider.configured() && w.stripeAccountId && !w.payoutsEnabled && (justBack || stale)) {
    try {
      return { ...w, payoutsEnabled: await refreshPayoutStatus(workerId, provider, now, true) };
    } catch {
      return w;
    }
  }
  return w;
}

/** Re-reads from Stripe whether this worker can be paid (cached on Worker). */
export async function refreshPayoutStatus(workerId: string, provider: PayoutProvider, now = new Date(), quick = false): Promise<boolean> {
  const w = await db().worker.findUniqueOrThrow({ where: { id: workerId }, select: { stripeAccountId: true, payoutsEnabled: true } });
  if (!w.stripeAccountId || !provider.configured()) return false;
  const enabled = await provider.payoutsEnabled(w.stripeAccountId, quick);
  await db().worker.update({ where: { id: workerId }, data: { payoutsEnabled: enabled, payoutsCheckedAt: now } });
  return enabled;
}

type PayRun = { ok: true; transferId: string; outcome: "paid" | "pending" | "failed"; message: string } | { ok: false; reason: string };

/**
 * Pays one worker everything approved and unpaid at this organization, in
 * one Stripe transfer. Step 1 records the transfer and marks its lines as
 * sending (committed before any money moves); step 2 settles it with
 * Stripe. A crash between the two leaves the lines "sending" until
 * settleTransfer runs again — it never sends a second payment.
 * `expectedCents`: the amount the person saw on the button; if more was
 * approved since, nothing is sent and they're asked to look again.
 */
export async function payWorker(actor: PayActor, workerId: string, provider: PayoutProvider, expectedCents: number | null = null, now = new Date()): Promise<PayRun> {
  if (notPayRole(actor)) return { ok: false, reason: "Only owners and finance can pay workers." };
  if (!UUID_RE.test(workerId)) return { ok: false, reason: "Worker not found." };
  if (!provider.configured()) return { ok: false, reason: "Stripe isn't connected yet, so pay can't be sent. Approved pay is kept until it is." };
  const worker = await db().worker.findUnique({ where: { id: workerId }, select: { stripeAccountId: true } });
  if (!worker?.stripeAccountId) return { ok: false, reason: "This worker hasn't set up payouts with Stripe yet." };
  // Always ask Stripe right before paying: an account can be restricted later.
  try {
    if (!(await refreshPayoutStatus(workerId, provider, now))) return { ok: false, reason: "This worker's Stripe account can't receive payouts right now (setup unfinished or restricted)." };
  } catch (e) {
    return { ok: false, reason: e instanceof ProviderError ? e.message : "Couldn't reach Stripe. Try again shortly." };
  }
  const started = await db().$transaction(async (tx) => {
    await payLock(tx, workerId);
    const lines = await orgLines(tx, { orgId: actor.orgId, workerId });
    if (lines.some((l) => l.state.status === "PROCESSING")) {
      return { ok: false as const, reason: "A payment to this worker is still being confirmed. Check its status first." };
    }
    const ready = lines.filter((l) => l.state.payable);
    const t = payableTotal(ready.map((l) => ({ amountCents: l.line.amountCents, feeCents: l.line.feeCents, state: l.state })));
    if (!ready.length) return { ok: false as const, reason: "Nothing approved to pay this worker." };
    if (t.amountCents <= 0) return { ok: false as const, reason: "Deductions cover this worker's approved pay; nothing to send yet." };
    if (expectedCents !== null && expectedCents !== t.amountCents) {
      return { ok: false as const, reason: `The amount changed to ${money(t.amountCents)} since you opened this page. Nothing was sent — check it and pay again.` };
    }
    const transfer = await tx.payoutTransfer.create({
      data: { workerId, orgId: actor.orgId, amountCents: t.amountCents, feeCents: t.feeCents, destination: worker.stripeAccountId!, createdById: actor.profileId, createdAt: now },
    });
    const ids = ready.map((l) => l.line.id);
    const at = await eventAt(tx, ids, now);
    await tx.payoutEvent.createMany({ data: ids.map((payoutId) => ({ payoutId, type: "TRANSFER_STARTED" as const, actorId: actor.profileId, transferId: transfer.id, createdAt: at })) });
    await tx.auditEvent.create({
      data: { actorId: actor.profileId, action: "payout.transfer_started", entityType: "PayoutTransfer", entityId: transfer.id, metadata: { workerId, amountCents: t.amountCents, feeCents: t.feeCents, payoutIds: ids } },
    });
    return { ok: true as const, transferId: transfer.id };
  });
  if (!started.ok) return started;
  return settleTransfer(actor, started.transferId, provider);
}

type TransferLines = Awaited<ReturnType<typeof transferLines>>;
async function transferLines(tx: Tx, transferId: string) {
  const lines = await tx.payout.findMany({ where: { events: { some: { transferId } } }, include: { events: true } });
  const of = (l: (typeof lines)[number]) => l.events.filter((e) => e.transferId === transferId).map((e) => e.type);
  return {
    lines,
    inFlight: lines.filter((l) => {
      const evs = of(l);
      return evs.includes("TRANSFER_STARTED") && !evs.includes("PAID") && !evs.includes("TRANSFER_FAILED") && !evs.includes("REVERSED");
    }),
    unpaid: lines.filter((l) => !of(l).includes("PAID") && !of(l).includes("REVERSED")),
    reversed: lines.some((l) => of(l).includes("REVERSED")),
    paid: lines.filter((l) => of(l).includes("PAID") && !of(l).includes("REVERSED")),
    failed: lines.some((l) => of(l).includes("TRANSFER_FAILED")),
  };
}

/** Records that Stripe made this transfer: every line of it not yet marked paid. */
async function recordPaid(tx: Tx, transferId: string, ref: string, actorId: string | null, source: string, now: Date, tl?: TransferLines) {
  const x = tl ?? (await transferLines(tx, transferId));
  if (!x.unpaid.length) return;
  const at = await eventAt(tx, x.unpaid.map((l) => l.id), now);
  await tx.payoutEvent.createMany({ data: x.unpaid.map((l) => ({ payoutId: l.id, type: "PAID" as const, actorId, transferId, providerRef: ref, reason: source, createdAt: at })) });
  await tx.auditEvent.create({
    data: { actorId, action: x.failed ? "payout.paid_after_failure" : "payout.paid", entityType: "PayoutTransfer", entityId: transferId, metadata: { providerRef: ref, source, payoutIds: x.unpaid.map((l) => l.id) } },
  });
}

/**
 * Finds or makes the Stripe transfer for a Turfcut transfer and records the
 * outcome. Safe to run any number of times. Stripe is called outside any
 * database lock ("sending" is already recorded); the outcome is then
 * written in a short transaction. Only a refusal of the create itself —
 * after the lookup found nothing — counts as failed; anything unclear,
 * including a failed lookup, stays "sending".
 */
export async function settleTransfer(actor: PayActor | null, transferId: string, provider: PayoutProvider, now = new Date()): Promise<PayRun> {
  if (actor && notPayRole(actor)) return { ok: false, reason: "Only owners and finance can pay workers." };
  if (!UUID_RE.test(transferId)) return { ok: false, reason: "Payment not found." };
  const t = await db().payoutTransfer.findUnique({ where: { id: transferId } });
  if (!t || (actor && t.orgId !== actor.orgId)) return { ok: false, reason: "Payment not found." };
  const before = await transferLines(db() as unknown as Tx, transferId);
  if (!before.inFlight.length) {
    if (!before.paid.length && before.reversed) return { ok: true, transferId, outcome: "failed", message: "This payment was reversed in Stripe; its lines are on hold." };
    return before.paid.length
      ? { ok: true, transferId, outcome: "paid", message: "This payment already went through." }
      : { ok: true, transferId, outcome: "failed", message: "This payment didn't go through; its lines can be paid again." };
  }
  let ref: string | null = null;
  let refusal: string | null = null;
  try {
    ref = (await provider.findTransfer(transferId))?.id ?? null;
  } catch (e) {
    // A failed lookup says nothing about whether money moved.
    return { ok: true, transferId, outcome: "pending", message: `${e instanceof ProviderError ? e.message : "Couldn't reach Stripe."} The payment stays "sending" until confirmed.` };
  }
  if (!ref) {
    try {
      ref = (await provider.transfer({ amountCents: t.amountCents, destination: t.destination, key: transferId, workerId: t.workerId })).id;
    } catch (e) {
      const err = e instanceof ProviderError ? e : new ProviderError("Couldn't reach Stripe.", false);
      if (!err.definitive) return { ok: true, transferId, outcome: "pending", message: `${err.message} The payment stays "sending" until confirmed.` };
      refusal = err.message;
    }
  }
  try {
    return await db().$transaction(async (tx) => {
      await payLock(tx, t.workerId);
      const x = await transferLines(tx, transferId);
      if (ref) {
        if (!x.unpaid.length && !x.paid.length && x.reversed) {
          return { ok: true as const, transferId, outcome: "failed" as const, message: "This payment was reversed in Stripe; its lines are on hold." };
        }
        await recordPaid(tx, transferId, ref, actor?.profileId ?? null, "Confirmed when sent", now, x);
        return { ok: true as const, transferId, outcome: "paid" as const, message: `Sent ${money(t.amountCents)} through Stripe.` };
      }
      if (x.inFlight.length) {
        const at = await eventAt(tx, x.inFlight.map((l) => l.id), now);
        await tx.payoutEvent.createMany({
          data: x.inFlight.map((l) => ({ payoutId: l.id, type: "TRANSFER_FAILED" as const, actorId: actor?.profileId ?? null, transferId, reason: refusal!.slice(0, 300), createdAt: at })),
        });
        await tx.auditEvent.create({ data: { actorId: actor?.profileId ?? null, action: "payout.transfer_failed", entityType: "PayoutTransfer", entityId: transferId, metadata: { reason: refusal } } });
      }
      return { ok: true as const, transferId, outcome: "failed" as const, message: refusal! };
    });
  } catch {
    return { ok: true, transferId, outcome: "pending", message: "Stripe answered, but the result couldn't be saved yet. Check status again — it won't send twice." };
  }
}

/** Transfers this organization has in flight, for "check status". */
export async function pendingTransfers(actor: PayActor) {
  assertPayRole(actor);
  const lines = await orgLines(db(), { orgId: actor.orgId });
  const ids = new Set(lines.filter((l) => l.state.status === "PROCESSING" && l.state.transferId).map((l) => l.state.transferId!));
  if (!ids.size) return [];
  return db().payoutTransfer.findMany({ where: { id: { in: [...ids] } }, include: { worker: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } });
}

/**
 * A verified Stripe webhook. Recorded and applied in one transaction, so a
 * failure leaves nothing recorded and Stripe's retry runs it again.
 */
export async function handleProviderEvent(e: ProviderEvent, now = new Date()): Promise<"applied" | "duplicate" | "ignored"> {
  const t = e.transfer;
  const transfer = t?.group && UUID_RE.test(t.group) ? await db().payoutTransfer.findUnique({ where: { id: t.group } }) : null;
  return db().$transaction(async (tx) => {
    if (transfer) await payLock(tx, transfer.workerId);
    const fresh = await tx.providerEvent.createMany({ data: [{ id: e.id, type: e.type, createdAt: now }], skipDuplicates: true });
    if (fresh.count === 0) return "duplicate" as const;
    if (e.account) {
      // An older event delivered late never overwrites a newer check.
      const at = e.createdAt ?? now;
      await tx.worker.updateMany({
        where: { stripeAccountId: e.account.id, OR: [{ payoutsCheckedAt: null }, { payoutsCheckedAt: { lt: at } }] },
        data: { payoutsEnabled: e.account.payoutsEnabled, payoutsCheckedAt: at },
      });
      return "applied" as const;
    }
    if (!t || !transfer) return "ignored" as const;
    const x = await transferLines(tx, transfer.id);
    if (e.type === "transfer.created") {
      // Money moved: record it even if the app had marked the payment failed
      // (a re-payment since then shows as a conflict on the lines).
      await recordPaid(tx, transfer.id, t.id, null, "Confirmed by Stripe", now, x);
      if (t.amountCents !== transfer.amountCents) {
        await tx.auditEvent.create({ data: { action: "payout.amount_mismatch", entityType: "PayoutTransfer", entityId: transfer.id, metadata: { orgId: transfer.orgId, expected: transfer.amountCents, stripe: t.amountCents } } });
      }
      return "applied" as const;
    }
    if (e.type === "transfer.reversed") {
      if (t.reversedCents >= t.amountCents) {
        // Paid lines, and lines still "sending" (a reversal can arrive first).
        const hit = [...x.paid, ...x.unpaid];
        if (hit.length) {
          const at = await eventAt(tx, hit.map((l) => l.id), now);
          await tx.payoutEvent.createMany({ data: hit.map((l) => ({ payoutId: l.id, type: "REVERSED" as const, transferId: transfer.id, providerRef: t.id, reason: "Reversed in Stripe", createdAt: at })) });
          await tx.auditEvent.create({ data: { action: "payout.reversed", entityType: "PayoutTransfer", entityId: transfer.id, metadata: { orgId: transfer.orgId, providerRef: t.id, payoutIds: hit.map((l) => l.id) } } });
        }
      } else {
        // A partial reversal isn't a line-by-line event: flag it for finance.
        await tx.auditEvent.create({
          data: {
            action: "payout.partially_reversed",
            entityType: "PayoutTransfer",
            entityId: transfer.id,
            metadata: { orgId: transfer.orgId, workerId: transfer.workerId, amountCents: t.amountCents, reversedCents: t.reversedCents, providerRef: t.id },
            createdAt: now,
          },
        });
      }
      return "applied" as const;
    }
    return "ignored" as const;
  });
}

/** Partial reversals finance needs to settle with an adjustment. */
export async function partialReversals(actor: PayActor) {
  assertPayRole(actor);
  const orgId = actor.orgId;
  return db().auditEvent.findMany({
    where: { action: "payout.partially_reversed", entityType: "PayoutTransfer", metadata: { path: ["orgId"], equals: orgId } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
