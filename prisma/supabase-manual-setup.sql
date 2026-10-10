-- Turfcut M0–M7 (with M4.1), C1 and the rate-limit store — manual Supabase setup (one paste), FRESH databases only.
-- Generated from prisma/schema.prisma + prisma/seed.ts on 2026-10-02.
-- Paste the entire file into the Supabase SQL editor and run it.
-- The DDL is not re-runnable. Existing database? Run the m1-, m1-profile-, m2-, m3-,
-- m4-0-rls-lockdown, m4-, m4-1-hardening, m5-migration, m5-1-history-lock, m6-migration, m7-migration and c1-roles.sql files in order, then manual-seed.sql (idempotent).
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('WORKER', 'OWNER', 'RECRUITER', 'COMPLIANCE', 'SUPERVISOR', 'FINANCE', 'PUBLISHER');

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
CREATE TYPE "public"."WorkEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'PAUSE_START', 'PAUSE_END', 'DOOR_KNOCK', 'CONTACT', 'SIGNATURE_SUBMITTED', 'CALL', 'INTERVIEW', 'PACKET_PICKUP', 'PACKET_RETURN', 'BATCH_COUNT', 'INCIDENT', 'CORRECTION', 'SHIFT_CANCELLED', 'NOTE');

-- CreateEnum
CREATE TYPE "public"."ValidationStatus" AS ENUM ('APPROVED', 'REJECTED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "public"."PayoutKind" AS ENUM ('SHIFT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."PayoutEventType" AS ENUM ('APPROVED', 'HELD', 'RELEASED', 'VOIDED', 'TRANSFER_STARTED', 'PAID', 'TRANSFER_FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "public"."DisputeOutcome" AS ENUM ('KEPT', 'ADJUSTED', 'REREVIEWED');

-- CreateEnum
CREATE TYPE "public"."ConversationKind" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "public"."ParticipantRole" AS ENUM ('WORKER', 'MANAGER');

-- CreateEnum
CREATE TYPE "public"."RevisionKind" AS ENUM ('EDIT', 'DELETE');

-- CreateTable
CREATE TABLE "public"."Profile" (
    "id" UUID NOT NULL,
    "role" "public"."Role" NOT NULL,
    "orgId" UUID,
    "displayName" TEXT,
    "closedAt" TIMESTAMP(3),
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
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeAccountId" TEXT,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsCheckedAt" TIMESTAMP(3),

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExperienceRecord" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "organizationName" TEXT,
    "campaign" TEXT NOT NULL,
    "campaignType" TEXT,
    "experienceGroup" TEXT,
    "role" TEXT NOT NULL,
    "channel" TEXT,
    "state" VARCHAR(2),
    "countyOrDistrict" TEXT,
    "turfType" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "completedShifts" INTEGER,
    "activeHours" DOUBLE PRECISION,
    "unitType" TEXT NOT NULL,
    "unitCount" INTEGER NOT NULL,
    "approvedCount" INTEGER,
    "referenceContact" TEXT,
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
    "expiresAt" TIMESTAMP(3),
    "consentTextVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoliticalPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "contractorTermsSignedAt" TIMESTAMP(3),
    "classificationReviewedAt" TIMESTAMP(3),
    "legalContact" TEXT,
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
    "effectiveFrom" TIMESTAMP(3),
    "approvalExpiresAt" TIMESTAMP(3),
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
    "campaignDisclosure" JSONB,
    "supportContacts" JSONB,
    "measureIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cancellationNoticeHours" INTEGER NOT NULL DEFAULT 24,
    "publishedAt" TIMESTAMP(3),
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
    "hiredById" UUID,
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
    "stagingLocation" TEXT,
    "stagingLat" DOUBLE PRECISION,
    "stagingLng" DOUBLE PRECISION,
    "supervisorId" UUID,
    "turfArea" JSONB,
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
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" UUID,
    "receivedAt" TIMESTAMP(3),

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
    "orgId" UUID NOT NULL,
    "engagementId" UUID,
    "shiftId" UUID,
    "validationId" UUID,
    "kind" "public"."PayoutKind" NOT NULL DEFAULT 'SHIFT',
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "basis" JSONB,
    "adjustsId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayoutEvent" (
    "id" UUID NOT NULL,
    "payoutId" UUID NOT NULL,
    "type" "public"."PayoutEventType" NOT NULL,
    "actorId" UUID,
    "reason" TEXT,
    "transferId" UUID,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayoutTransfer" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "destination" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayDispute" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "payoutId" UUID,
    "openedById" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayDisputeResolution" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "outcome" "public"."DisputeOutcome" NOT NULL,
    "response" TEXT NOT NULL,
    "resolvedById" UUID NOT NULL,
    "adjustmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayDisputeResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProviderEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "public"."Conversation" (
    "id" UUID NOT NULL,
    "kind" "public"."ConversationKind" NOT NULL,
    "orgId" UUID NOT NULL,
    "engagementId" UUID,
    "name" TEXT,
    "createdById" UUID NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversationJob" (
    "conversationId" UUID NOT NULL,
    "jobId" UUID NOT NULL,

    CONSTRAINT "ConversationJob_pkey" PRIMARY KEY ("conversationId","jobId")
);

-- CreateTable
CREATE TABLE "public"."ConversationParticipant" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "role" "public"."ParticipantRole" NOT NULL,
    "addedById" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" UUID,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentPath" TEXT,
    "attachmentName" TEXT,
    "attachmentType" TEXT,
    "attachmentSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageRevision" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "kind" "public"."RevisionKind" NOT NULL,
    "body" TEXT,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageReport" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "bodySnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,

    CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProfileBlock" (
    "id" UUID NOT NULL,
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),

    CONSTRAINT "ProfileBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Profile_orgId_idx" ON "public"."Profile"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_profileId_key" ON "public"."Worker"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_stripeAccountId_key" ON "public"."Worker"("stripeAccountId");

-- CreateIndex
CREATE INDEX "ExperienceRecord_workerId_idx" ON "public"."ExperienceRecord"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "PoliticalPreference_workerId_consentVersion_key" ON "public"."PoliticalPreference"("workerId", "consentVersion");

-- CreateIndex
CREATE UNIQUE INDEX "JurisdictionProfile_state_locality_version_key" ON "public"."JurisdictionProfile"("state", "locality", "version");

-- CreateIndex
CREATE INDEX "Job_orgId_status_idx" ON "public"."Job"("orgId", "status");

-- CreateIndex
CREATE INDEX "Job_jurisdictionId_idx" ON "public"."Job"("jurisdictionId");

-- CreateIndex
CREATE UNIQUE INDEX "Engagement_jobId_workerId_key" ON "public"."Engagement"("jobId", "workerId");

-- CreateIndex
CREATE INDEX "Engagement_workerId_idx" ON "public"."Engagement"("workerId");

-- CreateIndex
CREATE INDEX "Engagement_hiredById_idx" ON "public"."Engagement"("hiredById");

-- CreateIndex
CREATE INDEX "Shift_engagementId_startsAt_idx" ON "public"."Shift"("engagementId", "startsAt");

-- CreateIndex
CREATE INDEX "WorkEvent_shiftId_createdAt_idx" ON "public"."WorkEvent"("shiftId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkEvent_clientId_key" ON "public"."WorkEvent"("clientId");

-- CreateIndex
CREATE INDEX "Validation_shiftId_idx" ON "public"."Validation"("shiftId");

-- CreateIndex
CREATE INDEX "ProfileMetric_workerId_idx" ON "public"."ProfileMetric"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileMetric_workerId_version_key" ON "public"."ProfileMetric"("workerId", "version");

-- CreateIndex
CREATE INDEX "Payout_workerId_createdAt_idx" ON "public"."Payout"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_orgId_createdAt_idx" ON "public"."Payout"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_shiftId_idx" ON "public"."Payout"("shiftId");

-- CreateIndex
CREATE INDEX "Payout_engagementId_idx" ON "public"."Payout"("engagementId");

-- CreateIndex
CREATE INDEX "Payout_adjustsId_idx" ON "public"."Payout"("adjustsId");

-- CreateIndex
CREATE INDEX "PayoutEvent_payoutId_createdAt_idx" ON "public"."PayoutEvent"("payoutId", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutEvent_transferId_idx" ON "public"."PayoutEvent"("transferId");

-- CreateIndex
CREATE INDEX "PayoutTransfer_orgId_createdAt_idx" ON "public"."PayoutTransfer"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutTransfer_workerId_createdAt_idx" ON "public"."PayoutTransfer"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "PayDispute_orgId_createdAt_idx" ON "public"."PayDispute"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "PayDispute_shiftId_idx" ON "public"."PayDispute"("shiftId");

-- CreateIndex
CREATE INDEX "PayDispute_workerId_idx" ON "public"."PayDispute"("workerId");

-- CreateIndex
CREATE INDEX "PayDispute_payoutId_idx" ON "public"."PayDispute"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "PayDisputeResolution_disputeId_key" ON "public"."PayDisputeResolution"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayDisputeResolution_adjustmentId_key" ON "public"."PayDisputeResolution"("adjustmentId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "public"."AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "public"."AuditEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_engagementId_key" ON "public"."Conversation"("engagementId");

-- CreateIndex
CREATE INDEX "Conversation_orgId_kind_idx" ON "public"."Conversation"("orgId", "kind");

-- CreateIndex
CREATE INDEX "ConversationJob_jobId_idx" ON "public"."ConversationJob"("jobId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_profileId_idx" ON "public"."ConversationParticipant"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_profileId_key" ON "public"."ConversationParticipant"("conversationId", "profileId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "public"."Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "public"."Message"("senderId");

-- CreateIndex
CREATE INDEX "MessageRevision_messageId_createdAt_idx" ON "public"."MessageRevision"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageRevision_conversationId_createdAt_idx" ON "public"."MessageRevision"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageReport_orgId_createdAt_idx" ON "public"."MessageReport"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReport_messageId_reporterId_key" ON "public"."MessageReport"("messageId", "reporterId");

-- CreateIndex
CREATE INDEX "ProfileBlock_blockedId_idx" ON "public"."ProfileBlock"("blockedId");

-- AddForeignKey
ALTER TABLE "public"."Profile" ADD CONSTRAINT "Profile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Worker" ADD CONSTRAINT "Worker_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExperienceRecord" ADD CONSTRAINT "ExperienceRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PoliticalPreference" ADD CONSTRAINT "PoliticalPreference_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_jurisdictionId_fkey" FOREIGN KEY ("jurisdictionId") REFERENCES "public"."JurisdictionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Engagement" ADD CONSTRAINT "Engagement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Engagement" ADD CONSTRAINT "Engagement_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Engagement" ADD CONSTRAINT "Engagement_hiredById_fkey" FOREIGN KEY ("hiredById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Shift" ADD CONSTRAINT "Shift_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkEvent" ADD CONSTRAINT "WorkEvent_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Validation" ADD CONSTRAINT "Validation_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProfileMetric" ADD CONSTRAINT "ProfileMetric_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_validationId_fkey" FOREIGN KEY ("validationId") REFERENCES "public"."Validation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_adjustsId_fkey" FOREIGN KEY ("adjustsId") REFERENCES "public"."Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayoutEvent" ADD CONSTRAINT "PayoutEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "public"."Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayoutEvent" ADD CONSTRAINT "PayoutEvent_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "public"."PayoutTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayoutTransfer" ADD CONSTRAINT "PayoutTransfer_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayoutTransfer" ADD CONSTRAINT "PayoutTransfer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "public"."Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDisputeResolution" ADD CONSTRAINT "PayDisputeResolution_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "public"."PayDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDisputeResolution" ADD CONSTRAINT "PayDisputeResolution_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "public"."Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationJob" ADD CONSTRAINT "ConversationJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationJob" ADD CONSTRAINT "ConversationJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageRevision" ADD CONSTRAINT "MessageRevision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageReport" ADD CONSTRAINT "MessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProfileBlock" ADD CONSTRAINT "ProfileBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProfileBlock" ADD CONSTRAINT "ProfileBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---- Security (M4): Data API lockdown + messaging integrity and read policies ----
ALTER TABLE "public"."Profile"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Worker"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ExperienceRecord"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PoliticalPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Organization"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."JurisdictionProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Job"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Engagement"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Shift"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WorkEvent"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Validation"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProfileMetric"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Payout"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AuditEvent"          ENABLE ROW LEVEL SECURITY;

-- Defense in depth: take back the table privileges Supabase grants the API
-- roles by default, now and for tables created later — so a future table
-- that forgets RLS still isn't exposed. (Tables the app intends to expose
-- to clients, like Message for Realtime, are granted explicitly.)
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
-- Postgres also grants EXECUTE on every new function to PUBLIC, globally; a
-- per-schema default can't take that back. So Turfcut keeps its functions
-- in "turfcut_private" (not exposed) and revokes PUBLIC on each one.
-- Re-running this after m4-migration.sql must not cut off chat Realtime:
-- restore the one deliberate client grant (still filtered by RLS policies).
DO $$
BEGIN
  IF to_regclass('"public"."Message"') IS NOT NULL THEN
    GRANT SELECT ("id", "conversationId", "createdAt") ON "public"."Message" TO authenticated;
    GRANT SELECT ("id", "messageId", "conversationId", "createdAt") ON "public"."MessageRevision" TO authenticated;
  END IF;
END $$;

-- One active block per pair; lifted blocks stay as history.
CREATE UNIQUE INDEX "ProfileBlock_active_pair" ON "public"."ProfileBlock"("blockerId", "blockedId") WHERE "liftedAt" IS NULL;
-- Owners' open-reports list.
CREATE INDEX "MessageReport_open" ON "public"."MessageReport"("orgId", "createdAt") WHERE "resolvedAt" IS NULL;

-- Shape checks.
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_kind_shape" CHECK (
  ("kind" = 'DIRECT' AND "engagementId" IS NOT NULL) OR ("kind" = 'GROUP' AND "engagementId" IS NULL AND "name" IS NOT NULL));
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_body_length" CHECK (char_length("body") <= 4000);
ALTER TABLE "public"."MessageRevision" ADD CONSTRAINT "MessageRevision_shape" CHECK (
  ("kind" = 'EDIT' AND "body" IS NOT NULL AND char_length("body") <= 4000) OR ("kind" = 'DELETE' AND "body" IS NULL));

-- Turfcut's database functions live in a schema the Data API doesn't expose
-- (never callable as RPC).
CREATE SCHEMA IF NOT EXISTS "turfcut_private";
REVOKE ALL ON SCHEMA "turfcut_private" FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA "turfcut_private" TO authenticated;

-- Append-only, enforced: messages and their revisions are never changed or removed.
CREATE OR REPLACE FUNCTION "turfcut_private"."append_only"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."append_only"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "Message_append_only" BEFORE UPDATE OR DELETE ON "public"."Message"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "MessageRevision_append_only" BEFORE UPDATE OR DELETE ON "public"."MessageRevision"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Copied columns always match their message: Realtime filters revisions by
-- conversationId, and reports are routed by orgId.
CREATE OR REPLACE FUNCTION "turfcut_private"."copy_message_scope"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  SELECT m."conversationId" INTO STRICT NEW."conversationId" FROM "public"."Message" m WHERE m."id" = NEW."messageId";
  IF TG_TABLE_NAME = 'MessageReport' THEN
    SELECT c."orgId" INTO STRICT NEW."orgId" FROM "public"."Conversation" c WHERE c."id" = NEW."conversationId";
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."copy_message_scope"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "MessageRevision_scope" BEFORE INSERT ON "public"."MessageRevision"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."copy_message_scope"();
CREATE TRIGGER "MessageReport_scope" BEFORE INSERT ON "public"."MessageReport"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."copy_message_scope"();

-- Access ends with the job or the role, whatever path makes the change: a
-- frozen member must not keep reading new messages (here, over Realtime, or
-- the Data API). Removal keeps their history up to now, read-only.
-- Staff who leave the org, or stop being owner/recruiter/supervisor, are
-- removed from every conversation they manage there.
CREATE OR REPLACE FUNCTION "turfcut_private"."end_staff_chat_access"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE "public"."ConversationParticipant" p
     SET "removedAt" = (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
    FROM "public"."Conversation" c
   WHERE c."id" = p."conversationId" AND p."profileId" = NEW."id" AND p."role" = 'MANAGER' AND p."removedAt" IS NULL
     AND (NEW."orgId" IS DISTINCT FROM c."orgId" OR NEW."role"::text NOT IN ('OWNER', 'RECRUITER', 'SUPERVISOR'));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."end_staff_chat_access"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "Profile_end_chat_access" AFTER UPDATE OF "orgId", "role" ON "public"."Profile"
  FOR EACH ROW WHEN (OLD."orgId" IS DISTINCT FROM NEW."orgId" OR OLD."role" IS DISTINCT FROM NEW."role")
  EXECUTE FUNCTION "turfcut_private"."end_staff_chat_access"();

-- A worker whose hire ends leaves each team chat where they're no longer
-- hired on any of its jobs. (Their direct thread freezes for both sides by
-- the engagement's status, so nothing new is posted there.)
CREATE OR REPLACE FUNCTION "turfcut_private"."end_worker_chat_access"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Serialize per worker: two of their hires ending at once must not each
  -- see the other as still active. The UPDATE below runs after the wait,
  -- with a fresh snapshot.
  PERFORM pg_advisory_xact_lock(hashtext('chat-worker:' || NEW."workerId"::text));
  UPDATE "public"."ConversationParticipant" p
     SET "removedAt" = (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
    FROM "public"."Worker" w, "public"."ConversationJob" cj
   WHERE w."id" = NEW."workerId" AND p."profileId" = w."profileId" AND p."role" = 'WORKER' AND p."removedAt" IS NULL
     AND cj."conversationId" = p."conversationId" AND cj."jobId" = NEW."jobId"
     AND NOT EXISTS (
       SELECT 1 FROM "public"."ConversationJob" cj2 JOIN "public"."Engagement" e ON e."jobId" = cj2."jobId"
        WHERE cj2."conversationId" = p."conversationId" AND e."workerId" = NEW."workerId" AND e."status" IN ('ACTIVE', 'CLAIMED'));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."end_worker_chat_access"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "Engagement_end_chat_access" AFTER UPDATE OF "status" ON "public"."Engagement"
  FOR EACH ROW WHEN (OLD."status" IN ('ACTIVE', 'CLAIMED') AND NEW."status" NOT IN ('ACTIVE', 'CLAIMED'))
  EXECUTE FUNCTION "turfcut_private"."end_worker_chat_access"();

-- RLS: deny-by-default on every new table.
ALTER TABLE "public"."Conversation"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ConversationJob"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Message"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MessageRevision"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MessageReport"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProfileBlock"            ENABLE ROW LEVEL SECURITY;

-- Policy helpers (below): SECURITY DEFINER so they can read the participant
-- and block tables; search_path empty, every name qualified.

-- Can the signed-in user see something that happened at p_at in this
-- conversation, by p_author? Participant (and, if removed, p_at before the
-- removal), and p_author wasn't blocked by them at p_at.
CREATE OR REPLACE FUNCTION "turfcut_private"."can_see"(p_conversation uuid, p_author uuid, p_at timestamp)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
           SELECT 1 FROM "public"."ConversationParticipant" p
             JOIN "public"."Conversation" c ON c."id" = p."conversationId"
            WHERE p."conversationId" = p_conversation AND p."profileId" = auth.uid()
              AND (p."removedAt" IS NULL OR p_at <= p."removedAt")
              -- A contact who takes over a direct thread reads it from when they joined.
              AND (c."kind" = 'GROUP' OR p."role" = 'WORKER' OR p_at >= p."addedAt"))
     AND NOT EXISTS (
           SELECT 1 FROM "public"."ProfileBlock" b
            WHERE b."blockerId" = auth.uid() AND b."blockedId" = p_author
              AND b."createdAt" <= p_at AND (b."liftedAt" IS NULL OR p_at < b."liftedAt"));
$$;

-- A revision is visible if its message is, and the revision itself happened
-- inside the viewer's window and wasn't made by someone they had blocked.
CREATE OR REPLACE FUNCTION "turfcut_private"."can_see_revision"(p_message uuid, p_actor uuid, p_at timestamp)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT "turfcut_private"."can_see"(m."conversationId", m."senderId", m."createdAt")
                          AND "turfcut_private"."can_see"(m."conversationId", p_actor, p_at)
                     FROM "public"."Message" m WHERE m."id" = p_message), false);
$$;

REVOKE ALL ON FUNCTION "turfcut_private"."can_see"(uuid, uuid, timestamp) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION "turfcut_private"."can_see_revision"(uuid, uuid, timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "turfcut_private"."can_see"(uuid, uuid, timestamp) TO authenticated;
GRANT EXECUTE ON FUNCTION "turfcut_private"."can_see_revision"(uuid, uuid, timestamp) TO authenticated;

-- Only these two tables are readable by signed-in clients (for Realtime),
-- only their ids and times (never message text), and only through these
-- policies. Nothing is granted to anon. (M4.1)
GRANT SELECT ("id", "conversationId", "createdAt") ON "public"."Message" TO authenticated;
GRANT SELECT ("id", "messageId", "conversationId", "createdAt") ON "public"."MessageRevision" TO authenticated;

CREATE POLICY "participants read messages" ON "public"."Message"
  FOR SELECT TO authenticated
  USING ("turfcut_private"."can_see"("conversationId", "senderId", "createdAt"));

-- Tombstones aren't filtered by blocks (a NULL actor never matches a block).
CREATE POLICY "participants read revisions" ON "public"."MessageRevision"
  FOR SELECT TO authenticated
  USING ("turfcut_private"."can_see_revision"("messageId", CASE WHEN "kind" = 'DELETE' THEN NULL ELSE "actorId" END, "createdAt"));

-- No truncating chat history; consent and metric versions are never edited
-- or wiped (M4.1).
CREATE TRIGGER "Message_no_truncate" BEFORE TRUNCATE ON "public"."Message"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "MessageRevision_no_truncate" BEFORE TRUNCATE ON "public"."MessageRevision"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PoliticalPreference_no_update" BEFORE UPDATE ON "public"."PoliticalPreference"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PoliticalPreference_no_truncate" BEFORE TRUNCATE ON "public"."PoliticalPreference"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "ProfileMetric_no_update" BEFORE UPDATE ON "public"."ProfileMetric"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "ProfileMetric_no_truncate" BEFORE TRUNCATE ON "public"."ProfileMetric"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- ---- Security (M5): payout integrity, append-only, RLS ----

-- Shape checks.
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_kind_shape" CHECK (
  ("kind" = 'SHIFT' AND "amountCents" >= 0 AND "adjustsId" IS NULL)
  OR ("kind" = 'ADJUSTMENT' AND "amountCents" <> 0 AND ("adjustsId" IS NOT NULL OR "shiftId" IS NOT NULL)));
ALTER TABLE "public"."PayoutTransfer" ADD CONSTRAINT "PayoutTransfer_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_reason_length" CHECK (char_length("reason") BETWEEN 1 AND 1000);
ALTER TABLE "public"."PayDisputeResolution" ADD CONSTRAINT "PayDisputeResolution_response_length" CHECK (char_length("response") BETWEEN 1 AND 1000);
ALTER TABLE "public"."PayDisputeResolution" ADD CONSTRAINT "PayDisputeResolution_adjustment_shape" CHECK (("outcome" = 'ADJUSTED') = ("adjustmentId" IS NOT NULL));
-- One shift pay line per supervisor approval (a double-click can't pay twice).
CREATE UNIQUE INDEX "Payout_shift_validation_key" ON "public"."Payout"("validationId") WHERE "kind" = 'SHIFT';

-- Append-only, enforced by the database (the function is M4's).
CREATE TRIGGER "Payout_append_only" BEFORE UPDATE OR DELETE ON "public"."Payout"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayoutEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."PayoutEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayoutTransfer_append_only" BEFORE UPDATE OR DELETE ON "public"."PayoutTransfer"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayDispute_append_only" BEFORE UPDATE OR DELETE ON "public"."PayDispute"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayDisputeResolution_append_only" BEFORE UPDATE OR DELETE ON "public"."PayDisputeResolution"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "ProviderEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."ProviderEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();

CREATE TRIGGER "Payout_no_truncate" BEFORE TRUNCATE ON "public"."Payout"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayoutEvent_no_truncate" BEFORE TRUNCATE ON "public"."PayoutEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayoutTransfer_no_truncate" BEFORE TRUNCATE ON "public"."PayoutTransfer"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayDispute_no_truncate" BEFORE TRUNCATE ON "public"."PayDispute"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayDisputeResolution_no_truncate" BEFORE TRUNCATE ON "public"."PayDisputeResolution"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "ProviderEvent_no_truncate" BEFORE TRUNCATE ON "public"."ProviderEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- RLS: deny-by-default; no policies, no grants. Pay records are read and
-- written only by the server.
ALTER TABLE "public"."PayoutEvent"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PayoutTransfer"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PayDispute"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PayDisputeResolution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProviderEvent"        ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."PayoutEvent", "public"."PayoutTransfer", "public"."PayDispute",
  "public"."PayDisputeResolution", "public"."ProviderEvent" FROM anon, authenticated;

-- ---- Security (M5.1): append-only work history ----
CREATE OR REPLACE TRIGGER "WorkEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."WorkEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "Validation_append_only" BEFORE UPDATE OR DELETE ON "public"."Validation"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "WorkEvent_no_truncate" BEFORE TRUNCATE ON "public"."WorkEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "Validation_no_truncate" BEFORE TRUNCATE ON "public"."Validation"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "AuditEvent_no_truncate" BEFORE TRUNCATE ON "public"."AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- ---- C1: member invites (server-only, like the M5 tables) ----
CREATE TABLE "public"."OrgInvite" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "invitedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" UUID,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrgInvite_email_lowercase" CHECK ("email" = lower("email")),
    CONSTRAINT "OrgInvite_role_not_worker" CHECK ("role" <> 'WORKER')
);
CREATE INDEX "OrgInvite_email_idx" ON "public"."OrgInvite"("email");
CREATE INDEX "OrgInvite_orgId_createdAt_idx" ON "public"."OrgInvite"("orgId", "createdAt");
CREATE UNIQUE INDEX "OrgInvite_pending_key" ON "public"."OrgInvite"("orgId", "email")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
ALTER TABLE "public"."OrgInvite" ADD CONSTRAINT "OrgInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."OrgInvite" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."OrgInvite" FROM anon, authenticated;

-- ---- Rate-limit store (server-only; prisma/rate-limit.sql) ----
CREATE TABLE "public"."RateLimitCounter" (
    "bucket" TEXT NOT NULL,
    "windowStart" BIGINT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" BIGINT NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("bucket", "windowStart"),
    CONSTRAINT "RateLimitCounter_count_positive" CHECK ("count" > 0)
);

CREATE INDEX "RateLimitCounter_expiresAt_idx" ON "public"."RateLimitCounter"("expiresAt");

ALTER TABLE "public"."RateLimitCounter" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."RateLimitCounter" FROM anon, authenticated;


-- Turfcut seed (M0 + M1 events) — SQL version of prisma/seed.ts
-- Run AFTER the DDL above. Idempotent: safe to re-run (ON CONFLICT DO NOTHING).

-- --- Jurisdiction: CO / Denver v1, approved & current ---
-- workerRegistrationRequired / badgeRequired / affidavitRequired are circulator
-- rules: the app applies them to petition jobs only (jobCredentials in src/lib/jobs.ts).
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

-- --- Payout: the pay line for the approved shift (3.5 verified h x $25/h,
-- 15% fee charged to the org), approved for payment. Same values the app's
-- pay rules compute (prisma/seed.ts). ---
INSERT INTO "public"."Payout"
  ("id","workerId","orgId","engagementId","shiftId","validationId","kind","amountCents","feeCents","basis","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000161','00000000-0000-0000-0000-000000000101',
   '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000031',
   '00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000141','SHIFT',8750,1313,
   '{"method":"HOURLY","rateCents":2500,"quantity":3.5,"unit":"hour","activeMs":12600000,"formula":"3h 30m verified × $25.00/hr","jurisdictionVersion":1,"effectiveHourlyCents":2500}',
   NOW())
ON CONFLICT ("id") DO NOTHING;
-- (Only for the line this seed wrote: a pre-M5 line keeps its own history.)
INSERT INTO "public"."PayoutEvent" ("id","payoutId","type","reason","createdAt")
SELECT '00000000-0000-0000-0000-000000000162','00000000-0000-0000-0000-000000000161','APPROVED','Seed: approved for payment',NOW()
 WHERE EXISTS (SELECT 1 FROM "public"."Payout" WHERE "id" = '00000000-0000-0000-0000-000000000161' AND NOT ("basis" ? 'legacy'))
ON CONFLICT ("id") DO NOTHING;

-- --- Audit: seed completed ---
INSERT INTO "public"."AuditEvent"
  ("id","action","entityType","entityId","metadata","createdAt") VALUES
  ('00000000-0000-0000-0000-000000000124','seed.completed','Seed','m0',
   '{"org":"Front Range Circulators","job":"Denver Ballot Initiative - Signature Drive","workers":["Alex Rivera","Jordan Blake","Sam Torres"]}',
   NOW())
ON CONFLICT ("id") DO NOTHING;
