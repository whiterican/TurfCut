/* Sector, activity and place of work on jobs (prisma/p3-sectors.sql, lib/job-taxonomy.ts), against a fresh database (tests/acceptance/run.sh). */
import { db } from "@/lib/db";
import { ACTIVITIES, checkTaxonomy, type Sector, type WorkActivity, type WorkMode } from "@/lib/job-taxonomy";

const ORG = "00000000-0000-0000-0000-000000000001";
const JOB = "00000000-0000-0000-0000-000000000011";
let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
/** Refused by the hard stop itself: any other failure is not what these checks are about, and fails them. */
const refused = async (work: () => Promise<unknown>) => work().then(() => false, (e) => /Job_activity_live/.test(String(e instanceof Error ? e.message : e)));

(async () => {
  const p = db();
  const seeded = await p.job.findUniqueOrThrow({ where: { id: JOB } });
  check("a seeded job (written without the new fields) is labelled from how it is counted, political and in the field", seeded.sector === "POLITICAL" && seeded.workMode === "FIELD" && seeded.activity === (seeded.type === "PETITION" ? "PETITION_CIRCULATION" : "DOOR_CANVASSING"), [seeded.type, seeded.sector, seeded.activity, seeded.workMode]);
  const base = { orgId: ORG, jurisdictionId: seeded.jurisdictionId, title: "Taxonomy check" };
  const made = await p.job.create({ data: { ...base, type: "CANVASS" } });
  check("a job written without an activity gets the one its type means", made.activity === "DOOR_CANVASSING" && made.sector === "POLITICAL" && made.workMode === "FIELD");
  const flipped = await p.job.update({ where: { id: made.id }, data: { type: "PETITION" } });
  check("changing how a job is counted moves its activity with it", flipped.activity === "PETITION_CIRCULATION");
  check("an activity that contradicts the counting type is refused", await refused(() => p.job.update({ where: { id: made.id }, data: { activity: "DOOR_CANVASSING" } })));

  // Every combination, straight at the database: it stores exactly what the table says is live.
  const sectors: Sector[] = ["POLITICAL", "NONPROFIT", "PRIVATE"];
  const modes: WorkMode[] = ["FIELD", "REMOTE", "ONSITE"];
  const wrong: unknown[] = [];
  let stored = 0;
  for (const a of ACTIVITIES) for (const sector of sectors) for (const workMode of modes) for (const type of ["PETITION", "CANVASS"] as const) {
    const expected = checkTaxonomy({ sector, activity: a.id, workMode, type }).ok;
    const got = !(await refused(() => p.job.create({ data: { ...base, type, sector, activity: a.id as WorkActivity, workMode } })));
    if (got) stored++;
    if (got !== expected) wrong.push({ activity: a.id, sector, workMode, type, expected, got });
  }
  check("the database stores exactly the combinations the app calls live (2 of 144)", wrong.length === 0 && stored === 2, { stored, wrong: wrong.slice(0, 3) });
  check("a sales job cannot be stored, as sales or as canvassing in the private sector", (await refused(() => p.job.create({ data: { ...base, type: "CANVASS", sector: "PRIVATE", activity: "DOOR_SALES" } }))) && (await refused(() => p.job.create({ data: { ...base, type: "CANVASS", sector: "PRIVATE" } }))));
  check("nor can an existing job be moved to another sector or off the field", (await refused(() => p.job.update({ where: { id: JOB }, data: { sector: "PRIVATE" } }))) && (await refused(() => p.job.update({ where: { id: JOB }, data: { workMode: "REMOTE" } }))));

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
