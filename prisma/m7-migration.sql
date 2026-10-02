-- Turfcut M7 migration — account closure. Run ONCE, after m6-migration.sql.
-- Paste into the Supabase SQL editor. (Fresh databases: supabase-manual-setup.sql
-- already includes it.)
--
-- Changes (approved for M7). Both columns are nullable, so existing rows
-- stay valid:
--   1. Profile.closedAt — when the person closed their account. The auth
--      user is deleted; the row and everything it anchors stay (rule 3).
--   2. Worker.closedAt — same, on the worker; name and phone are
--      anonymized at closure, history is kept.

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "public"."Profile" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "public"."Worker" ADD COLUMN "closedAt" TIMESTAMP(3);

COMMIT;
