-- PROPOSAL, NOT APPLIED. Turfcut door-to-door polling. Would run after
-- w1-walkbooks.sql (with w1-amendments.sql folded in) and w2-stop-outcomes.sql, BEFORE deploying the code.
-- Safe to run again. (Would also be folded into supabase-manual-setup.sql.)
--
--   1. PollVersion: one version of the poll on a job. Editable while DRAFT;
--      LOCKED is one-way, and a locked version, its questions and its options
--      can no longer change (triggers).
--   2. PollQuestion, PollOption: the questions and answer choices of a version.
--   3. PollResponse: the poll given at one door. APPEND-ONLY (CLAUDE.md rule 3,
--      once Caden adds it to the list). A correction is a new row that
--      supersedes one earlier row.
--   4. PollAnswer: one answer (a choice or a 1-5 scale). APPEND-ONLY. No free
--      text in v1: an append-only row can never be deleted, so text that may
--      hold a respondent's name could not be purged.
--
-- A response points at W2's StopOutcome (the door's outcome, engagement, shift and stop). The 30-day purge deletes only
-- ImportedAddress rows (see w1-amendments.sql), so no poll row, outcome or stop is ever touched by it.
--
-- All of it is server-only: RLS on, no policies, no grants.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN CREATE TYPE "public"."PollVersionStatus" AS ENUM ('DRAFT', 'LOCKED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."PollQuestionKind" AS ENUM ('CHOICE', 'SCALE_5'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "public"."PollCompletion" AS ENUM ('COMPLETE', 'PARTIAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "public"."PollVersion" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "public"."PollVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "conductedBy" TEXT NOT NULL,
    "sponsor" TEXT,
    "disclosure" TEXT NOT NULL,
    "researchAttestedById" UUID,
    "researchAttestedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "PollVersion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PollVersion_version" CHECK ("version" BETWEEN 1 AND 1000),
    CONSTRAINT "PollVersion_title_length" CHECK (char_length("title") BETWEEN 1 AND 200),
    CONSTRAINT "PollVersion_conductedBy_length" CHECK (char_length("conductedBy") BETWEEN 1 AND 200),
    CONSTRAINT "PollVersion_sponsor_length" CHECK ("sponsor" IS NULL OR char_length("sponsor") BETWEEN 1 AND 200),
    CONSTRAINT "PollVersion_disclosure_length" CHECK (char_length("disclosure") BETWEEN 1 AND 2000),
    CONSTRAINT "PollVersion_attestation" CHECK (("researchAttestedById" IS NULL) = ("researchAttestedAt" IS NULL)),
    -- Locked means stamped, and a locked version carries the research-not-persuasion statement.
    CONSTRAINT "PollVersion_locked" CHECK ((("status" = 'LOCKED') = ("lockedAt" IS NOT NULL)) AND ("status" = 'DRAFT' OR "researchAttestedAt" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "PollVersion_jobId_version_key" ON "public"."PollVersion"("jobId", "version");
-- One draft at a time per job.
CREATE UNIQUE INDEX IF NOT EXISTS "PollVersion_one_draft_per_job" ON "public"."PollVersion"("jobId") WHERE "status" = 'DRAFT';
CREATE INDEX IF NOT EXISTS "PollVersion_createdById_idx" ON "public"."PollVersion"("createdById");
CREATE INDEX IF NOT EXISTS "PollVersion_researchAttestedById_idx" ON "public"."PollVersion"("researchAttestedById");

CREATE TABLE IF NOT EXISTS "public"."PollQuestion" (
    "id" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "public"."PollQuestionKind" NOT NULL,
    "text" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PollQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PollQuestion_position" CHECK ("position" BETWEEN 1 AND 100),
    CONSTRAINT "PollQuestion_text_length" CHECK (char_length("text") BETWEEN 1 AND 500)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PollQuestion_versionId_position_key" ON "public"."PollQuestion"("versionId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "PollQuestion_id_versionId_key" ON "public"."PollQuestion"("id", "versionId");

CREATE TABLE IF NOT EXISTS "public"."PollOption" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "pinnedLast" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PollOption_position" CHECK ("position" BETWEEN 1 AND 20),
    CONSTRAINT "PollOption_label_length" CHECK (char_length("label") BETWEEN 1 AND 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PollOption_questionId_position_key" ON "public"."PollOption"("questionId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "PollOption_id_questionId_key" ON "public"."PollOption"("id", "questionId");

CREATE TABLE IF NOT EXISTS "public"."PollResponse" (
    "id" UUID NOT NULL, -- the phone's UUID for this door, also the sync action's clientId: no default
    "versionId" UUID NOT NULL,
    "stopOutcomeId" UUID NOT NULL,
    "completion" "public"."PollCompletion" NOT NULL,
    "disclosureRead" BOOLEAN NOT NULL,
    "actorId" UUID NOT NULL,
    "supersedesId" UUID,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollResponse_pkey" PRIMARY KEY ("id"),
    -- No poll without the disclosure having been read: a door where it wasn't has no response row at all.
    CONSTRAINT "PollResponse_disclosure" CHECK ("disclosureRead"),
    -- A response that supersedes itself would drop its own door from every count, and an append-only row can't be repaired.
    -- (Longer loops can't form: a row can only point at a row that already exists, and rows never change.)
    CONSTRAINT "PollResponse_not_self" CHECK ("supersedesId" IS NULL OR "supersedesId" <> "id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PollResponse_stopOutcomeId_key" ON "public"."PollResponse"("stopOutcomeId");
CREATE UNIQUE INDEX IF NOT EXISTS "PollResponse_supersedesId_key" ON "public"."PollResponse"("supersedesId");
CREATE UNIQUE INDEX IF NOT EXISTS "PollResponse_id_versionId_key" ON "public"."PollResponse"("id", "versionId");
CREATE UNIQUE INDEX IF NOT EXISTS "PollResponse_supersedesId_versionId_key" ON "public"."PollResponse"("supersedesId", "versionId");
CREATE INDEX IF NOT EXISTS "PollResponse_versionId_createdAt_idx" ON "public"."PollResponse"("versionId", "createdAt");
CREATE INDEX IF NOT EXISTS "PollResponse_actorId_idx" ON "public"."PollResponse"("actorId");

CREATE TABLE IF NOT EXISTS "public"."PollAnswer" (
    "id" UUID NOT NULL,
    "responseId" UUID NOT NULL,
    "versionId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "optionId" UUID,
    "scale" INTEGER,

    CONSTRAINT "PollAnswer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PollAnswer_one_value" CHECK (num_nonnulls("optionId", "scale") = 1),
    CONSTRAINT "PollAnswer_scale" CHECK ("scale" IS NULL OR "scale" BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PollAnswer_responseId_questionId_key" ON "public"."PollAnswer"("responseId", "questionId");
CREATE INDEX IF NOT EXISTS "PollAnswer_versionId_questionId_optionId_idx" ON "public"."PollAnswer"("versionId", "questionId", "optionId");

-- Keys. Everything RESTRICT. The composite keys make the database itself refuse an answer whose
-- question is on another version, whose option is on another question, or whose response is on another version.
DO $$ BEGIN
  ALTER TABLE "public"."PollVersion" ADD CONSTRAINT "PollVersion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollVersion" ADD CONSTRAINT "PollVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollVersion" ADD CONSTRAINT "PollVersion_researchAttestedById_fkey" FOREIGN KEY ("researchAttestedById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollQuestion" ADD CONSTRAINT "PollQuestion_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."PollVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollOption" ADD CONSTRAINT "PollOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."PollQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollResponse" ADD CONSTRAINT "PollResponse_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "public"."PollVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- W2's table (w2-stop-outcomes.sql).
DO $$ BEGIN
  ALTER TABLE "public"."PollResponse" ADD CONSTRAINT "PollResponse_stopOutcomeId_fkey" FOREIGN KEY ("stopOutcomeId") REFERENCES "public"."StopOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollResponse" ADD CONSTRAINT "PollResponse_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollResponse" ADD CONSTRAINT "PollResponse_supersedes_fkey" FOREIGN KEY ("supersedesId", "versionId") REFERENCES "public"."PollResponse"("id", "versionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollAnswer" ADD CONSTRAINT "PollAnswer_response_fkey" FOREIGN KEY ("responseId", "versionId") REFERENCES "public"."PollResponse"("id", "versionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollAnswer" ADD CONSTRAINT "PollAnswer_question_fkey" FOREIGN KEY ("questionId", "versionId") REFERENCES "public"."PollQuestion"("id", "versionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- optionId NULL (a scale answer) skips this key by design (MATCH SIMPLE).
DO $$ BEGIN
  ALTER TABLE "public"."PollAnswer" ADD CONSTRAINT "PollAnswer_option_fkey" FOREIGN KEY ("optionId", "questionId") REFERENCES "public"."PollOption"("id", "questionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A published poll can't change. A version is born a DRAFT, and locking is one-way: DRAFT -> LOCKED once, then no UPDATE or
-- DELETE. It can lock only with a usable shape, because after that nothing can be fixed: at least one question, every
-- CHOICE question with at least two options, no SCALE_5 question with options. (The UPDATE holds the version row, so the
-- question and option triggers below, which take FOR SHARE on it, wait for the lock and then see LOCKED.)
CREATE OR REPLACE FUNCTION "turfcut_private"."poll_version_lock"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'PollVersion: a version is created as a DRAFT and locked afterwards' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" = 'LOCKED' THEN
    RAISE EXCEPTION 'PollVersion % is locked: % is not allowed', OLD."id", TG_OP USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW."status" = 'LOCKED' THEN
    IF NOT EXISTS (SELECT 1 FROM "public"."PollQuestion" WHERE "versionId" = OLD."id") THEN
      RAISE EXCEPTION 'PollVersion % can not lock: it has no questions', OLD."id" USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM "public"."PollQuestion" q
       WHERE q."versionId" = OLD."id"
         AND ((q."kind" = 'CHOICE' AND (SELECT count(*) FROM "public"."PollOption" o WHERE o."questionId" = q."id") < 2)
           OR (q."kind" = 'SCALE_5' AND EXISTS (SELECT 1 FROM "public"."PollOption" o WHERE o."questionId" = q."id")))
    ) THEN
      RAISE EXCEPTION 'PollVersion % can not lock: a CHOICE question needs at least two options and a SCALE_5 question none', OLD."id" USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."poll_version_lock"() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER "PollVersion_lock" BEFORE INSERT OR UPDATE OR DELETE ON "public"."PollVersion"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."poll_version_lock"();

-- Questions and options of a locked version can't be added, changed or removed. FOR SHARE on the version row:
-- an edit that arrives while a lock is in flight waits for it to commit, then sees LOCKED and is refused.
CREATE OR REPLACE FUNCTION "turfcut_private"."poll_question_lock"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE s "public"."PollVersionStatus"; vid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN vid := NEW."versionId";
  ELSIF TG_OP = 'DELETE' THEN vid := OLD."versionId";
  ELSE
    IF NEW."versionId" IS DISTINCT FROM OLD."versionId" THEN
      RAISE EXCEPTION 'PollQuestion % can not move to another version', OLD."id" USING ERRCODE = 'insufficient_privilege';
    END IF;
    vid := OLD."versionId";
  END IF;
  SELECT "status" INTO s FROM "public"."PollVersion" WHERE "id" = vid FOR SHARE;
  IF s = 'LOCKED' THEN
    RAISE EXCEPTION 'PollVersion % is locked: % of its questions is not allowed', vid, TG_OP USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."poll_question_lock"() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER "PollQuestion_lock" BEFORE INSERT OR UPDATE OR DELETE ON "public"."PollQuestion"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."poll_question_lock"();

CREATE OR REPLACE FUNCTION "turfcut_private"."poll_option_lock"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE s "public"."PollVersionStatus"; qid uuid; vid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN qid := NEW."questionId";
  ELSIF TG_OP = 'DELETE' THEN qid := OLD."questionId";
  ELSE
    IF NEW."questionId" IS DISTINCT FROM OLD."questionId" THEN
      RAISE EXCEPTION 'PollOption % can not move to another question', OLD."id" USING ERRCODE = 'insufficient_privilege';
    END IF;
    qid := OLD."questionId";
  END IF;
  SELECT "versionId" INTO vid FROM "public"."PollQuestion" WHERE "id" = qid;
  SELECT "status" INTO s FROM "public"."PollVersion" WHERE "id" = vid FOR SHARE;
  IF s = 'LOCKED' THEN
    RAISE EXCEPTION 'PollVersion % is locked: % of its options is not allowed', vid, TG_OP USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."poll_option_lock"() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER "PollOption_lock" BEFORE INSERT OR UPDATE OR DELETE ON "public"."PollOption"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."poll_option_lock"();

-- A poll response can only go on a locked version, for a door on the same job as the poll (checked through BOTH the stop
-- outcome's engagement and the stop's walkbook: W2's SQL doesn't tie the two together), and only for an outcome a poll can have: COMPLETE needs DONE; PARTIAL needs COME_BACK or REFUSED. A correction
-- must be on the same stop as the response it supersedes (W2: the newest outcome row for a stop is its state now).
CREATE OR REPLACE FUNCTION "turfcut_private"."poll_response_scope"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE s "public"."PollVersionStatus"; poll_job uuid; door_job uuid; stop_job uuid; door_outcome "public"."StopOutcomeKind"; door_stop uuid; old_stop uuid;
BEGIN
  SELECT "status", "jobId" INTO s, poll_job FROM "public"."PollVersion" WHERE "id" = NEW."versionId";
  IF s IS DISTINCT FROM 'LOCKED' THEN
    RAISE EXCEPTION 'PollResponse: version % is not locked', NEW."versionId" USING ERRCODE = 'check_violation';
  END IF;
  SELECT e."jobId", w."jobId", so."outcome", so."stopId" INTO door_job, stop_job, door_outcome, door_stop
    FROM "public"."StopOutcome" so
    JOIN "public"."Engagement" e ON e."id" = so."engagementId"
    JOIN "public"."WalkbookStop" ws ON ws."id" = so."stopId"
    JOIN "public"."Walkbook" w ON w."id" = ws."walkbookId"
   WHERE so."id" = NEW."stopOutcomeId";
  IF door_job IS DISTINCT FROM poll_job OR stop_job IS DISTINCT FROM poll_job THEN
    RAISE EXCEPTION 'PollResponse: the door (its engagement and its walkbook) and the poll version are not all on the same job' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."completion" = 'COMPLETE' AND door_outcome <> 'DONE' THEN
    RAISE EXCEPTION 'PollResponse: a COMPLETE poll needs a DONE stop outcome' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."completion" = 'PARTIAL' AND door_outcome NOT IN ('COME_BACK', 'REFUSED') THEN
    RAISE EXCEPTION 'PollResponse: a PARTIAL poll needs a COME_BACK or REFUSED stop outcome' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."supersedesId" IS NOT NULL THEN
    SELECT so."stopId" INTO old_stop
      FROM "public"."PollResponse" r
      JOIN "public"."StopOutcome" so ON so."id" = r."stopOutcomeId"
     WHERE r."id" = NEW."supersedesId";
    IF old_stop IS NOT NULL AND old_stop IS DISTINCT FROM door_stop THEN
      RAISE EXCEPTION 'PollResponse: a correction must be on the same stop as the response it supersedes' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."poll_response_scope"() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER "PollResponse_scope" BEFORE INSERT ON "public"."PollResponse"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."poll_response_scope"();

-- A choice question takes an option, a scale question takes a scale.
CREATE OR REPLACE FUNCTION "turfcut_private"."poll_answer_shape"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE k "public"."PollQuestionKind";
BEGIN
  SELECT "kind" INTO k FROM "public"."PollQuestion" WHERE "id" = NEW."questionId";
  IF (k = 'CHOICE' AND NEW."optionId" IS NULL) OR (k = 'SCALE_5' AND NEW."scale" IS NULL) THEN
    RAISE EXCEPTION 'PollAnswer: a % question does not take this kind of answer', k USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."poll_answer_shape"() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER "PollAnswer_shape" BEFORE INSERT ON "public"."PollAnswer"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."poll_answer_shape"();

-- Append-only (rule 3): what was answered at a door is history. Needs turfcut_private.append_only() from m4-migration.sql.
CREATE OR REPLACE TRIGGER "PollResponse_append_only" BEFORE UPDATE OR DELETE ON "public"."PollResponse"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollAnswer_append_only" BEFORE UPDATE OR DELETE ON "public"."PollAnswer"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollVersion_no_truncate" BEFORE TRUNCATE ON "public"."PollVersion"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollQuestion_no_truncate" BEFORE TRUNCATE ON "public"."PollQuestion"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollOption_no_truncate" BEFORE TRUNCATE ON "public"."PollOption"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollResponse_no_truncate" BEFORE TRUNCATE ON "public"."PollResponse"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollAnswer_no_truncate" BEFORE TRUNCATE ON "public"."PollAnswer"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Server-only: no grants, no policies (deny by default).
ALTER TABLE "public"."PollVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PollQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PollOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PollResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PollAnswer" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."PollVersion", "public"."PollQuestion", "public"."PollOption", "public"."PollResponse", "public"."PollAnswer" FROM anon, authenticated;

COMMIT;
