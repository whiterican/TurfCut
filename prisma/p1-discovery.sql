-- Turfcut P1.6 migration — saved and hidden jobs. Run BEFORE deploying this
-- code. Paste into the Supabase SQL editor. Safe to run again: everything it
-- adds is skipped when it already exists. (Fresh databases:
-- supabase-manual-setup.sql already includes it.)
--
-- A worker can save a job or hide it from their feed (swipe, or a button).
--   1. SavedJob and DismissedJob: one open row per worker and job; unsaving
--      or unhiding ends the row (removedAt, set once) and doing it again
--      starts a new one, so nothing is ever deleted or rewritten.
--   2. Both are private to the worker and server-only: RLS on, no policies,
--      no grants. Nothing in matching, ranking or the scorecards reads them
--      (src/lib/job-marks-isolation.test.ts), and no organization sees them.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "public"."SavedJob" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SavedJob_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SavedJob_removed_after_created" CHECK ("removedAt" IS NULL OR "removedAt" >= "createdAt")
);
-- Read by worker only; jobs are never deleted, so no index on "jobId" (the RESTRICT check would scan).
CREATE INDEX IF NOT EXISTS "SavedJob_workerId_removedAt_idx" ON "public"."SavedJob"("workerId", "removedAt");
-- One open save per worker and job.
CREATE UNIQUE INDEX IF NOT EXISTS "SavedJob_open_key" ON "public"."SavedJob"("workerId", "jobId") WHERE "removedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "public"."DismissedJob" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    CONSTRAINT "DismissedJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DismissedJob_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DismissedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DismissedJob_removed_after_created" CHECK ("removedAt" IS NULL OR "removedAt" >= "createdAt")
);
CREATE INDEX IF NOT EXISTS "DismissedJob_workerId_removedAt_idx" ON "public"."DismissedJob"("workerId", "removedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "DismissedJob_open_key" ON "public"."DismissedJob"("workerId", "jobId") WHERE "removedAt" IS NULL;

-- Append-only, like the social tables: a row is closed once (removedAt goes
-- from null to a time) and nothing else about it ever changes; deletes and
-- truncates are refused. (The functions come from s2-social.sql.)
CREATE OR REPLACE TRIGGER "SavedJob_close_once" BEFORE UPDATE OR DELETE ON "public"."SavedJob"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."close_once"('removedAt');
CREATE OR REPLACE TRIGGER "SavedJob_no_truncate" BEFORE TRUNCATE ON "public"."SavedJob"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "DismissedJob_close_once" BEFORE UPDATE OR DELETE ON "public"."DismissedJob"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."close_once"('removedAt');
CREATE OR REPLACE TRIGGER "DismissedJob_no_truncate" BEFORE TRUNCATE ON "public"."DismissedJob"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Private to the worker, server-only: the API roles' default privileges are
-- taken back and RLS is on with no policies.
ALTER TABLE "public"."SavedJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."DismissedJob" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."SavedJob", "public"."DismissedJob" FROM anon, authenticated;

COMMIT;
