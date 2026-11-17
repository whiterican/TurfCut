/* Hiring checks credentials (demo audit finding 3, src/lib/job-credentials.ts), on real Postgres: a worker can't apply
   to, instantly claim, or accept (invitation or offer) a job that needs a credential they don't hold, unless the job's
   "We provide training" setting waives a missing badge or training. Registration and affidavit are never waived.
   Turning the setting off later leaves existing hires as they are. */
import { db } from "@/lib/db";
import { acceptEngagement, applyToJob, claimJob, inviteWorker, moveEngagement } from "@/lib/engagements-data";
import { addCredential, removeCredential } from "@/lib/credentials-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const JOB = "00000000-0000-0000-0000-000000000011"; // the seeded petition job: CO circulator rules → registration, badge, affidavit, plus training
const X = "00000000-0000-0000-0000-0000000007a1"; // a worker with nothing in their wallet
const Y = "00000000-0000-0000-0000-0000000007a2";
const Z = "00000000-0000-0000-0000-0000000007a3"; // a worker whose badge is removed while their claim waits for the lock
const P = "00000000-0000-0000-0000-0000000007a4"; // hired while the organization provides training
const Q = "00000000-0000-0000-0000-0000000007a5"; // invite-accept
const R = "00000000-0000-0000-0000-0000000007a6"; // offer-accept
const S = "00000000-0000-0000-0000-0000000007a7"; // a later applicant after the setting is turned off
const T = "00000000-0000-0000-0000-0000000007a8"; // registration still required when the setting is on
const DAY = 86_400_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const reasonOf = (r: { ok: boolean; reason?: string }) => (r.ok ? "" : (r.reason ?? ""));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const org = { kind: "org" as const, profileId: OWNER, orgId: ORG };
const worker = (w: string) => ({ kind: "worker" as const, profileId: w, workerId: w });

(async () => {
  const p = db();
  await p.profile.createMany({ data: [
    { id: OWNER, role: "OWNER", orgId: ORG, displayName: "Maya Chen" },
    { id: X, role: "WORKER" }, { id: Y, role: "WORKER" }, { id: Z, role: "WORKER" },
    { id: P, role: "WORKER" }, { id: Q, role: "WORKER" }, { id: R, role: "WORKER" },
    { id: S, role: "WORKER" }, { id: T, role: "WORKER" },
  ] });
  await p.worker.createMany({ data: [
    { id: X, profileId: X, displayName: "Nora Blank" },
    { id: Y, profileId: Y, displayName: "Theo Open" },
    { id: Z, profileId: Z, displayName: "Rita Race" },
    { id: P, profileId: P, displayName: "Pat Hired" },
    { id: Q, profileId: Q, displayName: "Quinn Invite" },
    { id: R, profileId: R, displayName: "Robin Offer" },
    { id: S, profileId: S, displayName: "Sage Later" },
    { id: T, profileId: T, displayName: "Taylor Reg" },
  ] });
  const { jurisdictionId } = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  const job = (title: string, requirements: { badge?: boolean; training?: string; registration?: boolean; affidavit?: boolean }, extra: Record<string, unknown> = {}) =>
    p.job.create({ data: { orgId: ORG, jurisdictionId, type: "CANVASS", title, status: "PUBLISHED", hiringMethod: { modes: ["application", "invite", "instant_claim"] }, headcount: 5, geography: { city: "Denver", state: "CO" }, requirements, ...extra } });
  await p.job.update({ where: { id: JOB }, data: { geography: { city: "Denver", state: "CO" } } });
  const badgeJob = await job("Voter registration canvass (badge)", { badge: true });
  const trainingJob = await job("Survey canvass (training only)", { training: "Canvass basics" });
  const providedJob = await job("Canvass with training provided", { badge: true, training: "Canvass basics" }, { providesTraining: true });
  const openJob = await job("Open canvass (no credentials)", {});
  const engagements = async (w: string) => p.engagement.count({ where: { workerId: w } });
  const statusOf = async (id: string) => (await p.engagement.findUniqueOrThrow({ where: { id } })).status;

  // --- No credentials ---
  const claim0 = await claimJob(X, X, badgeJob.id);
  check("an instant claim on a job that needs a badge is refused for a worker with none, and says so", !claim0.ok && /needs credentials you haven't added: Badge\./.test(reasonOf(claim0)) && /Profile → Credentials/.test(reasonOf(claim0)), claim0);
  const apply0 = await applyToJob(X, X, JOB);
  check("applying to a petition job names every circulator credential missing, training included", !apply0.ok && /Circulator registration, Badge, Signed affidavit, Training: petition-basics/.test(reasonOf(apply0)), apply0);
  check("…and nothing is written: no engagement", (await engagements(X)) === 0);
  const trainingOff = await claimJob(Y, Y, trainingJob.id);
  check("a job that asks only for training, with We provide training off, is refused with an empty wallet", !trainingOff.ok && /Training: Canvass basics/.test(reasonOf(trainingOff)), trainingOff);

  // --- Some, but not current or not for this state ---
  const now = Date.now();
  for (const c of [
    { kind: "CIRCULATOR_REGISTRATION", state: "CO", expiresOn: iso(now - 3 * DAY) },
    { kind: "CIRCULATOR_REGISTRATION", state: "AZ", expiresOn: iso(now + 300 * DAY) },
    { kind: "NOTARY_OR_AFFIDAVIT", state: "CO" },
    { kind: "OTHER", label: "Paid circulator badge" },
    { kind: "TRAINING", label: "petition-basics" },
  ]) {
    const r = await addCredential(X, X, c);
    if (!r.ok) throw new Error(`addCredential: ${JSON.stringify(r)}`);
  }
  const apply1 = await applyToJob(X, X, JOB);
  check("an expired Colorado registration and an Arizona one don't count for a Colorado job", !apply1.ok && /haven't added: Circulator registration\./.test(reasonOf(apply1)), apply1);
  const claim1 = await claimJob(X, X, badgeJob.id);
  check("a badge named in an Other credential covers the badge", claim1.ok && "status" in claim1 && claim1.status === "CLAIMED", claim1);

  // --- A current one ---
  const added = await addCredential(X, X, { kind: "CIRCULATOR_REGISTRATION", state: "CO", expiresOn: iso(now + 300 * DAY) });
  check("(the worker adds a current Colorado registration)", added.ok, added);
  const apply2 = await applyToJob(X, X, JOB);
  check("with every credential current, the application goes through, self-reported as they are", apply2.ok && "status" in apply2 && apply2.status === "APPLIED", apply2);

  // --- A name that only mentions a badge isn't one ---
  const noBadge = await addCredential(Y, Y, { kind: "OTHER", label: "No badge yet" });
  check("(the worker adds an Other credential named “No badge yet”)", noBadge.ok, noBadge);
  const claim2 = await claimJob(Y, Y, badgeJob.id);
  check("“No badge yet” doesn't count as the badge", !claim2.ok && /haven't added: Badge\./.test(reasonOf(claim2)), claim2);

  // --- Removed while the claim waits for the lock: checked again under it ---
  const zBadge = await addCredential(Z, Z, { kind: "OTHER", label: "Badge" });
  if (!zBadge.ok) throw new Error(`addCredential: ${JSON.stringify(zBadge)}`);
  let raced: Awaited<ReturnType<typeof claimJob>> | undefined;
  await p.$transaction(async (tx) => {
    // Hold Z's worker lock, so the claim passes the early check and then waits inside its transaction.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker:${Z}`}))`;
    const pending = claimJob(Z, Z, badgeJob.id).then((r) => (raced = r));
    let waiting = 0;
    for (let i = 0; i < 100 && !waiting; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const rows = await p.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' AND datname = current_database()`;
      waiting = Number(rows[0].n);
    }
    check("(the claim is waiting on the worker's lock)", waiting > 0, waiting);
    const removed = await removeCredential(Z, Z, zBadge.id);
    check("(the badge is removed meanwhile)", removed.ok, removed);
    void pending;
  }, { timeout: 15_000 });
  for (let i = 0; i < 200 && !raced; i++) await new Promise((r) => setTimeout(r, 25));
  check("a badge removed while the claim waits is caught under the lock: refused, nothing written", !!raced && !raced.ok && /haven't added: Badge\./.test(reasonOf(raced)) && (await engagements(Z)) === 0, raced);

  // --- We provide training: apply, claim, and existing hires ---
  const claimProvided = await claimJob(P, P, providedJob.id);
  check("with We provide training on, a worker with no badge or training can claim", claimProvided.ok && "status" in claimProvided && claimProvided.status === "CLAIMED", claimProvided);
  const applyProvidedOff = await applyToJob(S, S, trainingJob.id);
  check("with We provide training off, apply is refused for a missing training course", !applyProvidedOff.ok && /Training: Canvass basics/.test(reasonOf(applyProvidedOff)) && (await engagements(S)) === 0, applyProvidedOff);
  await p.job.update({ where: { id: providedJob.id }, data: { providesTraining: false } });
  check("turning We provide training off leaves the existing hire as it was", (await statusOf(claimProvided.ok ? claimProvided.engagementId : "")) === "CLAIMED");
  const later = await claimJob(S, S, providedJob.id);
  check("…but a new claim is refused once the setting is off", !later.ok && /Badge/.test(reasonOf(later)) && /Training: Canvass basics/.test(reasonOf(later)) && (await engagements(S)) === 0, later);

  // Registration and affidavit are still required when the setting is on.
  const regJob = await job("Canvass with registration and training provided", { registration: true, badge: true, training: "Canvass basics" }, { providesTraining: true });
  const claimReg = await claimJob(T, T, regJob.id);
  check("with We provide training on, a missing registration still blocks a claim", !claimReg.ok && /haven't added: Circulator registration\./.test(reasonOf(claimReg)) && (await engagements(T)) === 0, claimReg);
  const tReg = await addCredential(T, T, { kind: "CIRCULATOR_REGISTRATION", state: "CO", expiresOn: iso(now + 300 * DAY) });
  check("(the worker adds a current Colorado registration)", tReg.ok, tReg);
  const claimReg2 = await claimJob(T, T, regJob.id);
  check("…and can claim once they have the registration, still without a badge or training", claimReg2.ok && "status" in claimReg2 && claimReg2.status === "CLAIMED", claimReg2);

  // Relationship for invitations: Q and R apply to an open job first.
  const qOpen = await applyToJob(Q, Q, openJob.id);
  const rOpen = await applyToJob(R, R, openJob.id);
  check("(two workers apply to an open job so the organization can invite them)", qOpen.ok && rOpen.ok, { qOpen, rOpen });

  // --- Invite-accept ---
  const inviteOffJob = await job("Invite canvass, training not provided", { badge: true, training: "Canvass basics" }, { providesTraining: false });
  const invOff = await inviteWorker(ORG, OWNER, inviteOffJob.id, Q);
  check("(the organization can invite a worker who lacks a badge — sending the invite is not the hire)", invOff.ok && "status" in invOff && invOff.status === "INVITED", invOff);
  const accOff = await acceptEngagement(invOff.ok ? invOff.engagementId : "", worker(Q));
  check("accepting an invitation is refused when We provide training is off and the badge is missing", !accOff.ok && /Badge/.test(reasonOf(accOff)) && (await statusOf(invOff.ok ? invOff.engagementId : "")) === "INVITED", accOff);

  const inviteOnJob = await job("Invite canvass, training provided", { badge: true, training: "Canvass basics" }, { providesTraining: true });
  const invOn = await inviteWorker(ORG, OWNER, inviteOnJob.id, Q);
  const accOn = await acceptEngagement(invOn.ok ? invOn.engagementId : "", worker(Q));
  check("accepting an invitation succeeds when We provide training is on, without a badge or training", invOn.ok && accOn.ok && "status" in accOn && accOn.status === "ACTIVE", { invOn, accOn });

  const inviteRegJob = await job("Invite canvass, registration still required", { registration: true, badge: true }, { providesTraining: true });
  const invReg = await inviteWorker(ORG, OWNER, inviteRegJob.id, Q);
  const accReg = await acceptEngagement(invReg.ok ? invReg.engagementId : "", worker(Q));
  check("accepting an invitation is still refused for a missing registration when We provide training is on", !accReg.ok && /Circulator registration/.test(reasonOf(accReg)) && (await statusOf(invReg.ok ? invReg.engagementId : "")) === "INVITED", accReg);

  // --- Offer-accept ---
  const offerOffJob = await job("Offer canvass, training not provided", { badge: true, training: "Canvass basics" }, { providesTraining: false, hiringMethod: { modes: ["application"] } });
  const applyOfferOff = await applyToJob(R, R, offerOffJob.id);
  check("applying is refused when We provide training is off and the badge is missing, so no offer can be accepted", !applyOfferOff.ok && /Badge/.test(reasonOf(applyOfferOff)), applyOfferOff);

  const offerOnJob = await job("Offer canvass, training provided", { badge: true, training: "Canvass basics" }, { providesTraining: true, hiringMethod: { modes: ["application"] } });
  const applyOfferOn = await applyToJob(R, R, offerOnJob.id);
  const offeredOn = applyOfferOn.ok ? await moveEngagement(applyOfferOn.engagementId, "offer", org) : { ok: false as const, reason: "no apply" };
  const accOfferOn = offeredOn.ok ? await acceptEngagement(applyOfferOn.ok ? applyOfferOn.engagementId : "", worker(R)) : offeredOn;
  check("accepting an offer succeeds when We provide training is on, without a badge or training", applyOfferOn.ok && offeredOn.ok && accOfferOn.ok && "status" in accOfferOn && accOfferOn.status === "ACTIVE", { applyOfferOn, offeredOn, accOfferOn });

  const offerFlipJob = await job("Offer canvass, setting flipped before accept", { badge: true }, { providesTraining: true, hiringMethod: { modes: ["application"] } });
  const applyFlip = await applyToJob(S, S, offerFlipJob.id);
  const offeredFlip = applyFlip.ok ? await moveEngagement(applyFlip.engagementId, "offer", org) : { ok: false as const, reason: "no apply" };
  await p.job.update({ where: { id: offerFlipJob.id }, data: { providesTraining: false } });
  const accFlip = offeredFlip.ok && applyFlip.ok ? await acceptEngagement(applyFlip.engagementId, worker(S)) : { ok: false as const, reason: "no offer" };
  check("accepting an offer is refused if We provide training is turned off after the worker applied, and they stay OFFERED, not hired", applyFlip.ok && offeredFlip.ok && !accFlip.ok && /Badge/.test(reasonOf(accFlip)) && (await statusOf(applyFlip.ok ? applyFlip.engagementId : "")) === "OFFERED", { applyFlip, offeredFlip, accFlip });

  const offerRegJob = await job("Offer canvass, registration still required", { registration: true, badge: true }, { providesTraining: true, hiringMethod: { modes: ["application"] } });
  const applyOfferReg = await applyToJob(Q, Q, offerRegJob.id);
  check("applying is still refused for a missing registration when We provide training is on", !applyOfferReg.ok && /Circulator registration/.test(reasonOf(applyOfferReg)), applyOfferReg);

  // Offer-accept with the setting on: a registration removed after the offer still blocks accepting it.
  const tRegRow = await p.workerCredential.findFirstOrThrow({ where: { workerId: T, kind: "CIRCULATOR_REGISTRATION", removed: false, supersededBy: null } });
  const applyRegOk = await applyToJob(T, T, offerRegJob.id);
  const offeredReg = applyRegOk.ok ? await moveEngagement(applyRegOk.engagementId, "offer", org) : { ok: false as const, reason: "no apply" };
  const removedReg = await removeCredential(T, T, tRegRow.id);
  const accOfferReg = applyRegOk.ok ? await acceptEngagement(applyRegOk.engagementId, worker(T)) : { ok: false as const, reason: "no apply" };
  check("accepting an offer is refused when the registration was removed after applying, even with We provide training on", applyRegOk.ok && offeredReg.ok && removedReg.ok && !accOfferReg.ok && /Circulator registration/.test(reasonOf(accOfferReg)) && (await statusOf(applyRegOk.ok ? applyRegOk.engagementId : "")) === "OFFERED", { applyRegOk, offeredReg, removedReg, accOfferReg });

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
