/**
 * M0 seed: 1 organization, 3 workers, 1 jurisdiction profile, 1 job,
 * 1 engagement + shift, sample work events, 1 validation, 1 metric snapshot,
 * 1 approved pay line (M5), and audit events.
 *
 * Run: npm run seed (requires DATABASE_URL).
 * Idempotent — safe to re-run. Every row has a fixed id (the same ids as
 * prisma/manual-seed.sql). Append-only tables are written with INSERT … ON
 * CONFLICT DO NOTHING, so a re-run never duplicates or rewrites anything.
 * The metric snapshot is computed by the app's own scorecard loader from the
 * seeded work events, never hand-written.
 *
 * NOTE: this seeds database rows only. Auth users (Supabase) are created via
 * the /signup page; to link a real login to a seeded worker, sign up and then
 * point the worker's profileId at the new auth user id.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { loadScorecard } from "../src/lib/scorecard-data";
import { computeShiftPay } from "../src/lib/pay";
import { verifiedWork } from "../src/lib/scorecard";
import { SEED_SHIFT_EVENTS, SEED_SHIFT_HOURS, SEED_SHIFT_ID } from "./seed-fixture";

const prisma = new PrismaClient();

async function main() {
  // --- Jurisdiction: Colorado / Denver, approved & current ---
  const jurisdiction = await prisma.jurisdictionProfile.upsert({
    where: {
      state_locality_version: {
        state: "CO",
        locality: "Denver",
        version: 1,
      },
    },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000021",
      state: "CO",
      locality: "Denver",
      version: 1,
      isCurrent: true,
      approved: true,
      approvedAt: new Date(),
      rules: {
        compensationAllowed: ["HOURLY", "SHIFT_RATE"],
        perUnitAllowed: false,
        workerRegistrationRequired: true,
        badgeRequired: true,
        affidavitRequired: true,
        notes: "Seed rules — replace with counsel-approved text before pilot.",
      },
    },
  });

  // --- Organization: one approved circulation company ---
  const org = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Front Range Circulators",
      approved: true,
    },
  });

  // --- Job: one published petition drive ---
  const job = await prisma.job.upsert({
    where: { id: "00000000-0000-0000-0000-000000000011" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000011",
      orgId: org.id,
      jurisdictionId: jurisdiction.id,
      type: "PETITION",
      title: "Denver Ballot Initiative — Signature Drive",
      description: "Seed job for M0. Collect signatures, return packets daily.",
      status: "PUBLISHED",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      geography: { city: "Denver", state: "CO" },
      compensationMethod: "HOURLY",
      payRateCents: 2500,
      headcount: 10,
      hiringMethod: { mode: "application" },
      requirements: { badge: true, training: "petition-basics" },
    },
  });

  // --- Workers: three seeded circulators (no auth users yet — see note above) ---
  const workerIds = [
    "00000000-0000-0000-0000-000000000101",
    "00000000-0000-0000-0000-000000000102",
    "00000000-0000-0000-0000-000000000103",
  ];
  const names = ["Alex Rivera", "Jordan Blake", "Sam Torres"];
  const workers = [];
  for (let i = 0; i < 3; i++) {
    const profileId = `00000000-0000-0000-0000-0000000001${String(i + 1).padStart(2, "0")}`;
    await prisma.profile.upsert({
      where: { id: profileId },
      update: {},
      create: { id: profileId, role: "WORKER" },
    });
    const worker = await prisma.worker.upsert({
      where: { id: workerIds[i] },
      update: {},
      create: {
        id: workerIds[i],
        profileId,
        displayName: names[i],
      },
    });
    workers.push(worker);

    // Seed political preferences: worker 1 = matching_only, others private.
    // Append-only tables use createMany + skipDuplicates (INSERT … ON CONFLICT
    // DO NOTHING): an existing row is never updated.
    await prisma.politicalPreference.createMany({
      skipDuplicates: true,
      data: {
        id: `00000000-0000-0000-0000-00000000011${i + 1}`,
        workerId: worker.id,
        visibilityMode: i === 0 ? "MATCHING_ONLY" : "PRIVATE",
        identityLabels: i === 0 ? ["unaffiliated"] : undefined,
        consentVersion: 1,
      },
    });

    await prisma.auditEvent.createMany({
      skipDuplicates: true,
      data: {
        id: `00000000-0000-0000-0000-00000000012${i + 1}`,
        action: "worker.seeded",
        entityType: "Worker",
        entityId: worker.id,
        metadata: { displayName: names[i] },
      },
    });
  }

  // --- Engagement + shift for worker 1 ---
  const engagement = await prisma.engagement.upsert({
    where: {
      jobId_workerId: { jobId: job.id, workerId: workers[0].id },
    },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000031",
      jobId: job.id,
      workerId: workers[0].id,
      status: "ACTIVE",
      applicationSnapshot: { seeded: true },
    },
  });

  const shiftStart = new Date(Date.now() - SEED_SHIFT_HOURS * 3600 * 1000);
  const shiftEnd = new Date(shiftStart.getTime() + SEED_SHIFT_HOURS * 3600 * 1000);
  const shift = await prisma.shift.upsert({
    where: { id: SEED_SHIFT_ID },
    update: {},
    create: {
      id: SEED_SHIFT_ID,
      engagementId: engagement.id,
      startsAt: shiftStart,
      endsAt: shiftEnd,
      status: "COMPLETED",
      checkInAt: shiftStart,
      checkOutAt: shiftEnd,
    },
  });

  // --- Work events (append-only). Timestamps are offsets from the shift's
  // check-in, so the scorecard's active-time math has a real timeline. ---
  const checkIn = shift.checkInAt ?? shift.startsAt;
  await prisma.workEvent.createMany({
    skipDuplicates: true,
    data: SEED_SHIFT_EVENTS.map((e) => ({
      id: e.id,
      shiftId: shift.id,
      type: e.type,
      payload: e.payload,
      createdAt: new Date(checkIn.getTime() + e.offsetMs),
    })),
  });

  // --- Supervisor validation of the shift ---
  await prisma.validation.createMany({
    skipDuplicates: true,
    data: {
      id: "00000000-0000-0000-0000-000000000141",
      shiftId: shift.id,
      status: "APPROVED",
      reason: "Seed validation — packet reconciled.",
    },
  });

  // --- Versioned metric snapshot for worker 1, computed from the events above.
  // Append-only: a new version is written only when the computed metrics differ
  // from the latest stored version. ---
  const scorecard = await loadScorecard(workers[0].id);
  // Rounded to 6 places: jsonb round-trips floats at 15 significant digits,
  // and the exact compare below would otherwise never match. computedAt is
  // left out so an unchanged ledger doesn't produce a new version.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { computedAt, ...snapshot } = roundDeep(scorecard) as typeof scorecard;
  const latest = await prisma.profileMetric.findFirst({
    where: { workerId: workers[0].id },
    orderBy: { version: "desc" },
  });
  if (!latest || canonical(latest.metrics) !== canonical(snapshot)) {
    await prisma.profileMetric.create({
      data: {
        workerId: workers[0].id,
        version: (latest?.version ?? 0) + 1,
        metrics: snapshot as unknown as Prisma.InputJsonObject,
      },
    });
  }

  // --- Payout: the pay line for the approved shift, calculated by the app's
  // own pay rules from the seeded events (3.5 verified hours × $25), and
  // approved for payment. Append-only: both rows have fixed ids. ---
  const pay = computeShiftPay({
    method: job.compensationMethod,
    rateCents: job.payRateCents,
    workType: job.type,
    work: verifiedWork(
      SEED_SHIFT_EVENTS.map((e) => ({ id: e.id, type: e.type, payload: e.payload, createdAt: new Date(checkIn.getTime() + e.offsetMs) })),
      [{ workEventId: null, status: "APPROVED", createdAt: shiftEnd }]
    ),
    jurisdictionVersion: jurisdiction.version,
  });
  if (!pay.ok) throw new Error(`Seed pay: ${pay.reason}`);
  await prisma.payout.createMany({
    skipDuplicates: true,
    data: {
      id: "00000000-0000-0000-0000-000000000161",
      workerId: workers[0].id,
      orgId: org.id,
      engagementId: engagement.id,
      shiftId: shift.id,
      validationId: "00000000-0000-0000-0000-000000000141",
      kind: "SHIFT",
      amountCents: pay.amountCents,
      feeCents: pay.feeCents,
      basis: pay.basis as unknown as Prisma.InputJsonObject,
    },
  });
  // Only for the line written just now: a pre-M5 line keeps its own history.
  const line = await prisma.payout.findUnique({ where: { id: "00000000-0000-0000-0000-000000000161" }, select: { basis: true } });
  const legacy = !!line?.basis && typeof line.basis === "object" && "legacy" in (line.basis as object);
  if (!legacy) await prisma.payoutEvent.createMany({
    skipDuplicates: true,
    data: { id: "00000000-0000-0000-0000-000000000162", payoutId: "00000000-0000-0000-0000-000000000161", type: "APPROVED", reason: "Seed: approved for payment" },
  });

  await prisma.auditEvent.createMany({
    skipDuplicates: true,
    data: {
      id: "00000000-0000-0000-0000-000000000124",
      action: "seed.completed",
      entityType: "Seed",
      entityId: "m0",
      metadata: {
        org: org.name,
        job: job.title,
        workers: names,
      },
    },
  });

  console.log("Seed complete:");
  console.log(`  org:         ${org.name} (${org.id})`);
  console.log(`  jurisdiction: CO/Denver v1 (approved)`);
  console.log(`  job:         ${job.title}`);
  console.log(`  workers:     ${names.join(", ")}`);
  console.log(`  shift:       completed, 40 doors / 18 contacts / 22 signatures (20 accepted), 30 min paused`);
}

function roundDeep(v: unknown): unknown {
  if (typeof v === "number") return Math.round(v * 1e6) / 1e6;
  if (Array.isArray(v)) return v.map(roundDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, roundDeep(x)]));
  }
  return v;
}

/** jsonb reorders keys at every level, so compare on recursively sorted keys. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await db().$disconnect(); // the app client used by loadScorecard
  });
