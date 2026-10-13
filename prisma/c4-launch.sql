-- Turfcut C4 migration — job launch and tools. Run after c3-hiring.sql,
-- BEFORE deploying the C4 code. Paste into the Supabase SQL editor. Safe to
-- run again: everything it creates is skipped when it already exists.
-- (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Changes (approved for C4, Oct 11). Additive; nothing existing changes:
--   1. Job.launch: self-launch or staged launch, with the job's staging
--      points and each one's check-in radius (JSON, like geography).
--   2. Job.tools: the canvassing app the work runs in (JSON).
--   3. JobChange: each edit to a published job (what, who, when, which of
--      it is material), append-only and server-only.
--   4. NotificationKind gains JOB_CHANGED.
--   5. WorkEventType gains APP_COUNTS (the canvassing app's returned totals,
--      C4.4) and PACKET_HELD (a packet kept between shifts, C4.5).

BEGIN;
SET LOCAL lock_timeout = '5s';

-- A new enum value first: nothing below uses it, so it's safe in the same
-- transaction (re-running skips it).
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'JOB_CHANGED';
ALTER TYPE "public"."WorkEventType" ADD VALUE IF NOT EXISTS 'APP_COUNTS';
ALTER TYPE "public"."WorkEventType" ADD VALUE IF NOT EXISTS 'PACKET_HELD';

ALTER TABLE "public"."Job" ADD COLUMN IF NOT EXISTS "launch" JSONB;
ALTER TABLE "public"."Job" ADD COLUMN IF NOT EXISTS "tools" JSONB;

-- Edits to published jobs (C4.3): what changed, who, when, and which of it
-- is material (hired workers may leave within 24 hours, no penalty).
CREATE TABLE IF NOT EXISTS "public"."JobChange" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "material" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobChange_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "JobChange_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "JobChange_jobId_createdAt_idx" ON "public"."JobChange"("jobId", "createdAt");
CREATE OR REPLACE TRIGGER "JobChange_append_only" BEFORE UPDATE OR DELETE ON "public"."JobChange"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "JobChange_no_truncate" BEFORE TRUNCATE ON "public"."JobChange"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
ALTER TABLE "public"."JobChange" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."JobChange" FROM anon, authenticated;

COMMIT;
