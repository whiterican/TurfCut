/* Volunteers, slice 1 (docs/product/VOLUNTEERS.md), on real Postgres: the migration is safe to run twice (run.sh runs
   prisma/v1-volunteers.sql again after the setup), a volunteer job has no pay rate and is a canvass once published,
   no pay line can be written for it whatever the code does, a reviewed volunteer shift gets its validation and no
   payout, a job with people on it cannot turn from paid to volunteer or back, and the worker's volunteer-history
   audience is nobody by default and is carried from one sharing version to the next. */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { supervisorShiftAction } from "@/lib/field-day-data";
import { publishJob, saveDraftProgress, updatePublishedJob } from "@/lib/jobs-data";
import { validateDraft, validateJob, VOLUNTEERING_NOT_YET } from "@/lib/jobs";
import { proposeJurisdictionVersion } from "@/lib/admin-jurisdictions-data";
import { readRules } from "@/lib/jurisdiction-rules";
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
  // The first checks are about the off state: off whatever the shell running this has exported.
  delete process.env.TURFCUT_VOLUNTEERS;
  const p = db();
  await p.profile.create({ data: { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Vol Owner" } });
  const actor = { profileId: OWNER, orgId: ORG };
  // The organization is ready to publish (approved, terms signed, classification reviewed), and the jobs are complete,
  // so the only thing between a volunteer job and publishing is the volunteer rules.
  await p.organization.update({ where: { id: ORG }, data: { approved: true, contractorTermsSignedAt: new Date(), classificationReviewedAt: new Date() } });
  const disclosure = { campaignType: "candidate", affiliation: "nonpartisan", campaignName: "Neighbors for Denver", issues: {}, message: "Talk to your neighbors about the election." };
  const contacts = { emergency: "Field lead, 555-0100", disputes: "ops@example.org", lostMaterials: "Office, 555-0101" };
  const base = { orgId: ORG, jurisdictionId: JUR, title: "Weekend door knock", hiringMethod: { modes: ["instant_claim"] } as Prisma.InputJsonValue, headcount: 10, geography: { city: "Denver", state: "CO" } as Prisma.InputJsonValue, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 24 * H), campaignDisclosure: disclosure as Prisma.InputJsonValue, supportContacts: contacts as Prisma.InputJsonValue };
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

  // --- Off until the last slice is merged: nothing below can be reached in production ---
  const form = { type: "CANVASS", title: "Weekend door knock", jurisdictionId: JUR, city: "Denver", state: "CO", compensationMethod: "VOLUNTEER", payRate: "", headcount: "10", hiringModes: ["instant_claim"] };
  const profile = await p.jurisdictionProfile.findUniqueOrThrow({ where: { id: JUR } });
  const rules = profile.rules as Record<string, unknown>;
  const offForm = validateJob(form);
  check("while volunteering is off, the form refuses a volunteer job", !offForm.ok && offForm.errors.compensationMethod === VOLUNTEERING_NOT_YET, offForm);
  const offPublish = await publishJob(vol.id, ORG, OWNER);
  check("…a stored one cannot be published", !offPublish.ok && offPublish.reasons.includes(VOLUNTEERING_NOT_YET), offPublish);
  const versionsBefore = await p.jurisdictionProfile.count();
  const offRules = await proposeJurisdictionVersion({ userId: OWNER, staff: true }, { state: "CO", locality: "Denver", rules: { ...readRules(profile.rules), compensationAllowed: ["HOURLY", "VOLUNTEER"] }, effectiveFrom: null, reason: "A crafted request" });
  check("…and staff cannot list it on a rule profile, whatever is posted", !offRules.ok && offRules.message.includes("can't be allowed on a rule profile yet"), offRules);
  check("…no version was written", (await p.jurisdictionProfile.count()) === versionsBefore);

  // --- From here on: the rules once volunteering is on (the last slice switches it on; tests do it with this) ---
  process.env.TURFCUT_VOLUNTEERS = "1";

  // --- The app's rules: the form, the draft writer, the publish gate ---
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
  // A later save that sends a rate but no usable method (a stale or tampered page) must not put a rate back on it.
  const stale = validateDraft({ ...form, title: "Was paid", compensationMethod: "", payRate: "25" });
  check("(a save with no method but a rate reads as: rate 2500, method left alone)", stale.ok && stale.draft.payRateCents === 2500 && !("compensationMethod" in stale.draft), stale);
  const staleSave = stale.ok ? await refused(() => saveDraftProgress(ORG, OWNER, paidDraft.id, stale.draft)) : "not ok";
  const after = await p.job.findUniqueOrThrow({ where: { id: paidDraft.id } });
  check("…and the volunteer draft keeps no rate: saved without an error", staleSave === null && after.compensationMethod === "VOLUNTEER" && after.payRateCents === null, { staleSave, rate: after.payRateCents });

  const noRule = await publishJob(vol.id, ORG, OWNER);
  check("no rule profile lists volunteer work yet, so it cannot publish: a clear reason, never a silent default", !noRule.ok && noRule.reasons.some((r) => /rules don't cover volunteer work yet/.test(r)), noRule);
  check("…and it stayed a draft", (await p.job.findUniqueOrThrow({ where: { id: vol.id } })).status === "DRAFT");
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { rules: { ...rules, compensationAllowed: ["HOURLY", "VOLUNTEER"] } } });
  const withRule = await publishJob(vol.id, ORG, OWNER);
  check("once the profile lists it, the volunteer job publishes, with no pay rate asked for", withRule.ok && (await p.job.findUniqueOrThrow({ where: { id: vol.id } })).status === "PUBLISHED", withRule);

  // --- No pay for volunteer work ---
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
  // The third thing a pay line can name is the approval it pays.
  check("a pay line naming only that approval is refused", /volunteer job has no pay/.test((await refused(() => p.payout.create({ data: { ...line, validationId: validations[0]?.id } }))) ?? ""));
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
  // A line is refused if EITHER thing it names is volunteer work: a paid engagement cannot lend its name to a volunteer shift.
  check("a pay line naming a paid engagement and a volunteer shift is refused", /volunteer job has no pay/.test((await refused(() => p.payout.create({ data: { ...line, engagementId: paidEng.id, shiftId: shift.id } }))) ?? ""));
  check("…and one naming a volunteer engagement and a paid shift", /volunteer job has no pay/.test((await refused(() => p.payout.create({ data: { ...line, engagementId: eng.id, shiftId: paidShift.id } }))) ?? ""));

  // --- People signed up for one or the other ---
  check("a volunteer job with people on it cannot become paid", /can't change between paid and volunteer/.test((await refused(() => p.job.update({ where: { id: vol.id }, data: { compensationMethod: "HOURLY", payRateCents: 2500 } }))) ?? ""));
  check("…nor a paid one become volunteer", /can't change between paid and volunteer/.test((await refused(() => p.job.update({ where: { id: paid.id }, data: { compensationMethod: "VOLUNTEER", payRateCents: null } }))) ?? ""));
  check("…a paid job can still change how it pays", (await refused(() => p.job.update({ where: { id: paid.id }, data: { compensationMethod: "SHIFT_RATE" } }))) === null);
  // Through the app, the same switch is a reason on the form, not an error page.
  const full = validateJob({ ...form, startsAt: new Date(Date.now() + 24 * H).toISOString().slice(0, 10), endsAt: new Date(Date.now() + 20 * 24 * H).toISOString().slice(0, 10), campaignType: "candidate", affiliation: "nonpartisan", campaignName: "Neighbors for Denver", message: "Talk to your neighbors about the election.", contactEmergency: "Field lead, 555-0100", contactDisputes: "ops@example.org", contactLostMaterials: "Office, 555-0101", cancellationNoticeHours: "12" });
  check("(the complete volunteer form is valid)", full.ok, full);
  const viaApp = full.ok ? await updatePublishedJob(paid.id, ORG, OWNER, full.value) : null;
  check("editing a paid job with people on it into a volunteer one is refused with a reason", !!viaApp && !viaApp.ok && /can't change between paid and volunteer/.test(viaApp.reasons.join(" ")), viaApp);
  check("…and the job is as it was", (await p.job.findUniqueOrThrow({ where: { id: paid.id } })).compensationMethod === "SHIFT_RATE");
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
