-- Turfcut W2 migration — stop outcomes. Run after w1-walkbooks.sql, BEFORE
-- deploying this code. Paste into the Supabase SQL editor. Safe to run
-- again. (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Approved by Caden, Nov 17 2026 (CLAUDE.md rule 8). Additive; no existing
-- table or row changes.
--
--   1. StopOutcome: what happened at one walkbook stop, recorded by the
--      worker holding the book. Append-only (rule 3): a correction is a new
--      row, and the newest row for a stop is its state now.
--   2. StopOutcomeAnswer: the work type's own fields for an outcome
--      (canvass: talked to someone, left literature; petition: signatures).
--      Append-only with its outcome. Only these keys are accepted; the
--      database refuses any other, so a free-text note about a resident
--      (or a recorded opinion) cannot be stored here.
--
-- Server-only: RLS on, no policies, no grants.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  CREATE TYPE "public"."StopOutcomeKind" AS ENUM ('DONE', 'COME_BACK', 'NOT_HOME', 'DO_NOT_KNOCK', 'REFUSED', 'MOVED_VACANT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "public"."StopOutcome" (
    "id" UUID NOT NULL,
    "stopId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "shiftId" UUID,
    "outcome" "public"."StopOutcomeKind" NOT NULL,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StopOutcome_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StopOutcome_stopId_createdAt_idx" ON "public"."StopOutcome"("stopId", "createdAt");
CREATE INDEX IF NOT EXISTS "StopOutcome_engagementId_idx" ON "public"."StopOutcome"("engagementId");
CREATE INDEX IF NOT EXISTS "StopOutcome_shiftId_idx" ON "public"."StopOutcome"("shiftId");
CREATE INDEX IF NOT EXISTS "StopOutcome_recordedById_idx" ON "public"."StopOutcome"("recordedById");

CREATE TABLE IF NOT EXISTS "public"."StopOutcomeAnswer" (
    "id" UUID NOT NULL,
    "outcomeId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "intValue" INTEGER,
    "boolValue" BOOLEAN,

    CONSTRAINT "StopOutcomeAnswer_pkey" PRIMARY KEY ("id"),
    -- The only fields there are. Adding one is a reviewed change to this file, not a string the app can invent.
    CONSTRAINT "StopOutcomeAnswer_key" CHECK ("key" IN ('talked_to', 'left_literature', 'signatures')),
    CONSTRAINT "StopOutcomeAnswer_shape" CHECK (
      ("key" = 'signatures' AND "intValue" IS NOT NULL AND "intValue" BETWEEN 0 AND 50 AND "boolValue" IS NULL)
      OR ("key" IN ('talked_to', 'left_literature') AND "boolValue" IS NOT NULL AND "intValue" IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "StopOutcomeAnswer_outcomeId_key_key" ON "public"."StopOutcomeAnswer"("outcomeId", "key");

DO $$ BEGIN
  ALTER TABLE "public"."StopOutcome" ADD CONSTRAINT "StopOutcome_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "public"."WalkbookStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."StopOutcome" ADD CONSTRAINT "StopOutcome_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."StopOutcome" ADD CONSTRAINT "StopOutcome_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."StopOutcome" ADD CONSTRAINT "StopOutcome_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."StopOutcomeAnswer" ADD CONSTRAINT "StopOutcomeAnswer_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "public"."StopOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Append-only (rule 3). Needs turfcut_private.append_only() from m4-migration.sql.
CREATE OR REPLACE TRIGGER "StopOutcome_append_only" BEFORE UPDATE OR DELETE ON "public"."StopOutcome"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "StopOutcome_no_truncate" BEFORE TRUNCATE ON "public"."StopOutcome"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "StopOutcomeAnswer_append_only" BEFORE UPDATE OR DELETE ON "public"."StopOutcomeAnswer"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "StopOutcomeAnswer_no_truncate" BEFORE TRUNCATE ON "public"."StopOutcomeAnswer"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

ALTER TABLE "public"."StopOutcome" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."StopOutcomeAnswer" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."StopOutcome", "public"."StopOutcomeAnswer" FROM anon, authenticated;

COMMIT;
