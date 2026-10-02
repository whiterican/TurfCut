-- Turfcut M2 migration — run ONCE, after the M1 migrations.
-- Paste into the Supabase SQL editor. (Fresh databases: use manual-ddl.sql,
-- which already includes these changes.)
--
-- Changes (approved for M2). Every new column is nullable or defaulted, so
-- existing rows stay valid and nothing is rewritten:
--   1. Organization: contractor-terms signature and classification-review
--      timestamps (the publish gate checks both) and a legal-review contact.
--   2. JurisdictionProfile: effective date and counsel-approval expiry.
--   3. Job: campaign disclosure, support contacts, ballot-measure IDs,
--      cancellation notice window, publish timestamp.
--   4. WorkEventType gains SHIFT_CANCELLED (append-only cancellation record;
--      late worker cancellations count against show rate).

BEGIN;

-- AlterEnum
ALTER TYPE "public"."WorkEventType" ADD VALUE 'SHIFT_CANCELLED';

-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "classificationReviewedAt" TIMESTAMP(3),
ADD COLUMN     "contractorTermsSignedAt" TIMESTAMP(3),
ADD COLUMN     "legalContact" TEXT;

-- AlterTable
ALTER TABLE "public"."JurisdictionProfile" ADD COLUMN     "approvalExpiresAt" TIMESTAMP(3),
ADD COLUMN     "effectiveFrom" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."Job" ADD COLUMN     "campaignDisclosure" JSONB,
ADD COLUMN     "cancellationNoticeHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "measureIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "supportContacts" JSONB;


COMMIT;
