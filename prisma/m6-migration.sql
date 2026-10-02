-- Turfcut M6 migration — offline field day. Run ONCE, after the M5
-- migrations (m5-migration.sql, m5-1-history-lock.sql). Paste into the
-- Supabase SQL editor. (Fresh databases: supabase-manual-setup.sql already
-- includes it.)
--
-- Changes (approved for M6). Both columns are nullable, so existing rows
-- stay valid and nothing is rewritten (WorkEvent is append-only):
--   1. WorkEvent.clientId — the phone's id for an action, unique, so an
--      action sent twice (e.g. after a dropped connection) is saved once.
--   2. WorkEvent.receivedAt — when an action recorded offline reached the
--      server. NULL means it was recorded live. createdAt stays "when it
--      happened" (the phone's time, corrected for clock drift).

BEGIN;

-- AlterTable
ALTER TABLE "public"."WorkEvent" ADD COLUMN     "clientId" UUID,
ADD COLUMN     "receivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "WorkEvent_clientId_key" ON "public"."WorkEvent"("clientId");

COMMIT;
