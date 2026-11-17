-- PROPOSAL, NOT APPLIED. Amendments to W1's tables (prisma/w1-walkbooks.sql), for Caden's decisions of Nov 17, 2026:
-- store each imported row's source record ID, keep every column of the imported file, and delete names and addresses (and
-- now all of that) after 30 days, or sooner if the job closes or a license requires it.
--
-- W1's SQL isn't applied yet, so these changes belong INSIDE w1-walkbooks.sql's CREATE TABLEs, not as ALTERs. They are
-- written as ALTERs here only so the test harness can apply them on top of W1's real file. Safe to run again.
--
--   1. The purge fix. W2's StopOutcome keys a stop with ON DELETE RESTRICT and is append-only, so a book's stops can never
--      be deleted once any stop has an outcome. WalkbookStop holds no personal data (the address is on ImportedAddress), so
--      the purge deletes ImportedAddress rows only, and WalkbookStop.addressId becomes nullable, ON DELETE SET NULL.
--      Stops, outcomes and poll answers stay; they are then keyed by book and stop number only.
--   2. deleteAfter / purgedAt on AddressImport: when the import's personal data goes, and when it went.
--   3. sourceSystem on AddressImport; sourceRecordId and sourceData (every other column of the row, header -> value) on
--      ImportedAddress. They live on the row the purge deletes, so one DELETE removes all of it.
--
-- These columns are the most sensitive data in the system (names, phone numbers, party, vote history). They must never reach a
-- worker's phone or any matching, scoring or ranking code; keep explicit field selects and add an isolation test.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "public"."AddressImport"
  ADD COLUMN IF NOT EXISTS "deleteAfter" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT;
ALTER TABLE "public"."ImportedAddress"
  ADD COLUMN IF NOT EXISTS "sourceRecordId" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceData" JSONB;

DO $$ BEGIN
  ALTER TABLE "public"."AddressImport" ADD CONSTRAINT "AddressImport_deleteAfter" CHECK ("deleteAfter" > "createdAt");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."AddressImport" ADD CONSTRAINT "AddressImport_sourceSystem" CHECK ("sourceSystem" IS NULL OR "sourceSystem" IN ('ECANVASSER', 'VAN', 'PDI', 'OTHER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."ImportedAddress" ADD CONSTRAINT "ImportedAddress_sourceRecordId_length" CHECK ("sourceRecordId" IS NULL OR char_length("sourceRecordId") BETWEEN 1 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- An object of header -> value, at most 16 KB a row (W1 already caps a file at 10,000 rows).
DO $$ BEGIN
  ALTER TABLE "public"."ImportedAddress" ADD CONSTRAINT "ImportedAddress_sourceData" CHECK ("sourceData" IS NULL OR (jsonb_typeof("sourceData") = 'object' AND octet_length("sourceData"::text) <= 16384));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A record ID names one row of one import.
CREATE UNIQUE INDEX IF NOT EXISTS "ImportedAddress_importId_sourceRecordId_key" ON "public"."ImportedAddress"("importId", "sourceRecordId") WHERE "sourceRecordId" IS NOT NULL;
-- The purge finds imports that are due.
CREATE INDEX IF NOT EXISTS "AddressImport_deleteAfter_idx" ON "public"."AddressImport"("deleteAfter") WHERE "purgedAt" IS NULL;

-- The purge fix (1).
ALTER TABLE "public"."WalkbookStop" ALTER COLUMN "addressId" DROP NOT NULL;
ALTER TABLE "public"."WalkbookStop" DROP CONSTRAINT IF EXISTS "WalkbookStop_addressId_fkey";
ALTER TABLE "public"."WalkbookStop" ADD CONSTRAINT "WalkbookStop_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "public"."ImportedAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
