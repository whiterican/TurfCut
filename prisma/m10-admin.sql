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
-- Slice 2: the organization approval queue.
--   3. NotificationKind gains ORG_APPROVED and ORG_APPROVAL_REVOKED: Turfcut's
--      decision, to the organization's owners. These notices have no subject
--      row (the Notification_subject check below allows exactly that).
--   4. Organization.approvedAt: when Turfcut last approved it. Organizations
--      already approved are dated from their creation (the one value filled
--      in; nothing recorded changes).
-- Slice 3: jurisdiction rule profiles.
--   5. NotificationKind gains ORG_JOBS_FROZEN: to an organization's owners
--      and recruiters when a rule change or a withdrawn approval froze some
--      of its jobs. No subject row, like the other ORG_ notices.
--   6. JurisdictionProfile.createdById, approvedById (staff) and
--      supersededAt (when a newer approved version took its place).

-- The new enum values first, outside the transaction (Postgres can't use a
-- value added in the same transaction). The check below compares the kind
-- as text, so it works statement by statement (psql -f) or as one block
-- (the Supabase SQL editor), where the new values aren't committed yet.
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'ORG_APPROVED';
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'ORG_APPROVAL_REVOKED';
ALTER TYPE "public"."NotificationKind" ADD VALUE IF NOT EXISTS 'ORG_JOBS_FROZEN';

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

-- Slice 2: when Turfcut last approved an organization (M10.2).
ALTER TABLE "public"."Organization" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
UPDATE "public"."Organization" SET "approvedAt" = "createdAt" WHERE "approved" AND "approvedAt" IS NULL;

-- One subject per notice and the kind says which, as in M9; an ORG_* notice
-- (Turfcut's decision on the recipient's organization) has none.
ALTER TABLE "public"."Notification" DROP CONSTRAINT IF EXISTS "Notification_subject";
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_subject" CHECK (
  (("engagementId" IS NOT NULL)::int + ("postId" IS NOT NULL)::int + ("disputeId" IS NOT NULL)::int + ("transferId" IS NOT NULL)::int)
    = (CASE WHEN "kind"::text LIKE 'ORG\_%' THEN 0 ELSE 1 END)
  AND (("kind"::text = 'CAMPAIGN_POST') = ("postId" IS NOT NULL))
  AND (("kind"::text LIKE 'DISPUTE\_%') = ("disputeId" IS NOT NULL))
  AND (("kind"::text LIKE 'PAYOUT\_%') = ("transferId" IS NOT NULL)));

-- Slice 3: who proposed and approved a jurisdiction version, and when it was superseded (M10.3).
ALTER TABLE "public"."JurisdictionProfile" ADD COLUMN IF NOT EXISTS "createdById" UUID;
ALTER TABLE "public"."JurisdictionProfile" ADD COLUMN IF NOT EXISTS "approvedById" UUID;
ALTER TABLE "public"."JurisdictionProfile" ADD COLUMN IF NOT EXISTS "supersededAt" TIMESTAMP(3);

COMMIT;
