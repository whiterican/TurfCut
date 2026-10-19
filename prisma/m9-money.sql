-- Turfcut M9 migration — money, visibly. Run after m8-slots.sql, BEFORE
-- deploying this code. Paste into the Supabase SQL editor. Safe to run
-- again: everything it adds is skipped when it already exists. (Fresh
-- databases: supabase-manual-setup.sql already includes it.)
--
-- Changes (M9 plan, approved Oct 19). Additive; no existing row changes:
--   1. PayDisputeMessage: the dispute thread (worker and pay roles).
--      Append-only, server-only.
--   2. NotificationKind gains the dispute and payout kinds.
--   3. Notification.disputeId and .transferId: a notice can be about a
--      dispute or a payout transfer. Exactly one subject, and the kind says
--      which (checked below); every existing row already fits.
--   4. PayoutTransfer.receiptNo: the worker's receipt number, counted per
--      organization. Existing transfers are numbered in the order they
--      were recorded (the one time this append-only table is updated: a
--      new column is filled, no recorded value changes).

-- The new enum values first. The check below compares the kind as text, so
-- it works whether this file runs statement by statement (psql -f) or as one
-- block (the Supabase SQL editor), where the new values aren't committed yet.
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'DISPUTE_OPENED';
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'DISPUTE_MESSAGE';
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'DISPUTE_RESOLVED';
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'DISPUTE_OVERDUE';
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'PAYOUT_SENT';
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'PAYOUT_REVERSED';

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "public"."PayDisputeMessage" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayDisputeMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PayDisputeMessage_body_length" CHECK (char_length("body") BETWEEN 1 AND 2000)
);
CREATE INDEX IF NOT EXISTS "PayDisputeMessage_disputeId_createdAt_idx" ON "public"."PayDisputeMessage"("disputeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PayDisputeMessage_authorId_idx" ON "public"."PayDisputeMessage"("authorId");
DO $$ BEGIN
  ALTER TABLE "public"."PayDisputeMessage" ADD CONSTRAINT "PayDisputeMessage_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "public"."PayDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PayDisputeMessage" ADD CONSTRAINT "PayDisputeMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Append-only, like the other dispute rows; server-only (RLS on, no policies, no grants).
CREATE OR REPLACE TRIGGER "PayDisputeMessage_append_only" BEFORE UPDATE OR DELETE ON "public"."PayDisputeMessage"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
ALTER TABLE "public"."PayDisputeMessage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."PayDisputeMessage" FROM anon, authenticated;

ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "disputeId" UUID;
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "transferId" UUID;
DO $$ BEGIN
  ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "public"."PayDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "public"."PayoutTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Notification_disputeId_idx" ON "public"."Notification"("disputeId");
CREATE INDEX IF NOT EXISTS "Notification_transferId_idx" ON "public"."Notification"("transferId");
-- One subject per notice, and the kind says which (replaces the S2.4 check).
ALTER TABLE "public"."Notification" DROP CONSTRAINT IF EXISTS "Notification_subject";
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_subject" CHECK (
  (("engagementId" IS NOT NULL)::int + ("postId" IS NOT NULL)::int + ("disputeId" IS NOT NULL)::int + ("transferId" IS NOT NULL)::int) = 1
  AND (("kind"::text = 'CAMPAIGN_POST') = ("postId" IS NOT NULL))
  AND (("kind"::text LIKE 'DISPUTE\_%') = ("disputeId" IS NOT NULL))
  AND (("kind"::text LIKE 'PAYOUT\_%') = ("transferId" IS NOT NULL)));

-- Receipt numbers (M9.2).
ALTER TABLE "public"."PayoutTransfer" ADD COLUMN IF NOT EXISTS "receiptNo" INTEGER;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "public"."PayoutTransfer" WHERE "receiptNo" IS NULL) THEN
    ALTER TABLE "public"."PayoutTransfer" DISABLE TRIGGER "PayoutTransfer_append_only";
    UPDATE "public"."PayoutTransfer" t SET "receiptNo" = n."rn"
      FROM (SELECT "id", row_number() OVER (PARTITION BY "orgId" ORDER BY "createdAt", "id") AS "rn" FROM "public"."PayoutTransfer") n
     WHERE n."id" = t."id" AND t."receiptNo" IS NULL;
    ALTER TABLE "public"."PayoutTransfer" ENABLE TRIGGER "PayoutTransfer_append_only";
  END IF;
END $$;
ALTER TABLE "public"."PayoutTransfer" ALTER COLUMN "receiptNo" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "PayoutTransfer_orgId_receiptNo_key" ON "public"."PayoutTransfer"("orgId", "receiptNo");

COMMIT;
