import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UUID_RE } from "@/lib/jobs";
import { verifiedWork } from "@/lib/scorecard";
import { computeShiftPay, disputeProblem, lineState, reReviewProblem, type LineState, type PayEventFact, type PayResult } from "@/lib/pay";

type Tx = Prisma.TransactionClient;
type Client = Tx | ReturnType<typeof db>;
type Result = { ok: true } | { ok: false; reason: string };

const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

const asFacts = (events: Array<{ type: string; createdAt: Date; reason: string | null; transferId: string | null; providerRef: string | null }>): PayEventFact[] =>
  events.map((e) => ({ type: e.type as PayEventFact["type"], createdAt: e.createdAt, reason: e.reason, transferId: e.transferId, providerRef: e.providerRef }));

/**
 * A time after every existing event of these lines, so each line's history
 * replays in the order it was written (callers hold the line's lock).
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

export type ReviewPlan = { ok: false; reason: string } | { ok: true; pay: PayResult & { ok: true } | null; voidIds: string[]; keepId: string | null };

/**
 * What a supervisor's review does to pay, decided before anything is
 * written (runs inside the shift lock):
 * - Approving needs pay that can be calculated (e.g. a per-signature shift
 *   needs its batch count).
 * - A review can change only while the shift's pay awaits approval; the old
 *   line is then voided and replaced. Re-approving with the same pay keeps it.
 */
export async function planReview(tx: Tx, s: ReviewShift, status: "APPROVED" | "REJECTED"): Promise<ReviewPlan> {
  const lines = await tx.payout.findMany({ where: { shiftId: s.id, kind: "SHIFT" }, include: { events: true } });
  const states = lines.map((l) => ({ line: l, state: lineState(l, asFacts(l.events), false) }));
  const blocked = reReviewProblem(states.map((x) => x.state));
  if (blocked) return { ok: false, reason: blocked };
  const active = states.filter((x) => x.state.status !== "VOIDED").map((x) => x.line);
  if (status === "REJECTED") return { ok: true, pay: null, voidIds: active.map((l) => l.id), keepId: null };
  const job = s.engagement.job;
  const pay = computeShiftPay({
    method: job.compensationMethod,
    rateCents: job.payRateCents,
    workType: job.type,
    work: verifiedWork(s.events, s.validations),
    jurisdictionVersion: job.jurisdiction.version,
  });
  if (!pay.ok) return { ok: false, reason: `Can't approve yet: ${pay.reason}` };
  const same = active.length === 1 && active[0].amountCents === pay.amountCents ? active[0] : null;
  return { ok: true, pay, voidIds: active.filter((l) => l !== same).map((l) => l.id), keepId: same?.id ?? null };
}

/** Applies a plan after the review's Validation row is written. */
export async function applyReviewPlan(tx: Tx, s: ReviewShift, plan: ReviewPlan & { ok: true }, validationId: string, actorId: string, now: Date): Promise<void> {
  const at = await eventAt(tx, plan.voidIds, now);
  for (const id of plan.voidIds) {
    await tx.payoutEvent.create({ data: { payoutId: id, type: "VOIDED", actorId, reason: "The shift was re-reviewed.", createdAt: at } });
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
  await tx.auditEvent.create({
    data: {
      actorId,
      action: "payout.created",
      entityType: "Payout",
      entityId: line.id,
      metadata: { shiftId: s.id, validationId, amountCents: line.amountCents, feeCents: line.feeCents, formula: plan.pay.basis.formula },
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

export async function openDispute(actor: { workerId: string; profileId: string }, shiftId: string, reason: unknown, now = new Date()): Promise<Result> {
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
    const problem = disputeProblem({
      reviewed: s.validations.length > 0,
      openDispute: s.payDisputes.some((d) => !d.resolution),
      disputes: s.payDisputes.length,
      reason: text,
    });
    if (problem) return { ok: false as const, reason: problem };
    const line = s.payouts.find((l) => lineState(l, asFacts(l.events), false).status !== "VOIDED");
    const d = await tx.payDispute.create({
      data: { shiftId, workerId: actor.workerId, orgId: s.engagement.job.orgId, payoutId: line?.id ?? null, openedById: actor.profileId, reason: text, createdAt: now },
    });
    await tx.auditEvent.create({
      data: { actorId: actor.profileId, action: "pay.dispute_opened", entityType: "PayDispute", entityId: d.id, metadata: { shiftId, payoutId: line?.id ?? null } },
    });
    return { ok: true as const };
  });
}
