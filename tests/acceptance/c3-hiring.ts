/* C3.1 acceptance checks: the hiring pipeline on real Postgres — review, offer, accept, decline with a reason, withdraw, expiry, history and no browser access (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { ACCOUNT_CLOSED_NOTE } from "@/lib/engagements";
import { applyToJob, claimJob, inviteWorker, loadEngagementEvents, loadPipelineFacts, moveEngagement, moveEngagements } from "@/lib/engagements-data";
import { loadApplicants } from "@/lib/applicants-data";
import { applicantCells } from "@/lib/applicants";
import { saveSharing } from "@/lib/sharing-data";
import { partsForOrg, partsForOrgMany } from "@/lib/shared-scorecard-data";
import { declineInvitation, hiringCounts, invitesLeft, loadInvitations, loadJobInvites, muteOrg, unmuteOrg } from "@/lib/invitations-data";
import { DEFAULT_SHARING } from "@/lib/sharing";
import { closeAccount, exportAccount } from "@/lib/account-data";
import { scheduleShift } from "@/lib/field-day-data";
import { orgHasRelationship, savePreferences } from "@/lib/political-fit-data";
import { workerAccessFor } from "@/lib/worker-access-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000cc";
const HIRER = "00000000-0000-0000-0000-0000000000ab";
const W4 = "00000000-0000-0000-0000-000000000104";
const W5 = "00000000-0000-0000-0000-000000000105";
const W6 = "00000000-0000-0000-0000-000000000106";
const W1 = "00000000-0000-0000-0000-000000000101"; // seeded engagement on JOB
const W2 = "00000000-0000-0000-0000-000000000102";
const W3 = "00000000-0000-0000-0000-000000000103";
const JOB = "00000000-0000-0000-0000-000000000011";
const HOUR = 3_600_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const refused = (q: Promise<unknown>) => q.then(() => "allowed", (e: unknown) => String(e));
const org = { kind: "org" as const, profileId: OWNER, orgId: ORG };
const worker = (w: string) => ({ kind: "worker" as const, profileId: w, workerId: w });
const types = async (id: string) => (await loadEngagementEvents(id)).map((e) => e.type).join(",");

(async () => {
  const p = db();
  await p.organization.create({ data: { id: ORG2, name: "Other Campaign Co", approved: true, updatedAt: new Date() } });
  await p.profile.createMany({ data: [
    { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" },
    { id: OTHER, role: "OWNER", orgId: ORG2, displayName: "Other Boss" },
    { id: HIRER, role: "RECRUITER", orgId: ORG, displayName: "Sam Hirer" },
    { id: W4, role: "WORKER" }, { id: W5, role: "WORKER" }, { id: W6, role: "WORKER" },
  ] });
  await p.worker.createMany({ data: [
    { id: W4, profileId: W4, displayName: "Riley Park" },
    { id: W5, profileId: W5, displayName: "Casey Lin" },
    { id: W6, profileId: W6, displayName: "Morgan Diaz" },
  ] });
  const jurisdictionId = (await p.job.findUniqueOrThrow({ where: { id: JOB } })).jurisdictionId;
  const newJob = (title: string, headcount: number | null, extra: Record<string, unknown> = {}) =>
    p.job.create({ data: { orgId: ORG, jurisdictionId, type: "CANVASS", title, status: "PUBLISHED", hiringMethod: { modes: ["application", "invite", "instant_claim"] }, headcount, ...extra } });
  const idOf = (r: { ok: boolean } & ({ engagementId: string } | object)) => ("engagementId" in r ? r.engagementId : "");
  await p.job.update({ where: { id: JOB }, data: { hiringMethod: { modes: ["application", "invite"] }, headcount: 3 } });

  // --- Apply → in review → offer → accept ---
  const a = await applyToJob(W2, W2, JOB);
  const e2 = a.ok ? a.engagementId : "";
  check("applying records an APPLIED event by the worker", a.ok && (await types(e2)) === "APPLIED" && (await loadEngagementEvents(e2))[0] !== undefined, a);
  const r1 = await moveEngagement(e2, "review", org);
  const r2 = await moveEngagement(e2, "review", org);
  check("in review is recorded once; the status stays APPLIED", r1.ok && r1.status === "APPLIED" && !r2.ok && (await types(e2)) === "APPLIED,IN_REVIEW", { r1, r2 });
  check("the worker can't put their own application in review", !(await moveEngagement(e2, "review", worker(W2))).ok);
  const foreign = await moveEngagement(e2, "offer", { kind: "org", profileId: OTHER, orgId: ORG2 });
  check("another organization can't touch it (reads as not found, nothing written)", !foreign.ok && /not found/.test(foreign.reason) && (await types(e2)) === "APPLIED,IN_REVIEW", foreign);
  const o = await moveEngagement(e2, "offer", org, { note: "  Saturdays   in Aurora  " });
  const offerEvt = (await loadEngagementEvents(e2)).at(-1)!;
  check("an offer moves it to OFFERED, names the sender as the contact, keeps the tidied note", o.ok && o.status === "OFFERED" && offerEvt.type === "OFFERED" && offerEvt.note === "Saturdays in Aurora" && (await p.engagement.findUniqueOrThrow({ where: { id: e2 } })).hiredById === OWNER, { o, offerEvt });
  check("an offer doesn't take a seat until accepted", (await p.engagement.count({ where: { jobId: JOB, status: { in: ["CLAIMED", "ACTIVE", "COMPLETED"] } } })) <= 1);
  const facts = (await loadPipelineFacts([e2])).get(e2)!;
  check("the offer lapses 48 hours after it was sent", !!facts.offerExpiresAt && Math.abs(facts.offerExpiresAt.getTime() - offerEvt.createdAt.getTime() - 48 * HOUR) < 1000, facts);
  const late = await moveEngagement(e2, "accept", worker(W2), {}, new Date(Date.now() + 49 * HOUR));
  check("accepting after 48 hours is refused, and nothing changes", !late.ok && /expired/.test(late.ok ? "" : late.reason) && (await p.engagement.findUniqueOrThrow({ where: { id: e2 } })).status === "OFFERED", late);
  check("the org can't accept its own offer", !(await moveEngagement(e2, "accept", org)).ok);
  const acc = await moveEngagement(e2, "accept", worker(W2));
  check("the worker accepts in time: ACTIVE, with OFFER_ACCEPTED in the history", acc.ok && acc.status === "ACTIVE" && (await types(e2)) === "APPLIED,IN_REVIEW,OFFERED,OFFER_ACCEPTED", acc);
  check("each step is audited", (await p.auditEvent.count({ where: { entityId: e2, action: { in: ["engagement.in_review", "engagement.offered", "engagement.offer_accepted"] } } })) === 3);

  // --- Not selected needs a reason; the note is checked ---
  const b = await applyToJob(W3, W3, JOB);
  const e3 = b.ok ? b.engagementId : "";
  check("not selected without a reason is refused", !(await moveEngagement(e3, "decline", org)).ok && !(await moveEngagement(e3, "decline", org, { reasonCode: "too_old" })).ok);
  check("a note over 500 characters is refused", !(await moveEngagement(e3, "decline", org, { reasonCode: "schedule", note: "x".repeat(501) })).ok);
  const ns = await moveEngagement(e3, "decline", org, { reasonCode: "schedule", note: "We need weekdays." });
  const nsEvt = (await loadEngagementEvents(e3)).at(-1)!;
  check("not selected: DECLINED, with the reason code and the note the worker reads", ns.ok && ns.status === "DECLINED" && nsEvt.type === "NOT_SELECTED" && nsEvt.reasonCode === "schedule" && nsEvt.note === "We need weekdays.", nsEvt);
  check("a declined engagement can't be offered, accepted or withdrawn", !(await moveEngagement(e3, "offer", org)).ok && !(await moveEngagement(e3, "accept", worker(W3))).ok && !(await moveEngagement(e3, "withdraw", worker(W3))).ok);
  check("the worker can't decline what's already declined", (await moveEngagement(e3, "decline", worker(W3))).ok === false);

  // --- Withdrawals and invitations ---
  const job2 = await p.job.create({ data: { orgId: ORG, jurisdictionId: (await p.job.findUniqueOrThrow({ where: { id: JOB } })).jurisdictionId, type: "CANVASS", title: "Weekend canvass", status: "PUBLISHED", hiringMethod: { modes: ["application", "invite"] }, headcount: 2 } });
  const c = await applyToJob(W3, W3, job2.id);
  const w = c.ok ? await moveEngagement(c.engagementId, "withdraw", worker(W3)) : c;
  check("the worker withdraws an application: WITHDRAWN, recorded", c.ok && w.ok && w.status === "WITHDRAWN" && (await types(c.ok ? c.engagementId : "")) === "APPLIED,WITHDRAWN", w);
  const inv = await inviteWorker(ORG, OWNER, job2.id, W2);
  const ie = inv.ok ? inv.engagementId : "";
  check("an invitation records INVITED by the inviter", inv.ok && (await loadEngagementEvents(ie))[0]?.type === "INVITED", inv);
  const wd = await moveEngagement(ie, "withdraw", org);
  check("the org withdraws an unanswered invitation", wd.ok && wd.status === "WITHDRAWN" && (await types(ie)).endsWith("INVITE_WITHDRAWN"), wd);
  check("…and the worker can't accept it afterwards", !(await moveEngagement(ie, "accept", worker(W2))).ok);

  // --- The database's own guards ---
  const evt = await p.engagementEvent.findFirstOrThrow({ where: { engagementId: e2 } });
  for (const [label, q] of [
    ["EngagementEvent update", p.$executeRaw`UPDATE "public"."EngagementEvent" SET "note" = 'x' WHERE "id" = ${evt.id}::uuid`],
    ["EngagementEvent delete", p.$executeRaw`DELETE FROM "public"."EngagementEvent" WHERE "id" = ${evt.id}::uuid`],
    ["EngagementEvent truncate", p.$executeRawUnsafe(`TRUNCATE "public"."EngagementEvent"`)],
  ] as const) { const r = await refused(q); check(`${label} is refused (append-only)`, /append-only/.test(r), r); }
  const badReason = await refused(p.engagementEvent.create({ data: { engagementId: e2, type: "NOT_SELECTED", reasonCode: "politics" } }));
  check("the database refuses a reason code outside the list", /EngagementEvent_reason_shape/.test(badReason), badReason);
  const strayReason = await refused(p.engagementEvent.create({ data: { engagementId: e2, type: "OFFERED", reasonCode: "schedule" } }));
  check("…and a reason on anything but NOT_SELECTED", /EngagementEvent_reason_shape/.test(strayReason), strayReason);
  const longNote = await refused(p.engagementEvent.create({ data: { engagementId: e2, type: "OFFERED", note: "x".repeat(501) } }));
  check("…and a note over 500 characters", /EngagementEvent_note_length/.test(longNote), longNote);
  for (const role of ["anon", "authenticated"]) {
    const r = await p.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      return tx.$queryRawUnsafe(`SELECT 1 FROM "public"."EngagementEvent" LIMIT 1`);
    }).then(() => "allowed", (e: unknown) => String(e));
    check(`${role} can't read EngagementEvent`, /permission denied/.test(r), r);
  }
  const seeded = (await p.engagement.findFirstOrThrow({ where: { workerId: W1 } })).id;
  check("an engagement from before C3 with no opening copy (the seed's) has an empty history and isn't offered or in review", (await loadPipelineFacts([seeded])).get(seeded)?.events.length === 0 && (await loadPipelineFacts([seeded])).get(seeded)?.offerExpiresAt === null);

  // --- Review round 1: lapsed offers, held seats, races ---
  const t0 = Date.now();
  const jobR = await newJob("Renewal job", 1);
  const ra = idOf(await applyToJob(W4, W4, jobR.id, new Date(t0 - 51 * HOUR)));
  const firstOffer = await moveEngagement(ra, "offer", org, {}, new Date(t0 - 50 * HOUR));
  check("(setup) an offer sent 50 hours ago", firstOffer.ok, firstOffer);
  check("the offer's event carries the time it was sent", (await loadEngagementEvents(ra)).at(-1)!.createdAt.getTime() === t0 - 50 * HOUR);
  check("a live offer can't be sent twice", !(await moveEngagement(ra, "offer", org, {}, new Date(t0 - 49 * HOUR))).ok);
  const renew = await moveEngagement(ra, "offer", { kind: "org", profileId: HIRER, orgId: ORG });
  const rf = (await loadPipelineFacts([ra])).get(ra)!;
  check("a lapsed offer can be sent again: a second OFFERED event, a fresh 48 hours, the new sender as contact", renew.ok && (await types(ra)) === "APPLIED,OFFERED,OFFERED" && !!rf.offerExpiresAt && rf.offerExpiresAt.getTime() > t0 + 47 * HOUR && (await p.engagement.findUniqueOrThrow({ where: { id: ra } })).hiredById === HIRER, { renew, rf });
  // The renewed offer holds the only seat.
  const rb = idOf(await applyToJob(W5, W5, jobR.id));
  const held = await moveEngagement(rb, "offer", org);
  check("a live offer holds the seat: a second offer on a one-seat job is refused", !held.ok && /offer out/.test(held.reason), held);
  const heldClaim = await claimJob(W6, W6, jobR.id);
  check("…and so is an instant claim", !heldClaim.ok && /offer out/.test(heldClaim.reason), heldClaim);
  const accR = await moveEngagement(ra, "accept", worker(W4));
  check("the worker holding the offer accepts it", accR.ok && accR.status === "ACTIVE", accR);
  // Demo-seed path (offer → worker accept → schedule): a hired worker can be scheduled.
  const sh = await scheduleShift({ profileId: OWNER, orgId: ORG }, ra, { startsAt: new Date(t0 + 30 * HOUR).toISOString(), endsAt: new Date(t0 + 34 * HOUR).toISOString(), stagingLocation: "Library parking lot" });
  check("an accepted offer can be scheduled (the demo seed's path)", sh.ok, sh);
  check("…and the seat is gone for the next applicant", !(await moveEngagement(rb, "offer", org)).ok);

  // Races: two offers for the last seat at once; the same offer twice at once.
  const jobQ = await newJob("Race job", 1);
  const qa = idOf(await applyToJob(W5, W5, jobQ.id));
  const qb = idOf(await applyToJob(W6, W6, jobQ.id));
  const both = await Promise.all([moveEngagement(qa, "offer", org), moveEngagement(qb, "offer", org)]);
  check("two offers for the last seat at once: exactly one goes out", both.filter((r) => r.ok).length === 1, both);
  const offeredOne = both[0].ok ? qa : qb;
  const dup = await Promise.all([moveEngagement(offeredOne, "accept", worker(offeredOne === qa ? W5 : W6)), moveEngagement(offeredOne, "decline", org, { reasonCode: "positions_filled" })]);
  check("an accept racing a not-selected: exactly one wins", dup.filter((r) => r.ok).length === 1, dup);
  const jobV = await newJob("Review race job", 2);
  const va = idOf(await applyToJob(W4, W4, jobV.id));
  const twice = await Promise.all([moveEngagement(va, "review", org), moveEngagement(va, "review", org)]);
  check("two reviews at once: exactly one is recorded", twice.filter((r) => r.ok).length === 1 && (await p.engagementEvent.count({ where: { engagementId: va, type: "IN_REVIEW" } })) === 1, twice);

  // A live offer holds its seat against an invitation's accept and against renewing someone else's lapsed offer.
  const jobH = await newJob("Held seat job", 1);
  const ha = idOf(await applyToJob(W4, W4, jobH.id));
  await moveEngagement(ha, "offer", org);
  const hi = idOf(await inviteWorker(ORG, OWNER, jobH.id, W5));
  const hiAcc = await moveEngagement(hi, "accept", worker(W5));
  check("an invitation can't be accepted into a seat an offer holds", !hiAcc.ok && /offer out/.test(hiAcc.reason) && (await p.engagement.findUniqueOrThrow({ where: { id: hi } })).status === "INVITED", hiAcc);
  const jobN = await newJob("Renewal blocked job", 1);
  const na = idOf(await applyToJob(W4, W4, jobN.id, new Date(t0 - 51 * HOUR)));
  await moveEngagement(na, "offer", org, {}, new Date(t0 - 50 * HOUR));
  const nb = idOf(await applyToJob(W5, W5, jobN.id));
  const nbOffer = await moveEngagement(nb, "offer", org);
  const naRenew = await moveEngagement(na, "offer", org);
  check("a lapsed offer holds no seat, and can't be renewed once another live offer holds it", nbOffer.ok && !naRenew.ok && /offer out/.test(naRenew.ok ? "" : naRenew.reason), { nbOffer, naRenew });

  // --- Closed jobs: close-outs still work ---
  const jobC = await newJob("Closing job", 3);
  const ca = idOf(await applyToJob(W4, W4, jobC.id));
  const cb = idOf(await applyToJob(W5, W5, jobC.id));
  await moveEngagement(cb, "offer", org);
  await p.job.update({ where: { id: jobC.id }, data: { status: "CLOSED" } });
  check("on a closed job no offer goes out and none is accepted", !(await moveEngagement(ca, "offer", org)).ok && !(await moveEngagement(cb, "accept", worker(W5))).ok);
  check("…but the org can still close out the application and the offer", (await moveEngagement(ca, "decline", org, { reasonCode: "positions_filled" })).ok && (await moveEngagement(cb, "decline", org, { reasonCode: "positions_filled" })).ok);

  // --- Declined and withdrawn end the relationship (decision for Caden) ---
  const jobD = await newJob("Decline job", 3);
  const da = idOf(await applyToJob(W6, W6, jobD.id));
  check("(setup) W6 is related to the org while applied", await orgHasRelationship(W6, ORG));
  // W6's race engagement on jobQ must be closed too for the relationship to end.
  const w6q = await p.engagement.findUniqueOrThrow({ where: { jobId_workerId: { jobId: jobQ.id, workerId: W6 } } });
  if (w6q.status === "APPLIED" || w6q.status === "OFFERED") await moveEngagement(w6q.id, "decline", org, { reasonCode: "positions_filled" });
  if (w6q.status === "ACTIVE") await p.engagement.update({ where: { id: w6q.id }, data: { status: "CANCELLED" } }); // test-only: end that hire
  await moveEngagement(da, "decline", org, { reasonCode: "positions_filled" });
  const staff = { role: "OWNER" as const, workerId: null, orgId: ORG };
  const access = await workerAccessFor(staff, W6, true);
  check("after not selected, the org loses the live profile", !(await orgHasRelationship(W6, ORG)) && access.kind === "denied", access);
  const reinvite = await inviteWorker(ORG, OWNER, (await newJob("Re-invite job", 2)).id, W6);
  check("…and can't invite them to another job until they apply again", !reinvite.ok && reinvite.reason === "Worker not found.", reinvite);
  check("a declined application can't be applied to again on the same job", !(await applyToJob(W6, W6, jobD.id)).ok);

  // --- The worker's own do-not-match answers still block an offer's accept ---
  const jobM = await newJob("Boundary job", 2, { campaignDisclosure: { campaignType: "ballot_measure", affiliation: "nonpartisan", message: "Paid for by the committee." } });
  const ma = idOf(await applyToJob(W4, W4, jobM.id));
  await moveEngagement(ma, "offer", org);
  await savePreferences(W4, W4, { visibilityMode: "APPLIED_TO", identityLabels: [], partyRelationship: null, issuePositions: {}, campaignBoundaries: [{ kind: "organization", target: "Front Range Circulators", stance: "do_not_match" }] } as never, null);
  const blocked = await moveEngagement(ma, "accept", worker(W4));
  check("a do-not-match answer blocks accepting the offer, and nothing changes", !blocked.ok && /not to be matched/.test(blocked.reason) && (await p.engagement.findUniqueOrThrow({ where: { id: ma } })).status === "OFFERED", blocked);

  // --- An accepted invitation keeps its inviter as the contact ---
  // W5's open application on the renewal job is the relationship that lets the org invite.
  const iv = await inviteWorker(ORG, HIRER, (await newJob("Invite job", 2)).id, W5);
  const ivAcc = iv.ok ? await moveEngagement(iv.engagementId, "accept", worker(W5)) : iv;
  check("an accepted invitation keeps the inviter as the worker's contact", iv.ok && ivAcc.ok && (await p.engagement.findUniqueOrThrow({ where: { id: iv.engagementId } })).hiredById === HIRER, { iv, ivAcc });

  // --- Closing an account withdraws an open offer, with a history line ---
  const jobX = await newJob("Closure job", 2);
  const xa = idOf(await applyToJob(W5, W5, jobX.id));
  await moveEngagement(xa, "offer", org);
  const closed = await closeAccount({ userId: W5, workerId: W5 });
  const xr = await p.engagement.findUniqueOrThrow({ where: { id: xa } });
  const closeEvt = (await loadEngagementEvents(xa)).at(-1)!;
  check("closing an account cancels an open offer and records it, saying why", closed.ok && xr.status === "CANCELLED" && (await types(xa)).endsWith("OFFERED,WITHDRAWN") && closeEvt.note === ACCOUNT_CLOSED_NOTE, { closed, xr, t: await types(xa) });
  check("…an open invitation reads as declined", (await p.engagement.findUniqueOrThrow({ where: { id: hi } })).status === "CANCELLED" && (await types(hi)) === "INVITED,INVITE_DECLINED");
  check("…and an open application", (await p.engagement.findUniqueOrThrow({ where: { id: rb } })).status === "CANCELLED" && (await types(rb)) === "APPLIED,WITHDRAWN");

  // --- The export carries the hiring history ---
  const files = await exportAccount({ userId: W4, workerId: W4 });
  const hist = files.find((f) => f.name === "engagement-history.csv");
  check("the data export includes engagement-history.csv with offers and reasons", !!hist && /OFFERED/.test(hist.text) && /OFFER_ACCEPTED/.test(hist.text) && /positions_filled/.test(hist.text), hist?.text.slice(0, 300));

  // --- C3.2: the applicants table and bulk steps ---
  const jobP = await newJob("Applicants job", 1, {
    type: "PETITION",
    requirements: { registration: true },
    startsAt: new Date("2026-11-02T00:00:00Z"),
    endsAt: new Date("2026-11-08T00:00:00Z"),
  });
  const pa = idOf(await applyToJob(W2, W2, jobP.id));
  const pb = idOf(await applyToJob(W3, W3, jobP.id));
  const pi = idOf(await inviteWorker(ORG, OWNER, jobP.id, W4));
  await saveSharing(W3, W3, { audiences: { ...DEFAULT_SHARING.audiences, output: "NOBODY", availability: "NOBODY", credentials: "NOBODY" } });
  const apps = await loadApplicants(jobP.id, ORG);
  const rowOf = (id: string) => apps.find((a) => a.engagementId === id);
  check("applicants: the people who applied, never the org's own invitations", apps.length === 2 && !!rowOf(pa) && !!rowOf(pb) && !rowOf(pi), apps.map((a) => a.name));
  const w3 = rowOf(pb)!;
  check("…each row only what the worker shares now: withheld parts read as withheld", w3.availability === "withheld" && w3.credentials === "withheld" && w3.scorecard.shared.output === false && w3.scorecard.shared.history === true, w3);
  const cells = applicantCells(w3, { type: "PETITION", startsAt: jobP.startsAt, endsAt: jobP.endsAt, requirements: { badge: false, registration: true, affidavit: false, training: null, script: null }, state: "CO" }, ["free", "credentials", "signaturesPerActiveHour"], "2026-10-09", "/x");
  check("…and its cells say 'not shared', unranked", ["free", "credentials", "signaturesPerActiveHour"].every((k) => cells[k].withheld === true && cells[k].sort === null), cells);
  check("…while the other applicant's shared parts come through", rowOf(pa)!.availability !== "withheld" && rowOf(pa)!.credentials !== "withheld");
  check("another organization gets nobody from this job", (await loadApplicants(jobP.id, ORG2)).length === 0);

  const bulk = await moveEngagements(jobP.id, { profileId: OWNER, orgId: ORG }, "review", [pa, pb, pi, "00000000-0000-0000-0000-00000000dead", "garbage"]);
  check("bulk in review: moves this job's applications, refuses the invitation by the same rules, counts strangers", bulk.ok && bulk.moved === 2 && bulk.refused.some((r) => r.names.includes("Riley Park") && /application/.test(r.reason)) && bulk.refused.some((r) => r.names[0] === "2 selected"), bulk);
  check("…and records each step", (await types(pa)) === "APPLIED,IN_REVIEW" && (await types(pb)) === "APPLIED,IN_REVIEW");
  const foreignBulk = await moveEngagements(jobP.id, { profileId: OTHER, orgId: ORG2 }, "review", [pa]);
  check("another organization's bulk step touches nothing", foreignBulk.ok && foreignBulk.moved === 0 && (await types(pa)) === "APPLIED,IN_REVIEW", foreignBulk);
  const offerAll = await moveEngagements(jobP.id, { profileId: OWNER, orgId: ORG }, "offer", [pb, pa]);
  check("bulk offer on a one-seat job: the earliest applicant gets it, the rest are refused with the reason", offerAll.ok && offerAll.moved === 1 && (await p.engagement.findUniqueOrThrow({ where: { id: pa } })).status === "OFFERED" && offerAll.refused.some((r) => /offer out/.test(r.reason)), offerAll);
  const noReason = await moveEngagements(jobP.id, { profileId: OWNER, orgId: ORG }, "decline", [pb]);
  check("bulk not selected needs a reason", noReason.ok && noReason.moved === 0 && noReason.refused[0]?.reason === "Pick a reason.", noReason);
  // partsForOrgMany must agree with partsForOrg for every kind of viewer: related, closed (W5), ended relationship (W6), unapproved org.
  const ORG3 = "00000000-0000-0000-0000-000000000003";
  await p.organization.create({ data: { id: ORG3, name: "Unapproved Co", approved: false, updatedAt: new Date() } });
  const everyone = [W1, W2, W3, W4, W5, W6];
  for (const o of [ORG, ORG2, ORG3]) {
    const many = await partsForOrgMany(everyone, o);
    const single = await Promise.all(everyone.map((w) => partsForOrg(w, o)));
    check(`partsForOrgMany matches partsForOrg for ${o.slice(-1)}`, everyone.every((w, i) => JSON.stringify(many.get(w)) === JSON.stringify(single[i])), { many: [...many], single });
  }
  check("bulk refuses an empty or oversized selection", !(await moveEngagements(jobP.id, { profileId: OWNER, orgId: ORG }, "review", [])).ok && !(await moveEngagements(jobP.id, { profileId: OWNER, orgId: ORG }, "review", Array.from({ length: 101 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`))).ok);

  // --- C3.3: invitations ---
  const DAY = 24 * HOUR;
  const ji1 = await newJob("Invite note job", 3);
  const n1 = await inviteWorker(ORG, OWNER, ji1.id, W2, undefined, { note: "  Saturday   canvass\n\n\n\nbring water " });
  const n1e = await p.engagement.findUniqueOrThrow({ where: { id: idOf(n1) } });
  const n1evt = (await loadEngagementEvents(n1e.id))[0];
  check("an invitation keeps the inviter's tidied note, on the row and its history line", n1.ok && n1e.inviteNote === "Saturday canvass\n\nbring water" && n1evt?.note === n1e.inviteNote, { n1e, n1evt });
  check("…and lapses 7 days after it was sent", !!n1e.inviteExpiresAt && Math.abs(n1e.inviteExpiresAt.getTime() - n1evt.createdAt.getTime() - 7 * DAY) < 1000, n1e);
  check("a note over 500 characters is refused", !(await inviteWorker(ORG, OWNER, (await newJob("Long note job", 2)).id, W2, undefined, { note: "x".repeat(501) })).ok);

  // The weekly cap: at most 3 from one organization to one worker in any 7 days, withdrawn ones included.
  const left0 = await invitesLeft(W2, ORG);
  for (let k = 0; k < left0; k++) await inviteWorker(ORG, OWNER, (await newJob(`Cap job ${k}`, 2)).id, W2);
  const over = await inviteWorker(ORG, OWNER, (await newJob("Over cap job", 2)).id, W2);
  check("a fourth invitation in a week is refused, and invitesLeft says 0", !over.ok && /3 invitations this week/.test(over.reason) && (await invitesLeft(W2, ORG)) === 0, { left0, over });
  const later = await inviteWorker(ORG, OWNER, (await newJob("Next week job", 2)).id, W2, new Date(Date.now() + 8 * DAY));
  check("…and allowed again once the week has rolled on", later.ok, later);

  // Lapsed invitations: no accept, still a decline.
  const old = await inviteWorker(ORG, OWNER, (await newJob("Old invite job", 2)).id, W4, new Date(Date.now() - 8 * DAY));
  const oldAcc = await moveEngagement(idOf(old), "accept", worker(W4));
  check("an expired invitation can't be accepted", old.ok && !oldAcc.ok && /expired/.test(oldAcc.ok ? "" : oldAcc.reason), oldAcc);
  const inbox = await loadInvitations(W4);
  check("the inbox lists it as lapsed", inbox.some((i) => i.id === idOf(old) && i.lapsed));

  // Decline and mute; mutes block invitations without saying so; unmute restores them.
  const jm1 = await newJob("Mute job 1", 2);
  const m1 = await inviteWorker(ORG, OWNER, jm1.id, W4, undefined, { note: "Hope you can make it" });
  check("the inbox shows an open invitation with its note and deadline", (await loadInvitations(W4)).some((i) => i.id === idOf(m1) && !i.lapsed && i.inviteNote === "Hope you can make it" && !!i.inviteExpiresAt));
  const dm = await declineInvitation({ workerId: W4, profileId: W4 }, idOf(m1), { mute: true });
  check("decline and mute: DECLINED, and the organization is muted", dm.ok && dm.status === "DECLINED" && (await p.orgMute.count({ where: { workerId: W4, orgId: ORG } })) === 1, dm);
  const blocked2 = await inviteWorker(ORG, OWNER, (await newJob("Mute job 2", 2)).id, W4);
  check("a muted organization's invitation reads 'Worker not found.', like any worker it can't reach", !blocked2.ok && blocked2.reason === "Worker not found.", blocked2);
  check("muting an organization that never invited you is refused (no probing)", !(await muteOrg({ workerId: W4, profileId: W4 }, ORG2)).ok);
  check("unmuting works once, and both are audited", (await unmuteOrg({ workerId: W4, profileId: W4 }, ORG)).ok && !(await unmuteOrg({ workerId: W4, profileId: W4 }, ORG)).ok && (await p.auditEvent.count({ where: { entityId: W4, action: { in: ["org.muted", "org.unmuted"] } } })) === 2);
  check("…after which the organization can invite again", (await inviteWorker(ORG, OWNER, (await newJob("Mute job 3", 2)).id, W4)).ok);

  // The organization's side.
  const jobInv = await loadJobInvites(ji1.id, ORG);
  check("the Invites view lists the invitation with its sender", jobInv.length === 1 && jobInv[0].sentBy === "Maya Chen" && jobInv[0].inviteNote === n1e.inviteNote, jobInv);
  check("…and another organization sees none of them", (await loadJobInvites(ji1.id, ORG2)).length === 0);
  check("tab counts split applicants from invitations", JSON.stringify(await hiringCounts(jobP.id, ORG)) === JSON.stringify({ applicants: 2, invites: 1 }), await hiringCounts(jobP.id, ORG));
  check("no read receipts: INVITE_VIEWED is never written", (await p.engagementEvent.count({ where: { type: "INVITE_VIEWED" } })) === 0);
  // Review round: a lapsed invitation can be sent again (the worker only missed the window).
  // (A week on, so this week's invitations to W4 don't hit the cap.)
  const reInv = await inviteWorker(ORG, HIRER, (await p.engagement.findUniqueOrThrow({ where: { id: idOf(old) } })).jobId, W4, new Date(Date.now() + 8 * DAY), { note: "Second try" });
  const renewed = await p.engagement.findUniqueOrThrow({ where: { id: idOf(old) } });
  check("a lapsed invitation is sent again on the same engagement: new deadline, note and sender", reInv.ok && idOf(reInv) === idOf(old) && renewed.status === "INVITED" && renewed.inviteNote === "Second try" && renewed.hiredById === HIRER && renewed.inviteExpiresAt! > new Date(), { reInv, renewed });
  const renewInvites = await loadJobInvites(renewed.jobId, ORG);
  check("…the Invites view names the latest sender, and the worker can accept it", renewInvites[0]?.sentBy === "Sam Hirer" && (await moveEngagement(idOf(old), "accept", worker(W4))).ok, renewInvites);

  // The cap holds under concurrency: four at once, three go out.
  const capJobs = await Promise.all([0, 1, 2, 3].map((k) => newJob(`Race cap ${k}`, 2)));
  const raced = await Promise.all(capJobs.map((j) => inviteWorker(ORG, OWNER, j.id, W3)));
  check("four invitations at once to one worker: exactly three go out", raced.filter((r) => r.ok).length === 3, raced);

  // Decline and mute only mutes when an invitation is declined, and says so.
  const offerMute = await declineInvitation({ workerId: W2, profileId: W2 }, pa, { mute: true });
  check("decline-and-mute on an offer declines it but mutes nothing", offerMute.ok && offerMute.muted === false && (await p.orgMute.count({ where: { workerId: W2 } })) === 0, offerMute);
  const legacyJob = await newJob("Legacy invite job", 2);
  const legacy = await p.engagement.create({ data: { jobId: legacyJob.id, workerId: W6, status: "INVITED" } });
  const legacyMute = await declineInvitation({ workerId: W6, profileId: W6 }, legacy.id, { mute: true });
  check("an invitation from before C3 history (no INVITED line) can still be declined and muted", legacyMute.ok && legacyMute.muted === true, legacyMute);
  check("…and it shows in the Invites view and the tab counts", (await loadJobInvites(legacyJob.id, ORG)).length === 1 && (await hiringCounts(legacyJob.id, ORG)).invites === 1);

  // The inbox honours the worker's own do-not-match answers (W4 asked not to be matched with this organization).
  const jd = await newJob("Disclosed invite job", 2, { campaignDisclosure: { campaignType: "ballot_measure", affiliation: "nonpartisan", message: "Paid for by the committee." } });
  const hidden = await inviteWorker(ORG, OWNER, jd.id, W4, new Date(Date.now() - 10 * DAY));
  check("an invitation the worker's do-not-match answers rule out never shows in their inbox", hidden.ok && !(await loadInvitations(W4)).some((i) => i.id === idOf(hidden)), hidden);

  check("tab counts agree with the applicants list on a job with a pre-C3 seeded engagement", (await hiringCounts(JOB, ORG)).applicants === (await loadApplicants(JOB, ORG, new Date(), { scorecards: false })).length, await hiringCounts(JOB, ORG));

  await muteOrg({ workerId: W4, profileId: W4 }, ORG);
  const mutesFile = (await exportAccount({ userId: W4, workerId: W4 })).find((f) => f.name === "mutes.json")?.text ?? "";
  check("the export's mutes file names the muted organization", /Front Range Circulators/.test(mutesFile), mutesFile);

  const expW2 = await exportAccount({ userId: W2, workerId: W2 });
  check("the export carries invitation notes and the mutes file", /Saturday canvass/.test(expW2.find((f) => f.name === "engagements.csv")?.text ?? "") && expW2.some((f) => f.name === "mutes.json"));

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
