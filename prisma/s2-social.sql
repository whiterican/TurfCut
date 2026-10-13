-- Turfcut S2 migration — follows and likes (the social layer, worker side).
-- Run AFTER prisma/s1-social.sql, BEFORE deploying the S2 code. Paste into
-- the Supabase SQL editor. Safe to run again: everything it creates is
-- skipped or replaced when it already exists.
-- (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Changes (approved for S2, Oct 11). Additive; nothing existing changes:
--   1. CampaignFollow: a worker following a campaign, with their notice
--      setting. One open row per worker and campaign; unfollowing closes
--      the row (revokedAt, set once) and nothing else about a row ever
--      changes. Private to the worker: campaigns never see who follows
--      them, and there are no follower counts.
--   2. PostLike: a worker's like on a post; unliking closes the row
--      (removedAt, set once). A campaign sees only how many likes a post
--      has, never who.
--
-- Nothing here is readable or writable through the Data API: both tables
-- are server-only (deny by default), scoped to the signed-in worker in code.
-- Nothing here is ever read by matching, scorecards or any ranking
-- (C1-Q14; enforced by src/lib/social-isolation.test.ts).

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "public"."CampaignFollow" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "CampaignFollow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CampaignFollow_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignFollow_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."CampaignProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignFollow_revoked_after_created" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt")
);
CREATE INDEX IF NOT EXISTS "CampaignFollow_workerId_revokedAt_idx" ON "public"."CampaignFollow"("workerId", "revokedAt");
CREATE INDEX IF NOT EXISTS "CampaignFollow_campaignId_revokedAt_idx" ON "public"."CampaignFollow"("campaignId", "revokedAt");
-- One open follow per worker and campaign.
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignFollow_open_key" ON "public"."CampaignFollow"("workerId", "campaignId") WHERE "revokedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "public"."PostLike" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "PostLike_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PostLike_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."CampaignPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PostLike_removed_after_created" CHECK ("removedAt" IS NULL OR "removedAt" >= "createdAt")
);
CREATE INDEX IF NOT EXISTS "PostLike_workerId_removedAt_idx" ON "public"."PostLike"("workerId", "removedAt");
CREATE INDEX IF NOT EXISTS "PostLike_postId_removedAt_idx" ON "public"."PostLike"("postId", "removedAt");
-- One open like per worker and post.
CREATE UNIQUE INDEX IF NOT EXISTS "PostLike_open_key" ON "public"."PostLike"("workerId", "postId") WHERE "removedAt" IS NULL;

-- Append-only, with one exception: a row is closed once (its closing column
-- goes from null to a time) and nothing else about it ever changes. Deletes
-- and truncates are refused.
CREATE OR REPLACE FUNCTION "turfcut_private"."close_once"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  col text := TG_ARGV[0];
  old_closed timestamp;
  new_closed timestamp;
  old_rest jsonb;
  new_rest jsonb;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
  END IF;
  old_closed := (to_jsonb(OLD) ->> col)::timestamp;
  new_closed := (to_jsonb(NEW) ->> col)::timestamp;
  old_rest := to_jsonb(OLD) - col;
  new_rest := to_jsonb(NEW) - col;
  IF old_rest <> new_rest OR old_closed IS NOT NULL OR new_closed IS NULL THEN
    RAISE EXCEPTION '% is append-only: only "%" may be set, once', TG_TABLE_NAME, col USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."close_once"() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER "CampaignFollow_close_once" BEFORE UPDATE OR DELETE ON "public"."CampaignFollow"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."close_once"('revokedAt');
CREATE OR REPLACE TRIGGER "CampaignFollow_no_truncate" BEFORE TRUNCATE ON "public"."CampaignFollow"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PostLike_close_once" BEFORE UPDATE OR DELETE ON "public"."PostLike"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."close_once"('removedAt');
CREATE OR REPLACE TRIGGER "PostLike_no_truncate" BEFORE TRUNCATE ON "public"."PostLike"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Server-only: no grants, no policies (deny by default). A lockdown re-run
-- (prisma/m4-0-rls-lockdown.sql) leaves this as it is.
ALTER TABLE "public"."CampaignFollow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PostLike" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."CampaignFollow", "public"."PostLike" FROM anon, authenticated;

COMMIT;
