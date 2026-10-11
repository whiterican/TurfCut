-- Turfcut C4 migration — job launch and tools. Run after c3-hiring.sql,
-- BEFORE deploying the C4 code. Paste into the Supabase SQL editor. Safe to
-- run again: everything it creates is skipped when it already exists.
-- (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Changes (approved for C4, Oct 11). Additive; nothing existing changes:
--   1. Job.launch: self-launch or staged launch, with the job's staging
--      points and each one's check-in radius (JSON, like geography).
--   2. Job.tools: the canvassing app the work runs in (JSON).

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "public"."Job" ADD COLUMN IF NOT EXISTS "launch" JSONB;
ALTER TABLE "public"."Job" ADD COLUMN IF NOT EXISTS "tools" JSONB;

COMMIT;
