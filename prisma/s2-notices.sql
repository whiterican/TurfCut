-- Turfcut S2.4 migration — notices of a followed campaign's new posts. Run
-- after c3-hiring.sql and c4-launch.sql, BEFORE deploying this code. Paste
-- into the Supabase SQL editor. Safe to run again: everything it adds is
-- skipped when it already exists. (Fresh databases:
-- supabase-manual-setup.sql already includes it.)
--
-- Changes (S2 plan, approved Oct 11; delivery waited on C3.5's Notification).
-- Additive; no existing notice changes:
--   1. NotificationKind gains CAMPAIGN_POST.
--   2. Notification.postId: a notice can be about a campaign post instead of
--      an engagement. Exactly one of the two is set, and CAMPAIGN_POST is
--      the only kind about a post (checked below), so every existing row
--      (all about an engagement) already fits.

-- The new enum value first, outside the transaction: the check below uses it.
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'CAMPAIGN_POST';

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "public"."Notification" ALTER COLUMN "engagementId" DROP NOT NULL;
ALTER TABLE "public"."Notification" ADD COLUMN IF NOT EXISTS "postId" UUID;
DO $$ BEGIN
  ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."CampaignPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_subject" CHECK (
    ("engagementId" IS NULL) <> ("postId" IS NULL)
    AND (("kind" = 'CAMPAIGN_POST') = ("postId" IS NOT NULL)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Notification_postId_idx" ON "public"."Notification"("postId");

COMMIT;
