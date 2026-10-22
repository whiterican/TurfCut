-- Turfcut M10.6 migration — organization roles. Run after m10-verification.sql,
-- BEFORE deploying this code. Paste into the Supabase SQL editor. Safe to run
-- again: everything it adds is skipped when it already exists. (Fresh
-- databases: supabase-manual-setup.sql already includes it.)
--
-- An organization can define roles of its own: a name and what it reaches,
-- as grants on the access map's areas at full or read.
--   1. Role gains CUSTOM: a member whose access comes from their OrgRole.
--   2. OrgRole (per organization) and OrgRoleGrant (area + full/read).
--      Never deleted: a role is archived once nobody holds it. Server-only
--      (RLS on, no policies, no grants). Area names are checked in code
--      against the access map, so a new area never needs a migration.
--   3. Profile.orgRoleId and OrgInvite.orgRoleId: set exactly when the role
--      is CUSTOM (a CHECK keeps the two in step).
-- Nothing recorded changes: built-in members keep their role and a null
-- orgRoleId.

-- The new enum value first, outside the transaction (Postgres can't use a
-- value added in the same transaction). The checks below compare the role
-- as text, so the file works statement by statement (psql -f) or as one
-- block (the Supabase SQL editor).
ALTER TYPE "public"."Role" ADD VALUE IF NOT EXISTS 'CUSTOM';

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  CREATE TYPE "public"."RoleAccessLevel" AS ENUM ('FULL', 'READ');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "public"."OrgRole" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "basedOn" "public"."Role",
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "OrgRole_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrgRole_name_length" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60),
    CONSTRAINT "OrgRole_description_length" CHECK (char_length("description") <= 300),
    CONSTRAINT "OrgRole_basedOn_builtin" CHECK ("basedOn" IS NULL OR "basedOn"::text NOT IN ('WORKER', 'CUSTOM'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgRole_orgId_name_key" ON "public"."OrgRole"("orgId", "name");
-- Names are compared without case: "Field lead" and "field lead" are one name.
CREATE UNIQUE INDEX IF NOT EXISTS "OrgRole_orgId_lower_name_key" ON "public"."OrgRole"("orgId", lower("name"));
CREATE INDEX IF NOT EXISTS "OrgRole_orgId_archivedAt_idx" ON "public"."OrgRole"("orgId", "archivedAt");
DO $$ BEGIN
  ALTER TABLE "public"."OrgRole" ADD CONSTRAINT "OrgRole_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."OrgRole" ADD CONSTRAINT "OrgRole_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "public"."OrgRoleGrant" (
    "roleId" UUID NOT NULL,
    "area" TEXT NOT NULL,
    "level" "public"."RoleAccessLevel" NOT NULL,

    CONSTRAINT "OrgRoleGrant_pkey" PRIMARY KEY ("roleId", "area")
);
DO $$ BEGIN
  ALTER TABLE "public"."OrgRoleGrant" ADD CONSTRAINT "OrgRoleGrant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."OrgRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."OrgRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."OrgRoleGrant" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."OrgRole", "public"."OrgRoleGrant" FROM anon, authenticated;

ALTER TABLE "public"."Profile" ADD COLUMN IF NOT EXISTS "orgRoleId" UUID;
ALTER TABLE "public"."OrgInvite" ADD COLUMN IF NOT EXISTS "orgRoleId" UUID;
DO $$ BEGIN
  ALTER TABLE "public"."Profile" ADD CONSTRAINT "Profile_orgRoleId_fkey" FOREIGN KEY ("orgRoleId") REFERENCES "public"."OrgRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."OrgInvite" ADD CONSTRAINT "OrgInvite_orgRoleId_fkey" FOREIGN KEY ("orgRoleId") REFERENCES "public"."OrgRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- A custom role has an OrgRole and nothing else does.
DO $$ BEGIN
  ALTER TABLE "public"."Profile" ADD CONSTRAINT "Profile_custom_role" CHECK (("role"::text = 'CUSTOM') = ("orgRoleId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."OrgInvite" ADD CONSTRAINT "OrgInvite_custom_role" CHECK (("role"::text = 'CUSTOM') = ("orgRoleId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Profile_orgRoleId_idx" ON "public"."Profile"("orgRoleId");

COMMIT;
