-- Turfcut W1 migration — file-to-walkbook pilot. Run after p3-sectors.sql,
-- BEFORE deploying this code. Paste into the Supabase SQL editor. Safe to run
-- again: everything it adds is skipped when it already exists. (Fresh
-- databases: supabase-manual-setup.sql already includes it.)
--
-- Approved by Caden, Nov 17 2026 (CLAUDE.md rule 8). Additive: no existing
-- table or row changes.
--
--   1. AddressImport: one authorized file an organization brought, with where
--      it came from, what it may be used for and under what license, as the
--      uploader stated them. The file itself is not kept.
--   2. ImportedAddress: the address of each row, the row's source record ID
--      (Ecanvasser Contact ID, VanID) and, in sourceData, every other column
--      of the row (header -> value, at most 16 KB a row). Caden decided on
--      Nov 17 2026 to keep every column, so the firm's return file can be
--      matched. These columns hold names, phone numbers, party and vote
--      history: the most sensitive data in the system. They never reach a
--      worker's phone or any matching, scoring or ranking code (CLAUDE.md
--      rules 4 and 5); the app selects explicit fields and a test enforces
--      it. Columns that are only ever a risk (government ID numbers, birth
--      dates, payment and password columns) are never stored.
--
--      DELETION. Names and addresses go after 30 days (AddressImport.
--      deleteAfter), sooner if the organization deletes the file or all its
--      jobs have closed. The purge deletes ImportedAddress rows only: the
--      stops, their outcomes and poll answers stay, keyed by walkbook and stop
--      number, so WalkbookStop.addressId is nullable and ON DELETE SET NULL.
--      (W2's StopOutcome is append-only and RESTRICTs a stop, so a worked stop
--      can never be deleted.) AddressImport.purgedAt says when it happened.
--   3. Walkbook: a numbered book of stops on one job, cut from an import.
--   4. WalkbookStop: an address on a walkbook, at its stop number.
--   5. WalkbookAssignment: who holds a walkbook. Append-only (rule 3): a
--      change of hands, or taking a book back, is a new row; the newest row
--      for a walkbook is who holds it now (engagementId NULL: nobody).
--
-- All five are server-only: RLS on, no policies, no grants.

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "public"."AddressImport" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "recordSource" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "keptCount" INTEGER NOT NULL,
    "droppedColumns" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sourceSystem" TEXT,
    "deleteAfter" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AddressImport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AddressImport_fileName_length" CHECK (char_length("fileName") BETWEEN 1 AND 200),
    CONSTRAINT "AddressImport_recordSource_length" CHECK (char_length("recordSource") BETWEEN 1 AND 200),
    CONSTRAINT "AddressImport_purpose_length" CHECK (char_length("purpose") BETWEEN 1 AND 500),
    CONSTRAINT "AddressImport_license_length" CHECK (char_length("license") BETWEEN 1 AND 500),
    CONSTRAINT "AddressImport_counts" CHECK ("rowCount" BETWEEN 1 AND 10000 AND "keptCount" BETWEEN 1 AND "rowCount")
);
CREATE INDEX IF NOT EXISTS "AddressImport_orgId_createdAt_idx" ON "public"."AddressImport"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "AddressImport_uploadedById_idx" ON "public"."AddressImport"("uploadedById");

CREATE TABLE IF NOT EXISTS "public"."ImportedAddress" (
    "id" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "line1" TEXT NOT NULL,
    "unit" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "sourceRecordId" TEXT,
    "sourceData" JSONB,

    CONSTRAINT "ImportedAddress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportedAddress_line1_length" CHECK (char_length("line1") BETWEEN 1 AND 200),
    CONSTRAINT "ImportedAddress_unit_length" CHECK ("unit" IS NULL OR char_length("unit") BETWEEN 1 AND 50),
    CONSTRAINT "ImportedAddress_city_length" CHECK (char_length("city") BETWEEN 1 AND 100),
    CONSTRAINT "ImportedAddress_state" CHECK ("state" ~ '^[A-Z]{2}$'),
    CONSTRAINT "ImportedAddress_zip" CHECK ("zip" ~ '^[0-9]{5}$'),
    CONSTRAINT "ImportedAddress_point" CHECK (("lat" IS NULL) = ("lng" IS NULL) AND ("lat" IS NULL OR ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180)))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ImportedAddress_importId_rowNumber_key" ON "public"."ImportedAddress"("importId", "rowNumber");

CREATE TABLE IF NOT EXISTS "public"."Walkbook" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "importId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Walkbook_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Walkbook_number" CHECK ("number" BETWEEN 1 AND 100000),
    CONSTRAINT "Walkbook_name_length" CHECK (char_length("name") BETWEEN 1 AND 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS "Walkbook_jobId_number_key" ON "public"."Walkbook"("jobId", "number");
CREATE INDEX IF NOT EXISTS "Walkbook_importId_idx" ON "public"."Walkbook"("importId");
CREATE INDEX IF NOT EXISTS "Walkbook_createdById_idx" ON "public"."Walkbook"("createdById");

CREATE TABLE IF NOT EXISTS "public"."WalkbookStop" (
    "id" UUID NOT NULL,
    "walkbookId" UUID NOT NULL,
    "addressId" UUID,
    "stopNumber" INTEGER NOT NULL,

    CONSTRAINT "WalkbookStop_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WalkbookStop_stopNumber" CHECK ("stopNumber" BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS "WalkbookStop_walkbookId_stopNumber_key" ON "public"."WalkbookStop"("walkbookId", "stopNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "WalkbookStop_walkbookId_addressId_key" ON "public"."WalkbookStop"("walkbookId", "addressId");
CREATE INDEX IF NOT EXISTS "WalkbookStop_addressId_idx" ON "public"."WalkbookStop"("addressId");

CREATE TABLE IF NOT EXISTS "public"."WalkbookAssignment" (
    "id" UUID NOT NULL,
    "walkbookId" UUID NOT NULL,
    "engagementId" UUID,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalkbookAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WalkbookAssignment_walkbookId_createdAt_idx" ON "public"."WalkbookAssignment"("walkbookId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalkbookAssignment_engagementId_idx" ON "public"."WalkbookAssignment"("engagementId");
CREATE INDEX IF NOT EXISTS "WalkbookAssignment_actorId_idx" ON "public"."WalkbookAssignment"("actorId");

DO $$ BEGIN
  ALTER TABLE "public"."AddressImport" ADD CONSTRAINT "AddressImport_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."AddressImport" ADD CONSTRAINT "AddressImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."ImportedAddress" ADD CONSTRAINT "ImportedAddress_importId_fkey" FOREIGN KEY ("importId") REFERENCES "public"."AddressImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."Walkbook" ADD CONSTRAINT "Walkbook_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."Walkbook" ADD CONSTRAINT "Walkbook_importId_fkey" FOREIGN KEY ("importId") REFERENCES "public"."AddressImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."Walkbook" ADD CONSTRAINT "Walkbook_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."WalkbookStop" ADD CONSTRAINT "WalkbookStop_walkbookId_fkey" FOREIGN KEY ("walkbookId") REFERENCES "public"."Walkbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."WalkbookStop" ADD CONSTRAINT "WalkbookStop_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "public"."ImportedAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."WalkbookAssignment" ADD CONSTRAINT "WalkbookAssignment_walkbookId_fkey" FOREIGN KEY ("walkbookId") REFERENCES "public"."Walkbook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."WalkbookAssignment" ADD CONSTRAINT "WalkbookAssignment_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."WalkbookAssignment" ADD CONSTRAINT "WalkbookAssignment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ---- Keep every column, and the 30-day purge (Caden, Nov 17 2026) ----
-- Also upgrades a database that already ran the first version of this file.
ALTER TABLE "public"."AddressImport"
  ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
  ADD COLUMN IF NOT EXISTS "deleteAfter" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  ADD COLUMN IF NOT EXISTS "purgedAt" TIMESTAMP(3);
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
-- An object of header -> value, at most 16 KB a row (a file is capped at 10,000 rows).
DO $$ BEGIN
  ALTER TABLE "public"."ImportedAddress" ADD CONSTRAINT "ImportedAddress_sourceData" CHECK ("sourceData" IS NULL OR (jsonb_typeof("sourceData") = 'object' AND octet_length("sourceData"::text) <= 16384));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A record ID names one row of one import.
CREATE UNIQUE INDEX IF NOT EXISTS "ImportedAddress_importId_sourceRecordId_key" ON "public"."ImportedAddress"("importId", "sourceRecordId") WHERE "sourceRecordId" IS NOT NULL;
-- The purge finds imports that are due.
CREATE INDEX IF NOT EXISTS "AddressImport_deleteAfter_idx" ON "public"."AddressImport"("deleteAfter") WHERE "purgedAt" IS NULL;

-- The purge fix: a stop outlives its address.
ALTER TABLE "public"."WalkbookStop" ALTER COLUMN "addressId" DROP NOT NULL;
ALTER TABLE "public"."WalkbookStop" DROP CONSTRAINT IF EXISTS "WalkbookStop_addressId_fkey";
ALTER TABLE "public"."WalkbookStop" ADD CONSTRAINT "WalkbookStop_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "public"."ImportedAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only (rule 3): who held a walkbook, and when, is history.
-- Needs turfcut_private.append_only() from m4-migration.sql.
CREATE OR REPLACE TRIGGER "WalkbookAssignment_append_only" BEFORE UPDATE OR DELETE ON "public"."WalkbookAssignment"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "WalkbookAssignment_no_truncate" BEFORE TRUNCATE ON "public"."WalkbookAssignment"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Server-only: no grants, no policies (deny by default).
ALTER TABLE "public"."AddressImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ImportedAddress" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Walkbook" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WalkbookStop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WalkbookAssignment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."AddressImport", "public"."ImportedAddress", "public"."Walkbook", "public"."WalkbookStop", "public"."WalkbookAssignment" FROM anon, authenticated;

COMMIT;
