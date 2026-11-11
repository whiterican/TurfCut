-- Sector, activity and place of work on jobs (Caden, Nov 10 2026: the
-- private-sector work starts here; data-model change approved).
--
--   * Job.sector: POLITICAL, NONPROFIT or PRIVATE. Stated by the
--     organization, never inferred.
--   * Job.activity: what the work is (the founder's eight activities).
--   * Job.workMode: FIELD, or REMOTE / ONSITE for phone work.
--
-- Job.type (PETITION / CANVASS) stays: it is how the work is counted.
-- Existing jobs are labelled from it and nothing else about them changes.
--
-- Only the two live activities can be stored. The check at the end is the
-- hard stop: a planned activity, another sector or another work mode is
-- refused by the database until the slice that builds it loosens this check
-- in its own reviewed migration. So a sales job can never be stored as
-- canvassing, and nothing planned can be passed off as live.
--
-- Idempotent: safe to run again, in one transaction or as one statement.
-- Also folded into supabase-manual-setup.sql.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "public"."Sector" AS ENUM ('POLITICAL', 'NONPROFIT', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."WorkActivity" AS ENUM ('PETITION_CIRCULATION', 'DOOR_CANVASSING', 'PHONE_BANKING', 'PHONE_POLLING', 'DOOR_POLLING', 'DOOR_FUNDRAISING', 'DOOR_SALES', 'PHONE_SALES');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."WorkMode" AS ENUM ('FIELD', 'REMOTE', 'ONSITE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "public"."Job" ADD COLUMN IF NOT EXISTS "sector" "public"."Sector" NOT NULL DEFAULT 'POLITICAL';
ALTER TABLE "public"."Job" ADD COLUMN IF NOT EXISTS "activity" "public"."WorkActivity";
ALTER TABLE "public"."Job" ADD COLUMN IF NOT EXISTS "workMode" "public"."WorkMode" NOT NULL DEFAULT 'FIELD';

-- A row that arrives without an activity gets the one its type means. (The
-- app names it; this covers every other way a job is written.)
CREATE OR REPLACE FUNCTION "turfcut_private"."job_activity_from_type"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- No activity named, or the counting type changed and the activity was left as it was: the activity follows the type.
  IF NEW."activity" IS NULL OR (TG_OP = 'UPDATE' AND NEW."type" IS DISTINCT FROM OLD."type" AND NEW."activity" IS NOT DISTINCT FROM OLD."activity") THEN
    NEW."activity" := CASE NEW."type"::text WHEN 'PETITION' THEN 'PETITION_CIRCULATION' ELSE 'DOOR_CANVASSING' END::"public"."WorkActivity";
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."job_activity_from_type"() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS "Job_activity_from_type" ON "public"."Job";
CREATE TRIGGER "Job_activity_from_type" BEFORE INSERT OR UPDATE OF "type", "activity" ON "public"."Job"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."job_activity_from_type"();

-- Existing jobs: labelled from their type. Nothing else about them changes.
UPDATE "public"."Job" SET "activity" = CASE "type"::text WHEN 'PETITION' THEN 'PETITION_CIRCULATION' ELSE 'DOOR_CANVASSING' END::"public"."WorkActivity" WHERE "activity" IS NULL;
ALTER TABLE "public"."Job" ALTER COLUMN "activity" SET NOT NULL;

-- The hard stop. What can be stored today, and how type and activity go together:
--   petition circulation = PETITION, political, in the field;
--   door-to-door canvassing = CANVASS, political, in the field.
ALTER TABLE "public"."Job" DROP CONSTRAINT IF EXISTS "Job_activity_live";
ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_activity_live" CHECK (
  "sector"::text = 'POLITICAL' AND "workMode"::text = 'FIELD' AND (
       ("activity"::text = 'PETITION_CIRCULATION' AND "type"::text = 'PETITION')
    OR ("activity"::text = 'DOOR_CANVASSING' AND "type"::text = 'CANVASS')));

CREATE INDEX IF NOT EXISTS "Job_sector_activity_idx" ON "public"."Job"("sector", "activity");

COMMIT;
