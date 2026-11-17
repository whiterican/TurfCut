-- "We provide training" on jobs (PR #187, owner decision Nov 16 2026).
--
--   * Job.providesTraining: when true, a worker missing a required
--     TRAINING credential or badge can still be hired on this job
--     (apply, instant claim, and accepting an invitation or offer).
--     Circulator registration and affidavit status are always required
--     when the job or its jurisdiction asks for them, whatever this
--     setting says. When false (the default, including every existing
--     job), every required credential is enforced, training included.
--   * Turning it off later does not change anyone already hired: the
--     setting only governs new applies, claims and accepts.
--
-- Idempotent: safe to run again.
-- Also folded into supabase-manual-setup.sql.
--
-- Apply this to production in the Supabase SQL editor BEFORE deploying
-- the code that reads Job.providesTraining.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE "public"."Job" ADD COLUMN IF NOT EXISTS "providesTraining" BOOLEAN NOT NULL DEFAULT false;

COMMIT;
