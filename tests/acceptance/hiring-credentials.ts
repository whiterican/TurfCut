/* Hiring checks credentials (demo audit finding 3, src/lib/job-credentials.ts), on real Postgres: a worker can't apply
   to or instantly claim a job that needs a circulator registration, an affidavit status or a badge they don't hold, is
   told which, and gets through once a current one is in their wallet. */
import { db } from "@/lib/db";
import { applyToJob, claimJob } from "@/lib/engagements-data";
import { addCredential, removeCredential } from "@/lib/credentials-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const JOB = "00000000-0000-0000-0000-000000000011"; // the seeded petition job: CO circulator rules → registration, badge, affidavit
const X = "00000000-0000-0000-0000-0000000007a1"; // a worker with nothing in their wallet
const Y = "00000000-0000-0000-0000-0000000007a2";
const Z = "00000000-0000-0000-0000-0000000007a3"; // a worker whose badge is removed while their claim waits for the lock
const DAY = 86_400_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const reasonOf = (r: { ok: boolean; reason?: string }) => (r.ok ? "" : (r.reason ?? ""));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

(async () => {
  const p = db();
  await p.profile.createMany({ data: [{ id: X, role: "WORKER" }, { id: Y, role: "WORKER" }, { id: Z, role: "WORKER" }] });
  await p.worker.createMany({ data: [{ id: X, profileId: X, displayName: "Nora Blank" }, { id: Y, profileId: Y, displayName: "Theo Open" }, { id: Z, profileId: Z, displayName: "Rita Race" }] });
  const { jurisdictionId } = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  const job = (title: string, requirements: { badge?: boolean; training?: string }) =>
    p.job.create({ data: { orgId: ORG, jurisdictionId, type: "CANVASS", title, status: "PUBLISHED", hiringMethod: { modes: ["application", "instant_claim"] }, headcount: 5, geography: { city: "Denver", state: "CO" }, requirements } });
  await p.job.update({ where: { id: JOB }, data: { geography: { city: "Denver", state: "CO" } } });
  const badgeJob = await job("Voter registration canvass (badge)", { badge: true });
  const trainingJob = await job("Survey canvass (training only)", { training: "Canvass basics" });
  const engagements = async (w: string) => p.engagement.count({ where: { workerId: w } });

  // --- No credentials ---
  const claim0 = await claimJob(X, X, badgeJob.id);
  check("an instant claim on a job that needs a badge is refused for a worker with none, and says so", !claim0.ok && /needs credentials you haven't added: Badge\./.test(reasonOf(claim0)) && /Profile → Credentials/.test(reasonOf(claim0)), claim0);
  const apply0 = await applyToJob(X, X, JOB);
  check("applying to a petition job names every circulator credential missing", !apply0.ok && /Circulator registration, Badge, Signed affidavit/.test(reasonOf(apply0)), apply0);
  check("…and nothing is written: no engagement", (await engagements(X)) === 0);
  const training = await claimJob(Y, Y, trainingJob.id);
  check("a job that asks only for training (given on day one) can be claimed with an empty wallet", training.ok && "status" in training && training.status === "CLAIMED", training);

  // --- Some, but not current or not for this state ---
  const now = Date.now();
  for (const c of [
    { kind: "CIRCULATOR_REGISTRATION", state: "CO", expiresOn: iso(now - 3 * DAY) },
    { kind: "CIRCULATOR_REGISTRATION", state: "AZ", expiresOn: iso(now + 300 * DAY) },
    { kind: "NOTARY_OR_AFFIDAVIT", state: "CO" },
    { kind: "OTHER", label: "Paid circulator badge" },
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

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
