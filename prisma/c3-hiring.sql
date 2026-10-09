-- Turfcut C3 migration — the hiring hub. Run after c2-consent.sql, and
-- BEFORE deploying the C3 code (the code writes to EngagementEvent, so
-- applying, claiming and inviting fail until this has run). Paste into the
-- Supabase SQL editor. Safe to run again: everything it creates is skipped
-- when it already exists, and the history step only fills in engagements
-- that have none — so running it once more after the deploy covers any
-- engagement made in between. (Fresh databases: supabase-manual-setup.sql
-- already includes it.)
--
-- Already ran it for C3.1–C3.5? Run it once more before deploying C3.6: the
-- code reads WorkerCredential.verificationMethod wherever credentials load
-- (profile, applicants, Matches), so those pages fail until the column exists.
--
-- Changes (approved for C3, Oct 9). Additive; nothing existing changes:
--   1. EngagementStatus gains OFFERED, DECLINED and WITHDRAWN. An offer waits
--      on the worker: nothing starts without their accept.
--   2. EngagementEvent: the dated hiring history of each engagement (applied,
--      in review, offered, not selected with a reason code, withdrawn, ...).
--      Append-only and server-only, like the other history tables.
--   3. Invitations carry the inviter's note and lapse after 7 days
--      (Engagement.inviteNote, inviteExpiresAt); OrgMute records a worker's
--      mute of an organization (no invitations from it).
--   4. Notification: in-app notices about hiring steps (C3.5).
--   5. WorkerCredential.verificationMethod: how a verified credential was
--      checked (C3.6).
--   6. Each existing engagement gets its opening event (applied, claimed or
--      invited, from the copy it kept), dated when it was created.

-- New enum values come first and nothing below uses them, so they're safe in
-- the same transaction as the rest (re-running skips them).
ALTER TYPE "public"."EngagementStatus" ADD VALUE IF NOT EXISTS 'OFFERED';
ALTER TYPE "public"."EngagementStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
ALTER TYPE "public"."EngagementStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  CREATE TYPE "public"."EngagementEventType" AS ENUM (
    'APPLIED', 'CLAIMED', 'INVITED', 'INVITE_VIEWED', 'INVITE_ACCEPTED', 'INVITE_DECLINED', 'INVITE_WITHDRAWN',
    'IN_REVIEW', 'OFFERED', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'NOT_SELECTED', 'WITHDRAWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "public"."EngagementEvent" (
    "id" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "type" "public"."EngagementEventType" NOT NULL,
    "actorId" UUID,
    "reasonCode" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngagementEvent_pkey" PRIMARY KEY ("id"),
    -- A structured reason only when an organization doesn't select someone
    -- (no free-text notes about a worker, C3 decision Q5).
    CONSTRAINT "EngagementEvent_reason_shape" CHECK (
      ("type" = 'NOT_SELECTED' AND "reasonCode" IN ('positions_filled', 'schedule', 'credentials', 'area', 'other'))
      OR ("type" <> 'NOT_SELECTED' AND "reasonCode" IS NULL)),
    CONSTRAINT "EngagementEvent_note_length" CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500),
    CONSTRAINT "EngagementEvent_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EngagementEvent_engagementId_createdAt_idx" ON "public"."EngagementEvent"("engagementId", "createdAt");

-- Append-only: rows are never changed, removed or wiped (rule 3).
CREATE OR REPLACE TRIGGER "EngagementEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."EngagementEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "EngagementEvent_no_truncate" BEFORE TRUNCATE ON "public"."EngagementEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Server-only: row-level security on with no policies, nothing granted.
ALTER TABLE "public"."EngagementEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."EngagementEvent" FROM anon, authenticated;

-- Invitations (C3.3): the inviter's note and when the invitation lapses.
ALTER TABLE "public"."Engagement" ADD COLUMN IF NOT EXISTS "inviteNote" TEXT;
ALTER TABLE "public"."Engagement" ADD COLUMN IF NOT EXISTS "inviteExpiresAt" TIMESTAMP(3);
DO $$ BEGIN
  ALTER TABLE "public"."Engagement" ADD CONSTRAINT "Engagement_inviteNote_length" CHECK ("inviteNote" IS NULL OR char_length("inviteNote") BETWEEN 1 AND 500);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- A worker's mute of an organization (C3.3): no invitations from it while
-- the row exists. Unmuting removes the row (audited by the app).
CREATE TABLE IF NOT EXISTS "public"."OrgMute" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgMute_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrgMute_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrgMute_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgMute_workerId_orgId_key" ON "public"."OrgMute"("workerId", "orgId");
CREATE INDEX IF NOT EXISTS "OrgMute_orgId_idx" ON "public"."OrgMute"("orgId");
ALTER TABLE "public"."OrgMute" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."OrgMute" FROM anon, authenticated;

-- In-app notifications (C3.5): one row per person per hiring step that
-- concerns them. Only the kind and the engagement are stored; the words are
-- drawn when shown. readAt is the recipient's alone (no read receipts).
DO $$ BEGIN
  CREATE TYPE "public"."NotificationKind" AS ENUM (
    'APPLICATION_RECEIVED', 'CLAIM_RECEIVED', 'INVITATION_RECEIVED', 'INVITATION_ACCEPTED', 'INVITATION_DECLINED',
    'INVITATION_WITHDRAWN', 'OFFER_RECEIVED', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'NOT_SELECTED', 'APPLICATION_WITHDRAWN', 'JOB_CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "public"."Notification" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "kind" "public"."NotificationKind" NOT NULL,
    "engagementId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Notification_recipientId_readAt_createdAt_idx" ON "public"."Notification"("recipientId", "readAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_engagementId_idx" ON "public"."Notification"("engagementId");
ALTER TABLE "public"."Notification" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."Notification" FROM anon, authenticated;

-- Credential verification records how it was checked (C3.6). Set exactly
-- when a credential is verified; NOT VALID leaves any earlier rows as they
-- were and holds every new row to it.
DO $$ BEGIN
  CREATE TYPE "public"."VerificationMethod" AS ENUM ('REGISTRY_LOOKUP', 'ORIGINAL_DOCUMENT', 'PROOF_PHOTO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "public"."WorkerCredential" ADD COLUMN IF NOT EXISTS "verificationMethod" "public"."VerificationMethod";
DO $$ BEGIN
  ALTER TABLE "public"."WorkerCredential" ADD CONSTRAINT "WorkerCredential_verification_method" CHECK (
    ("verification" = 'SELF_REPORTED' AND "verificationMethod" IS NULL) OR ("verification" <> 'SELF_REPORTED' AND "verificationMethod" IS NOT NULL)) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- History so far: the opening event of each engagement that kept a copy of
-- how it began (an engagement without one, like the base seed's, gets
-- none). Who did it: the worker for an application or claim, the inviter
-- for an invitation.
INSERT INTO "public"."EngagementEvent" ("id", "engagementId", "type", "actorId", "createdAt")
SELECT gen_random_uuid(), e."id",
       (CASE e."applicationSnapshot"->>'kind' WHEN 'application' THEN 'APPLIED' WHEN 'claim' THEN 'CLAIMED' ELSE 'INVITED' END)::"public"."EngagementEventType",
       CASE WHEN e."applicationSnapshot"->>'kind' = 'invitation' THEN e."hiredById" ELSE w."profileId" END,
       e."createdAt"
  FROM "public"."Engagement" e JOIN "public"."Worker" w ON w."id" = e."workerId"
 WHERE e."applicationSnapshot"->>'kind' IN ('application', 'claim', 'invitation')
   AND NOT EXISTS (SELECT 1 FROM "public"."EngagementEvent" x WHERE x."engagementId" = e."id");

COMMIT;
