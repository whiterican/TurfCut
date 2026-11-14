/* The demo seed (prisma/demo-seed.ts) against a fresh seeded database (tests/acceptance/run.sh). It walks the app's own
   rules to make its data, so a rule it no longer meets stops it partway: it did, for a month, and nothing noticed. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { db } from "@/lib/db";

// The seed writes permanent, append-only rows wherever DATABASE_URL points: only ever this check's own database.
const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/turfcut_acc_demo", "Use the isolated demo acceptance database");

let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const seed = (...args: string[]) => spawnSync("npx", ["tsx", "prisma/demo-seed.ts", ...args], { encoding: "utf8", env: process.env, timeout: 240_000 });
const tail = (r: ReturnType<typeof seed>) => `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split("\n").slice(-12).join("\n");

(async () => {
  const p = db();

  // --- It asks first ---
  const asked = seed();
  check("without --yes it writes nothing and says how to go ahead", asked.status === 1 && /Run it again with --yes/.test(asked.stdout) && (await p.organization.count({ where: { name: { endsWith: " (demo)" } } })) === 0, tail(asked));

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

  // --- It runs once ---
  const before = { shifts, events: await p.auditEvent.count() };
  const again = seed("--yes");
  check("a second run changes nothing and says so", again.status === 0 && /already here; nothing to do/.test(again.stdout) && (await p.shift.count({ where: inDemo })) === before.shifts && (await p.auditEvent.count()) === before.events, tail(again));

  await p.$disconnect();
  if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
