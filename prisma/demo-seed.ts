/**
 * Demo data: makes the app look active for testers. Every organization and
 * worker it creates is named "… (demo)"; the campaigns are fictional and
 * nonpartisan (civic work and made-up local measures), and demo workers have
 * no political-fit answers.
 *
 * Built through the app's own rules — jobs pass the publish gate, workers
 * apply and are accepted, shifts are scheduled, worked and reviewed with the
 * field-day functions — backdated so workers have real verified history and
 * pay lines computed by the pay rules. Nothing is hand-written.
 *
 * Run: npm run seed:demo (needs DATABASE_URL; the base seed's approved
 * CO/Denver jurisdiction must exist). Runs once: if the demo organizations
 * are already there it stops. Most of what it writes is append-only (work
 * events, reviews, pay lines) and stays for good; demo jobs can be closed.
 */
import { db } from "../src/lib/db";
import { validateJob } from "../src/lib/jobs";
import { createJob, publishJob } from "../src/lib/jobs-data";
import { acceptEngagement, applyToJob, claimJob } from "../src/lib/engagements-data";
import { scheduleShift, supervisorShiftAction, workerShiftAction } from "../src/lib/field-day-data";
import { ensureDirect, sendMessage } from "../src/lib/chat-data";

const p = db();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;
const JURISDICTION = "00000000-0000-0000-0000-000000000021";
const DEMO = " (demo)";

// Deterministic randomness, so a run is reproducible.
let seed = 20261006;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const must = <T extends { ok: boolean }>(r: T, what: string): T & { ok: true } => {
  if (!r.ok) throw new Error(`${what}: ${JSON.stringify(r)}`);
  return r as T & { ok: true };
};

const ORGS = [
  { name: "Mile High Civic Works", owner: "Dana Whitfield", supervisor: "Luis Ortega" },
  { name: "Front Range Field Partners", owner: "Priya Raman", supervisor: "Marcus Bell" },
  { name: "Colfax Canvass Collective", owner: "Erin Callahan", supervisor: "Tomás Rivera" },
  { name: "Cherry Creek Petition Co.", owner: "Sam Whitaker", supervisor: "Nia Holloway" },
  { name: "Platte Valley Outreach", owner: "Grace Kim", supervisor: "Devon Price" },
  { name: "Rocky Mountain Voter Project", owner: "Hannah Lowe", supervisor: "Andre Mitchell" },
];

const WORKERS = [
  "Maya Okafor", "Jordan Reyes", "Chris Nguyen", "Ava Lindqvist", "Malik Johnson", "Sofia Delgado",
  "Ben Carter", "Riley Thompson", "Imani Brooks", "Diego Morales", "Hana Sato", "Owen Fischer",
];

const CITIES = ["Denver", "Aurora", "Lakewood", "Englewood", "Westminster", "Arvada", "Littleton", "Thornton"];

/** Fictional, nonpartisan campaigns. */
const CAMPAIGNS = [
  { type: "PETITION", title: "Library Hours Initiative — signature drive", campaignType: "ballot_measure", name: "Denver Library Hours Measure (demo)", message: "Put extended library hours on the city ballot.", issues: {} },
  { type: "PETITION", title: "Neighborhood Parks Bond — petition team", campaignType: "ballot_measure", name: "Neighborhood Parks Bond (demo)", message: "Let voters decide on a parks maintenance bond.", issues: {} },
  { type: "PETITION", title: "Bike Lane Safety Measure — circulators", campaignType: "ballot_measure", name: "Safer Streets Measure (demo)", message: "Qualify a street-safety measure for the ballot.", issues: {} },
  { type: "PETITION", title: "Public Transit Night Service — signatures", campaignType: "ballot_measure", name: "Late-Night Transit Measure (demo)", message: "Ask voters to fund late-night bus service.", issues: {} },
  { type: "CANVASS", title: "Voter registration canvass — East Colfax", campaignType: "nonpartisan_civic", name: null, message: "Help eligible neighbors register and check their registration.", issues: { voting_access: "support" } },
  { type: "CANVASS", title: "Get-out-the-vote reminders — weekend shifts", campaignType: "nonpartisan_civic", name: null, message: "Remind registered voters of dates, drop boxes and polling places.", issues: {} },
  { type: "CANVASS", title: "Census-style community survey — door to door", campaignType: "nonpartisan_civic", name: null, message: "Collect neighborhood feedback for the city's planning office.", issues: {} },
  { type: "CANVASS", title: "Ballot measure info canvass — Aurora", campaignType: "ballot_measure", name: "Neighborhood Parks Bond (demo)", message: "Share what the parks bond does and answer questions.", issues: {} },
  { type: "PETITION", title: "School Crossing Guards Measure — petitioners", campaignType: "ballot_measure", name: "Safe Routes to School Measure (demo)", message: "Gather signatures for funding school crossing guards.", issues: {} },
  { type: "CANVASS", title: "New-resident voter guide drop", campaignType: "nonpartisan_civic", name: null, message: "Leave nonpartisan voter guides and answer questions.", issues: {} },
] as const;

const PACKET = (i: number) => `DEMO-${String(i).padStart(4, "0")}`;

async function main() {
  if (await p.organization.findFirst({ where: { name: { endsWith: DEMO } } })) {
    console.log("Demo data is already here; nothing to do.");
    return;
  }
  const jurisdiction = await p.jurisdictionProfile.findUnique({ where: { id: JURISDICTION } });
  if (!jurisdiction?.approved) throw new Error("Run the base seed first: the approved CO/Denver jurisdiction is missing.");

  const now = new Date();
  const T0 = new Date(now.getTime() - 45 * DAY); // when the demo's history starts

  // --- Organizations, each with an owner and a supervisor ---
  const orgs = [];
  for (const o of ORGS) {
    const org = await p.organization.create({
      data: {
        name: `${o.name}${DEMO}`,
        approved: true,
        contractorTermsSignedAt: T0,
        classificationReviewedAt: T0,
        legalContact: "legal@example.org",
        createdAt: T0,
      },
    });
    const owner = await p.profile.create({ data: { id: crypto.randomUUID(), role: "OWNER", orgId: org.id, displayName: o.owner, createdAt: T0 } });
    const sup = await p.profile.create({ data: { id: crypto.randomUUID(), role: "SUPERVISOR", orgId: org.id, displayName: o.supervisor, createdAt: T0 } });
    orgs.push({ org, owner, sup });
  }

  // --- Workers ---
  const workers = [];
  for (const name of WORKERS) {
    const profile = await p.profile.create({ data: { id: crypto.randomUUID(), role: "WORKER", createdAt: T0 } });
    const worker = await p.worker.create({ data: { profileId: profile.id, displayName: `${name}${DEMO}`, createdAt: T0 } });
    workers.push({ worker, profile });
  }

  // --- Jobs: ~20, some running since the demo began (they hold the history), some starting soon ---
  const jobs: Array<{ id: string; orgIdx: number; type: "PETITION" | "CANVASS"; startsAt: Date; endsAt: Date; past: boolean; modes: string[]; rateCents: number; method: string }> = [];
  for (let i = 0; i < 20; i++) {
    const orgIdx = i % orgs.length;
    const c = CAMPAIGNS[i % CAMPAIGNS.length];
    const past = i < 12;
    const startsAt = past ? new Date(T0.getTime() + int(0, 10) * DAY) : new Date(now.getTime() + int(2, 21) * DAY);
    const endsAt = new Date((past ? now.getTime() : startsAt.getTime()) + int(20, 60) * DAY);
    const method = rand() < 0.7 ? "HOURLY" : "SHIFT_RATE";
    const rate = method === "HOURLY" ? pick(["22", "24", "25", "26", "28", "30"]) : pick(["150", "165", "180", "200"]);
    const modes = past ? ["application"] : pick([["application"], ["application", "instant_claim"], ["instant_claim"], ["application", "invite"]]);
    const city = pick(CITIES);
    const raw: Record<string, unknown> = {
      type: c.type,
      title: c.title,
      description: `${c.message} Training provided on day one; staging point shared after you're hired. Demo job: not a real campaign.`,
      jurisdictionId: JURISDICTION,
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      city,
      state: "CO",
      compensationMethod: method,
      payRate: rate,
      headcount: String(int(4, 25)),
      hiringModes: modes,
      badge: "on",
      registration: c.type === "PETITION" ? "on" : "",
      affidavit: c.type === "PETITION" ? "on" : "",
      training: c.type === "PETITION" ? "Petition basics" : "Canvass basics",
      campaignType: c.campaignType,
      affiliation: "nonpartisan",
      campaignName: c.name ?? "",
      message: c.message,
      contactEmergency: `${orgs[orgIdx].sup.displayName}, (303) 555-01${String(10 + orgIdx).padStart(2, "0")}`,
      contactDisputes: `${orgs[orgIdx].owner.displayName}, disputes@example.org`,
      contactLostMaterials: `${orgs[orgIdx].sup.displayName}, (303) 555-01${String(10 + orgIdx).padStart(2, "0")}`,
      cancellationNoticeHours: "24",
      ...Object.fromEntries(Object.entries(c.issues).map(([k, v]) => [`issue_${k}`, v])),
    };
    const v = validateJob(raw);
    if (!v.ok) throw new Error(`demo job ${i}: ${JSON.stringify(v.errors)}`);
    const { org, owner } = orgs[orgIdx];
    const job = await createJob(org.id, owner.id, v.value);
    must(await publishJob(job.id, org.id, owner.id, past ? T0 : now), `publish job ${i}`);
    jobs.push({ id: job.id, orgIdx, type: c.type, startsAt, endsAt, past, modes, rateCents: Math.round(Number(rate) * 100), method });
  }

  // --- History: each worker was hired on 1–2 running jobs and worked shifts there ---
  let packet = 1;
  let shiftsWorked = 0;
  const pastJobs = jobs.filter((j) => j.past);
  for (const [wi, { worker, profile }] of workers.entries()) {
    const hiredOn = [pastJobs[wi % pastJobs.length], pastJobs[(wi + 5) % pastJobs.length]].slice(0, wi % 3 === 0 ? 1 : 2);
    for (const job of hiredOn) {
      const { org, owner, sup } = orgs[job.orgIdx];
      const appliedAt = new Date(job.startsAt.getTime() - 2 * DAY);
      const applied = must(await applyToJob(worker.id, profile.id, job.id, appliedAt), "apply");
      must(await acceptEngagement(applied.engagementId, { kind: "org", profileId: owner.id, orgId: org.id }), "accept");

      const shifts = int(2, 5);
      for (let s = 0; s < shifts; s++) {
        const dayOffset = int(1, Math.max(2, Math.floor((now.getTime() - job.startsAt.getTime()) / DAY) - 1));
        const start = new Date(job.startsAt.getTime() + dayOffset * DAY + int(15, 17) * HOUR); // 9–11am Mountain
        if (start.getTime() > now.getTime() - 8 * HOUR) continue;
        const hours = pick([4, 4, 5, 6]);
        const end = new Date(start.getTime() + hours * HOUR);
        const sched = await scheduleShift(
          { profileId: owner.id, orgId: org.id },
          applied.engagementId,
          { startsAt: start.toISOString(), endsAt: end.toISOString(), stagingLocation: `${pick(["Library", "Rec center", "Coffee shop", "Community center"])} parking lot`, supervisorId: sup.id },
          new Date(start.getTime() - 3 * DAY)
        );
        if (!sched.ok) continue; // e.g. overlaps another shift: skip it
        const shiftId = sched.shiftId;
        const me = { workerId: worker.id, profileId: profile.id };
        const boss = { profileId: sup.id, orgId: org.id };
        const at = (m: number) => new Date(start.getTime() + m * MIN);

        // A small share of shifts are no-shows (the worker never checks in): show rate isn't always 100%.
        if (rand() < 0.08) continue;
        must(await workerShiftAction(me, shiftId, { kind: "check_in", location: { checked: true, atStaging: true, distance: "under 250 m" } }, at(int(-5, 10))), "check in");
        const id = PACKET(packet++);
        if (job.type === "PETITION") must(await supervisorShiftAction(boss, shiftId, { kind: "packet_pickup", packetId: id, sheets: 25 }, at(15)), "packet");
        const skill = 0.75 + (wi % 5) * 0.1; // workers differ, steadily
        if (job.type === "PETITION") {
          const sigs = Math.round(hours * int(5, 9) * skill);
          must(await workerShiftAction(me, shiftId, { kind: "log", unit: "signatures", count: Math.ceil(sigs / 2) }, at(90)), "log");
          must(await workerShiftAction(me, shiftId, { kind: "pause" }, at(120)), "pause");
          must(await workerShiftAction(me, shiftId, { kind: "resume" }, at(145)), "resume");
          must(await workerShiftAction(me, shiftId, { kind: "log", unit: "signatures", count: Math.floor(sigs / 2) }, at(hours * 60 - 30)), "log");
          must(await workerShiftAction(me, shiftId, { kind: "return_packet", packetId: id, sheetsReturned: 25, signatures: sigs }, at(hours * 60 - 10)), "return");
          must(await workerShiftAction(me, shiftId, { kind: "check_out" }, at(hours * 60)), "check out");
          const rejected = int(0, Math.max(1, Math.round(sigs * 0.12)));
          must(await supervisorShiftAction(boss, shiftId, { kind: "batch_count", reviewed: sigs, accepted: sigs - rejected, rejected, exceptions: null }, at(hours * 60 + 60)), "batch count");
        } else {
          const doors = Math.round(hours * int(14, 22) * skill);
          must(await workerShiftAction(me, shiftId, { kind: "log", unit: "doors", count: Math.ceil(doors / 2) }, at(100)), "log");
          must(await workerShiftAction(me, shiftId, { kind: "pause" }, at(120)), "pause");
          must(await workerShiftAction(me, shiftId, { kind: "resume" }, at(140)), "resume");
          must(await workerShiftAction(me, shiftId, { kind: "log", unit: "doors", count: Math.floor(doors / 2) }, at(hours * 60 - 20)), "log");
          must(await workerShiftAction(me, shiftId, { kind: "log", unit: "contacts", count: Math.round(doors * (0.3 + rand() * 0.2)) }, at(hours * 60 - 15)), "log");
          must(await workerShiftAction(me, shiftId, { kind: "check_out" }, at(hours * 60)), "check out");
        }
        // Reviewed the next morning; the last couple of days are still awaiting review.
        const reviewAt = new Date(end.getTime() + 18 * HOUR);
        if (reviewAt < now) must(await supervisorShiftAction(boss, shiftId, { kind: "closeout", status: "APPROVED", reason: null }, reviewAt), "closeout");
        shiftsWorked++;
      }
    }
  }

  // --- Upcoming jobs: applications waiting for a decision, and a few claimed spots ---
  let pending = 0;
  for (const job of jobs.filter((j) => !j.past)) {
    const n = int(1, 4);
    for (let k = 0; k < n; k++) {
      const { worker, profile } = workers[(pending * 5 + k) % workers.length];
      const r = job.modes.includes("application")
        ? await applyToJob(worker.id, profile.id, job.id)
        : await claimJob(worker.id, profile.id, job.id);
      if (r.ok) pending++;
    }
  }

  // --- A few direct messages between a hiring manager and a worker ---
  const engagements = await p.engagement.findMany({
    where: { status: "ACTIVE", job: { org: { name: { endsWith: DEMO } } } },
    include: { job: { select: { orgId: true, title: true } }, worker: { select: { profileId: true, displayName: true } } },
    take: 6,
  });
  for (const e of engagements) {
    const o = orgs.find((x) => x.org.id === e.job.orgId)!;
    const boss = { userId: o.owner.id, role: "OWNER" as const, orgId: o.org.id };
    const w = { userId: e.worker.profileId, role: "WORKER" as const, orgId: null };
    const conv = await ensureDirect(boss, e.id);
    if (!conv.ok) continue;
    const first = e.worker.displayName.split(" ")[0];
    await sendMessage(boss, conv.conversationId, `Hi ${first}, thanks for the great work on ${e.job.title.split(" — ")[0]}. Staging is the same spot this weekend.`);
    await sendMessage(w, conv.conversationId, "Sounds good, see you Saturday!");
  }

  console.log("Demo data loaded:");
  console.log(`  ${orgs.length} organizations, ${workers.length} workers, ${jobs.length} published jobs`);
  console.log(`  ${shiftsWorked} worked shifts, ${pending} waiting applications/claims, ${engagements.length} message threads`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
