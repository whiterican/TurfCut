/* Hiring stops when an organization's approval is withdrawn or its job's rules lapse (demo audit finding 5), on real
   Postgres: those jobs leave the feed, and applying, claiming, inviting, offering and accepting are refused with the
   reason, not only scheduling. People already hired keep their place, and everything comes back when it's cleared. */
import { db } from "@/lib/db";
import { loadFeed } from "@/lib/jobs-data";
import { applyToJob, claimJob, inviteWorker, moveEngagement } from "@/lib/engagements-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-0000000008b0";
const OWNER = "00000000-0000-0000-0000-0000000008b1";
const OWNER2 = "00000000-0000-0000-0000-0000000008b2";
const JUR = "00000000-0000-0000-0000-000000000021"; // the seeded CO/Denver profile
const [A, B, C, D] = ["8a1", "8a2", "8a3", "8a4"].map((x) => `00000000-0000-0000-0000-000000000${x}`);
const DAY = 86_400_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const reasonOf = (r: { ok: boolean; reason?: string }) => (r.ok ? "" : (r.reason ?? ""));
const idOf = (r: { ok: boolean } & ({ engagementId: string } | object)) => ("engagementId" in r ? r.engagementId : "");

(async () => {
  const p = db();
  await p.organization.create({ data: { id: ORG2, name: "Second Field Co", approved: true, updatedAt: new Date() } });
  await p.profile.createMany({ data: [{ id: OWNER, role: "OWNER", orgId: ORG, displayName: "Owner One" }, { id: OWNER2, role: "OWNER", orgId: ORG2, displayName: "Owner Two" }, ...[A, B, C, D].map((id) => ({ id, role: "WORKER" as const }))] });
  await p.worker.createMany({ data: [A, B, C, D].map((id, i) => ({ id, profileId: id, displayName: `Worker ${"ABCD"[i]}` })) });
  const job = (orgId: string, title: string) =>
    p.job.create({
      data: { orgId, jurisdictionId: JUR, type: "CANVASS", title, status: "PUBLISHED", hiringMethod: { modes: ["application", "instant_claim", "invite"] }, headcount: 10, geography: { city: "Denver", state: "CO" }, startsAt: new Date(), endsAt: new Date(Date.now() + 30 * DAY) },
    });
  const j1 = await job(ORG, "Paused-rules canvass");
  const j2 = await job(ORG2, "Second org canvass");
  const feedIds = async () => new Set((await loadFeed(null)).jobs.map((j) => j.id));
  const org1 = { kind: "org" as const, profileId: OWNER, orgId: ORG };
  const worker = (w: string) => ({ kind: "worker" as const, profileId: w, workerId: w });

  check("both jobs are in the feed to start with", (await feedIds()).has(j1.id) && (await feedIds()).has(j2.id));
  const dHired = await claimJob(D, D, j1.id);
  const bApplied = idOf(await applyToJob(B, B, j1.id));
  const cApplied = idOf(await applyToJob(C, C, j1.id));
  await moveEngagement(cApplied, "review", org1);
  const cOffered = await moveEngagement(cApplied, "offer", org1);
  check("(before: D is hired, B applied, C has an offer)", dHired.ok && !!bApplied && cOffered.ok && "status" in cOffered && cOffered.status === "OFFERED", { dHired, bApplied, cOffered });

  // --- Turfcut withdraws an organization's approval ---
  await p.organization.update({ where: { id: ORG2 }, data: { approved: false } });
  const feedUnapproved = await feedIds();
  check("an unapproved organization's jobs leave the feed; others stay", !feedUnapproved.has(j2.id) && feedUnapproved.has(j1.id), [...feedUnapproved]);
  const claimU = await claimJob(A, A, j2.id);
  check("claiming its job is refused, with the reason", !claimU.ok && /^Hiring is paused on this job: Turfcut's approval of this organization is on hold\./.test(reasonOf(claimU)), claimU);
  const applyU = await applyToJob(A, A, j2.id);
  check("…and so is applying", !applyU.ok && /Hiring is paused/.test(reasonOf(applyU)), applyU);
  const inviteU = await inviteWorker(ORG2, OWNER2, j2.id, A);
  check("…and inviting, by the organization itself", !inviteU.ok && /Hiring is paused/.test(reasonOf(inviteU)), inviteU);
  check("nothing was written for those", (await p.engagement.count({ where: { jobId: j2.id } })) === 0);
  await p.organization.update({ where: { id: ORG2 }, data: { approved: true } });

  // --- The job's rules lapse (counsel's approval expired) ---
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { approvalExpiresAt: new Date(Date.now() - DAY) } });
  const feedLapsed = await feedIds();
  check("jobs under lapsed rules leave the feed", !feedLapsed.has(j1.id) && !feedLapsed.has(j2.id), [...feedLapsed]);
  const claimL = await claimJob(A, A, j1.id);
  check("claiming is refused, naming the lapsed approval", !claimL.ok && /Hiring is paused on this job: Counsel approval for Denver, CO \(rules v1\) expired/.test(reasonOf(claimL)), claimL);
  const applyL = await applyToJob(A, A, j1.id);
  check("…and applying", !applyL.ok && /Hiring is paused/.test(reasonOf(applyL)), applyL);
  const reviewL = await moveEngagement(bApplied, "review", org1);
  const offerL = await moveEngagement(bApplied, "offer", org1);
  check("an offer is refused (it would hire)", !offerL.ok && /Hiring is paused/.test(reasonOf(offerL)), offerL);
  const acceptL = await moveEngagement(cApplied, "accept", worker(C));
  check("…and accepting an offer already out", !acceptL.ok && /Hiring is paused/.test(reasonOf(acceptL)), acceptL);
  const statusOf = async (id: string) => (await p.engagement.findUniqueOrThrow({ where: { id } })).status;
  check("other steps still work: B's application went into review", reviewL.ok && (await p.engagementEvent.count({ where: { engagementId: bApplied, type: "IN_REVIEW" } })) === 1, reviewL);
  check("someone already hired keeps their place", (await statusOf(idOf(dHired))) === "CLAIMED");
  const withdrawn = await moveEngagement(bApplied, "withdraw", worker(B));
  check("…and a worker can still withdraw", withdrawn.ok, withdrawn);

  // --- Cleared: hiring opens again ---
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { approvalExpiresAt: null } });
  check("re-approved: the jobs are back in the feed", (await feedIds()).has(j1.id) && (await feedIds()).has(j2.id));
  const claimOk = await claimJob(A, A, j1.id);
  const acceptOk = await moveEngagement(cApplied, "accept", worker(C));
  check("…and claiming and accepting go through", claimOk.ok && acceptOk.ok, { claimOk, acceptOk });

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
