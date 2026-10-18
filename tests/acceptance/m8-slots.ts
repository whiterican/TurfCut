/* M8.2 acceptance checks: shift slots on real Postgres — posting under the jurisdiction hard stop, first come first served under contention, no overfill, overlap across campaigns, giving a seat back, closing, staff placing a worker, closed accounts (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { createJob, publishJob } from "@/lib/jobs-data";
import { validateJob } from "@/lib/jobs";
import { claimJob } from "@/lib/engagements-data";
import { scheduleShift, workerShiftAction } from "@/lib/field-day-data";
import { closeAccount } from "@/lib/account-data";
import { assignToSlot, claimSlot, closeSlot, loadJobSlots, loadWorkerSlots, postSlot, setSlotSeats } from "@/lib/shift-slots-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const SUP = "00000000-0000-0000-0000-0000000000ab";
const W = ["00000000-0000-0000-0000-000000000101", "00000000-0000-0000-0000-000000000102", "00000000-0000-0000-0000-000000000103"];
const JOB = "00000000-0000-0000-0000-000000000011";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

(async () => {
  const p = db();
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }, { id: SUP, role: "SUPERVISOR", orgId: ORG, displayName: "Sam Ortiz" }] });
  await p.organization.update({ where: { id: ORG }, data: { approved: true, contractorTermsSignedAt: new Date(), classificationReviewedAt: new Date() } });
  const seeded = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  const year = new Date().getUTCFullYear() + 1;
  const job = await createJob(ORG, OWNER, (() => {
    const v = validateJob({
      type: "PETITION", title: "Slots test", jurisdictionId: seeded.jurisdictionId, startsAt: `${year}-03-01`, endsAt: `${year}-04-01`, city: "Denver", state: "CO",
      compensationMethod: "HOURLY", payRate: "24", headcount: "10", hiringModes: ["instant_claim"], campaignType: "ballot_measure", affiliation: "nonpartisan",
      message: "Qualify a measure.", contactEmergency: "a", contactDisputes: "b", contactLostMaterials: "c", launchMode: "SELF",
    });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    return v.value;
  })());
  check("the job publishes", (await publishJob(job.id, ORG, OWNER)).ok);
  const owner = { profileId: OWNER, orgId: ORG };
  const sup = { profileId: SUP, orgId: ORG };
  const at = (d: number, h: number, m = 0) => new Date(Date.UTC(year, 2, d, h, m));
  const form = (d: number, h1: number, h2: number, headcount = "2") => ({ startsAt: at(d, h1).toISOString(), endsAt: at(d, h2).toISOString(), headcount, notes: "Meet by the fountain" });
  const now = new Date(Date.UTC(year, 1, 1));

  // --- Posting ---
  const bad = await postSlot(owner, job.id, { ...form(2, 15, 19), headcount: "0" }, now);
  check("a slot needs at least one seat", !bad.ok && !!bad.errors?.headcount, bad);
  const staged = await postSlot(owner, job.id, { ...form(2, 15, 19), stagingLocation: "Library" }, now);
  check("a self-launch job's slot has no staging point", !staged.ok && /self-launch/.test(staged.errors?.stagingLat ?? ""), staged);
  const s1 = await postSlot(sup, job.id, form(2, 15, 19), now);
  check("a supervisor posts a slot (decision A)", s1.ok, s1);
  const other = await postSlot({ profileId: OWNER, orgId: "00000000-0000-0000-0000-0000000000ff" }, job.id, form(2, 15, 19), now);
  check("another organization can't post on the job", !other.ok && /not found/.test(other.reason), other);
  const audit = s1.ok ? await p.auditEvent.findFirst({ where: { entityId: s1.slotId, action: "shift_slot.posted" } }) : null;
  check("posting is audited with the jurisdiction version", !!audit && (audit.metadata as { jurisdictionVersion?: number }).jurisdictionVersion !== undefined, audit);

  // Jurisdiction hard stop: a superseded rule profile freezes posting and taking seats.
  await p.jurisdictionProfile.update({ where: { id: seeded.jurisdictionId }, data: { isCurrent: false } });
  const frozenPost = await postSlot(owner, job.id, form(3, 15, 19), now);
  const frozenClaimHire = await claimJob(W[0], W[0], job.id);
  const frozenClaim = s1.ok ? await claimSlot({ workerId: W[0], profileId: W[0] }, s1.slotId, now) : null;
  await p.jurisdictionProfile.update({ where: { id: seeded.jurisdictionId }, data: { isCurrent: true } });
  check("a superseded jurisdiction blocks posting and taking a seat, with the reason", !frozenPost.ok && /frozen/.test(frozenPost.reason) && !!frozenClaim && !frozenClaim.ok && /frozen/.test(frozenClaim.reason), { frozenPost, frozenClaim, frozenClaimHire });

  // --- Who may take a seat ---
  const slotId = s1.ok ? s1.slotId : "";
  const unhired = await claimSlot({ workerId: W[1], profileId: W[1] }, slotId, now);
  check("a worker not hired on the job can't see or take the slot", !unhired.ok && /not found/.test(unhired.reason) && (await loadWorkerSlots(W[1], now)).length === 0, unhired);
  const hires = await Promise.all(W.slice(1).map((w) => claimJob(w, w, job.id)));
  const eng = [frozenClaimHire, ...hires].map((h) => (h.ok ? h.engagementId : ""));
  check("three workers are hired", eng.every(Boolean), { frozenClaimHire, hires });

  // --- First come, first served under contention: 3 workers race for 2 seats ---
  const race = await Promise.all(W.map((w) => claimSlot({ workerId: w, profileId: w }, slotId, now)));
  const won = race.filter((r) => r.ok).length;
  const held = await p.shift.count({ where: { slotId, status: { not: "CANCELLED" } } });
  check("three at once for two seats: exactly two get one, the third is told it's full", won === 2 && held === 2 && race.some((r) => !r.ok && /seat on this shift is taken/.test(r.reason)), race);
  const winner = W.find((_, i) => race[i].ok)!;
  const loser = W.find((_, i) => !race[i].ok)!;
  const again = await claimSlot({ workerId: winner, profileId: winner }, slotId, now);
  check("a worker can't take two seats on one slot", !again.ok && /already have a seat/.test(again.reason), again);
  const shiftRow = await p.shift.findFirst({ where: { slotId, engagement: { workerId: winner } } });
  check("a seat is a real shift with the slot's times", !!shiftRow && shiftRow.startsAt.getTime() === at(2, 15).getTime() && shiftRow.endsAt.getTime() === at(2, 19).getTime() && shiftRow.status === "SCHEDULED", shiftRow);
  const shiftAudit = shiftRow ? await p.auditEvent.findFirst({ where: { entityId: shiftRow.id, action: "shift.scheduled" } }) : null;
  check("…audited as scheduled by the worker, from the slot", (shiftAudit?.metadata as { by?: string; slotId?: string })?.by === "WORKER" && (shiftAudit?.metadata as { slotId?: string })?.slotId === slotId, shiftAudit);

  // --- Seats: can't go below those taken ---
  const shrink = await setSlotSeats(owner, slotId, "1", now);
  const grow = await setSlotSeats(owner, slotId, "3", now);
  check("seats can't drop below the sign-ups; they can grow", !shrink.ok && /2 people/.test(shrink.reason) && grow.ok, { shrink, grow });

  // --- Overlap across slots and shifts ---
  const s2 = await postSlot(owner, job.id, form(2, 17, 21, "5"), now);
  const overlap = s2.ok ? await claimSlot({ workerId: winner, profileId: winner }, s2.slotId, now) : null;
  check("a worker can't take a seat overlapping a shift they hold", !!overlap && !overlap.ok && /already have a shift then/.test(overlap.reason), overlap);
  const direct = await scheduleShift(owner, eng[W.indexOf(loser)], { startsAt: at(2, 16).toISOString(), endsAt: at(2, 18).toISOString() }, now);
  const overlap2 = await claimSlot({ workerId: loser, profileId: loser }, slotId, now);
  check("…including a shift scheduled the usual way", direct.ok && !overlap2.ok && /already have a shift then/.test(overlap2.reason), { direct, overlap2 });

  // --- Giving a seat back: the usual cancel frees it ---
  const cancel = shiftRow ? await workerShiftAction({ workerId: winner, profileId: winner }, shiftRow.id, { kind: "cancel", reason: "Family thing" }, now) : null;
  const afterCancel = await p.shift.count({ where: { slotId, status: { not: "CANCELLED" } } });
  const back = await claimSlot({ workerId: winner, profileId: winner }, slotId, now);
  check("cancelling the shift frees the seat, and the worker may take it again", !!cancel && cancel.ok && afterCancel === 1 && back.ok, { cancel, afterCancel, back });

  // --- Closing ---
  const s3 = await postSlot(owner, job.id, form(5, 15, 19, "4"), now);
  const s3Id = s3.ok ? s3.slotId : "";
  const closed = await closeSlot(sup, s3Id, now);
  const afterClose = await claimSlot({ workerId: W[0], profileId: W[0] }, s3Id, now);
  const closedRow = await p.shiftSlot.findUnique({ where: { id: s3Id } });
  check("a closed slot takes no sign-ups and records when it closed", closed.ok && !afterClose.ok && /closed to new sign-ups/.test(afterClose.reason) && closedRow?.status === "CLOSED" && !!closedRow.closedAt, { closed, afterClose, closedRow });
  const placed = await assignToSlot(owner, s3Id, eng[0], now);
  const placedAgain = await assignToSlot(owner, s3Id, eng[0], now);
  const placedAudit = placed.ok ? await p.auditEvent.findFirst({ where: { entityId: placed.shiftId, action: "shift.scheduled" } }) : null;
  check("staff can still place a hired worker on a closed slot, once, audited as staff", placed.ok && !placedAgain.ok && /already has a seat/.test(placedAgain.reason) && (placedAudit?.metadata as { by?: string })?.by === "STAFF", { placed, placedAgain, placedAudit });
  const foreign = await assignToSlot({ profileId: OWNER, orgId: "00000000-0000-0000-0000-0000000000ff" }, s3Id, eng[1], now);
  check("another organization can't place anyone", !foreign.ok, foreign);

  // --- Started slots ---
  const late = await claimSlot({ workerId: W[2], profileId: W[2] }, s2.ok ? s2.slotId : "", at(2, 17, 30));
  check("a slot that has started takes no one", !late.ok && /already started/.test(late.reason), late);

  // --- Views ---
  const staffView = await loadJobSlots(ORG, job.id, now);
  const first = staffView.find((s) => s.id === slotId);
  check("staff see each slot's seats and who holds them", !!first && first.facts.taken === 2 && first.shifts.length === 2 && first.shifts.every((x) => !!x.engagement.worker.displayName), first);
  check("staff of another organization see nothing", (await loadJobSlots("00000000-0000-0000-0000-0000000000ff", job.id, now)).length === 0);
  const mine = await loadWorkerSlots(winner, now);
  check("the worker sees the job's slots and which seat is theirs", mine.length === 3 && !!mine.find((s) => s.id === slotId)?.myShiftId && mine.every((s) => !("shifts" in s)), mine);

  // --- Closed accounts ---
  const s4 = await postSlot(owner, job.id, form(9, 15, 19, "3"), now);
  const s4Id = s4.ok ? s4.slotId : "";
  const pre = await claimSlot({ workerId: W[2], profileId: W[2] }, s4Id, now);
  const closedAcct = await closeAccount({ userId: W[2], workerId: W[2] }, now);
  const afterAcct = await p.shift.count({ where: { slotId: s4Id, status: { not: "CANCELLED" } } });
  const reclaim = await claimSlot({ workerId: W[2], profileId: W[2] }, s4Id, now);
  const staffPlace = await assignToSlot(owner, s4Id, eng[2], now);
  check("closing the account gives the seat back; a closed account can't take or be given one", pre.ok && closedAcct.ok && afterAcct === 0 && !reclaim.ok && !staffPlace.ok, { pre, closedAcct, afterAcct, reclaim, staffPlace });

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
