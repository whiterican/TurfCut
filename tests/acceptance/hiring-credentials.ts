/* Hiring checks credentials (demo audit finding 3, src/lib/job-credentials.ts), on real Postgres: a worker can't apply
   to or instantly claim a job that needs a circulator registration, an affidavit status or a badge they don't hold, is
   told which, and gets through once a current one is in their wallet. */
import { db } from "@/lib/db";
import { applyToJob, claimJob } from "@/lib/engagements-data";
import { addCredential } from "@/lib/credentials-data";

const ORG = "00000000-0000-0000-0000-000000000001";
const JOB = "00000000-0000-0000-0000-000000000011"; // the seeded petition job: CO circulator rules → registration, badge, affidavit
const X = "00000000-0000-0000-0000-0000000007a1"; // a worker with nothing in their wallet
const Y = "00000000-0000-0000-0000-0000000007a2";
const DAY = 86_400_000;
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const reasonOf = (r: { ok: boolean; reason?: string }) => (r.ok ? "" : (r.reason ?? ""));
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

(async () => {
  const p = db();
  await p.profile.createMany({ data: [{ id: X, role: "WORKER" }, { id: Y, role: "WORKER" }] });
  await p.worker.createMany({ data: [{ id: X, profileId: X, displayName: "Nora Blank" }, { id: Y, profileId: Y, displayName: "Theo Open" }] });
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

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
