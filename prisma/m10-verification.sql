-- Turfcut M10.5 migration — campaign verification. Run after m10-admin.sql,
-- BEFORE deploying this code. Paste into the Supabase SQL editor. Safe to run
-- again: everything it adds is skipped when it already exists. (Fresh
-- databases: supabase-manual-setup.sql already includes it.)
--
-- CampaignProfile.verifiedAt / verifiedById: when a Turfcut staff member
-- confirmed that this is the organization's official campaign account, and
-- who. Both null, or both set. The reason lives on the staff ledger
-- (AdminAction), not here. The public may read verifiedAt (it is the mark on
-- the page); verifiedById stays server-only like every staff identity.
-- Nothing recorded changes.

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

-- The public column list (the same rows the read policy already allows) gains the mark.
GRANT SELECT ("verifiedAt") ON "public"."CampaignProfile" TO anon, authenticated;

COMMIT;
