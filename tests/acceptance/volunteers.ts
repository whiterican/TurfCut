/* Volunteers, slice 1 (docs/product/VOLUNTEERS.md), on real Postgres: the migration is safe to run twice (run.sh runs
   prisma/v1-volunteers.sql again after the setup), a volunteer job has no pay rate and is a canvass once published,
   no pay line can be written for it whatever the code does, a reviewed volunteer shift gets its validation and no
   payout, a job with people on it cannot turn from paid to volunteer or back, and the worker's volunteer-history
   audience is nobody by default and is carried from one sharing version to the next. */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { supervisorShiftAction } from "@/lib/field-day-data";
import { publishJob, saveDraftProgress } from "@/lib/jobs-data";
import { validateDraft, validateJob } from "@/lib/jobs";
import { saveSharing } from "@/lib/sharing-data";
import { DEFAULT_SHARING } from "@/lib/sharing";

const ORG = "00000000-0000-0000-0000-000000000001";
const W1 = "00000000-0000-0000-0000-000000000101";
const JUR = "00000000-0000-0000-0000-000000000021"; // the seeded CO/Denver profile
const OWNER = "00000000-0000-0000-0000-0000000009b1";
const H = 3_600_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
/** Whether a write is refused by the database, and what it said. */
const refused = async (work: () => Promise<unknown>): Promise<string | null> => {
  try { await work(); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
};

(async () => {
  const p = db();
  await p.profile.create({ data: { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Vol Owner" } });
  const actor = { profileId: OWNER, orgId: ORG };
  const base = { orgId: ORG, jurisdictionId: JUR, title: "Weekend door knock", hiringMethod: { modes: ["instant_claim"] } as Prisma.InputJsonValue, headcount: 10, geography: { city: "Denver", state: "CO" } as Prisma.InputJsonValue, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 24 * H) };
  const job = (over: Partial<Prisma.JobUncheckedCreateInput>) => p.job.create({ data: { ...base, type: "CANVASS", compensationMethod: "VOLUNTEER", status: "DRAFT", ...over } as Prisma.JobUncheckedCreateInput });

  // --- The database's own guards on the job ---
  check("a volunteer job with a pay rate is refused", /Job_volunteer_no_rate/.test((await refused(() => job({ payRateCents: 2500 }))) ?? ""));
  check("…a rate of zero too: none means none", /Job_volunteer_no_rate/.test((await refused(() => job({ payRateCents: 0 }))) ?? ""));
  const vol = await job({});
  check("a volunteer job is stored with no rate", vol.compensationMethod === "VOLUNTEER" && vol.payRateCents === null);
  const petitionDraft = await job({ type: "PETITION", title: "Part-way petition draft" });
  check("a part-way draft may pair volunteer with petition (the builder saves as it goes)", petitionDraft.status === "DRAFT");
  check("…but it cannot be published that way", /Job_volunteer_canvass/.test((await refused(() => p.job.update({ where: { id: petitionDraft.id }, data: { status: "PUBLISHED" } }))) ?? ""));
  check("…nor created published", /Job_volunteer_canvass/.test((await refused(() => job({ type: "PETITION", status: "PUBLISHED" }))) ?? ""));
  const paid = await job({ compensationMethod: "HOURLY", payRateCents: 2500, title: "Paid canvass", status: "PUBLISHED" });
  check("paid jobs are as they were: a rate, any status", paid.payRateCents === 2500);

  // --- The app's rules: the form, the draft writer, the publish gate ---
  const form = { type: "CANVASS", title: "Weekend door knock", jurisdictionId: JUR, city: "Denver", state: "CO", compensationMethod: "VOLUNTEER", payRate: "", headcount: "10", hiringModes: ["instant_claim"] };
  const withRate = validateJob({ ...form, payRate: "25" });
  check("the form refuses a rate on a volunteer job", !withRate.ok && /no pay rate/.test(withRate.errors.payRate ?? ""), withRate);
  const asPetition = validateJob({ ...form, type: "PETITION" });
  check("…and volunteer petition circulation", !asPetition.ok && /canvassing only/.test(asPetition.errors.compensationMethod ?? ""), asPetition);
  // A paid draft turned into a volunteer one loses its rate (the database would refuse it otherwise).
  const paidDraft = await job({ compensationMethod: "HOURLY", payRateCents: 2500, title: "Was paid" });
  const d = validateDraft({ ...form, title: "Was paid" });
  check("(the draft reads as volunteer with no rate)", d.ok && d.draft.compensationMethod === "VOLUNTEER" && d.draft.payRateCents === null, d);
  if (d.ok) await saveDraftProgress(ORG, OWNER, paidDraft.id, d.draft);
  const turned = await p.job.findUniqueOrThrow({ where: { id: paidDraft.id } });
  check("a paid draft saved as volunteer loses its rate", turned.compensationMethod === "VOLUNTEER" && turned.payRateCents === null, { method: turned.compensationMethod, rate: turned.payRateCents });

  const noRule = await publishJob(vol.id, ORG, OWNER);
  check("no rule profile lists volunteer work yet, so it cannot publish: a clear reason, never a silent default", !noRule.ok && noRule.reasons.some((r) => /rules don't cover volunteer work yet/.test(r)), noRule);
  check("…and it stayed a draft", (await p.job.findUniqueOrThrow({ where: { id: vol.id } })).status === "DRAFT");
  const rules = (await p.jurisdictionProfile.findUniqueOrThrow({ where: { id: JUR } })).rules as Record<string, unknown>;
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { rules: { ...rules, compensationAllowed: ["HOURLY", "VOLUNTEER"] } } });
  const withRule = await publishJob(vol.id, ORG, OWNER);
  check("once the profile lists it, that reason is gone (and no pay rate is asked for)", withRule.ok || !withRule.reasons.some((r) => /volunteer|pay rate/i.test(r)), withRule);

  // --- No pay for volunteer work ---
  await p.job.update({ where: { id: vol.id }, data: { status: "PUBLISHED" } });
  const eng = await p.engagement.create({ data: { jobId: vol.id, workerId: W1, status: "ACTIVE" } });
  const start = new Date(Date.now() - 6 * H);
  const shift = await p.shift.create({ data: { engagementId: eng.id, startsAt: start, endsAt: new Date(start.getTime() + 4 * H), status: "COMPLETED", checkInAt: start, checkOutAt: new Date(start.getTime() + 4 * H) } });
  await p.workEvent.createMany({ data: [{ type: "CHECK_IN", at: 0 }, { type: "DOOR_KNOCK", at: 1 }, { type: "DOOR_KNOCK", at: 2 }, { type: "CONTACT", at: 2.1 }, { type: "CHECK_OUT", at: 4 }].map((e) => ({ shiftId: shift.id, type: e.type as never, payload: {}, createdAt: new Date(start.getTime() + e.at * H) })) });
  const line = { workerId: W1, orgId: ORG, kind: "SHIFT" as const, amountCents: 1000, createdById: OWNER };
  check("the database refuses a pay line for a volunteer engagement", /volunteer job has no pay/.test((await refused(() => p.payout.create({ data: { ...line, engagementId: eng.id, shiftId: shift.id } }))) ?? ""));
  check("…named by its shift alone", /volunteer job has no pay/.test((await refused(() => p.payout.create({ data: { ...line, shiftId: shift.id } }))) ?? ""));
  check("…an adjustment too", /volunteer job has no pay/.test((await refused(() => p.payout.create({ data: { ...line, kind: "ADJUSTMENT", engagementId: eng.id } }))) ?? ""));

  const review = await supervisorShiftAction(actor, shift.id, { kind: "closeout", status: "APPROVED", reason: null });
  check("a volunteer shift is reviewed like any other", review.ok, review);
  const validations = await p.validation.findMany({ where: { shiftId: shift.id, workEventId: null } });
  check("…its approval is on record, so the doors are verified", validations.length === 1 && validations[0].status === "APPROVED" && validations[0].reviewerId === OWNER, validations);
  check("…and no pay line was written", (await p.payout.count({ where: { OR: [{ shiftId: shift.id }, { engagementId: eng.id }] } })) === 0);
  const again = await supervisorShiftAction(actor, shift.id, { kind: "closeout", status: "REJECTED", reason: "Wrong turf" });
  check("…it can be re-reviewed, still with no pay line", again.ok && (await p.payout.count({ where: { shiftId: shift.id } })) === 0, again);

  // --- Paid work is untouched ---
  const paidEng = await p.engagement.create({ data: { jobId: paid.id, workerId: W1, status: "ACTIVE" } });
  const paidShift = await p.shift.create({ data: { engagementId: paidEng.id, startsAt: start, endsAt: new Date(start.getTime() + 4 * H), status: "COMPLETED", checkInAt: start, checkOutAt: new Date(start.getTime() + 4 * H) } });
  await p.workEvent.createMany({ data: [{ type: "CHECK_IN", at: 0 }, { type: "CHECK_OUT", at: 4 }].map((e) => ({ shiftId: paidShift.id, type: e.type as never, payload: {}, createdAt: new Date(start.getTime() + e.at * H) })) });
  const paidReview = await supervisorShiftAction(actor, paidShift.id, { kind: "closeout", status: "APPROVED", reason: null });
  const paidLines = await p.payout.findMany({ where: { shiftId: paidShift.id } });
  check("a paid shift still gets its pay line: 4 hours at $25", paidReview.ok && paidLines.length === 1 && paidLines[0].amountCents === 10_000, { paidReview, paidLines: paidLines.map((l) => l.amountCents) });

  // --- People signed up for one or the other ---
  check("a volunteer job with people on it cannot become paid", /can't change between paid and volunteer/.test((await refused(() => p.job.update({ where: { id: vol.id }, data: { compensationMethod: "HOURLY", payRateCents: 2500 } }))) ?? ""));
  check("…nor a paid one become volunteer", /can't change between paid and volunteer/.test((await refused(() => p.job.update({ where: { id: paid.id }, data: { compensationMethod: "VOLUNTEER", payRateCents: null } }))) ?? ""));
  check("…a paid job can still change how it pays", (await refused(() => p.job.update({ where: { id: paid.id }, data: { compensationMethod: "SHIFT_RATE" } }))) === null);
  const empty = await job({ compensationMethod: "HOURLY", payRateCents: 2500, title: "Nobody on it" });
  check("…and a job nobody is on may still be turned into a volunteer one", (await refused(() => p.job.update({ where: { id: empty.id }, data: { compensationMethod: "VOLUNTEER", payRateCents: null } }))) === null);

  // --- Who may see volunteer history: the worker's choice, nobody until they make one ---
  const first = await saveSharing(W1, W1, DEFAULT_SHARING);
  const row1 = await p.workerSharing.findFirstOrThrow({ where: { workerId: W1 }, orderBy: { version: "desc" } });
  check("a first sharing save shows volunteer history to nobody", first.ok && row1.volunteerAudience === "NOBODY", row1.volunteerAudience);
  // A later slice lets the worker choose; a version written with a choice must keep it through saves that don't touch it.
  const { id: _id, createdAt: _at, ...copy } = row1;
  void _id; void _at;
  await p.workerSharing.create({ data: { ...copy, version: row1.version + 1, volunteerAudience: "RELATIONSHIP" } });
  const next = await saveSharing(W1, W1, { ...DEFAULT_SHARING, readReceipts: !DEFAULT_SHARING.readReceipts });
  const row3 = await p.workerSharing.findFirstOrThrow({ where: { workerId: W1 }, orderBy: { version: "desc" } });
  check("a save that doesn't touch it carries the worker's choice to the new version", next.ok && row3.version === row1.version + 2 && row3.volunteerAudience === "RELATIONSHIP", { v: row3.version, a: row3.volunteerAudience, next });

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
