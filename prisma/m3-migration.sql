-- Turfcut M3 migration — run ONCE, after the M2 migration. (Safe to re-run:
-- every statement is IF NOT EXISTS.) Paste into the Supabase SQL editor.
-- Fresh databases: use supabase-manual-setup.sql, which already includes this.
--
-- Changes (approved for M3 — field day). All nullable, nothing is rewritten:
--   1. Shift: staging location + optional staging coordinates (check-in records
--      only whether the worker was at staging — never their own position),
--      the supervising profile, and the assigned turf as a GeoJSON polygon.
--   2. WorkEvent: who recorded each event (worker or supervisor), for custody.
--   3. Index for the multi-campaign calendar and conflict check.

BEGIN;

ALTER TABLE "public"."Shift" ADD COLUMN IF NOT EXISTS "stagingLat" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "stagingLng" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "stagingLocation" TEXT,
ADD COLUMN IF NOT EXISTS "supervisorId" UUID,
ADD COLUMN IF NOT EXISTS "turfArea" JSONB;

ALTER TABLE "public"."WorkEvent" ADD COLUMN IF NOT EXISTS "actorId" UUID;

CREATE INDEX IF NOT EXISTS "Shift_engagementId_startsAt_idx" ON "public"."Shift"("engagementId", "startsAt");

COMMIT;
