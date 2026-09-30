-- Turfcut M0 + M1 — manual Supabase setup (one paste), FRESH databases only.
-- Generated from prisma/schema.prisma + prisma/seed.ts on 2026-09-30.
-- Paste the entire file into the Supabase SQL editor and run it.
-- The DDL is not re-runnable. Already set up under M0? Run m1-migration.sql,
-- then manual-seed.sql (which is idempotent) instead of this file.
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('WORKER', 'OWNER', 'RECRUITER', 'COMPLIANCE', 'SUPERVISOR', 'FINANCE');

-- CreateEnum
CREATE TYPE "public"."VerificationLevel" AS ENUM ('PLATFORM', 'ORGANIZATION', 'IMPORTED', 'SELF_REPORTED');

-- CreateEnum
CREATE TYPE "public"."VisibilityMode" AS ENUM ('PRIVATE', 'MATCHING_ONLY', 'APPLIED_TO', 'APPROVED_RECRUITERS');

-- CreateEnum
CREATE TYPE "public"."JobType" AS ENUM ('PETITION', 'CANVASS');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."CompensationMethod" AS ENUM ('HOURLY', 'SHIFT_RATE', 'PER_UNIT');

-- CreateEnum
CREATE TYPE "public"."EngagementStatus" AS ENUM ('APPLIED', 'INVITED', 'CLAIMED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ShiftStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."WorkEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'PAUSE_START', 'PAUSE_END', 'DOOR_KNOCK', 'CONTACT', 'SIGNATURE_SUBMITTED', 'CALL', 'INTERVIEW', 'PACKET_PICKUP', 'PACKET_RETURN', 'BATCH_COUNT', 'INCIDENT', 'CORRECTION', 'NOTE');

-- CreateEnum
CREATE TYPE "public"."ValidationStatus" AS ENUM ('APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "public"."PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'DISPUTED');

-- CreateTable
CREATE TABLE "public"."Profile" (
    "id" UUID NOT NULL,
    "role" "public"."Role" NOT NULL,
    "orgId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Worker" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExperienceRecord" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "campaign" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "unitType" TEXT NOT NULL,
    "unitCount" INTEGER NOT NULL,
    "verificationLevel" "public"."VerificationLevel" NOT NULL DEFAULT 'SELF_REPORTED',
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PoliticalPreference" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "visibilityMode" "public"."VisibilityMode" NOT NULL,
    "identityLabels" JSONB,
    "partyRelationship" JSONB,
    "issuePositions" JSONB,
    "campaignBoundaries" JSONB,
    "consentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoliticalPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JurisdictionProfile" (
    "id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "locality" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JurisdictionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Job" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "jurisdictionId" UUID NOT NULL,
    "type" "public"."JobType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "geography" JSONB,
    "compensationMethod" "public"."CompensationMethod" NOT NULL DEFAULT 'HOURLY',
    "payRateCents" INTEGER,
    "headcount" INTEGER,
    "hiringMethod" JSONB,
    "requirements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Engagement" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "status" "public"."EngagementStatus" NOT NULL DEFAULT 'APPLIED',
    "applicationSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Engagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Shift" (
    "id" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "public"."ShiftStatus" NOT NULL DEFAULT 'SCHEDULED',
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkEvent" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "type" "public"."WorkEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Validation" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "workEventId" UUID,
    "status" "public"."ValidationStatus" NOT NULL,
    "reason" TEXT,
    "reviewerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Validation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProfileMetric" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "metrics" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payout" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "engagementId" UUID,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "stripeTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Worker_profileId_key" ON "public"."Worker"("profileId");

-- CreateIndex
CREATE INDEX "ExperienceRecord_workerId_idx" ON "public"."ExperienceRecord"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "PoliticalPreference_workerId_consentVersion_key" ON "public"."PoliticalPreference"("workerId", "consentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionProfile_state_locality_version_key" ON "public"."JurisdictionProfile"("state", "locality", "version");

-- CreateIndex
CREATE INDEX "Job_orgId_status_idx" ON "public"."Job"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_jobId_workerId_key" ON "public"."Engagement"("jobId", "workerId");

-- CreateIndex
CREATE INDEX "WorkEvent_shiftId_createdAt_idx" ON "public"."WorkEvent"("shiftId", "createdAt");

-- CreateIndex
CREATE INDEX "Validation_shiftId_idx" ON "public"."Validation"("shiftId");

-- CreateIndex
CREATE INDEX "ProfileMetric_workerId_idx" ON "public"."ProfileMetric"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileMetric_workerId_version_key" ON "public"."ProfileMetric"("workerId", "version");

-- CreateIndex
CREATE INDEX "Payout_workerId_status_idx" ON "public"."Payout"("workerId", "status");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "public"."AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "public"."AuditEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."Profile" ADD CONSTRAINT "Profile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Worker" ADD CONSTRAINT "Worker_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExperienceRecord" ADD CONSTRAINT "ExperienceRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PoliticalPreference" ADD CONSTRAINT "PoliticalPreference_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "public"."JurisdictionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Engagement" ADD CONSTRAINT "Engagement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Engagement" ADD CONSTRAINT "Engagement_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Shift" ADD CONSTRAINT "Shift_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkEvent" ADD CONSTRAINT "WorkEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Validation" ADD CONSTRAINT "Validation_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProfileMetric" ADD CONSTRAINT "ProfileMetric_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Turfcut seed (M0 + M1 events) — SQL version of prisma/seed.ts
-- Run AFTER the DDL above. Idempotent: safe to re-run (ON CONFLICT DO NOTHING).

-- --- Jurisdiction: CO / Denver v1, approved & current ---
INSERT INTO "public"."JurisdictionProfile"
  ("id","state","locality","version","isCurrent","approved","approvedAt","rules","createdAt")
VALUES
  ('00000000-0000-0000-0000-000000000021','CO','Denver',1,true,true,NOW(),
   '{"compensationAllowed":["HOURLY","SHIFT_RATE"],"perUnitAllowed":false,"workerRegistrationRequired":true,"badgeRequired":true,"affidavitRequired":true,"notes":"Seed rules - replace with counsel-approved text before pilot."}',
   NOW())
ON CONFLICT ("state","locality","version") DO NOTHING;

-- --- Organization: one approved circulation company ---
INSERT INTO "public"."Organization" ("id","name","approved","createdAt","updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001','Front Range Circulators',true,NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Job: one published petition drive ---
INSERT INTO "public"."Job"
  ("id","orgId","jurisdictionId","type","title","description","status","startsAt","endsAt",
   "geography","compensationMethod","payRateCents","headcount","hiringMethod","requirements",
   "createdAt","updatedAt")
VALUES
  ('00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000021',
   'PETITION','Denver Ballot Initiative - Signature Drive',
   'Seed job for M0. Collect signatures, return packets daily.',
   'PUBLISHED',NOW(),NOW() + interval '30 days',
   '{"city":"Denver","state":"CO"}','HOURLY',2500,10,
   '{"mode":"application"}','{"badge":true,"training":"petition-basics"}',
   NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Profiles + workers: three seeded circulators ---
INSERT INTO "public"."Profile" ("id","role","createdAt","updatedAt") VALUES
  ('00000000-0000-0000-0000-000000000101','WORKER',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000102','WORKER',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000103','WORKER',NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."Worker" ("id","profileId","displayName","createdAt","updatedAt") VALUES
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000101','Alex Rivera',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000102','Jordan Blake',NOW(),NOW()),
  ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000103','Sam Torres',NOW(),NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Political preferences: worker 1 = matching_only, others private ---
INSERT INTO "public"."PoliticalPreference"
  ("id","workerId","visibilityMode","identityLabels","consentVersion","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000111','00000000-0000-0000-0000-000000000101',
   'MATCHING_ONLY','["unaffiliated"]',1,NOW()),
  ('00000000-0000-0000-0000-000000000112','00000000-0000-0000-0000-000000000102',
   'PRIVATE',NULL,1,NOW()),
  ('00000000-0000-0000-0000-000000000113','00000000-0000-0000-0000-000000000103',
   'PRIVATE',NULL,1,NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Audit: workers seeded ---
INSERT INTO "public"."AuditEvent"
  ("id","action","entityType","entityId","metadata","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000121','worker.seeded','Worker','00000000-0000-0000-0000-000000000101','{"displayName":"Alex Rivera"}',NOW()),
  ('00000000-0000-0000-0000-000000000122','worker.seeded','Worker','00000000-0000-0000-0000-000000000102','{"displayName":"Jordan Blake"}',NOW()),
  ('00000000-0000-0000-0000-000000000123','worker.seeded','Worker','00000000-0000-0000-0000-000000000103','{"displayName":"Sam Torres"}',NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Engagement + shift for worker 1 ---
INSERT INTO "public"."Engagement"
  ("id","jobId","workerId","status","applicationSnapshot","createdAt","updatedAt") VALUES
  ('00000000-0000-0000-0000-000000000031',
   '00000000-0000-0000-0000-000000000011',
   '00000000-0000-0000-0000-000000000101',
   'ACTIVE','{"seeded":true}',NOW(),NOW())
ON CONFLICT ("jobId","workerId") DO NOTHING;

INSERT INTO "public"."Shift"
  ("id","engagementId","startsAt","endsAt","status","checkInAt","checkOutAt","createdAt","updatedAt") VALUES
  ('00000000-0000-0000-0000-000000000201',
   '00000000-0000-0000-0000-000000000031',
   NOW() - interval '4 hours', NOW(), 'COMPLETED',
   NOW() - interval '4 hours', NOW(), NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Work events (append-only) ---
-- Mirrors prisma/seed-fixture.ts. Timestamps are offsets from the shift's
-- check-in: 30 min paused, 3.5 active hours; batch count 22 reviewed, 20 accepted.
-- Ids 131-135 are the M0 events; 136-140 were added in M1. Re-running against
-- an M0 database adds only the new events (ON CONFLICT DO NOTHING).
INSERT INTO "public"."WorkEvent" ("id","shiftId","type","payload","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000136','00000000-0000-0000-0000-000000000201',
   'CHECK_IN','{}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '0 minutes'),
  ('00000000-0000-0000-0000-000000000131','00000000-0000-0000-0000-000000000201',
   'PACKET_PICKUP','{"packetId":"PKT-0001","sheets":25}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '5 minutes'),
  ('00000000-0000-0000-0000-000000000132','00000000-0000-0000-0000-000000000201',
   'DOOR_KNOCK','{"count":40}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '80 minutes'),
  ('00000000-0000-0000-0000-000000000137','00000000-0000-0000-0000-000000000201',
   'PAUSE_START','{"reason":"break"}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '90 minutes'),
  ('00000000-0000-0000-0000-000000000138','00000000-0000-0000-0000-000000000201',
   'PAUSE_END','{}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '120 minutes'),
  ('00000000-0000-0000-0000-000000000133','00000000-0000-0000-0000-000000000201',
   'CONTACT','{"count":18}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '180 minutes'),
  ('00000000-0000-0000-0000-000000000134','00000000-0000-0000-0000-000000000201',
   'SIGNATURE_SUBMITTED','{"count":22}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '200 minutes'),
  ('00000000-0000-0000-0000-000000000135','00000000-0000-0000-0000-000000000201',
   'PACKET_RETURN','{"packetId":"PKT-0001","sheetsReturned":25,"signatures":22}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '230 minutes'),
  ('00000000-0000-0000-0000-000000000139','00000000-0000-0000-0000-000000000201',
   'CHECK_OUT','{}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '240 minutes'),
  ('00000000-0000-0000-0000-000000000140','00000000-0000-0000-0000-000000000201',
   'BATCH_COUNT','{"reviewed":22,"accepted":20,"rejected":2}',(SELECT "checkInAt" FROM "public"."Shift" WHERE "id"='00000000-0000-0000-0000-000000000201') + interval '250 minutes')
ON CONFLICT ("id") DO NOTHING;

-- --- Supervisor validation of the shift ---
INSERT INTO "public"."Validation" ("id","shiftId","status","reason","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000141','00000000-0000-0000-0000-000000000201',
   'APPROVED','Seed validation - packet reconciled.',NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Metric snapshots ---
-- None here on purpose: ProfileMetric rows are computed by the app's
-- scorecard from the events above (`npm run seed` writes one), never
-- hand-written in SQL. Nothing reads them in M1; the scorecard endpoint
-- always derives live from work_events.

-- --- Payout: approved earnings for the shift (4h x $25/h, 15% fee) ---
INSERT INTO "public"."Payout"
  ("id","workerId","engagementId","amountCents","feeCents","status","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000101',
   '00000000-0000-0000-0000-000000000031',10000,1500,'APPROVED',NOW())
ON CONFLICT ("id") DO NOTHING;

-- --- Audit: seed completed ---
INSERT INTO "public"."AuditEvent"
  ("id","action","entityType","entityId","metadata","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000124','seed.completed','Seed','m0',
   '{"org":"Front Range Circulators","job":"Denver Ballot Initiative - Signature Drive","workers":["Alex Rivera","Jordan Blake","Sam Torres"]}',
   NOW())
ON CONFLICT ("id") DO NOTHING;
