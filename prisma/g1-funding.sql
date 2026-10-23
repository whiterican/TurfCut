-- Turfcut G1 migration: organization funding ledger. Run after the latest
-- migration, BEFORE deploying this code. Safe to run again. (Fresh databases:
-- supabase-manual-setup.sql already includes it.)
--
-- Adds OrgFundingEntry: append-only, server-only record of money each
-- organization has put in for worker pay. Enforcement is off until the
-- deployment sets PAYOUT_FUNDING_REQUIRED=1, so nothing changes on deploy;
-- record each organization's opening balance first, then turn it on.

CREATE TABLE IF NOT EXISTS "public"."OrgFundingEntry" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgFundingEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrgFundingEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrgFundingEntry_amount_nonzero" CHECK ("amountCents" <> 0),
    CONSTRAINT "OrgFundingEntry_reference_len" CHECK (length("reference") BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgFundingEntry_orgId_reference_key" ON "public"."OrgFundingEntry"("orgId", "reference");
CREATE INDEX IF NOT EXISTS "OrgFundingEntry_orgId_createdAt_idx" ON "public"."OrgFundingEntry"("orgId", "createdAt");
CREATE OR REPLACE TRIGGER "OrgFundingEntry_append_only" BEFORE UPDATE OR DELETE ON "public"."OrgFundingEntry"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "OrgFundingEntry_no_truncate" BEFORE TRUNCATE ON "public"."OrgFundingEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
-- Server-only, like every pay table: RLS on, no policies, no grants.
ALTER TABLE "public"."OrgFundingEntry" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."OrgFundingEntry" FROM anon, authenticated;
