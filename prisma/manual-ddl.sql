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

