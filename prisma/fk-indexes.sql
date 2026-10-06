-- Turfcut foreign-key indexes — the nine foreign keys Supabase's performance
-- advisor flagged as having no covering index. Lookups and joins on these
-- columns (a worker's engagements and disputes, an org's members, a sender's
-- messages, a pay line's adjustments) and the checks Postgres runs on
-- delete stop scanning the whole table. Indexes only: no rows change, so the
-- append-only rules are untouched. Safe to re-run. Paste into the Supabase
-- SQL editor. (Fresh databases: supabase-manual-setup.sql already has them.)

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS "Profile_orgId_idx" ON "public"."Profile"("orgId");
CREATE INDEX IF NOT EXISTS "Job_jurisdictionId_idx" ON "public"."Job"("jurisdictionId");
CREATE INDEX IF NOT EXISTS "Engagement_workerId_idx" ON "public"."Engagement"("workerId");
CREATE INDEX IF NOT EXISTS "Engagement_hiredById_idx" ON "public"."Engagement"("hiredById");
CREATE INDEX IF NOT EXISTS "Payout_engagementId_idx" ON "public"."Payout"("engagementId");
CREATE INDEX IF NOT EXISTS "Payout_adjustsId_idx" ON "public"."Payout"("adjustsId");
CREATE INDEX IF NOT EXISTS "PayDispute_workerId_idx" ON "public"."PayDispute"("workerId");
CREATE INDEX IF NOT EXISTS "PayDispute_payoutId_idx" ON "public"."PayDispute"("payoutId");
CREATE INDEX IF NOT EXISTS "Message_senderId_idx" ON "public"."Message"("senderId");

COMMIT;
