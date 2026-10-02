-- Turfcut M5 migration — review and in-app payouts. Run ONCE, after the M4
-- migrations. Paste into the Supabase SQL editor. (Fresh databases:
-- supabase-manual-setup.sql already includes it.)
--
-- Changes (approved for M5):
--   1. Payout becomes an immutable pay line: organization, shift, the
--      supervisor approval it pays for, kind (shift pay or adjustment), the
--      frozen calculation, and the line an adjustment corrects. Its status
--      moves to the new PayoutEvent log (payouts are append-only), so the
--      old "status" and "stripeTransferId" columns are copied into that log
--      and then dropped.
--   2. New append-only tables: PayoutEvent (status history), PayoutTransfer
--      (one Stripe transfer per worker per pay run), PayDispute and
--      PayDisputeResolution, ProviderEvent (Stripe webhooks already handled).
--   3. Worker: Stripe Connect account id and whether payouts are switched on.
--   4. Integrity: amount-sign checks, and triggers that refuse UPDATE/DELETE
--      on every payout table. RLS on every new table, with no policies: only
--      the server (as `postgres`) reads or writes them.
--
-- Needs the turfcut_private.append_only() trigger function from
-- m4-migration.sql. The migration stops without changing anything if an
-- existing payout can't be traced to an organization through its
-- engagement, or has a negative amount. It gives up after waiting 5 seconds
-- for a busy table (nothing changes); run it again.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE orphans INTEGER; negatives INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphans FROM "public"."Payout" p
   WHERE NOT EXISTS (SELECT 1 FROM "public"."Engagement" e JOIN "public"."Job" j ON j."id" = e."jobId" WHERE e."id" = p."engagementId");
  IF orphans > 0 THEN
    RAISE EXCEPTION 'M5 migration stopped: % payout(s) have no engagement, so their organization is unknown. Resolve them before re-running.', orphans;
  END IF;
  SELECT COUNT(*) INTO negatives FROM "public"."Payout" WHERE "amountCents" < 0;
  IF negatives > 0 THEN
    RAISE EXCEPTION 'M5 migration stopped: % payout(s) have a negative amount, which shift pay can''t be. Resolve them before re-running.', negatives;
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "public"."PayoutKind" AS ENUM ('SHIFT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."PayoutEventType" AS ENUM ('APPROVED', 'HELD', 'RELEASED', 'VOIDED', 'TRANSFER_STARTED', 'PAID', 'TRANSFER_FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "public"."DisputeOutcome" AS ENUM ('KEPT', 'ADJUSTED', 'REREVIEWED');

-- AlterTable
ALTER TABLE "public"."Worker" ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payoutsCheckedAt" TIMESTAMP(3);

-- AlterTable (orgId is filled below, then made NOT NULL)
ALTER TABLE "public"."Payout" ADD COLUMN     "orgId" UUID,
ADD COLUMN     "shiftId" UUID,
ADD COLUMN     "validationId" UUID,
ADD COLUMN     "kind" "public"."PayoutKind" NOT NULL DEFAULT 'SHIFT',
ADD COLUMN     "basis" JSONB,
ADD COLUMN     "adjustsId" UUID,
ADD COLUMN     "createdById" UUID;

-- CreateTable
CREATE TABLE "public"."PayoutEvent" (
    "id" UUID NOT NULL,
    "payoutId" UUID NOT NULL,
    "type" "public"."PayoutEventType" NOT NULL,
    "actorId" UUID,
    "reason" TEXT,
    "transferId" UUID,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayoutTransfer" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "destination" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayDispute" (
    "id" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "payoutId" UUID,
    "openedById" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PayDisputeResolution" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "outcome" "public"."DisputeOutcome" NOT NULL,
    "response" TEXT NOT NULL,
    "resolvedById" UUID NOT NULL,
    "adjustmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayDisputeResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProviderEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- Backfill existing payouts (rows are filled once here, before the
-- append-only trigger exists). Organization from the engagement's job; the
-- shift and its approval only when the engagement has exactly one shift.
UPDATE "public"."Payout" p SET "orgId" = j."orgId"
  FROM "public"."Engagement" e JOIN "public"."Job" j ON j."id" = e."jobId"
 WHERE e."id" = p."engagementId";
UPDATE "public"."Payout" p SET
  "shiftId" = s."id",
  -- The shift's latest review, when that review approved it — and only for
  -- the engagement's one payout (one shift line per approval).
  "validationId" = CASE WHEN (SELECT COUNT(*) FROM "public"."Payout" p2 WHERE p2."engagementId" = p."engagementId") = 1 THEN
                     (SELECT v."id" FROM (SELECT * FROM "public"."Validation" v0
                       WHERE v0."shiftId" = s."id" AND v0."workEventId" IS NULL
                       ORDER BY v0."createdAt" DESC LIMIT 1) v WHERE v."status" = 'APPROVED') END
  FROM "public"."Shift" s
 WHERE s."engagementId" = p."engagementId"
   AND (SELECT COUNT(*) FROM "public"."Shift" s2 WHERE s2."engagementId" = p."engagementId") = 1;
UPDATE "public"."Payout" SET "basis" = '{"legacy": true, "formula": "Recorded before in-app payouts; no saved calculation"}'::jsonb;

-- The old status, as history: PAID → approved + paid. Unpaid pre-M5 lines
-- (PENDING, APPROVED, DISPUTED) have no saved calculation and no record of
-- who approved them, so they come over on hold with no approval: finance
-- checks the amount and releases it, and then it needs a fresh approval —
-- by two people, like every other line — before a pay run can include it.
INSERT INTO "public"."PayoutEvent" ("id", "payoutId", "type", "reason", "createdAt")
SELECT gen_random_uuid(), p."id", 'APPROVED', 'Status before in-app payouts', p."createdAt"
  FROM "public"."Payout" p WHERE p."status" = 'PAID';
INSERT INTO "public"."PayoutEvent" ("id", "payoutId", "type", "reason", "providerRef", "createdAt")
SELECT gen_random_uuid(), p."id", 'PAID', 'Status before in-app payouts', p."stripeTransferId", p."createdAt" + interval '1 millisecond'
  FROM "public"."Payout" p WHERE p."status" = 'PAID';
INSERT INTO "public"."PayoutEvent" ("id", "payoutId", "type", "reason", "createdAt")
SELECT gen_random_uuid(), p."id", 'HELD',
       CASE WHEN p."status" = 'DISPUTED' THEN 'Disputed before in-app payouts: check it, then release it for a fresh approval'
            ELSE 'Recorded before in-app payouts: check the amount, then release it for a fresh approval' END,
       p."createdAt" + interval '1 millisecond'
  FROM "public"."Payout" p WHERE p."status" IN ('APPROVED', 'DISPUTED', 'PENDING');

ALTER TABLE "public"."Payout" ALTER COLUMN "orgId" SET NOT NULL;

-- DropIndex
DROP INDEX "public"."Payout_workerId_status_idx";

-- AlterTable (copied into PayoutEvent above)
ALTER TABLE "public"."Payout" DROP COLUMN "status",
DROP COLUMN "stripeTransferId";

-- DropEnum
DROP TYPE "public"."PayoutStatus";

-- CreateIndex
CREATE UNIQUE INDEX "Worker_stripeAccountId_key" ON "public"."Worker"("stripeAccountId");

-- CreateIndex
CREATE INDEX "Payout_workerId_createdAt_idx" ON "public"."Payout"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_orgId_createdAt_idx" ON "public"."Payout"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_shiftId_idx" ON "public"."Payout"("shiftId");

-- CreateIndex
CREATE INDEX "PayoutEvent_payoutId_createdAt_idx" ON "public"."PayoutEvent"("payoutId", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutEvent_transferId_idx" ON "public"."PayoutEvent"("transferId");

-- CreateIndex
CREATE INDEX "PayoutTransfer_orgId_createdAt_idx" ON "public"."PayoutTransfer"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "PayoutTransfer_workerId_createdAt_idx" ON "public"."PayoutTransfer"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "PayDispute_orgId_createdAt_idx" ON "public"."PayDispute"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "PayDispute_shiftId_idx" ON "public"."PayDispute"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "PayDisputeResolution_disputeId_key" ON "public"."PayDisputeResolution"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayDisputeResolution_adjustmentId_key" ON "public"."PayDisputeResolution"("adjustmentId");

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_validationId_fkey" FOREIGN KEY ("validationId") REFERENCES "public"."Validation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_adjustsId_fkey" FOREIGN KEY ("adjustsId") REFERENCES "public"."Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayoutEvent" ADD CONSTRAINT "PayoutEvent_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "public"."Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayoutEvent" ADD CONSTRAINT "PayoutEvent_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "public"."PayoutTransfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayoutTransfer" ADD CONSTRAINT "PayoutTransfer_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayoutTransfer" ADD CONSTRAINT "PayoutTransfer_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "public"."Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDisputeResolution" ADD CONSTRAINT "PayDisputeResolution_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "public"."PayDispute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PayDisputeResolution" ADD CONSTRAINT "PayDisputeResolution_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "public"."Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- Security (M5): payout integrity, append-only, RLS ----

-- Shape checks.
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_kind_shape" CHECK (
  ("kind" = 'SHIFT' AND "amountCents" >= 0 AND "adjustsId" IS NULL)
  OR ("kind" = 'ADJUSTMENT' AND "amountCents" <> 0 AND ("adjustsId" IS NOT NULL OR "shiftId" IS NOT NULL)));
ALTER TABLE "public"."PayoutTransfer" ADD CONSTRAINT "PayoutTransfer_amount_positive" CHECK ("amountCents" > 0);
ALTER TABLE "public"."PayDispute" ADD CONSTRAINT "PayDispute_reason_length" CHECK (char_length("reason") BETWEEN 1 AND 1000);
ALTER TABLE "public"."PayDisputeResolution" ADD CONSTRAINT "PayDisputeResolution_response_length" CHECK (char_length("response") BETWEEN 1 AND 1000);
ALTER TABLE "public"."PayDisputeResolution" ADD CONSTRAINT "PayDisputeResolution_adjustment_shape" CHECK (("outcome" = 'ADJUSTED') = ("adjustmentId" IS NOT NULL));
-- One shift pay line per supervisor approval (a double-click can't pay twice).
CREATE UNIQUE INDEX "Payout_shift_validation_key" ON "public"."Payout"("validationId") WHERE "kind" = 'SHIFT';

-- Append-only, enforced by the database (the function is M4's).
CREATE TRIGGER "Payout_append_only" BEFORE UPDATE OR DELETE ON "public"."Payout"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayoutEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."PayoutEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayoutTransfer_append_only" BEFORE UPDATE OR DELETE ON "public"."PayoutTransfer"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayDispute_append_only" BEFORE UPDATE OR DELETE ON "public"."PayDispute"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayDisputeResolution_append_only" BEFORE UPDATE OR DELETE ON "public"."PayDisputeResolution"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "ProviderEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."ProviderEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();

CREATE TRIGGER "Payout_no_truncate" BEFORE TRUNCATE ON "public"."Payout"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayoutEvent_no_truncate" BEFORE TRUNCATE ON "public"."PayoutEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayoutTransfer_no_truncate" BEFORE TRUNCATE ON "public"."PayoutTransfer"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayDispute_no_truncate" BEFORE TRUNCATE ON "public"."PayDispute"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "PayDisputeResolution_no_truncate" BEFORE TRUNCATE ON "public"."PayDisputeResolution"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "ProviderEvent_no_truncate" BEFORE TRUNCATE ON "public"."ProviderEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- RLS: deny-by-default; no policies, no grants. Pay records are read and
-- written only by the server.
ALTER TABLE "public"."PayoutEvent"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PayoutTransfer"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PayDispute"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PayDisputeResolution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProviderEvent"        ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."PayoutEvent", "public"."PayoutTransfer", "public"."PayDispute",
  "public"."PayDisputeResolution", "public"."ProviderEvent" FROM anon, authenticated;

COMMIT;
