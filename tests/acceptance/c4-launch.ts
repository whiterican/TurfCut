/* C4 acceptance checks: job launch and tools on real Postgres — launch mode, staging points and check-in radius; editing live jobs and the 24-hour release (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { createJob, loadJobChanges, publishJob, updateDraftJob, updatePublishedJob } from "@/lib/jobs-data";
import { openRelease, releaseFromJob } from "@/lib/job-changes-data";
import { cancellationOf } from "@/lib/scorecard";
import { validateJob } from "@/lib/jobs";
import { radiusFor, readLaunch } from "@/lib/job-launch";
import { facts, heldOnJob, loadShift, scheduleShift, supervisorShiftAction, syncWorkerActions, workerShiftAction } from "@/lib/field-day-data";
import { shiftState } from "@/lib/field-day";
import { readTools } from "@/lib/job-tools";
import { applyToJob, claimJob, inviteWorker } from "@/lib/engagements-data";
import { loadNotifications } from "@/lib/notifications-data";
import { savePreferences } from "@/lib/political-fit-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const W1 = "00000000-0000-0000-0000-000000000101";
const JOB = "00000000-0000-0000-0000-000000000011";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };

(async () => {
  const p = db();
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" }] });
  await p.organization.update({ where: { id: ORG }, data: { approved: true, contractorTermsSignedAt: new Date(), classificationReviewedAt: new Date() } });
  const seeded = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  const year = new Date().getUTCFullYear() + 1;
  const base = {
    type: "PETITION", title: "Launch test", jurisdictionId: seeded.jurisdictionId, startsAt: `${year}-03-01`, endsAt: `${year}-04-01`, city: "Denver", state: "CO",
    compensationMethod: "HOURLY", payRate: "24", headcount: "4", hiringModes: ["instant_claim", "application"], campaignType: "ballot_measure", affiliation: "nonpartisan",
    message: "Qualify a measure.", contactEmergency: "a", contactDisputes: "b", contactLostMaterials: "c",
  };
  const input = (over: Record<string, unknown>) => {
    const v = validateJob({ ...base, ...over });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    return v.value;
  };
  const org = { profileId: OWNER, orgId: ORG };

  // --- C4.2: launch mode and staging points ---
  const staged = await createJob(ORG, OWNER, input({ launchMode: "STAGED" }));
  const blocked = await publishJob(staged.id, ORG, OWNER);
  check("a staged job with no staging point can't publish, and says why", !blocked.ok && blocked.reasons.some((r) => /staging point/.test(r)), blocked);
  const self = await createJob(ORG, OWNER, input({ launchMode: "SELF", point_0_name: "ignored", point_0_lat: "39.7", point_0_lng: "-104.9" }));
  check("self-launch keeps no points and publishes", readLaunch(self.launch).points.length === 0 && (await publishJob(self.id, ORG, OWNER)).ok);
  const legacy = await createJob(ORG, OWNER, input({}));
  check("a job that says nothing about its launch (API callers from before C4) stores none and publishes as before", legacy.launch === null && (await publishJob(legacy.id, ORG, OWNER)).ok);
  const withPoint = input({ launchMode: "STAGED", point_0_name: "Library steps", point_0_address: "10 W 14th Ave", point_0_lat: "39.737", point_0_lng: "-104.989", point_0_radius: "400" });
  const edited = await updateDraftJob(staged.id, ORG, OWNER, withPoint);
  const launch = readLaunch((await p.job.findUniqueOrThrow({ where: { id: staged.id } })).launch);
  check("adding a point to the draft stores it with its radius, and the job publishes", edited && launch.points.length === 1 && launch.points[0].radiusM === 400 && (await publishJob(staged.id, ORG, OWNER)).ok, launch);
  const claim = await claimJob(W1, W1, staged.id);
  const shift = claim.ok
    ? await scheduleShift(org, claim.engagementId, { startsAt: new Date(Date.UTC(year, 2, 2, 15)).toISOString(), endsAt: new Date(Date.UTC(year, 2, 2, 19)).toISOString(), stagingLocation: "Library steps, 10 W 14th Ave", stagingLat: "39.737", stagingLng: "-104.989" })
    : null;
  const row = shift?.ok ? await p.shift.findUniqueOrThrow({ where: { id: shift.shiftId } }) : null;
  check("a shift at the job's point gets that point's check-in radius; elsewhere, the default", !!row && radiusFor(launch, { lat: row.stagingLat, lng: row.stagingLng }) === 400 && radiusFor(launch, { lat: 39.8, lng: -104.989 }) === 250, { shift, row });
  // The phone's check-in band names the radius it compared with: the server confirms it is this shift's.
  const me = { workerId: W1, profileId: W1 };
  const start = row ? new Date(row.startsAt.getTime() - 5 * 60_000) : new Date();
  const wrongRadius = row ? await workerShiftAction(me, row.id, { kind: "check_in", location: { checked: true, atStaging: true, distance: "under 300 m" } }, start) : null;
  // The offline sync (the route the phone uses) confirms the same thing.
  const synced = row
    ? await syncWorkerActions(me, row.id, { deviceNow: start.getTime(), actions: [{ clientId: crypto.randomUUID(), at: start.getTime(), action: { kind: "check_in", location: { checked: true, atStaging: true, distance: "under 300 m" } } }] }, start)
    : null;
  const syncedResult = synced?.ok ? synced.results[0] : null;
  check("…and so does the offline sync", !!syncedResult && syncedResult.status === "rejected" && /different staging point/.test(syncedResult.reason ?? ""), synced);
  const rightRadius = row ? await workerShiftAction(me, row.id, { kind: "check_in", location: { checked: true, atStaging: true, distance: "under 400 m" } }, start) : null;
  check("a check-in made against another radius is refused; one against the shift's own point goes through", !!wrongRadius && !wrongRadius.ok && /different staging point/.test(wrongRadius.reason) && !!rightRadius && rightRadius.ok, { wrongRadius, rightRadius });
  const stored = row ? await p.workEvent.findFirst({ where: { shiftId: row.id, type: "CHECK_IN" }, select: { payload: true } }) : null;
  const pl = (stored?.payload ?? {}) as Record<string, unknown>;
  check("…and what's stored is the yes/no and the band, never a position", pl.atStaging === true && pl.distance === "under 400 m" && Object.keys(pl).sort().join() === "atStaging,distance", stored);
  // A self-launch job has no staging point on its shifts.
  const selfClaim = await claimJob(W1, W1, self.id);
  const selfShift = selfClaim.ok
    ? await scheduleShift(org, selfClaim.engagementId, { startsAt: new Date(Date.UTC(year, 2, 3, 15)).toISOString(), endsAt: new Date(Date.UTC(year, 2, 3, 19)).toISOString(), stagingLat: "39.737", stagingLng: "-104.989" })
    : null;
  const selfShiftOk = selfClaim.ok
    ? await scheduleShift(org, selfClaim.engagementId, { startsAt: new Date(Date.UTC(year, 2, 3, 15)).toISOString(), endsAt: new Date(Date.UTC(year, 2, 3, 19)).toISOString() })
    : null;
  check("a self-launch job refuses a staging point on a shift, and schedules without one", !!selfShift && !selfShift.ok && /self-launch/.test(selfShift.errors?.stagingLat ?? "") && !!selfShiftOk && selfShiftOk.ok, { selfShift, selfShiftOk });
  const noPointStart = new Date(Date.UTC(year, 2, 3, 14, 55));
  const atNothing = selfShiftOk?.ok ? await workerShiftAction(me, selfShiftOk.shiftId, { kind: "check_in", location: { checked: true, atStaging: true, distance: "under 250 m" } }, noPointStart) : null;
  const unchecked = selfShiftOk?.ok ? await workerShiftAction(me, selfShiftOk.shiftId, { kind: "check_in", location: { checked: false } }, noPointStart) : null;
  check("a shift with no staging point can't be checked in \"at staging\"; an unchecked check-in goes through", !!atNothing && !atNothing.ok && /no staging point/.test(atNothing.reason) && !!unchecked && unchecked.ok, { atNothing, unchecked });

  // --- C4.3: editing a published job; the 24-hour release ---
  const W2 = "00000000-0000-0000-0000-000000000102";
  const live = await createJob(ORG, OWNER, input({ launchMode: "SELF" }));
  check("the live job publishes", (await publishJob(live.id, ORG, OWNER)).ok);
  const hiredClaim = await claimJob(W1, W1, live.id);
  const applied = await applyToJob(W2, W2, live.id);
  const hiredId = hiredClaim.ok ? hiredClaim.engagementId : "";
  const hiredShift = hiredClaim.ok ? await scheduleShift(org, hiredId, { startsAt: new Date(Date.UTC(year, 2, 10, 15)).toISOString(), endsAt: new Date(Date.UTC(year, 2, 10, 19)).toISOString() }) : null;
  check("W1 is hired with a shift, W2 applied", hiredClaim.ok && applied.ok && !!hiredShift?.ok, { hiredClaim, applied, hiredShift });
  const noticesFor = (jobId: string) => p.notification.findMany({ where: { kind: "JOB_CHANGED", engagement: { jobId } }, select: { recipientId: true } });
  const cosmetic = await updatePublishedJob(live.id, ORG, OWNER, input({ launchMode: "SELF", title: "Launch test (renamed)" }));
  check("a cosmetic edit is recorded, tells everyone on the job, and is not material", cosmetic.ok && cosmetic.changed.join() === "title" && cosmetic.material.length === 0 && cosmetic.told === 2 && (await noticesFor(live.id)).length === 2, cosmetic);
  check("…and nobody can leave over it", (await openRelease({ id: hiredId, jobId: live.id, status: "CLAIMED", createdAt: new Date(0) })) === null);
  const same = await updatePublishedJob(live.id, ORG, OWNER, input({ launchMode: "SELF", title: "Launch test (renamed)" }));
  check("saving the same terms again records nothing", same.ok && same.changed.length === 0 && (await p.jobChange.count({ where: { jobId: live.id } })) === 1, same);
  const broken = await updatePublishedJob(live.id, ORG, OWNER, input({ launchMode: "STAGED", title: "Launch test (renamed)" }));
  check("an edit that would stop the job publishing is refused, nothing recorded", !broken.ok && /staging point/.test(broken.reasons.join(" ")) && (await p.jobChange.count({ where: { jobId: live.id } })) === 1, broken);
  const payCut = await updatePublishedJob(live.id, ORG, OWNER, input({ launchMode: "SELF", title: "Launch test (renamed)", payRate: "22", startsAt: `${year}-03-02` }));
  const changeRow = await p.jobChange.findFirst({ where: { jobId: live.id }, orderBy: { createdAt: "desc" } });
  check("a change to pay and dates is material: recorded with before and after, and everyone told again", payCut.ok && payCut.material.join() === "dates,pay" && changeRow?.material.join() === "dates,pay" && (changeRow.changes as { payRateCents?: { from: number; to: number } }).payRateCents?.to === 2200 && (await noticesFor(live.id)).length === 4, { payCut, changeRow });
  const release = await openRelease({ id: hiredId, jobId: live.id, status: "CLAIMED", createdAt: new Date(0) });
  check("the hired worker may leave for 24 hours", !!release && release.material.join() === "dates,pay" && release.deadline.getTime() - release.createdAt.getTime() === 24 * 3_600_000, release);
  // Mid-shift, the worker checks out before leaving.
  const underWay = await scheduleShift(org, hiredId, { startsAt: new Date(Date.UTC(year, 2, 11, 15)).toISOString(), endsAt: new Date(Date.UTC(year, 2, 11, 19)).toISOString() });
  const underWayStart = new Date(Date.UTC(year, 2, 11, 14, 55));
  const checkedIn = underWay.ok ? await workerShiftAction(me, underWay.shiftId, { kind: "check_in", location: { checked: false } }, underWayStart) : null;
  const midShift = await releaseFromJob({ workerId: W1, profileId: W1 }, hiredId);
  const checkedOut = underWay.ok ? await workerShiftAction(me, underWay.shiftId, { kind: "check_out" }, new Date(Date.UTC(year, 2, 11, 19))) : null;
  check("a worker mid-shift checks out before leaving", !!checkedIn?.ok && !midShift.ok && /current shift/.test(midShift.reason) && !!checkedOut?.ok, { checkedIn, midShift, checkedOut });
  const notHired = await releaseFromJob({ workerId: W2, profileId: W2 }, applied.ok ? applied.engagementId : "");
  check("an applicant isn't released this way (nothing to leave)", !notHired.ok && /hired/.test(notHired.reason), notHired);
  const tooLate = await releaseFromJob({ workerId: W1, profileId: W1 }, hiredId, new Date(Date.now() + 25 * 3_600_000));
  check("after 24 hours the release has passed", !tooLate.ok && /24 hours/.test(tooLate.reason), tooLate);
  const left = await releaseFromJob({ workerId: W1, profileId: W1 }, hiredId);
  const afterLeave = await p.engagement.findUniqueOrThrow({ where: { id: hiredId } });
  const cancelledEv = hiredShift?.ok ? await p.workEvent.findFirst({ where: { shiftId: hiredShift.shiftId, type: "SHIFT_CANCELLED" } }) : null;
  check("leaving in time withdraws the engagement, cancels the upcoming shift as a job-change release, and tells the organization",
    left.ok && left.cancelledShifts === 1 && afterLeave.status === "WITHDRAWN" && (cancelledEv?.payload as { jobChanged?: boolean })?.jobChanged === true && (await p.engagementEvent.count({ where: { engagementId: hiredId, type: "WITHDRAWN" } })) === 1 && (await p.notification.count({ where: { engagementId: hiredId, kind: "APPLICATION_WITHDRAWN" } })) > 0,
    { left, afterLeave, cancelledEv });
  const shiftRow = hiredShift?.ok ? await p.shift.findUniqueOrThrow({ where: { id: hiredShift.shiftId }, include: { events: true, validations: true } }) : null;
  check("…and the scorecard reads that cancellation as excused, never a no-show", !!shiftRow && cancellationOf({ ...shiftRow, engagementStatus: "WITHDRAWN", scheduledAt: shiftRow.createdAt, cancellationNoticeHours: 24 } as never) === "excused");
  const again = await releaseFromJob({ workerId: W1, profileId: W1 }, hiredId);
  check("leaving twice does nothing", !again.ok, again);
  const editP = await p.jobChange.update({ where: { id: changeRow!.id }, data: { material: [] } }).then(() => "allowed", (e: unknown) => String(e));
  check("the database refuses changing a JobChange", /append-only/.test(editP), editP);
  const hist = await loadJobChanges(live.id);
  check("the job's change record lists both edits, newest first, with who made them", hist.length === 2 && hist[0].labels.join() === "dates,pay" && hist[1].labels.join() === "title" && hist[0].by === "Maya Chen", hist.map((h) => h.labels));
  // A job from before C4 (no launch stored) edited through the builder, which always sends a mode.
  const legacyTitle = await updatePublishedJob(legacy.id, ORG, OWNER, input({ launchMode: "STAGED", title: "Launch test (legacy, renamed)" }));
  const legacyAfter = await p.job.findUniqueOrThrow({ where: { id: legacy.id }, select: { launch: true } });
  check("a pre-C4 job keeps its unset launch through a builder edit: only the title is recorded", legacyTitle.ok && legacyTitle.changed.join() === "title" && legacyAfter.launch === null, { legacyTitle, legacyAfter });
  const legacySelf = await updatePublishedJob(legacy.id, ORG, OWNER, input({ launchMode: "SELF", title: "Launch test (legacy, renamed)" }));
  check("…until it picks a launch, which is a material change", legacySelf.ok && legacySelf.material.join() === "how each day starts", legacySelf);
  const legacyTools = await updatePublishedJob(legacy.id, ORG, OWNER, input({ launchMode: "SELF", title: "Launch test (legacy, renamed)", canvassApp: "", toolList: "", toolNotes: "" }));
  check("…and the builder's \"no app\" default is no change to a job that never named one", legacyTools.ok && legacyTools.changed.length === 0 && legacyTools.told === 0, legacyTools);
  // The notice is hidden while the worker's own answers hide the invitation (rule 4); a closed account isn't told.
  const W3 = "00000000-0000-0000-0000-000000000103";
  const byInvite = { launchMode: "SELF", hiringModes: ["instant_claim", "application", "invite"] };
  const inviteJob = await createJob(ORG, OWNER, input(byInvite));
  await publishJob(inviteJob.id, ORG, OWNER);
  await applyToJob(W3, W3, staged.id); // an organization invites only workers it has a relationship with (C1)
  const invited = await inviteWorker(ORG, OWNER, inviteJob.id, W3);
  await savePreferences(W3, W3, { visibilityMode: "MATCHING_ONLY", identityLabels: [], partyRelationship: null, issuePositions: {}, campaignBoundaries: [{ kind: "campaign_type", target: "ballot_measure", stance: "do_not_match" }] } as never, null);
  const toInvited = await updatePublishedJob(inviteJob.id, ORG, OWNER, input({ ...byInvite, title: "Launch test (invite, renamed)" }));
  const w3Notices = (await loadNotifications({ userId: W3, role: "WORKER", workerId: W3, orgId: null })).filter((n) => n.kind === "JOB_CHANGED" && n.engagement.jobId === inviteJob.id);
  const w3Row = await p.notification.count({ where: { recipientId: W3, kind: "JOB_CHANGED", engagement: { jobId: inviteJob.id } } });
  check("an invited worker whose answers rule the job out is told nothing of its edits (rule 4), though the row exists", invited.ok && toInvited.ok && toInvited.told === 1 && w3Row === 1 && w3Notices.length === 0, { invited, toInvited, w3Row, w3Notices });
  await p.worker.update({ where: { id: W3 }, data: { closedAt: new Date() } });
  const toClosed = await updatePublishedJob(inviteJob.id, ORG, OWNER, input({ ...byInvite, title: "Launch test (invite)" }));
  check("a closed account isn't told", toClosed.ok && toClosed.told === 0, toClosed);
  await p.worker.update({ where: { id: W3 }, data: { closedAt: null } });
  await p.job.update({ where: { id: live.id }, data: { status: "PAUSED" } });
  const paused = await updatePublishedJob(live.id, ORG, OWNER, input({ launchMode: "SELF", title: "Launch test (renamed)", payRate: "22", startsAt: `${year}-03-02`, headcount: "5" }));
  await p.job.update({ where: { id: live.id }, data: { status: "PUBLISHED" } });
  check("a paused job is edited the same way", paused.ok && paused.changed.join() === "headcount", paused);

  // A pre-C4 draft keeps its unset launch through a builder save, and publishes as before.
  const legacyDraft = await createJob(ORG, OWNER, input({}));
  const draftSaved = await updateDraftJob(legacyDraft.id, ORG, OWNER, input({ launchMode: "STAGED", title: "Legacy draft, renamed" }));
  const legacyDraftRow = await p.job.findUniqueOrThrow({ where: { id: legacyDraft.id }, select: { launch: true, title: true } });
  check("a pre-C4 draft keeps its unset launch through a builder save and still publishes", draftSaved && legacyDraftRow.launch === null && legacyDraftRow.title === "Legacy draft, renamed" && (await publishJob(legacyDraft.id, ORG, OWNER)).ok, legacyDraftRow);

  // --- C4.4: the canvassing app's totals ---
  const canvass = await createJob(ORG, OWNER, input({ type: "CANVASS", launchMode: "SELF", canvassApp: "MINIVAN", toolList: "Turf 12", toolNotes: "Sam hands out the tablets at 8:45" }));
  const tools = readTools(canvass.tools);
  check("a job stores its canvassing app, list and notes, and publishes", tools.canvassApp === "MINIVAN" && tools.list === "Turf 12" && tools.notes === "Sam hands out the tablets at 8:45" && (await publishJob(canvass.id, ORG, OWNER)).ok, tools);
  const noApp = validateJob({ ...base, type: "CANVASS", toolList: "Turf 12" });
  check("a list without an app is refused by the builder", !noApp.ok && /Pick the app/.test(noApp.errors.canvassApp ?? ""), noApp);
  const cClaim = await claimJob(W2, W2, canvass.id);
  const cShift = cClaim.ok ? await scheduleShift(org, cClaim.engagementId, { startsAt: new Date(Date.UTC(year, 2, 20, 15)).toISOString(), endsAt: new Date(Date.UTC(year, 2, 20, 19)).toISOString() }) : null;
  const cId = cShift?.ok ? cShift.shiftId : "";
  const w2 = { workerId: W2, profileId: W2 };
  const cStart = new Date(Date.UTC(year, 2, 20, 14, 55));
  const cIn = await workerShiftAction(w2, cId, { kind: "check_in", location: { checked: false } }, cStart);
  const cLog = await workerShiftAction(w2, cId, { kind: "log", unit: "doors", count: 10 }, new Date(Date.UTC(year, 2, 20, 16)));
  const wrongApp = await workerShiftAction(w2, cId, { kind: "app_counts", app: "PDI", doors: 42, contacts: 7 }, new Date(Date.UTC(year, 2, 20, 18)));
  const rightApp = await workerShiftAction(w2, cId, { kind: "app_counts", app: "MINIVAN", doors: 42, contacts: 7 }, new Date(Date.UTC(year, 2, 20, 18, 1)));
  const cState = shiftState(facts((await loadShift(cId))!));
  check("the app's totals are taken for the job's own app only, and replace what was logged by hand", cIn.ok && cLog.ok && !wrongApp.ok && /MiniVAN/.test(wrongApp.reason) && rightApp.ok && cState.doors === 42 && cState.contacts === 7 && cState.appCounts?.app === "MINIVAN", { cIn, cLog, wrongApp, rightApp, cState });
  const cSyncAt = Date.UTC(year, 2, 20, 18, 30);
  const cSync = await syncWorkerActions(w2, cId, { deviceNow: cSyncAt, actions: [{ clientId: crypto.randomUUID(), at: cSyncAt, action: { kind: "app_counts", app: "MINIVAN", doors: 45, contacts: 8 } }] }, new Date(cSyncAt));
  const cState2 = shiftState(facts((await loadShift(cId))!));
  check("…the newest entry wins, through the offline sync too", cSync.ok && cSync.results[0].status === "saved" && cState2.doors === 45 && cState2.contacts === 8, { cSync, cState2 });
  const cOut = await workerShiftAction(w2, cId, { kind: "check_out" }, new Date(Date.UTC(year, 2, 20, 19)));
  const afterOut = await workerShiftAction(w2, cId, { kind: "app_counts", app: "MINIVAN", doors: 46, contacts: 8 }, new Date(Date.UTC(year, 2, 20, 19, 5)));
  check("the totals can still be entered after checking out", cOut.ok && afterOut.ok, { cOut, afterOut });
  const appEvents = await p.workEvent.count({ where: { shiftId: cId, type: "APP_COUNTS" } });
  check("each entry is its own event; nothing is edited", appEvents === 3, appEvents);

  // --- C4.5: packets kept between shifts ---
  const pjob = await createJob(ORG, OWNER, input({ launchMode: "SELF" }));
  await publishJob(pjob.id, ORG, OWNER);
  const pClaim = await claimJob(W2, W2, pjob.id);
  const pEng = pClaim.ok ? pClaim.engagementId : "";
  const sup = { profileId: OWNER, orgId: ORG };
  const day = (d: number, h: number, m = 0) => new Date(Date.UTC(year, 2, 20 + d, h, m));
  const mk = async (d: number) => { const r = await scheduleShift(org, pEng, { startsAt: day(d, 15).toISOString(), endsAt: day(d, 19).toISOString() }); if (!r.ok) throw new Error(JSON.stringify(r)); return r.shiftId; };
  const p1 = await mk(1);
  const pIn1 = await workerShiftAction(w2, p1, { kind: "check_in", location: { checked: false } }, day(1, 14, 55));
  const hand = await supervisorShiftAction(sup, p1, { kind: "packet_pickup", packetId: "18A", sheets: 20 }, day(1, 15, 5));
  const hold = await workerShiftAction(w2, p1, { kind: "hold_packet", packetId: "18a" }, day(1, 18, 50));
  const pOut1 = await workerShiftAction(w2, p1, { kind: "check_out" }, day(1, 19));
  const close1 = await supervisorShiftAction(sup, p1, { kind: "closeout", status: "APPROVED", reason: null }, day(1, 20));
  const st1 = shiftState(facts((await loadShift(p1))!));
  check("a worker keeps a packet for the next shift, checks out, and the shift is reviewed with the packet still in their hands", pIn1.ok && hand.ok && hold.ok && pOut1.ok && close1.ok && st1.packetsHeld.join() === "18A" && st1.packetsOut.length === 0, { pIn1, hand, hold, pOut1, close1, st1 });
  const p2 = await mk(2);
  const pIn2 = await workerShiftAction(w2, p2, { kind: "check_in", location: { checked: false } }, day(2, 14, 55));
  const st2 = shiftState(facts((await loadShift(p2))!));
  const carried = await p.workEvent.findFirst({ where: { shiftId: p2, type: "PACKET_PICKUP" }, select: { payload: true, actorId: true } });
  check("…and at the next check-in the packet comes back out, in the worker's name, carried from the last shift", pIn2.ok && st2.packetsOut.join() === "18A" && (carried?.payload as { carriedFrom?: string; sheets?: number })?.carriedFrom === p1 && (carried?.payload as { sheets?: number }).sheets === 20 && carried?.actorId === W2, { pIn2, st2, carried });
  const ret2 = await workerShiftAction(w2, p2, { kind: "return_packet", packetId: "18A", sheetsReturned: 20, signatures: 31 }, day(2, 18));
  const hand19 = await supervisorShiftAction(sup, p2, { kind: "packet_pickup", packetId: "19B", sheets: 10 }, day(2, 18, 1));
  const hand20 = await supervisorShiftAction(sup, p2, { kind: "packet_pickup", packetId: "20C", sheets: 10 }, day(2, 18, 2));
  const hold19 = await workerShiftAction(w2, p2, { kind: "hold_packet", packetId: "19B" }, day(2, 18, 50));
  const hold20 = await workerShiftAction(w2, p2, { kind: "hold_packet", packetId: "20C" }, day(2, 18, 51));
  const hand21 = await supervisorShiftAction(sup, p2, { kind: "packet_pickup", packetId: "21D", sheets: 5 }, day(2, 18, 3));
  const hold21 = await workerShiftAction(w2, p2, { kind: "hold_packet", packetId: "21D" }, day(2, 18, 52));
  const undo21 = await workerShiftAction(w2, p2, { kind: "return_packet", packetId: "21D", sheetsReturned: 5, signatures: 2 }, day(2, 18, 53));
  const pOut2 = await workerShiftAction(w2, p2, { kind: "check_out" }, day(2, 19));
  const st2b = shiftState(facts((await loadShift(p2))!));
  check("the carried packet is returned like any other; two more are kept, and a kept one returned after all (a mis-tap undone)", ret2.ok && hand19.ok && hand20.ok && hold19.ok && hold20.ok && hand21.ok && hold21.ok && undo21.ok && pOut2.ok && st2b.packetsHeld.join() === "19B,20C" && st2b.packetsReturned.includes("21D"), { ret2, hand19, hand20, hold19, hold20, hand21, hold21, undo21, pOut2, st2b });
  // The worker hands 19B to a colleague in person; the supervisor records it on the colleague's shift (a kept packet isn't "out" here).
  const otherClaim = await claimJob(W1, W1, pjob.id);
  const q1 = otherClaim.ok ? await scheduleShift(org, otherClaim.engagementId, { startsAt: day(3, 15).toISOString(), endsAt: day(3, 19).toISOString() }) : null;
  const q1Id = q1?.ok ? q1.shiftId : "";
  const qIn = await workerShiftAction(me, q1Id, { kind: "check_in", location: { checked: false } }, day(3, 14, 55));
  const reassigned = await supervisorShiftAction(sup, q1Id, { kind: "packet_pickup", packetId: "19B", sheets: 10 }, day(3, 15, 5));
  const takenRow = await p.workEvent.findFirst({ where: { shiftId: q1Id, type: "PACKET_PICKUP" }, select: { payload: true } });
  const keptNow = (await heldOnJob(p, pjob.id)).filter((h) => h.heldOn === p2);
  check("a kept packet can be handed to a colleague through their supervisor; the record says whose it was, and the holding shift knows", qIn.ok && reassigned.ok && (takenRow?.payload as { takenFrom?: string })?.takenFrom === p2 && keptNow.find((h) => h.packetId === "19B")?.takenOn === q1Id && keptNow.find((h) => h.packetId === "20C")?.takenOn === null, { qIn, reassigned, takenRow, keptNow });
  const p3 = await mk(4);
  const syncAt = day(4, 14, 55).getTime();
  const pSync3 = await syncWorkerActions(w2, p3, { deviceNow: syncAt, actions: [{ clientId: crypto.randomUUID(), at: syncAt, action: { kind: "check_in", location: { checked: false } } }, { clientId: crypto.randomUUID(), at: syncAt + 60_000, action: { kind: "return_packet", packetId: "20C", sheetsReturned: 10, signatures: 4 } }] }, new Date(syncAt + 120_000));
  const st3 = shiftState(facts((await loadShift(p3))!));
  check("at the next check-in (offline sync too) only the packet still in the worker's hands comes out, and a return later in the batch finds it", pSync3.ok && pSync3.results.every((r) => r.status === "saved") && st3.packetsReturned.join() === "20C" && st3.packetsOut.length === 0, { pSync3, st3 });

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
