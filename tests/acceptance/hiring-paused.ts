/* Hiring stops when an organization's approval is withdrawn or its job's rules lapse (demo audit finding 5), on real
   Postgres: those jobs leave the feed, and applying, claiming, inviting, offering and accepting are refused with the
   reason, not only scheduling. People already hired keep their place, and everything comes back when it's cleared. */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { listHiringJobs, listPublicCampaigns, loadPosts, loadPublicPost } from "@/lib/campaign-social-data";
import { embedState } from "@/lib/campaign-social";
import { hiringOpenWhere, hiringPausedReasons } from "@/lib/jobs";
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

  // --- Lists that count or pick open jobs in the database leave paused jobs out, as the feed does ---
  const camp = await p.campaignProfile.create({ data: { orgId: ORG2, handle: "second_field_co", displayName: "Second Field Co", publishedAt: new Date(Date.now() - DAY) }, select: { id: true, orgId: true } });
  await p.job.update({ where: { id: j2.id }, data: { campaignProfileId: camp.id } });
  const listed = async () => ({
    hiring: (await listHiringJobs(camp)).jobs.map((j) => j.id),
    count: (await listPublicCampaigns()).campaigns.find((c) => c.id === camp.id)?.hiring ?? null,
  });
  const open = await listed();
  check("an open job is on its campaign's hiring list and in the directory's count", open.hiring.includes(j2.id) && open.count === 1, open);
  await p.organization.update({ where: { id: ORG2 }, data: { approved: false } });
  const unapproved = await listed();
  check("approval withdrawn: off the hiring list (the directory drops the campaign)", unapproved.hiring.length === 0 && unapproved.count === null, unapproved);
  await p.organization.update({ where: { id: ORG2 }, data: { approved: true } });
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { approvalExpiresAt: new Date(Date.now() - DAY) } });
  const lapsedList = await listed();
  check("rules lapsed: off the hiring list, and the directory counts 0", lapsedList.hiring.length === 0 && lapsedList.count === 0, lapsedList);
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { approvalExpiresAt: null } });
  check("cleared: back on the list and in the count", (await listed()).count === 1);

  // A job embedded in a post reads "paused" while hiring is paused, with no organization or rules left on the post.
  const post = await p.campaignPost.create({ data: { profileId: camp.id, authorId: OWNER2, body: "We are hiring.", jobId: j2.id }, select: { id: true } });
  const embedded = async () => {
    const posts = (await loadPosts(camp.id)).posts;
    const one = posts.find((x) => x.id === post.id)?.job ?? null;
    const viaPage = (await loadPublicPost("second_field_co", post.id))?.post.job ?? null;
    return { one, viaPage, state: one ? embedState(one, new Date()) : null, viaPageState: viaPage ? embedState(viaPage, new Date()) : null };
  };
  const e0 = await embedded();
  check("an open job's embed reads open", e0.state === "open" && e0.viaPageState === "open", e0);
  check("…and carries neither the organization nor the rules", !!e0.one && !("org" in e0.one) && !("jurisdiction" in e0.one), e0.one && Object.keys(e0.one));
  await p.organization.update({ where: { id: ORG2 }, data: { approved: false } });
  const e1 = await embedded();
  // (The post's own page is gone with the campaign while its organization is unapproved, so only the post lists show it.)
  check("approval withdrawn: the embed reads paused, and the post's own page is hidden with the campaign", e1.state === "paused" && e1.viaPage === null, e1);
  await p.organization.update({ where: { id: ORG2 }, data: { approved: true } });
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { approvalExpiresAt: new Date(Date.now() - DAY) } });
  const e2 = await embedded();
  check("rules lapsed: the embed reads paused", e2.state === "paused" && e2.viaPageState === "paused", e2);
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { approvalExpiresAt: null } });
  check("cleared: the embed reads open again", (await embedded()).state === "open");

  // hiringOpenWhere (the query) and hiringPausedReasons (the feed and the server) agree, profile state by profile state.
  const original = await p.jurisdictionProfile.findUniqueOrThrow({ where: { id: JUR } });
  const now = new Date();
  const states: Array<[string, Prisma.JurisdictionProfileUpdateInput, boolean]> = [
    ["as seeded", {}, true],
    ["not approved by counsel", { approved: false }, true],
    ["superseded", { isCurrent: false }, true],
    ["not yet effective", { effectiveFrom: new Date(now.getTime() + DAY) }, true],
    ["effective since yesterday", { effectiveFrom: new Date(now.getTime() - DAY) }, true],
    ["approval expired", { approvalExpiresAt: new Date(now.getTime() - DAY) }, true],
    ["approval expires tomorrow", { approvalExpiresAt: new Date(now.getTime() + DAY) }, true],
    ["no compensation rules", { rules: { notes: "none" } }, true],
    ["compensation rules not a list", { rules: { compensationAllowed: "HOURLY" } }, true],
    ["an empty list of methods", { rules: { compensationAllowed: [] } }, true],
    ["organization on hold", {}, false],
  ];
  const disagree: string[] = [];
  for (const [label, change, orgApproved] of states) {
    await p.jurisdictionProfile.update({ where: { id: JUR }, data: { approved: original.approved, isCurrent: original.isCurrent, effectiveFrom: original.effectiveFrom, approvalExpiresAt: original.approvalExpiresAt, rules: original.rules as Prisma.InputJsonValue, ...change } });
    await p.organization.update({ where: { id: ORG2 }, data: { approved: orgApproved } });
    const row = await p.job.findUniqueOrThrow({ where: { id: j2.id }, include: { org: true, jurisdiction: true } });
    const byQuery = (await p.job.count({ where: { id: j2.id, AND: [hiringOpenWhere(now)] } })) === 1;
    const byReasons = hiringPausedReasons(row.org, row.jurisdiction, now).length === 0;
    // The directory's count is the same rule in SQL (an organization on hold drops the whole campaign).
    const bySql = ((await listPublicCampaigns({ now })).campaigns.find((c) => c.id === camp.id)?.hiring ?? 0) === 1;
    if (byQuery !== byReasons || bySql !== byReasons) disagree.push(`${label}: query ${byQuery}, directory ${bySql}, reasons ${byReasons}`);
  }
  check("hiringOpenWhere and the directory count match hiringPausedReasons in every profile state", disagree.length === 0, disagree);
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { approved: original.approved, isCurrent: original.isCurrent, effectiveFrom: original.effectiveFrom, approvalExpiresAt: original.approvalExpiresAt, rules: original.rules as Prisma.InputJsonValue } });
  await p.organization.update({ where: { id: ORG2 }, data: { approved: true } });

  // --- Paused while a hire waits for the lock: checked again under it (rule 6) ---
  // Holds the worker's lock so the action passes the early check and then waits inside its transaction,
  // runs `pause` meanwhile (it commits at once, on another connection), then lets the action through.
  const whileWaiting = async <R,>(w: string, act: () => Promise<R>, pause: () => Promise<unknown>): Promise<R | undefined> => {
    let out: R | undefined;
    await p.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker:${w}`}))`;
      void act().then((r) => (out = r));
      let waiting = 0;
      for (let i = 0; i < 100 && !waiting; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const rows = await p.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' AND datname = current_database()`;
        waiting = Number(rows[0].n);
      }
      check("(the action is waiting on the worker's lock)", waiting > 0, waiting);
      await pause();
    }, { timeout: 15_000 });
    for (let i = 0; i < 200 && !out; i++) await new Promise((r) => setTimeout(r, 25));
    return out;
  };
  const before2 = await p.engagement.count({ where: { jobId: j2.id } });
  const racedClaim = await whileWaiting(A, () => claimJob(A, A, j2.id), () => p.organization.update({ where: { id: ORG2 }, data: { approved: false } }));
  check("approval withdrawn while a claim waits: refused under the lock, nothing written", !!racedClaim && !racedClaim.ok && /Hiring is paused on this job: Turfcut's approval/.test(reasonOf(racedClaim)) && (await p.engagement.count({ where: { jobId: j2.id } })) === before2, racedClaim);
  await p.organization.update({ where: { id: ORG2 }, data: { approved: true } });
  const bApplied2 = idOf(await applyToJob(B, B, j2.id));
  const org2 = { kind: "org" as const, profileId: OWNER2, orgId: ORG2 };
  await moveEngagement(bApplied2, "review", org2);
  const racedOffer = await whileWaiting(B, () => moveEngagement(bApplied2, "offer", org2), () => p.jurisdictionProfile.update({ where: { id: JUR }, data: { approvalExpiresAt: new Date(Date.now() - DAY) } }));
  const offered2 = await p.engagementEvent.count({ where: { engagementId: bApplied2, type: "OFFERED" } });
  check("rules lapse while an offer waits: refused under the lock, no offer made", !!racedOffer && !racedOffer.ok && /Hiring is paused on this job: Counsel approval/.test(reasonOf(racedOffer)) && (await statusOf(bApplied2)) === "APPLIED" && offered2 === 0, { racedOffer, offered2 });
  await p.jurisdictionProfile.update({ where: { id: JUR }, data: { approvalExpiresAt: null } });

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
