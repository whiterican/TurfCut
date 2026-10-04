-- Turfcut C1 migration — organization roles and member invites. Run ONCE,
-- after m7-migration.sql. Paste into the Supabase SQL editor. (Fresh
-- databases: supabase-manual-setup.sql already includes it.)
--
-- Changes (approved for C1). Additive; existing rows stay valid:
--   1. Role gains PUBLISHER (campaign communications; campaign profiles land
--      in C6). One role per person stays as before.
--   2. OrgInvite: an owner's invitation for someone to join the organization
--      in a role, matched to the email the person proves they own when they
--      first sign in. At most one pending invite per organization and email.
--      Row-level security on with no policies: only the server reads it.

-- Postgres can't use a new enum value in the transaction that adds it, and
-- nothing below does; adding it on its own keeps re-runs simple.
ALTER TYPE "public"."Role" ADD VALUE IF NOT EXISTS 'PUBLISHER';

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

CREATE TABLE "public"."OrgInvite" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "invitedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" UUID,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrgInvite_email_lowercase" CHECK ("email" = lower("email")),
    CONSTRAINT "OrgInvite_role_not_worker" CHECK ("role" <> 'WORKER')
);

CREATE INDEX "OrgInvite_email_idx" ON "public"."OrgInvite"("email");
CREATE INDEX "OrgInvite_orgId_createdAt_idx" ON "public"."OrgInvite"("orgId", "createdAt");
-- One pending invite per organization and email (resend moves its expiry).
CREATE UNIQUE INDEX "OrgInvite_pending_key" ON "public"."OrgInvite"("orgId", "email")
  WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;

ALTER TABLE "public"."OrgInvite" ADD CONSTRAINT "OrgInvite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."OrgInvite" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."OrgInvite" FROM anon, authenticated;

COMMIT;
