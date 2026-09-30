-- Turfcut M1 migration — run ONCE against a database created from the M0 DDL.
-- Paste into the Supabase SQL editor. (Fresh databases: use manual-ddl.sql,
-- which already includes these changes.)
--
-- Changes (both approved for M1):
--   1. New ExperienceRecord table (profile builder).
--   2. PoliticalPreference (workerId, consentVersion) becomes UNIQUE so two
--      concurrent saves can't both claim the same consent version.

BEGIN;

-- Pre-check: the unique index fails if any worker already has two rows with
-- the same consentVersion (e.g. prisma/seed.ts was run more than once under
-- M0). Rows in PoliticalPreference are append-only, so this migration will
-- NOT delete anything — it stops and tells you instead.
DO $$
DECLARE dupes INTEGER;
BEGIN
  SELECT COUNT(*) INTO dupes FROM (
    SELECT 1 FROM "public"."PoliticalPreference"
    GROUP BY "workerId", "consentVersion" HAVING COUNT(*) > 1
  ) d;
  IF dupes > 0 THEN
    RAISE EXCEPTION
      'M1 migration stopped: % (workerId, consentVersion) pair(s) are duplicated in PoliticalPreference. Resolve them before re-running.',
      dupes;
  END IF;
END $$;

-- DropIndex
DROP INDEX "public"."PoliticalPreference_workerId_consentVersion_idx";

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

-- CreateIndex
CREATE INDEX "ExperienceRecord_workerId_idx" ON "public"."ExperienceRecord"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "PoliticalPreference_workerId_consentVersion_key" ON "public"."PoliticalPreference"("workerId", "consentVersion");

-- AddForeignKey
ALTER TABLE "public"."ExperienceRecord" ADD CONSTRAINT "ExperienceRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
