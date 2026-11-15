/* The demo seed (prisma/demo-seed.ts) against a fresh seeded database (tests/acceptance/run.sh). It walks the app's own
   rules to make its data, so a rule it no longer meets stops it partway: it did, for a month, and nothing noticed. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { DEMO_ONLY_NOTES, DEMO_STATEWIDE_EXPIRY_DAYS, STATEWIDE_CO_ID, projectRefFromDatabaseUrl, projectRefFromSupabaseUrl } from "@/lib/demo-seed-guard";
import { jobRulesLabel, jurisdictionLocalityProblem } from "@/lib/jobs";

// The seed writes permanent, append-only rows wherever DATABASE_URL points: only ever this check's own database.
const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/turfcut_acc_demo", "Use the isolated demo acceptance database");

let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
// A placeholder statewide profile is only created on a guarded demo database.
// This check's isolated Postgres is local; the three values are set so the
// refs match, and they never point at a hosted project.
const dbUrl = process.env.DATABASE_URL ?? "";
const demoRef = projectRefFromDatabaseUrl(dbUrl);
const guardedEnv: NodeJS.ProcessEnv = {
  ...process.env,
  TURFCUT_DEMO: "1",
  TURFCUT_DEMO_PROJECT_REF: demoRef ?? "",
  NEXT_PUBLIC_SUPABASE_URL: demoRef ? `http://${demoRef}` : "",
  DATABASE_URL: dbUrl,
};
const unguardedEnv: NodeJS.ProcessEnv = (() => {
  const env = { ...process.env };
  delete env.TURFCUT_DEMO;
  delete env.TURFCUT_DEMO_PROJECT_REF;
  return env;
})();
const seed = (...args: string[]) => spawnSync("npx", ["tsx", "prisma/demo-seed.ts", ...args], { encoding: "utf8", env: guardedEnv, timeout: 240_000 });
const seedWith = (env: NodeJS.ProcessEnv, ...args: string[]) => spawnSync("npx", ["tsx", "prisma/demo-seed.ts", ...args], { encoding: "utf8", env, timeout: 240_000 });
const tail = (r: ReturnType<typeof seed>) => `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n").slice(-12).join("\n");
const siblingUrl = (name: string) => {
  const u = new URL(dbUrl);
  u.pathname = `/${name}`;
  return u.toString();
};
const psql = (targetUrl: string, ...args: string[]) =>
  spawnSync("psql", ["-v", "ON_ERROR_STOP=1", "-q", "-X", targetUrl, ...args], { encoding: "utf8" });

const PENDING = "00000000-0000-0000-0000-0000000000aa";
const DENVER = "00000000-0000-0000-0000-000000000021";

(async () => {
  const p = db();

  // --- It asks first ---
  const asked = seed();
  check("without --yes it writes nothing and says how to go ahead", asked.status === 1 && /Run it again with --yes/.test(asked.stdout) && (await p.organization.count({ where: { name: { endsWith: " (demo)" } } })) === 0, tail(asked));

  // --- A leftover pending statewide v1 must be seen, and must block a guarded create ---
  // If the lookup added isCurrent: true, this leftover would be hidden, the seed would
  // create …0022, and this check would fail.
  await p.jurisdictionProfile.create({
    data: { id: PENDING, state: "CO", locality: null, version: 1, isCurrent: false, approved: false, rules: { notes: "pending leftover — not current" } },
  });
  const beforeOrgs = await p.organization.count({ where: { name: { endsWith: " (demo)" } } });
  const beforeStatewide = await p.jurisdictionProfile.count({ where: { state: "CO", locality: null } });
  const refused = seed("--yes");
  const afterStatewide = await p.jurisdictionProfile.findMany({ where: { state: "CO", locality: null }, select: { id: true, isCurrent: true, approved: true } });
  check(
    "a guarded run against a pending or non-current statewide v1 refuses and writes nothing",
    refused.status !== 0
      && /already exists but isn't current/.test(tail(refused))
      && (await p.organization.count({ where: { name: { endsWith: " (demo)" } } })) === beforeOrgs
      && (await p.job.count({ where: { title: { endsWith: " (demo)" } } })) === 0
      && afterStatewide.length === beforeStatewide
      && afterStatewide.every((row) => row.id === PENDING)
      && !(await p.jurisdictionProfile.findUnique({ where: { id: STATEWIDE_CO_ID } }))
      && (await p.auditEvent.count({ where: { action: { in: ["demo.seeded", "demo.statewide_profile"] } } })) === 0,
    { status: refused.status, tail: tail(refused), afterStatewide }
  );
  await p.jurisdictionProfile.delete({ where: { id: PENDING } });

  // --- A whole run ---
  const first = seed("--yes");
  check("the demo seed runs to the end on a fresh seeded database", first.status === 0 && /Demo data loaded:/.test(first.stdout), tail(first));
  const marker = await p.auditEvent.findFirst({ where: { action: "demo.seeded", entityType: "Demo", entityId: "demo-data" } });
  const meta = (marker?.metadata ?? {}) as { orgIds?: string[]; workerIds?: string[]; jobs?: number; shiftsWorked?: number };
  const orgIds = meta.orgIds ?? [];
  check("it leaves its completion marker, naming the organizations it made", !!marker && orgIds.length > 0 && (meta.shiftsWorked ?? 0) > 0, meta);
  const named = await p.organization.findMany({ where: { name: { endsWith: " (demo)" } }, select: { id: true } });
  check("every organization with a demo name is one the marker names", named.length === orgIds.length && named.every((o) => orgIds.includes(o.id)), { named: named.length, marked: orgIds.length });

  // --- What it made ---
  const jobs = await p.job.count({ where: { orgId: { in: orgIds }, status: "PUBLISHED" } });
  check("its jobs are published, as many as the marker counts", jobs > 0 && jobs === meta.jobs, { jobs, marked: meta.jobs });
  const inDemo = { engagement: { job: { orgId: { in: orgIds } } } };
  const shifts = await p.shift.count({ where: inDemo });
  const unstaged = await p.shift.count({ where: { ...inDemo, OR: [{ stagingLat: null }, { stagingLng: null }, { stagingLocation: null }] } });
  // A staged job's check-in is taken against the shift's staging point (C4.2): a shift without one cannot be worked.
  check("every demo shift has a staging point", shifts > 0 && unstaged === 0, { shifts, unstaged });
  const worked = await p.shift.count({ where: { ...inDemo, checkInAt: { not: null }, checkOutAt: { not: null } } });
  // The seed counts a shift as worked only after its check-in and check-out both went through.
  check("shifts were worked from check-in to check-out, as many as the marker counts", worked > 0 && worked === meta.shiftsWorked, { worked, marked: meta.shiftsWorked });

  // A city profile covers that city only (demo audit 4): every demo job's rules line names its own city.
  const demoJobs = await p.job.findMany({ where: { orgId: { in: orgIds } }, select: { geography: true, jurisdiction: { select: { state: true, locality: true, version: true } } } });
  const misfiled = demoJobs.filter((j) => jurisdictionLocalityProblem(((j.geography ?? {}) as { city?: string }).city ?? null, j.jurisdiction));
  const labels = demoJobs.map((j) => jobRulesLabel(j.geography, j.jurisdiction));
  const cities = [...new Set(demoJobs.map((j) => ((j.geography ?? {}) as { city?: string }).city).filter((c): c is string => !!c))];
  check("no demo job outside Denver is filed under Denver's rules, and each rules line names the job's own city", demoJobs.length > 0 && misfiled.length === 0 && labels.every((l) => !l.includes("filed under")) && labels.some((l) => /statewide/.test(l)), { misfiled: misfiled.length, labels: [...new Set(labels)] });
  check("a guarded run files jobs across all eight demo cities", cities.length === 8, { cities });
  check("this suite's seed env is a guarded demo database (local refs match)", !!demoRef && projectRefFromSupabaseUrl(guardedEnv.NEXT_PUBLIC_SUPABASE_URL) === demoRef, { demoRef });
  const statewide = await p.jurisdictionProfile.findFirst({ where: { state: "CO", locality: null, isCurrent: true } });
  const notes = statewide && typeof statewide.rules === "object" && statewide.rules && "notes" in statewide.rules ? String((statewide.rules as { notes?: unknown }).notes ?? "") : "";
  const expiryDays = statewide?.approvalExpiresAt ? (statewide.approvalExpiresAt.getTime() - Date.now()) / 86_400_000 : null;
  const created = await p.auditEvent.findFirst({ where: { action: "demo.statewide_profile", entityType: "JurisdictionProfile", entityId: statewide?.id ?? "" } });
  check("the demo statewide profile expires in about 14 days, is labelled DEMO ONLY, and has a system audit row", !!statewide && notes.includes("DEMO ONLY") && notes === DEMO_ONLY_NOTES && expiryDays != null && expiryDays > DEMO_STATEWIDE_EXPIRY_DAYS - 1 && expiryDays < DEMO_STATEWIDE_EXPIRY_DAYS + 1 && !!created && statewide.approvedById == null, { notes, expiryDays, created: !!created, approvedById: statewide?.approvedById ?? null });

  // --- It runs once ---
  const before = { shifts, events: await p.auditEvent.count() };
  const again = seed("--yes");
  check("a second run changes nothing and says so", again.status === 0 && /already here; nothing to do/.test(again.stdout) && (await p.shift.count({ where: inDemo })) === before.shifts && (await p.auditEvent.count()) === before.events, tail(again));

  // --- Re-seeding a guarded demo extends an expired DEMO ONLY profile only ---
  if (statewide) {
    await p.jurisdictionProfile.update({ where: { id: statewide.id }, data: { approvalExpiresAt: new Date(Date.now() - 86_400_000) } });
  }
  const renewed = seed("--yes");
  const afterRenew = statewide ? await p.jurisdictionProfile.findUnique({ where: { id: statewide.id } }) : null;
  const renewDays = afterRenew?.approvalExpiresAt ? (afterRenew.approvalExpiresAt.getTime() - Date.now()) / 86_400_000 : null;
  const renewEvent = statewide ? await p.auditEvent.findFirst({ where: { action: "demo.statewide_profile_renewed", entityId: statewide.id } }) : null;
  check(
    "a guarded re-seed extends an expired DEMO ONLY profile and leaves the rest alone",
    !!statewide && renewed.status === 0 && /Extended the DEMO ONLY statewide profile/.test(renewed.stdout)
      && renewDays != null && renewDays > DEMO_STATEWIDE_EXPIRY_DAYS - 1 && renewDays < DEMO_STATEWIDE_EXPIRY_DAYS + 1
      && !!renewEvent
      && (await p.shift.count({ where: inDemo })) === before.shifts
      && (await p.organization.count({ where: { name: { endsWith: " (demo)" } } })) === orgIds.length,
    tail(renewed)
  );

  // --- Unguarded run: no statewide profile, every job under Denver ---
  // If planStatewideProfile were called with guarded: true, this run would
  // create a statewide profile and file jobs outside Denver, and this check would fail.
  const unguardedName = "turfcut_acc_demo_unguarded";
  const unguardedUrl = siblingUrl(unguardedName);
  const adminUrl = siblingUrl("postgres");
  const dropped = psql(adminUrl, "-c", `DROP DATABASE IF EXISTS ${unguardedName}`);
  const createdDb = psql(adminUrl, "-c", `CREATE DATABASE ${unguardedName}`);
  const shim = psql(unguardedUrl, "-f", "tests/acceptance/supabase-shim.sql");
  const setup = psql(unguardedUrl, "-f", "prisma/supabase-manual-setup.sql");
  const base = spawnSync("npx", ["tsx", "prisma/seed.ts"], { encoding: "utf8", env: { ...unguardedEnv, DATABASE_URL: unguardedUrl }, timeout: 120_000 });
  const unguarded = seedWith({ ...unguardedEnv, DATABASE_URL: unguardedUrl }, "--yes");
  const p2 = new PrismaClient({ datasources: { db: { url: unguardedUrl } } });
  try {
    const uOrgs = await p2.organization.findMany({ where: { name: { endsWith: " (demo)" } }, select: { id: true } });
    const uJobs = await p2.job.findMany({
      where: { orgId: { in: uOrgs.map((o) => o.id) } },
      select: { geography: true, jurisdictionId: true, jurisdiction: { select: { state: true, locality: true } } },
    });
    const uStatewide = await p2.jurisdictionProfile.findMany({ where: { state: "CO", locality: null } });
    const uCities = [...new Set(uJobs.map((j) => ((j.geography ?? {}) as { city?: string }).city))];
    check(
      "an unguarded run creates no statewide profile and puts all jobs under Denver",
      dropped.status === 0 && createdDb.status === 0 && shim.status === 0 && setup.status === 0 && base.status === 0
        && unguarded.status === 0 && /Demo data loaded:/.test(unguarded.stdout)
        && uOrgs.length > 0 && uJobs.length > 0
        && uStatewide.length === 0
        && !(await p2.jurisdictionProfile.findUnique({ where: { id: STATEWIDE_CO_ID } }))
        && uJobs.every((j) => j.jurisdictionId === DENVER && j.jurisdiction.locality === "Denver")
        && uCities.length === 1 && uCities[0] === "Denver",
      {
        setup: { dropped: dropped.status, createdDb: createdDb.status, shim: shim.status, setup: setup.status, base: base.status },
        tail: tail(unguarded),
        jobs: uJobs.length,
        statewide: uStatewide.length,
        cities: uCities,
      }
    );
  } finally {
    await p2.$disconnect();
  }

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
