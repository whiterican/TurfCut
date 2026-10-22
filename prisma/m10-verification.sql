-- Turfcut M10.5 migration — campaign verification. Run after m10-admin.sql,
-- BEFORE deploying this code. Paste into the Supabase SQL editor. Safe to run
-- again: everything it adds is skipped when it already exists. (Fresh
-- databases: supabase-manual-setup.sql already includes it.)
--
-- CampaignProfile.verifiedAt / verifiedById: when a Turfcut staff member
-- confirmed that this is the organization's official campaign account, and
-- who. Both null, or both set. The reason lives on the staff ledger
-- (AdminAction), not here. Neither column is granted to the API roles: the
-- mark is served by the app, and a staff identity is never public. Nothing
-- recorded changes.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "public"."CampaignProfile" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "public"."CampaignProfile" ADD COLUMN IF NOT EXISTS "verifiedById" UUID;
DO $$ BEGIN
  ALTER TABLE "public"."CampaignProfile" ADD CONSTRAINT "CampaignProfile_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."CampaignProfile" ADD CONSTRAINT "CampaignProfile_verified_together" CHECK (("verifiedAt" IS NULL) = ("verifiedById" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "CampaignProfile_verifiedAt_idx" ON "public"."CampaignProfile"("verifiedAt");

COMMIT;
