/**
 * Shift slots (M8.2): staff post open shifts on a job; hired workers take a
 * seat first come, first served, and each seat is a real Shift. Lock order
 * matches scheduling and closure: the worker, then the slot. A worker gives a
 * seat back by cancelling the shift (the usual cancellation rules), which
 * frees it: seats held are the slot's shifts that aren't cancelled.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { FIELD_ROLES } from "@/lib/access";
import { canScheduleShift, UUID_RE } from "@/lib/jobs";
import { readLaunch } from "@/lib/job-launch";
import { findConflicts } from "@/lib/field-day";
import { claimCheck, headcountCheck, slotState, validateSlot, type SlotFacts } from "@/lib/shift-slots";

type Tx = Prisma.TransactionClient;
type Fail = { ok: false; reason: string; errors?: Record<string, string> };
type Staff = { profileId: string; orgId: string };
type WorkerActor = { workerId: string; profileId: string };

const lock = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
const HIRED = ["ACTIVE", "CLAIMED"] as const;
/** A closed job stops hiring, not the work: people already hired still take shifts (C3.5). */
const WORKING_JOB = ["PUBLISHED", "CLOSED"] as const;

const taken = (tx: Tx | ReturnType<typeof db>, slotId: string) => tx.shift.count({ where: { slotId, status: { not: "CANCELLED" } } });

// ---------------------------------------------------------------------------
// Staff: post, change seats, close
// ---------------------------------------------------------------------------

export async function postSlot(actor: Staff, jobId: string, raw: Record<string, unknown>, now = new Date()): Promise<{ ok: true; slotId: string } | Fail> {
  if (!UUID_RE.test(jobId)) return { ok: false, reason: "Job not found." };
  const job = await db().job.findFirst({ where: { id: jobId, orgId: actor.orgId }, include: { jurisdiction: true } });
  if (!job) return { ok: false, reason: "Job not found." };
  if (!(WORKING_JOB as readonly string[]).includes(job.status)) return { ok: false, reason: "The job isn't open." };
  // Jurisdiction hard stop: a seat becomes a shift, so posting freezes with scheduling.
  const freeze = canScheduleShift(job.jurisdiction, now);
  if (!freeze.ok) return { ok: false, reason: `New shifts are frozen: ${freeze.reasons.join(" ")}` };
  const v = validateSlot(raw, job);
  if (!v.ok) return { ok: false, reason: "Fix the highlighted fields.", errors: v.errors };
  if (readLaunch(job.launch).mode === "SELF" && (v.value.stagingLat !== null || v.value.stagingLocation)) {
    return { ok: false, reason: "Fix the highlighted fields.", errors: { stagingLat: "This job is self-launch: workers start from wherever they are, so a shift has no staging point." } };
  }
  if (v.value.startsAt <= now) return { ok: false, reason: "Open shifts are for later: this one has already started.", errors: { startsAt: "Pick a time in the future." } };
  if (v.value.supervisorId) {
    const sup = await db().profile.findFirst({ where: { id: v.value.supervisorId, orgId: actor.orgId, role: { in: FIELD_ROLES } } });
    if (!sup) return { ok: false, reason: "Fix the highlighted fields.", errors: { supervisorId: "Pick a supervisor from your organization." } };
  }
  const { turfArea, ...rest } = v.value;
  return db().$transaction(async (tx) => {
    const slot = await tx.shiftSlot.create({
      data: { ...rest, jobId, createdById: actor.profileId, turfArea: turfArea ? (turfArea as unknown as Prisma.InputJsonValue) : Prisma.DbNull, createdAt: now },
    });
    await tx.auditEvent.create({
      data: { actorId: actor.profileId, action: "shift_slot.posted", entityType: "ShiftSlot", entityId: slot.id, metadata: { jobId, headcount: rest.headcount, jurisdictionVersion: job.jurisdiction.version }, createdAt: now },
    });
    return { ok: true as const, slotId: slot.id };
  });
}

async function staffSlot(tx: Tx, actor: Staff, slotId: string) {
  if (!UUID_RE.test(slotId)) return null;
  await lock(tx, `slot:${slotId}`);
  return tx.shiftSlot.findFirst({ where: { id: slotId, job: { orgId: actor.orgId } } });
}

/** More or fewer seats; never fewer than are taken. */
export async function setSlotSeats(actor: Staff, slotId: string, headcountRaw: string, now = new Date()): Promise<{ ok: true } | Fail> {
  const hc = headcountRaw.trim();
  const headcount = Number(hc);
  if (!/^\d+$/.test(hc) || headcount < 1 || headcount > 200) return { ok: false, reason: "Seats must be a whole number from 1 to 200." };
  return db().$transaction(async (tx) => {
    const slot = await staffSlot(tx, actor, slotId);
    if (!slot) return { ok: false as const, reason: "Open shift not found." };
    if (now >= slot.endsAt) return { ok: false as const, reason: "This shift is over." };
    const problem = headcountCheck(headcount, await taken(tx, slot.id));
    if (problem) return { ok: false as const, reason: problem };
    if (headcount === slot.headcount) return { ok: true as const };
    await tx.shiftSlot.update({ where: { id: slot.id }, data: { headcount } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "shift_slot.seats_changed", entityType: "ShiftSlot", entityId: slot.id, metadata: { from: slot.headcount, to: headcount }, createdAt: now } });
    return { ok: true as const };
  });
}

/** Closes a slot to new sign-ups. Seats already taken stay scheduled. */
export async function closeSlot(actor: Staff, slotId: string, now = new Date()): Promise<{ ok: true } | Fail> {
  return db().$transaction(async (tx) => {
    const slot = await staffSlot(tx, actor, slotId);
    if (!slot) return { ok: false as const, reason: "Open shift not found." };
    if (slot.status === "CLOSED") return { ok: true as const };
    await tx.shiftSlot.update({ where: { id: slot.id }, data: { status: "CLOSED", closedAt: now } });
    await tx.auditEvent.create({ data: { actorId: actor.profileId, action: "shift_slot.closed", entityType: "ShiftSlot", entityId: slot.id, metadata: {}, createdAt: now } });
    return { ok: true as const };
  });
}

// ---------------------------------------------------------------------------
// Taking a seat: the worker's claim, or staff placing a hired worker
// ---------------------------------------------------------------------------

/**
 * The one way a seat is taken, under the worker's lock then the slot's.
 * Everything is judged under both locks: the slot's state and seats, the
 * engagement, the worker's account and their other shifts.
 */
async function takeSeat(
  tx: Tx,
  slotId: string,
  engagementId: string,
  by: { actorId: string; kind: "WORKER" | "STAFF" },
  now: Date
): Promise<{ ok: true; shiftId: string } | Fail> {
  const e = await tx.engagement.findUnique({ where: { id: engagementId }, select: { id: true, workerId: true, status: true, jobId: true } });
  if (!e) return { ok: false, reason: "Engagement not found." };
  await lock(tx, `worker:${e.workerId}`);
  await lock(tx, `slot:${slotId}`);
  const slot = await tx.shiftSlot.findUnique({ where: { id: slotId }, include: { job: { include: { jurisdiction: true } } } });
  if (!slot || slot.jobId !== e.jobId) return { ok: false, reason: "Open shift not found." };
  const w = await tx.worker.findUniqueOrThrow({ where: { id: e.workerId }, select: { closedAt: true } });
  if (w.closedAt) return { ok: false, reason: by.kind === "WORKER" ? "Your account is closed." : "This worker has closed their account." };
  const current = await tx.engagement.findUniqueOrThrow({ where: { id: e.id }, select: { status: true } });
  if (!(HIRED as readonly string[]).includes(current.status)) return { ok: false, reason: by.kind === "WORKER" ? "Only people hired on this job can take its shifts." : "Only hired workers can be scheduled." };
  if (!(WORKING_JOB as readonly string[]).includes(slot.job.status)) return { ok: false, reason: "The job isn't open." };
  const freeze = canScheduleShift(slot.job.jurisdiction, now);
  if (!freeze.ok) return { ok: false, reason: `New shifts are frozen: ${freeze.reasons.join(" ")}` };

  const mine = await tx.shift.count({ where: { slotId, engagementId: e.id, status: { not: "CANCELLED" } } });
  const facts: SlotFacts = { status: slot.status, startsAt: slot.startsAt, endsAt: slot.endsAt, headcount: slot.headcount, taken: await taken(tx, slotId) };
  // Staff may place someone on a slot closed to sign-ups; seats and time still hold.
  const check = claimCheck(by.kind === "STAFF" && facts.status === "CLOSED" ? { ...facts, status: "OPEN" } : facts, mine > 0, now);
  if (!check.ok) return { ok: false, reason: by.kind === "STAFF" && mine > 0 ? "This worker already has a seat on this shift." : check.reason };

  const theirs = await tx.shift.findMany({
    where: { engagement: { workerId: e.workerId }, endsAt: { gt: slot.startsAt }, startsAt: { lt: slot.endsAt } },
    select: { startsAt: true, endsAt: true, status: true },
  });
  if (findConflicts(slot, theirs).length) {
    return { ok: false, reason: by.kind === "WORKER" ? "You already have a shift then (on this or another campaign)." : "This worker already has a shift then (on this or another campaign)." };
  }
  const shift = await tx.shift.create({
    data: {
      engagementId: e.id,
      slotId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      stagingLocation: slot.stagingLocation,
      stagingLat: slot.stagingLat,
      stagingLng: slot.stagingLng,
      supervisorId: slot.supervisorId,
      turfArea: slot.turfArea === null ? Prisma.DbNull : (slot.turfArea as Prisma.InputJsonValue),
      createdAt: now,
    },
  });
  await tx.auditEvent.create({
    data: {
      actorId: by.actorId,
      action: "shift.scheduled",
      entityType: "Shift",
      entityId: shift.id,
      metadata: { engagementId: e.id, slotId, by: by.kind, jurisdictionVersion: slot.job.jurisdiction.version },
      createdAt: now,
    },
  });
  return { ok: true, shiftId: shift.id };
}

/** A hired worker takes a seat. Final at once: they give it back by cancelling the shift. */
export async function claimSlot(actor: WorkerActor, slotId: string, now = new Date()): Promise<{ ok: true; shiftId: string } | Fail> {
  if (!UUID_RE.test(slotId)) return { ok: false, reason: "Open shift not found." };
  const slot = await db().shiftSlot.findUnique({ where: { id: slotId }, select: { jobId: true } });
  if (!slot) return { ok: false, reason: "Open shift not found." };
  const e = await db().engagement.findFirst({
    where: { jobId: slot.jobId, workerId: actor.workerId, worker: { profileId: actor.profileId }, status: { in: [...HIRED] } },
    select: { id: true },
  });
  // Not hired on the job: the slot isn't theirs to see, so it reads as missing.
  if (!e) return { ok: false, reason: "Open shift not found." };
  return db().$transaction((tx) => takeSeat(tx, slotId, e.id, { actorId: actor.profileId, kind: "WORKER" }, now));
}

/** Staff place a hired worker on a slot by hand. */
export async function assignToSlot(actor: Staff, slotId: string, engagementId: string, now = new Date()): Promise<{ ok: true; shiftId: string } | Fail> {
  if (!UUID_RE.test(slotId) || !UUID_RE.test(engagementId)) return { ok: false, reason: "Open shift not found." };
  const slot = await db().shiftSlot.findFirst({ where: { id: slotId, job: { orgId: actor.orgId } }, select: { id: true } });
  if (!slot) return { ok: false, reason: "Open shift not found." };
  return db().$transaction((tx) => takeSeat(tx, slotId, engagementId, { actorId: actor.profileId, kind: "STAFF" }, now));
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** The job page's slots for staff, newest-ending last, with who holds each seat. */
export async function loadJobSlots(orgId: string, jobId: string, now = new Date()) {
  if (!UUID_RE.test(jobId)) return [];
  const slots = await db().shiftSlot.findMany({
    where: { jobId, job: { orgId }, endsAt: { gt: new Date(now.getTime() - 7 * 86_400_000) } },
    orderBy: { startsAt: "asc" },
    take: 200,
    include: {
      supervisor: { select: { id: true } },
      shifts: {
        where: { status: { not: "CANCELLED" } },
        orderBy: { createdAt: "asc" },
        select: { id: true, engagementId: true, engagement: { select: { worker: { select: { displayName: true } } } } },
      },
    },
  });
  return slots.map((s) => {
    const facts: SlotFacts = { status: s.status, startsAt: s.startsAt, endsAt: s.endsAt, headcount: s.headcount, taken: s.shifts.length };
    return { ...s, facts, state: slotState(facts, now) };
  });
}

/**
 * The worker's open shifts: slots on jobs they're hired on that haven't
 * ended, with whether they hold a seat. Fit to their availability is worked
 * out in their browser, in their own time zone (components/OpenShiftList).
 */
export async function loadWorkerSlots(workerId: string, now = new Date()) {
  const slots = await db().shiftSlot.findMany({
    where: { endsAt: { gt: now }, job: { status: { in: [...WORKING_JOB] }, engagements: { some: { workerId, status: { in: [...HIRED] } } } } },
    orderBy: { startsAt: "asc" },
    take: 200,
    include: {
      job: { select: { id: true, title: true, org: { select: { name: true } } } },
      shifts: { where: { status: { not: "CANCELLED" } }, select: { id: true, engagement: { select: { workerId: true } } } },
    },
  });
  return slots.map((s) => {
    const facts: SlotFacts = { status: s.status, startsAt: s.startsAt, endsAt: s.endsAt, headcount: s.headcount, taken: s.shifts.length };
    const mine = s.shifts.find((x) => x.engagement.workerId === workerId)?.id ?? null;
    return {
      id: s.id,
      job: { id: s.job.id, title: s.job.title, orgName: s.job.org.name },
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      stagingLocation: s.stagingLocation,
      notes: s.notes,
      facts,
      state: slotState(facts, now),
      myShiftId: mine,
    };
  });
}

export type WorkerSlot = Awaited<ReturnType<typeof loadWorkerSlots>>[number];
