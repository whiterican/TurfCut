import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { FIELD_ROLES } from "@/lib/access";
import { canScheduleShift, UUID_RE } from "@/lib/jobs";
import { applyReviewPlan, payLock, planReview, reviewLockProblem, withdrawStalePay } from "@/lib/pay-data";
import { correctTime, placeTime, timeProblem, wasOffline, type QueuedAction } from "@/lib/offline-sync";
import {
  correctionAction,
  findConflicts,
  samePacket,
  shiftState,
  supervisorAction,
  validateShift,
  workerAction,
  turfAction,
  type CorrectionAction,
  type Outcome,
  type TurfAction,
  type ShiftFacts,
  type SupervisorAction,
  type WorkerAction,
} from "@/lib/field-day";

type Tx = Prisma.TransactionClient;
type Result = { ok: true } | { ok: false; reason: string };

const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

/** Every shift-scoped page and action loads the same shape. */
const SHIFT_INCLUDE = {
  engagement: {
    select: {
      id: true,
      workerId: true,
      status: true,
      worker: { select: { id: true, displayName: true, profileId: true } },
      job: {
        select: {
          id: true,
          orgId: true,
          title: true,
          type: true,
          compensationMethod: true,
          payRateCents: true,
          org: { select: { name: true } },
          supportContacts: true,
          jurisdiction: { select: { version: true, rules: true } },
        },
      },
    },
  },
  events: { orderBy: { createdAt: "asc" as const } },
  validations: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.ShiftInclude;

export type LoadedShift = Prisma.ShiftGetPayload<{ include: typeof SHIFT_INCLUDE }>;

export function facts(s: LoadedShift): ShiftFacts {
  return {
    status: s.status,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    workType: s.engagement.job.type,
    events: s.events.map((e) => ({ id: e.id, type: e.type, payload: e.payload, actorId: e.actorId, createdAt: e.createdAt })),
    validations: s.validations.map((v) => ({ workEventId: v.workEventId, status: v.status, reason: v.reason, createdAt: v.createdAt })),
    campaignTurf: s.turfArea !== null,
  };
}

export async function loadShift(shiftId: string, tx: Tx | ReturnType<typeof db> = db()) {
  if (!UUID_RE.test(shiftId)) return null;
  return tx.shift.findUnique({ where: { id: shiftId }, include: SHIFT_INCLUDE });
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export async function scheduleShift(
  actor: { profileId: string; orgId: string },
  engagementId: string,
  raw: Record<string, unknown>,
  now = new Date()
): Promise<{ ok: true; shiftId: string } | { ok: false; reason: string; errors?: Record<string, string> }> {
  if (!UUID_RE.test(engagementId)) return { ok: false, reason: "Engagement not found." };
  const e = await db().engagement.findUnique({
    where: { id: engagementId },
    include: { job: { include: { jurisdiction: true } } },
  });
  if (!e || e.job.orgId !== actor.orgId) return { ok: false, reason: "Engagement not found." };
  if (e.status !== "ACTIVE" && e.status !== "CLAIMED") return { ok: false, reason: "Only hired workers can be scheduled." };
  if (e.job.status !== "PUBLISHED") return { ok: false, reason: "The job isn't open." };
  // Jurisdiction hard stop: a rule change freezes new shifts until re-approved.
  const freeze = canScheduleShift(e.job.jurisdiction, now);
  if (!freeze.ok) return { ok: false, reason: `New shifts are frozen: ${freeze.reasons.join(" ")}` };

  const v = validateShift(raw, e.job);
  if (!v.ok) return { ok: false, reason: "Fix the highlighted fields.", errors: v.errors };
  if (v.value.endsAt <= now) return { ok: false, reason: "That shift is already over.", errors: { endsAt: "Pick a time in the future." } };
  if (v.value.supervisorId) {
    const sup = await db().profile.findFirst({ where: { id: v.value.supervisorId, orgId: actor.orgId, role: { in: FIELD_ROLES } } });
    if (!sup) return { ok: false, reason: "Fix the highlighted fields.", errors: { supervisorId: "Pick a supervisor from your organization." } };
  }

  return db().$transaction(async (tx) => {
    // One worker, many campaigns: the conflict check spans every engagement.
    await lock(tx, `worker:${e.workerId}`);
    const theirs = await tx.shift.findMany({
      where: { engagement: { workerId: e.workerId }, endsAt: { gt: v.value.startsAt }, startsAt: { lt: v.value.endsAt } },
      select: { startsAt: true, endsAt: true, status: true },
    });
    if (findConflicts(v.value, theirs).length) {
      return { ok: false as const, reason: "This worker already has a shift then (on this or another campaign).", errors: { startsAt: "Overlaps another shift." } };
    }
    const shift = await tx.shift.create({
      data: {
        engagementId,
        startsAt: v.value.startsAt,
        endsAt: v.value.endsAt,
        stagingLocation: v.value.stagingLocation,
        stagingLat: v.value.stagingLat,
        stagingLng: v.value.stagingLng,
        supervisorId: v.value.supervisorId,
        turfArea: v.value.turfArea ? (v.value.turfArea as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
    await tx.auditEvent.create({
      data: {
        actorId: actor.profileId,
        action: "shift.scheduled",
        entityType: "Shift",
        entityId: shift.id,
        metadata: { engagementId, jurisdictionVersion: e.job.jurisdiction.version },
      },
    });
    return { ok: true as const, shiftId: shift.id };
  });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function apply(
  tx: Tx,
  shiftId: string,
  actorId: string,
  out: Outcome,
  now: Date,
  afterReview?: (validationId: string) => Promise<void>,
  sync?: { clientId: string; receivedAt: Date | null }
): Promise<Result> {
  if (!out.ok) return out;
  if (out.event) {
    await tx.workEvent.create({
      data: {
        shiftId,
        type: out.event.type as never,
        payload: out.event.payload as Prisma.InputJsonValue,
        actorId,
        createdAt: now,
        ...(sync ? { clientId: sync.clientId, receivedAt: sync.receivedAt } : {}),
      },
    });
  }
  if (out.closeout) {
    // Append-only: a later review supersedes an earlier one; neither is edited.
    const v = await tx.validation.create({ data: { shiftId, workEventId: null, status: out.closeout.status, reason: out.closeout.reason, reviewerId: actorId, createdAt: now } });
    await afterReview?.(v.id);
    await tx.auditEvent.create({
      data: { actorId, action: "shift.reviewed", entityType: "Shift", entityId: shiftId, metadata: { status: out.closeout.status, reason: out.closeout.reason } },
    });
  }
  if (out.status) {
    const t = out.event?.type;
    await tx.shift.update({
      where: { id: shiftId },
      data: { status: out.status, ...(t === "CHECK_IN" ? { checkInAt: now } : t === "CHECK_OUT" ? { checkOutAt: now } : {}) },
    });
  }
  if (out.event?.type === "SHIFT_CANCELLED") {
    await tx.auditEvent.create({ data: { actorId, action: "shift.cancelled", entityType: "Shift", entityId: shiftId, metadata: out.event.payload as Prisma.InputJsonValue } });
  }
  return { ok: true };
}

/**
 * A worker's field action. Check-in carries the phone's own staging check
 * (yes/no and a band): the server never receives a position.
 */
export type WorkerRequest = WorkerAction;

export async function workerShiftAction(
  actor: { workerId: string; profileId: string },
  shiftId: string,
  req: WorkerRequest,
  at?: Date
): Promise<Result> {
  if (!UUID_RE.test(shiftId)) return { ok: false, reason: "Shift not found." };
  return db().$transaction(async (tx) => {
    await lock(tx, `shift:${shiftId}`);
    // Timed after the lock, so events land in the order they were judged.
    const now = at ?? new Date();
    const s = await loadShift(shiftId, tx);
    if (!s || s.engagement.workerId !== actor.workerId) return { ok: false as const, reason: "Shift not found." };
    const action: WorkerAction = req;
    return apply(tx, shiftId, actor.profileId, workerAction(facts(s), action, now), now);
  });
}

export async function supervisorShiftAction(
  actor: { profileId: string; orgId: string },
  shiftId: string,
  action: SupervisorAction,
  at?: Date
): Promise<Result> {
  if (!UUID_RE.test(shiftId)) return { ok: false, reason: "Shift not found." };
  return db().$transaction(async (tx) => {
    await lock(tx, `shift:${shiftId}`);
    // Timed after the lock, so events land in the order they were judged.
    const now = at ?? new Date();
    const s = await loadShift(shiftId, tx);
    if (!s || s.engagement.job.orgId !== actor.orgId) return { ok: false as const, reason: "Shift not found." };
    let elsewhere: string[] = [];
    if (action.kind === "packet_pickup") {
      // Packets move between shifts of the same job: serialize those checks.
      await lock(tx, `packets:${s.engagement.job.id}`);
      const others = await tx.shift.findMany({
        where: { id: { not: shiftId }, engagement: { jobId: s.engagement.job.id }, events: { some: { type: "PACKET_PICKUP" } } },
        include: SHIFT_INCLUDE,
      });
      elsewhere = others.flatMap((o) => shiftState(facts(o)).packetsOut);
    }
    const out = supervisorAction(facts(s), action, elsewhere, now);
    if (out.ok && action.kind === "batch_count") {
      // A recount changes per-signature pay: not once that pay is approved.
      await payLock(tx, s.engagement.workerId);
      const locked = await reviewLockProblem(tx, shiftId);
      if (locked) return { ok: false as const, reason: locked };
      const r = await apply(tx, shiftId, actor.profileId, out, now);
      // Pay recorded from the old counts can't be approved any more.
      const fresh = r.ok ? await loadShift(shiftId, tx) : null;
      if (fresh) await withdrawStalePay(tx, fresh, actor.profileId, now);
      return r;
    }
    if (!out.ok || action.kind !== "closeout") return apply(tx, shiftId, actor.profileId, out, now);
    // A review creates, keeps or voids the shift's pay line (lib/pay-data.ts).
    const plan = await planReview(tx, s, action.status);
    if (!plan.ok) return plan;
    return apply(tx, shiftId, actor.profileId, out, now, (validationId) => applyReviewPlan(tx, s, plan, validationId, actor.profileId, now));
  });
}

/** The events a worker's own field actions write (not supervisors', not map pins). */
const WORKER_FIELD_EVENTS = new Set(["CHECK_IN", "CHECK_OUT", "PAUSE_START", "PAUSE_END", "SIGNATURE_SUBMITTED", "DOOR_KNOCK", "CONTACT", "PACKET_RETURN"]);

export type SyncResult = { clientId: string; status: "saved" | "duplicate" | "rejected"; reason?: string };

/**
 * Applies actions a worker's phone queued (M6, lib/offline-sync.ts), in the
 * phone's order, at their corrected times — but never before the worker's
 * own field events already on the shift (check-in, breaks, counts, packet
 * returns, check-out): each goes after the latest of those and is judged
 * against the whole shift as it stands, so a backdated action can't slip in
 * front of recorded work. (The phone's clock is the worker's to set; this
 * keeps it from rewriting recorded time.) Other people's events — a packet
 * handed out, a map pin — don't move the worker's times; a packet return
 * goes after that packet was handed out. Once a supervisor has reviewed the
 * shift, nothing more is added from the phone. An id already saved is
 * reported as a duplicate, never saved twice. One transaction under the
 * shift lock.
 */
export async function syncWorkerActions(
  actor: { workerId: string; profileId: string },
  shiftId: string,
  batch: { deviceNow: number; actions: QueuedAction[] },
  serverNow = new Date()
): Promise<{ ok: true; results: SyncResult[] } | { ok: false; reason: string }> {
  if (!UUID_RE.test(shiftId)) return { ok: false, reason: "Shift not found." };
  if (!Number.isFinite(batch.deviceNow)) return { ok: false, reason: "Missing the phone's clock." };
  return db().$transaction(
    async (tx) => {
    await lock(tx, `shift:${shiftId}`);
    const s = await loadShift(shiftId, tx);
    if (!s || s.engagement.workerId !== actor.workerId) return { ok: false as const, reason: "Shift not found." };
    const seen = await tx.workEvent.findMany({ where: { clientId: { in: batch.actions.map((a) => a.clientId) } }, select: { clientId: true, shiftId: true } });
    const done = new Map(seen.map((e) => [e.clientId!, e.shiftId]));
    const f = facts(s);
    const reviewed = shiftState(f).closeout !== null;
    const results: SyncResult[] = [];
    const latest = (keep: (e: (typeof f.events)[number]) => boolean) =>
      f.events.reduce<Date | null>((m, e) => (keep(e) && (!m || e.createdAt > m) ? e.createdAt : m), null);
    // Everything synced goes after the worker's own field events.
    let lastWorker = latest((e) => WORKER_FIELD_EVENTS.has(e.type));
    for (const q of batch.actions) {
      if (done.has(q.clientId)) {
        results.push(done.get(q.clientId) === shiftId ? { clientId: q.clientId, status: "duplicate" } : { clientId: q.clientId, status: "rejected", reason: "Already used for another shift." });
        continue;
      }
      if (reviewed) {
        results.push({ clientId: q.clientId, status: "rejected", reason: "Your supervisor already reviewed this shift. Ask them to add it." });
        continue;
      }
      const corrected = correctTime(q.at, batch.deviceNow, serverNow);
      const late = timeProblem(corrected, serverNow);
      if (late) {
        results.push({ clientId: q.clientId, status: "rejected", reason: late });
        continue;
      }
      // A packet comes back after it went out.
      const pickedUp = q.action.kind === "return_packet" ? latest((e) => e.type === "PACKET_PICKUP" && samePacket(String((e.payload as { packetId?: unknown } | null)?.packetId ?? ""), (q.action as { packetId: string }).packetId)) : null;
      const floor = pickedUp && (!lastWorker || pickedUp > lastWorker) ? pickedUp : lastWorker;
      const t = placeTime(corrected, floor, serverNow);
      // t is after the worker's own events, so their side of the shift is as
      // it stands. (A cancelled shift stays cancelled: nothing more is added.)
      const out = workerAction(f, q.action, t);
      if (!out.ok) {
        results.push({ clientId: q.clientId, status: "rejected", reason: out.reason });
        continue;
      }
      // "Recorded offline" is about when it happened on the phone, not where
      // it was placed: a moved entry is still marked for the reviewer.
      await apply(tx, shiftId, actor.profileId, out, t, undefined, { clientId: q.clientId, receivedAt: wasOffline(corrected, serverNow) ? serverNow : null });
      done.set(q.clientId, shiftId);
      if (out.event) lastWorker = t;
      if (out.event) f.events.push({ type: out.event.type, payload: out.event.payload, actorId: actor.profileId, createdAt: t });
      if (out.status) f.status = out.status;
      results.push({ clientId: q.clientId, status: "saved" });
    }
    return { ok: true as const, results };
    },
    // A day's worth of entries can take a while on a slow connection to the
    // database; the default 5 s would roll the whole batch back.
    { timeout: 30_000, maxWait: 10_000 }
  );
}

const CORRECTED_VOID = "The shift was corrected; it needs approving again.";

/**
 * A supervisor corrects the ledger (M7): a CORRECTION event that supersedes
 * one of the worker's entries, or a missing entry made in the worker's name
 * at a stated time. Refused once pay is approved for payment (then it's an
 * adjustment, by finance). Pay recorded from the old entries is withdrawn,
 * like after a recount, so the shift is approved again at the corrected
 * figure. Shift.status/checkInAt/checkOutAt are refreshed from the
 * corrected timeline (they're denormalized, not the record).
 */
export async function supervisorCorrection(
  actor: { profileId: string; orgId: string },
  shiftId: string,
  action: CorrectionAction,
  at?: Date
): Promise<Result> {
  if (!UUID_RE.test(shiftId)) return { ok: false, reason: "Shift not found." };
  return db().$transaction(async (tx) => {
    await lock(tx, `shift:${shiftId}`);
    const now = at ?? new Date();
    const s = await loadShift(shiftId, tx);
    if (!s || s.engagement.job.orgId !== actor.orgId) return { ok: false as const, reason: "Shift not found." };
    const out = correctionAction(facts(s), action, actor.profileId, now);
    if (!out.ok) return out;
    await payLock(tx, s.engagement.workerId);
    const locked = await reviewLockProblem(tx, shiftId);
    if (locked) return { ok: false as const, reason: locked };
    const ev = await tx.workEvent.create({
      data: { shiftId, type: out.event.type as never, payload: out.event.payload as Prisma.InputJsonValue, actorId: actor.profileId, createdAt: out.event.createdAt },
    });
    const fresh = (await loadShift(shiftId, tx))!;
    const st = shiftState(facts(fresh));
    await tx.shift.update({
      where: { id: shiftId },
      data: {
        status: st.checkedOutAt ? "COMPLETED" : st.checkedInAt ? "ACTIVE" : fresh.status === "CANCELLED" ? "CANCELLED" : "SCHEDULED",
        checkInAt: st.checkedInAt,
        checkOutAt: st.checkedOutAt,
      },
    });
    await withdrawStalePay(tx, fresh, actor.profileId, now, CORRECTED_VOID);
    await tx.auditEvent.create({
      data: {
        actorId: actor.profileId,
        action: action.kind === "correct_event" ? "shift.corrected" : "shift.entry_entered",
        entityType: "Shift",
        entityId: shiftId,
        metadata: { eventId: ev.id, ...(action.kind === "correct_event" ? { supersedesEventId: action.eventId } : { type: action.type }), reason: action.reason.trim() },
      },
    });
    return { ok: true as const };
  });
}

/** The worker's own pins and day turf on their shift. */
export async function workerTurfAction(
  actor: { workerId: string; profileId: string },
  shiftId: string,
  action: TurfAction,
  at?: Date
): Promise<Result> {
  if (!UUID_RE.test(shiftId)) return { ok: false, reason: "Shift not found." };
  return db().$transaction(async (tx) => {
    await lock(tx, `shift:${shiftId}`);
    // Timed after the lock, so events land in the order they were judged.
    const now = at ?? new Date();
    const s = await loadShift(shiftId, tx);
    if (!s || s.engagement.workerId !== actor.workerId) return { ok: false as const, reason: "Shift not found." };
    return apply(tx, shiftId, actor.profileId, turfAction(facts(s), action, now), now);
  });
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** A worker's shifts across every campaign, upcoming first. */
export async function loadWorkerShifts(workerId: string, now = new Date()) {
  return db().shift.findMany({
    where: { engagement: { workerId }, endsAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
    include: SHIFT_INCLUDE,
    orderBy: { startsAt: "asc" },
  });
}

export async function listSupervisors(orgId: string) {
  return db().profile.findMany({ where: { orgId, role: { in: FIELD_ROLES } }, select: { id: true, role: true } });
}

/** The organizer's live view (mockup "Operations"): today's field work. */
export async function loadOps(orgId: string, now = new Date()) {
  const shifts = await db().shift.findMany({
    where: {
      engagement: { job: { orgId } },
      startsAt: { lt: new Date(now.getTime() + 24 * 3_600_000) },
      endsAt: { gt: new Date(now.getTime() - 12 * 3_600_000) },
    },
    include: SHIFT_INCLUDE,
    orderBy: { startsAt: "asc" },
  });
  const rows = shifts.map((s) => ({ shift: s, state: shiftState(facts(s)) }));
  const live = rows.filter((r) => !r.state.cancelled);
  const late = live.filter((r) => !r.state.checkedInAt && now.getTime() > r.shift.startsAt.getTime() + 15 * 60_000 && now < r.shift.endsAt);
  const awaitingReview = live.filter((r) => r.state.checkedOutAt && !r.state.closeout);
  // "In the field" = shifts that have started (or checked in early); the
  // rest of the next 24 hours is counted separately as upcoming.
  const due = live.filter((r) => r.state.checkedInAt || r.shift.startsAt <= now);
  return {
    scheduled: due.length,
    upcoming: live.length - due.length,
    checkedIn: due.filter((r) => r.state.checkedInAt).length,
    signatures: live.reduce((n, r) => n + r.state.signatures, 0),
    doors: live.reduce((n, r) => n + r.state.doors, 0),
    late,
    awaitingReview,
    rows: live,
  };
}

/**
 * "My turf": the worker's shifts from today on (any campaign), with the
 * campaign-assigned turf or the worker's own day turf, and their pins.
 */
export async function loadWorkerTurf(workerId: string, now = new Date()) {
  const startOfToday = new Date(now.getTime() - 18 * 3_600_000);
  return db().shift.findMany({
    where: { engagement: { workerId }, status: { not: "CANCELLED" }, endsAt: { gte: startOfToday } },
    include: SHIFT_INCLUDE,
    orderBy: { startsAt: "asc" },
    take: 20,
  });
}
