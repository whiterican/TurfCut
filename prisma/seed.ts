/**
 * M0 seed: 1 organization, 3 workers, 1 jurisdiction profile, 1 job,
 * 1 engagement + shift, sample work events, 1 validation, 1 metric snapshot,
 * 1 payout, and audit events.
 *
 * Run: npm run seed (requires DATABASE_URL).
 * Idempotent — safe to re-run.
 *
 * NOTE: this seeds database rows only. Auth users (Supabase) are created via
 * the /signup page; to link a real login to a seeded worker, sign up and then
 * point the worker's profileId at the new auth user id.
 */
import { PrismaClient } from "@prisma/client";

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
    await prisma.politicalPreference.create({
      data: {
        workerId: worker.id,
        visibilityMode: i === 0 ? "MATCHING_ONLY" : "PRIVATE",
        identityLabels: i === 0 ? ["unaffiliated"] : undefined,
        consentVersion: 1,
      },
    });

    await prisma.auditEvent.create({
      data: {
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
      jobId: job.id,
      workerId: workers[0].id,
      status: "ACTIVE",
      applicationSnapshot: { seeded: true },
    },
  });

  const shiftStart = new Date(Date.now() - 4 * 3600 * 1000);
  const shift = await prisma.shift.create({
    data: {
      engagementId: engagement.id,
      startsAt: shiftStart,
      endsAt: new Date(shiftStart.getTime() + 4 * 3600 * 1000),
      status: "COMPLETED",
      checkInAt: shiftStart,
      checkOutAt: new Date(shiftStart.getTime() + 4 * 3600 * 1000),
    },
  });

  // --- Sample work events (append-only) ---
  const events: Array<{ type: "DOOR_KNOCK" | "CONTACT" | "SIGNATURE_SUBMITTED" | "PACKET_PICKUP" | "PACKET_RETURN"; payload: object }> = [
    { type: "PACKET_PICKUP", payload: { packetId: "PKT-0001", sheets: 25 } },
    { type: "DOOR_KNOCK", payload: { count: 40 } },
    { type: "CONTACT", payload: { count: 18 } },
    { type: "SIGNATURE_SUBMITTED", payload: { count: 22 } },
    { type: "PACKET_RETURN", payload: { packetId: "PKT-0001", sheetsReturned: 25, signatures: 22 } },
  ];
  for (const e of events) {
    await prisma.workEvent.create({
      data: { shiftId: shift.id, type: e.type, payload: e.payload },
    });
  }

  // --- Supervisor validation of the shift ---
  await prisma.validation.create({
    data: {
      shiftId: shift.id,
      status: "APPROVED",
      reason: "Seed validation — packet reconciled.",
    },
  });

  // --- Versioned metric snapshot for worker 1 ---
  await prisma.profileMetric.upsert({
    where: { workerId_version: { workerId: workers[0].id, version: 1 } },
    update: {},
    create: {
      workerId: workers[0].id,
      version: 1,
      metrics: {
        doorsKnocked: 40,
        contacts: 18,
        signaturesSubmitted: 22,
        signaturesAccepted: 22,
        activeHours: 4,
        doorsPerActiveHour: 10,
        contactRate: 0.45,
        signaturesPerActiveHour: 5.5,
      },
    },
  });

  // --- Payout: approved earnings for the shift ---
  await prisma.payout.create({
    data: {
      workerId: workers[0].id,
      engagementId: engagement.id,
      amountCents: 10000, // 4h × $25/h gross — worker sees 0% commission
      feeCents: 1500, // 15% marketplace fee on approved spend
      status: "APPROVED",
    },
  });

  await prisma.auditEvent.create({
    data: {
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
  console.log(`  shift:       completed, 40 doors / 18 contacts / 22 signatures`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
