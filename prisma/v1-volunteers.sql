-- Turfcut V1 migration: volunteers (docs/product/VOLUNTEERS.md). Run BEFORE
-- deploying the code that uses it. Paste into the Supabase SQL editor. Safe
-- to run again: everything it creates is skipped or replaced when it exists.
-- (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Approved by Caden, Nov 25 2026: "a volunteer system so people can
-- volunteer to knock doors outside of paid gigs". Two schema changes, no
-- new tables. Additive: no existing row changes.
--   1. CompensationMethod gains VOLUNTEER. A volunteer job is a job with no
--      pay. Whether one may be published in a place is its rule profile's
--      call, like any method but hourly (rules.compensationAllowed): no
--      profile lists VOLUNTEER until counsel says so.
--   2. WorkerSharing gains volunteerAudience, default NOBODY: who may see a
--      worker's volunteer history is the worker's own choice, and nobody
--      until they make one.
--
-- The guards below are the database's own, whatever the app does:
--   * a volunteer job has no pay rate;
--   * a published volunteer job is door canvassing, and never in the
--     private sector (a company's work is not volunteered);
--   * no pay line can be written for work on a volunteer job;
--   * a job with people on it cannot turn from paid to volunteer or back:
--     they signed up for one or the other.
--
-- VOLUNTEER is compared as text everywhere here. A value added to an enum
-- cannot be used as that enum until the transaction that added it commits.

BEGIN;

-- Everything below holds a lock on "Job" until COMMIT. Wait a few seconds for it at most, rather than queue every read of jobs behind a long transaction.
SET LOCAL lock_timeout = '5s';

ALTER TYPE "public"."CompensationMethod" ADD VALUE IF NOT EXISTS 'VOLUNTEER';

ALTER TABLE "public"."WorkerSharing" ADD COLUMN IF NOT EXISTS "volunteerAudience" "public"."ShareAudience" NOT NULL DEFAULT 'NOBODY';

ALTER TABLE "public"."Job" DROP CONSTRAINT IF EXISTS "Job_volunteer_no_rate";
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_volunteer_no_rate" CHECK (
  "compensationMethod"::text <> 'VOLUNTEER' OR "payRateCents" IS NULL);

-- A draft may be part-way (the builder saves as it goes); from published on, the pair must hold.
ALTER TABLE "public"."Job" DROP CONSTRAINT IF EXISTS "Job_volunteer_canvass";
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_volunteer_canvass" CHECK (
  "compensationMethod"::text <> 'VOLUNTEER' OR "status"::text = 'DRAFT'
  OR ("type"::text = 'CANVASS' AND "sector"::text <> 'PRIVATE'));

-- No pay line for work on a volunteer job. A line names its engagement, its
-- shift, or both: it is refused if either one belongs to a volunteer job.
CREATE OR REPLACE FUNCTION "turfcut_private"."payout_not_for_volunteer"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "public"."Engagement" e JOIN "public"."Job" j ON j."id" = e."jobId"
     WHERE j."compensationMethod"::text = 'VOLUNTEER'
       AND (e."id" = NEW."engagementId" OR e."id" = (SELECT s."engagementId" FROM "public"."Shift" s WHERE s."id" = NEW."shiftId"))
  ) THEN
    RAISE EXCEPTION 'A volunteer job has no pay: no pay line can be written for it' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."payout_not_for_volunteer"() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS "Payout_not_for_volunteer" ON "public"."Payout";
CREATE TRIGGER "Payout_not_for_volunteer" BEFORE INSERT ON "public"."Payout"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."payout_not_for_volunteer"();

-- People sign up for paid work or for volunteering, never "whichever it turns out to be".
CREATE OR REPLACE FUNCTION "turfcut_private"."job_volunteer_fixed"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF (OLD."compensationMethod"::text = 'VOLUNTEER') IS DISTINCT FROM (NEW."compensationMethod"::text = 'VOLUNTEER')
     AND EXISTS (SELECT 1 FROM "public"."Engagement" e WHERE e."jobId" = NEW."id") THEN
    RAISE EXCEPTION 'A job with people on it can''t change between paid and volunteer' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."job_volunteer_fixed"() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS "Job_volunteer_fixed" ON "public"."Job";
CREATE TRIGGER "Job_volunteer_fixed" BEFORE UPDATE OF "compensationMethod" ON "public"."Job"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."job_volunteer_fixed"();

COMMIT;
