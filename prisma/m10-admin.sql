-- Turfcut M10 migration — self-serve admin. Run after m9-money.sql, BEFORE
-- deploying this code. Paste into the Supabase SQL editor. Safe to run
-- again: everything it adds is skipped when it already exists. (Fresh
-- databases: supabase-manual-setup.sql already includes it.)
--
-- Slice 1 (M10 plan, approved Oct 20): the staff gate and the staff ledger.
-- Nothing recorded changes. Later slices append their own numbered sections
-- to this file; it stays safe to run again after each.
--   1. Profile.staffSince: when this account became Turfcut staff; null for
--      everyone else. Set by hand (README, "Turfcut staff") — never by the
--      app in this slice.
--   2. AdminAction: one row per act a staff member takes, with who, what,
--      on which record, for which organization, and why. Append-only,
--      server-only (RLS on, no policies, no grants).

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "public"."Profile" ADD COLUMN IF NOT EXISTS "staffSince" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "public"."AdminAction" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "orgId" UUID,
    "reason" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id"),
    -- Why is never blank: the ledger exists to say so.
    CONSTRAINT "AdminAction_reason_given" CHECK (length(btrim("reason")) > 0)
);
CREATE INDEX IF NOT EXISTS "AdminAction_targetType_targetId_idx" ON "public"."AdminAction"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "AdminAction_orgId_createdAt_idx" ON "public"."AdminAction"("orgId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAction_staffId_createdAt_idx" ON "public"."AdminAction"("staffId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminAction_createdAt_idx" ON "public"."AdminAction"("createdAt");
DO $$ BEGIN
  ALTER TABLE "public"."AdminAction" ADD CONSTRAINT "AdminAction_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."AdminAction" ADD CONSTRAINT "AdminAction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- A staff act, once recorded, never changes; server-only (RLS on, no policies, no grants).
CREATE OR REPLACE TRIGGER "AdminAction_append_only" BEFORE UPDATE OR DELETE ON "public"."AdminAction"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
ALTER TABLE "public"."AdminAction" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."AdminAction" FROM anon, authenticated;

COMMIT;
