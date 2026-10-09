/* C3.1 acceptance checks: the hiring pipeline on real Postgres — review, offer, accept, decline with a reason, withdraw, expiry, history and no browser access (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { applyToJob, inviteWorker, loadEngagementEvents, loadPipelineFacts, moveEngagement } from "@/lib/engagements-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const ORG2 = "00000000-0000-0000-0000-000000000002";
const OWNER = "00000000-0000-0000-0000-0000000000aa";
const OTHER = "00000000-0000-0000-0000-0000000000cc";
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
  ] });
  await p.job.update({ where: { id: JOB }, data: { hiringMethod: { modes: ["application", "invite"] }, headcount: 3 } });

  // --- Apply → in review → offer → accept ---
  const a = await applyToJob(W2, W2, JOB);
  const e2 = a.ok ? a.engagementId : "";
  check("applying records an APPLIED event by the worker", a.ok && (await types(e2)) === "APPLIED" && (await loadEngagementEvents(e2))[0] !== undefined, a);
  const r1 = await moveEngagement(e2, "review", org);
  const r2 = await moveEngagement(e2, "review", org);
  check("in review is recorded once; the status stays APPLIED", r1.ok && r1.status === "APPLIED" && !r2.ok && (await types(e2)) === "APPLIED,IN_REVIEW", { r1, r2 });
  check("the worker can't put their own application in review", !(await moveEngagement(e2, "review", worker(W2))).ok);
  check("another organization can't touch it (reads as not found)", (await moveEngagement(e2, "offer", { kind: "org", profileId: OTHER, orgId: ORG2 })).ok === false);
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
  check("an engagement from before C3 has an empty history and isn't offered or in review", (await loadPipelineFacts([seeded])).get(seeded)?.events.length === 0 && (await loadPipelineFacts([seeded])).get(seeded)?.offerExpiresAt === null);

  await p.$disconnect();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
