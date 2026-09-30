-- Turfcut M1 profile migration — run ONCE, after m1-migration.sql.
-- Paste into the Supabase SQL editor. (Fresh databases: use manual-ddl.sql,
-- which already includes these changes.)
--
-- Changes (approved for M1, spec p.8/p.9/p.17). Every new column is
-- nullable, so existing rows stay valid and nothing is rewritten:
--   1. ExperienceRecord: spec p.9 fields (organization, campaign type,
--      experience group, channel, state, county/district, turf type,
--      completed shifts, active hours, approved count, reference contact).
--   2. PoliticalPreference: worker-chosen expiry and the consent-wording
--      version. Existing rows get NULL for both, which the app treats as
--      "needs reconfirmation" (not shared) — it never back-fills consent.

BEGIN;

-- AlterTable
ALTER TABLE "public"."ExperienceRecord" ADD COLUMN     "activeHours" DOUBLE PRECISION,
ADD COLUMN     "approvedCount" INTEGER,
ADD COLUMN     "campaignType" TEXT,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "completedShifts" INTEGER,
ADD COLUMN     "countyOrDistrict" TEXT,
ADD COLUMN     "experienceGroup" TEXT,
ADD COLUMN     "organizationName" TEXT,
ADD COLUMN     "referenceContact" TEXT,
ADD COLUMN     "state" VARCHAR(2),
ADD COLUMN     "turfType" TEXT;

-- AlterTable
ALTER TABLE "public"."PoliticalPreference" ADD COLUMN     "consentTextVersion" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3);

COMMIT;
