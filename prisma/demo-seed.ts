/**
 * Demo data: makes the app look active for testers. Every organization,
 * person, job and campaign it creates is named "… (demo)" and is fictional;
 * candidates have invented names and run in districts that don't exist. The
 * campaigns cover every campaign type and affiliation (each party, "other"
 * and nonpartisan), and between them every disclosed issue, so the feed's
 * filters and workers' own "do not match me" preferences have something to
 * act on. Demo workers have no political-fit answers: nothing about them is
 * stated or inferred.
 *
 * Jobs whose campaign takes a party or an issue position hire by invitation
 * only, so a real worker can't apply to one and leave their shared fit
 * answers in a demo organization's application records.
 *
 * Built through the app's own rules — jobs pass the publish gate, workers
 * apply and are accepted, shifts are scheduled, worked and reviewed with the
 * field-day functions — backdated so workers have real verified history and
 * pay lines computed by the pay rules. The only hand-set values are the
 * hire dates (acceptEngagement stamps the current time).
 *
 * Run: npm run seed:demo -- --yes (DATABASE_URL must be set in the shell;
 * the base seed's approved CO/Denver jurisdiction must exist). It runs once:
 * work history, reviews and pay lines are append-only and stay for good.
 * Everything is checked before the first write, and a completion marker
 * naming the organizations it made is written last, so a run that stopped
 * partway is reported, not hidden, and the demo set is known by id rather
 * than by a name anyone could type.
 */
import { cleanDatabaseUrl } from "../src/lib/env";
import { db } from "../src/lib/db";
import { compensationProblem, jurisdictionProblems, validateJob, type Affiliation, type CampaignType, type JobInput } from "../src/lib/jobs";
import type { IssueKey } from "../src/lib/political-fit";
import { createJob, publishJob } from "../src/lib/jobs-data";
import { acceptEngagement, applyToJob, claimJob, inviteWorker } from "../src/lib/engagements-data";
import { scheduleShift, supervisorShiftAction, workerShiftAction } from "../src/lib/field-day-data";
import { ensureDirect, sendMessage } from "../src/lib/chat-data";

const p = db();
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;
const JURISDICTION = "00000000-0000-0000-0000-000000000021";
const DEMO = " (demo)";
/**
 * Written last, with the ids of the organizations and workers the run made: a
 * demo-named organization that no marker names means a run stopped partway
 * (or someone gave a real organization that name).
 */
const MARKER = { action: "demo.seeded", entityType: "Demo", entityId: "demo-data" };
const orgIdsOf = (metadata: unknown): string[] => {
  const ids = metadata && typeof metadata === "object" ? (metadata as { orgIds?: unknown }).orgIds : null;
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : [];
};

// Deterministic randomness, so a run is reproducible.
let seed = 20261006;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
const iso = (d: Date) => d.toISOString().slice(0, 10);
/** Midnight UTC of a date: how job dates are stored. */
const dayOf = (d: Date) => new Date(`${iso(d)}T00:00:00Z`);
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

interface Campaign {
  type: "PETITION" | "CANVASS";
  title: string;
  campaignType: CampaignType;
  affiliation: Affiliation;
  /** Candidate or measure name, if any. */
  name: string | null;
  message: string;
  issues: Partial<Record<IssueKey, "support" | "oppose">>;
  /** Asks for nothing beyond onboarding: shows under the feed's "No credentials" filter. */
  noCredentials?: boolean;
}

/** Fictional local measures and civic work. These jobs hold the work history. */
const CAMPAIGNS: Campaign[] = [
  { type: "PETITION", title: "Library Hours Initiative — signature drive", campaignType: "ballot_measure", affiliation: "nonpartisan", name: "Denver Library Hours Measure (demo)", message: "Put extended library hours on the city ballot.", issues: {} },
  { type: "PETITION", title: "Neighborhood Parks Bond — petition team", campaignType: "ballot_measure", affiliation: "nonpartisan", name: "Neighborhood Parks Bond (demo)", message: "Let voters decide on a parks maintenance bond.", issues: {} },
  { type: "PETITION", title: "Bike Lane Safety Measure — circulators", campaignType: "ballot_measure", affiliation: "nonpartisan", name: "Safer Streets Measure (demo)", message: "Qualify a street-safety measure for the ballot.", issues: {} },
  { type: "PETITION", title: "Public Transit Night Service — signatures", campaignType: "ballot_measure", affiliation: "nonpartisan", name: "Late-Night Transit Measure (demo)", message: "Ask voters to fund late-night bus service.", issues: {} },
  { type: "CANVASS", title: "Voter registration canvass — East Colfax", campaignType: "nonpartisan_civic", affiliation: "nonpartisan", name: null, message: "Help eligible neighbors register and check their registration.", issues: {} },
  { type: "CANVASS", title: "Get-out-the-vote reminders — weekend shifts", campaignType: "nonpartisan_civic", affiliation: "nonpartisan", name: null, message: "Remind registered voters of dates, drop boxes and polling places.", issues: {} },
  { type: "CANVASS", title: "Census-style community survey — door to door", campaignType: "nonpartisan_civic", affiliation: "nonpartisan", name: null, message: "Collect neighborhood feedback for the city's planning office.", issues: {} },
  { type: "CANVASS", title: "Ballot measure info canvass — Aurora", campaignType: "ballot_measure", affiliation: "nonpartisan", name: "Neighborhood Parks Bond (demo)", message: "Share what the parks bond does and answer questions.", issues: {} },
  { type: "PETITION", title: "School Crossing Guards Measure — petitioners", campaignType: "ballot_measure", affiliation: "nonpartisan", name: "Safe Routes to School Measure (demo)", message: "Gather signatures for funding school crossing guards.", issues: {} },
  { type: "CANVASS", title: "New-resident voter guide drop", campaignType: "nonpartisan_civic", affiliation: "nonpartisan", name: null, message: "Leave nonpartisan voter guides and answer questions.", issues: {} },
];

/**
 * One job for each remaining campaign type and affiliation, starting soon.
 * The candidates' names are invented (no Colorado politician found with
 * them) and their districts don't exist: Colorado has 65 House and 35 Senate
 * districts, and no county has nine commissioner districts. The committees
 * are unnamed. Between them these campaigns take every issue on the
 * disclosure list; the two nonpartisan ones lean opposite ways.
 */
const MORE_CAMPAIGNS: Array<Campaign & { org: number }> = [
  { org: 4, type: "CANVASS", title: "Halvorsen for House District 71 — weekend canvass", campaignType: "candidate", affiliation: "democratic", name: "Corinne Halvorsen for State House, District 71 (demo)", message: "Introduce the candidate to voters and hear what matters to them.", issues: { healthcare_access: "support", abortion_access: "support", voting_access: "support" } },
  { org: 1, type: "CANVASS", title: "Pellerin for County Commissioner — door knocking", campaignType: "candidate", affiliation: "republican", name: "Wade Pellerin for County Commissioner, District 9 (demo)", message: "Share the candidate's plan for county roads and budgets.", issues: { tax_policy: "oppose", gun_rights: "support", school_choice: "support" } },
  { org: 2, type: "CANVASS", title: "County party committee — voter contact", campaignType: "party_committee", affiliation: "libertarian", name: null, message: "Contact voters for the county party committee and its slate.", issues: { criminal_justice_reform: "support", immigration: "support", tax_policy: "oppose" } },
  { org: 3, type: "PETITION", title: "Party ballot access — petition circulators", campaignType: "party_committee", affiliation: "green", name: null, message: "Collect signatures so the party's candidates qualify for the ballot.", issues: { renewable_energy: "support", labor_unions: "support", minimum_wage: "support" } },
  { org: 5, type: "CANVASS", title: "Ashgrove for State Senate District 41 — literature drop", campaignType: "candidate", affiliation: "other", name: "Lena Ashgrove for State Senate, District 41 (demo)", message: "Drop literature for a minor-party candidate and note voters' questions.", issues: {} },
  { org: 0, type: "CANVASS", title: "Renters' rights canvass — tenant outreach", campaignType: "issue_advocacy", affiliation: "nonpartisan", name: null, message: "Talk with renters about rents, repairs and tenant protections.", issues: { housing_affordability: "support" }, noCredentials: true },
  { org: 1, type: "CANVASS", title: "School options info canvass — parent outreach", campaignType: "issue_advocacy", affiliation: "nonpartisan", name: null, message: "Tell parents about the school options in their district.", issues: { school_choice: "support" }, noCredentials: true },
];

const PACKET = (i: number) => `DEMO-${String(i).padStart(4, "0")}`;

/** Where the data would go, without credentials (tidied the way the app tidies it). */
function target(): string {
  try {
    const u = new URL(cleanDatabaseUrl(process.env.DATABASE_URL ?? ""));
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(DATABASE_URL is not set)";
  }
}

async function main() {
  if (!process.argv.includes("--yes")) {
    console.log(`This writes permanent, append-only demo data to ${target()}.`);
    console.log("Run it again with --yes to go ahead: npm run seed:demo -- --yes");
    process.exitCode = 1;
    return;
  }
  const finished = new Set((await p.auditEvent.findMany({ where: MARKER, select: { metadata: true } })).flatMap((m) => orgIdsOf(m.metadata)));
  const named = await p.organization.findMany({ where: { name: { endsWith: DEMO } }, select: { id: true, name: true } });
  const unexplained = named.filter((o) => !finished.has(o.id));
  if (unexplained.length) {
    throw new Error(
      `No finished demo run made ${unexplained.map((o) => `"${o.name}"`).join(", ")}. Either an earlier run stopped partway ` +
        "(its history is append-only, so check it by hand before anything else) or a real organization has a demo name."
    );
  }
  if (named.length) {
    console.log("Demo data is already here; nothing to do.");
    return;
  }

  const now = new Date();
  const T0 = new Date(now.getTime() - 45 * DAY); // when the demo's history starts

  // --- Check everything before the first write ---
  const jurisdiction = await p.jurisdictionProfile.findUnique({ where: { id: JURISDICTION } });
  if (!jurisdiction) throw new Error("Run the base seed first: the CO/Denver jurisdiction is missing.");
  // Past jobs publish at T0, so the profile must be usable then as well as now.
  const problems = [...new Set([...jurisdictionProblems(jurisdiction, now), ...jurisdictionProblems(jurisdiction, T0)])];
  const shiftRate = compensationProblem("SHIFT_RATE", jurisdiction.rules);
  if (problems.length || shiftRate) throw new Error(`The CO/Denver jurisdiction can't take demo jobs: ${[...problems, shiftRate].filter(Boolean).join(" ")}`);

  type Planned = { input: JobInput; orgIdx: number; type: "PETITION" | "CANVASS"; startsAt: Date; endsAt: Date; past: boolean; modes: string[] };
  const plan = (c: Campaign, orgIdx: number, past: boolean): Planned => {
    const startsAt = dayOf(past ? new Date(T0.getTime() + int(0, 10) * DAY) : new Date(now.getTime() + int(2, 21) * DAY));
    const endsAt = dayOf(new Date((past ? now.getTime() : startsAt.getTime()) + int(20, 60) * DAY));
    const method = rand() < 0.7 ? "HOURLY" : "SHIFT_RATE";
    const rate = method === "HOURLY" ? pick(["22", "24", "25", "26", "28", "30"]) : pick(["150", "165", "180", "200"]);
    // A campaign that takes a side hires by invitation only (see the header).
    const sided = c.affiliation !== "nonpartisan" || Object.keys(c.issues).length > 0;
    if (sided && past) throw new Error(`demo job "${c.title}": past jobs hold the history, which needs applications`);
    const modes = sided ? ["invite"] : past ? ["application"] : pick([["application"], ["application", "instant_claim"], ["instant_claim"], ["application", "invite"]]);
    const o = ORGS[orgIdx];
    const phone = `(303) 555-01${String(10 + orgIdx).padStart(2, "0")}`;
    const petition = c.type === "PETITION";
    const v = validateJob({
      type: c.type,
      title: `${c.title}${DEMO}`,
      description: `${c.message} Training provided on day one; staging point shared after you're hired. Demo job: not a real campaign.`,
      jurisdictionId: JURISDICTION,
      startsAt: iso(startsAt),
      endsAt: iso(endsAt),
      city: pick(CITIES),
      state: "CO",
      compensationMethod: method,
      payRate: rate,
      headcount: String(int(4, 25)),
      hiringModes: modes,
      badge: c.noCredentials ? "" : "on",
      registration: petition ? "on" : "",
      affidavit: petition ? "on" : "",
      training: c.noCredentials ? "" : petition ? "Petition basics" : "Canvass basics",
      campaignType: c.campaignType,
      affiliation: c.affiliation,
      campaignName: c.name ?? "",
      message: c.message,
      contactEmergency: `${o.supervisor}${DEMO}, ${phone}`,
      contactDisputes: `${o.owner}${DEMO}, disputes@example.org`,
      contactLostMaterials: `${o.supervisor}${DEMO}, ${phone}`,
      cancellationNoticeHours: "24",
      ...Object.fromEntries(Object.entries(c.issues).map(([k, v]) => [`issue_${k}`, v])),
    });
    if (!v.ok) throw new Error(`demo job "${c.title}": ${JSON.stringify(v.errors)}`);
    return { input: v.value, orgIdx, type: c.type, startsAt, endsAt, past, modes };
  };
  // ~20 jobs on the local campaigns (some running since the demo began, holding
  // the history; some starting soon), then one for each campaign type and affiliation.
  const planned = [
    ...Array.from({ length: 20 }, (_, i) => plan(CAMPAIGNS[i % CAMPAIGNS.length], i % ORGS.length, i < 12)),
    ...MORE_CAMPAIGNS.map((c) => plan(c, c.org, false)),
  ];

  console.log(`Writing demo data to ${target()}…`);

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
    const owner = await p.profile.create({ data: { id: crypto.randomUUID(), role: "OWNER", orgId: org.id, displayName: `${o.owner}${DEMO}`, createdAt: T0 } });
    const sup = await p.profile.create({ data: { id: crypto.randomUUID(), role: "SUPERVISOR", orgId: org.id, displayName: `${o.supervisor}${DEMO}`, createdAt: T0 } });
    orgs.push({ org, owner, sup });
  }

  // --- Workers ---
  const workers = [];
  for (const name of WORKERS) {
    const profile = await p.profile.create({ data: { id: crypto.randomUUID(), role: "WORKER", createdAt: T0 } });
    const worker = await p.worker.create({ data: { profileId: profile.id, displayName: `${name}${DEMO}`, createdAt: T0 } });
    workers.push({ worker, profile });
  }

  // --- Jobs, through the publish gate ---
  const jobs = [];
  for (const [i, j] of planned.entries()) {
    const { org, owner } = orgs[j.orgIdx];
    const job = await createJob(org.id, owner.id, j.input);
    must(await publishJob(job.id, org.id, owner.id, j.past ? T0 : now), `publish job ${i}`);
    jobs.push({ ...j, id: job.id });
  }

  // --- History: each worker was hired on 1–2 running jobs and worked shifts there ---
  let packet = 1;
  let shiftsWorked = 0;
  const pastJobs = jobs.filter((j) => j.past);
  for (const [wi, { worker, profile }] of workers.entries()) {
    // Workers differ steadily, one measure at a time (no overall "quality").
    const pace = { signatures: 0.8 + ((wi * 3) % 5) * 0.08, doors: 0.8 + ((wi * 2 + 1) % 5) * 0.08 };
    const hiredOn = [pastJobs[wi % pastJobs.length], pastJobs[(wi + 5) % pastJobs.length]].slice(0, wi % 3 === 0 ? 1 : 2);
    for (const job of hiredOn) {
      const { org, owner, sup } = orgs[job.orgIdx];
      // Applied two days before the start, but never before the job or the worker existed.
      const appliedAt = new Date(Math.max(job.startsAt.getTime() - 2 * DAY, T0.getTime() + HOUR));
      const acceptedAt = new Date(appliedAt.getTime() + int(2, 20) * HOUR);
      const applied = must(await applyToJob(worker.id, profile.id, job.id, appliedAt), "apply");
      must(await acceptEngagement(applied.engagementId, { kind: "org", profileId: owner.id, orgId: org.id }), "accept");
      // acceptEngagement stamps the current time; the demo's hire happened back then.
      await p.engagement.update({ where: { id: applied.engagementId }, data: { createdAt: appliedAt, updatedAt: acceptedAt } });

      const shifts = int(2, 5);
      for (let s = 0; s < shifts; s++) {
        const dayOffset = int(1, Math.max(2, Math.floor((now.getTime() - job.startsAt.getTime()) / DAY) - 1));
        // Job dates are midnight UTC, so 15–17h UTC is 9–11am Mountain (daylight time).
        const start = new Date(job.startsAt.getTime() + dayOffset * DAY + int(15, 17) * HOUR);
        if (start.getTime() > now.getTime() - 8 * HOUR || start <= acceptedAt) continue;
        const hours = pick([4, 4, 5, 6]);
        const end = new Date(start.getTime() + hours * HOUR);
        const sched = await scheduleShift(
          { profileId: owner.id, orgId: org.id },
          applied.engagementId,
          { startsAt: start.toISOString(), endsAt: end.toISOString(), stagingLocation: `${pick(["Library", "Rec center", "Coffee shop", "Community center"])} parking lot`, supervisorId: sup.id },
          new Date(Math.max(start.getTime() - 3 * DAY, acceptedAt.getTime() + HOUR))
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
        if (job.type === "PETITION") {
          const sigs = Math.round(hours * int(5, 9) * pace.signatures);
          must(await workerShiftAction(me, shiftId, { kind: "log", unit: "signatures", count: Math.ceil(sigs / 2) }, at(90)), "log");
          must(await workerShiftAction(me, shiftId, { kind: "pause" }, at(120)), "pause");
          must(await workerShiftAction(me, shiftId, { kind: "resume" }, at(145)), "resume");
          must(await workerShiftAction(me, shiftId, { kind: "log", unit: "signatures", count: Math.floor(sigs / 2) }, at(hours * 60 - 30)), "log");
          must(await workerShiftAction(me, shiftId, { kind: "return_packet", packetId: id, sheetsReturned: 25, signatures: sigs }, at(hours * 60 - 10)), "return");
          must(await workerShiftAction(me, shiftId, { kind: "check_out" }, at(hours * 60)), "check out");
          const rejected = int(0, Math.max(1, Math.round(sigs * 0.12)));
          must(await supervisorShiftAction(boss, shiftId, { kind: "batch_count", reviewed: sigs, accepted: sigs - rejected, rejected, exceptions: null }, at(hours * 60 + 60)), "batch count");
        } else {
          const doors = Math.round(hours * int(14, 22) * pace.doors);
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

  // --- Upcoming jobs: applications waiting for a decision, claimed spots and invitations out ---
  let pending = 0;
  for (const job of jobs.filter((j) => !j.past)) {
    const { org, owner } = orgs[job.orgIdx];
    const n = int(1, 4);
    for (let k = 0; k < n; k++) {
      const { worker, profile } = workers[(pending * 5 + k) % workers.length];
      const r = job.modes.includes("application")
        ? await applyToJob(worker.id, profile.id, job.id)
        : job.modes.includes("instant_claim")
          ? await claimJob(worker.id, profile.id, job.id)
          : await inviteWorker(org.id, owner.id, job.id, worker.id);
      if (r.ok) pending++;
    }
  }

  // --- A few direct messages between a hiring manager and a worker ---
  const orgIds = orgs.map((o) => o.org.id);
  const engagements = await p.engagement.findMany({
    where: { status: "ACTIVE", job: { orgId: { in: orgIds } } },
    include: { job: { select: { orgId: true, title: true } }, worker: { select: { profileId: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
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

  await p.auditEvent.create({
    data: { ...MARKER, actorId: null, metadata: { orgIds, workerIds: workers.map((w) => w.worker.id), jobs: jobs.length, shiftsWorked } },
  });
  console.log("Demo data loaded:");
  console.log(`  ${orgs.length} organizations, ${workers.length} workers, ${jobs.length} published jobs`);
  console.log(`  ${shiftsWorked} worked shifts, ${pending} waiting applications, claims and invitations, ${engagements.length} message threads`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
