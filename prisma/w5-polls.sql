-- Turfcut W5 migration — polling at the door. Run after w2-stop-outcomes.sql,
-- BEFORE deploying this code. Paste into the Supabase SQL editor. Safe to run
-- again. (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Approved by Caden, Nov 17 2026 (CLAUDE.md rule 8). Additive; no existing
-- table or row changes.
--
-- A poll is a set of questions on a canvass job, each with fixed answer
-- choices, answered by residents at the door and recorded by the worker
-- holding the book. Poll answers are what a resident said, so they are
-- handled as sensitive: server-only, closed in shape, never inferred, never
-- scored (CLAUDE.md rules 4 and 5).
--
--   1. PollQuestion: a job's question. Append-only (rule 3): changing a
--      question adds a new one that supersedes the old; the old stays, with
--      the answers given to it. A question is "current" when no other
--      question supersedes it.
--   2. PollChoice: one fixed answer choice of a question. Append-only.
--   3. PollAnswer: one answer to one question at one stop: a choice, or
--      "declined". Append-only: an edit is a new row and the newest row for a
--      stop and question is the answer now; every earlier answer, who gave it
--      and when, stays. There is no free-text column anywhere, so no note
--      about a person can be stored. engagementId is null for an answer
--      edited by staff.
--
-- All three are server-only: RLS on, no policies, no grants.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "public"."PollQuestion" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "supersedesId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollQuestion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PollQuestion_position" CHECK ("position" BETWEEN 1 AND 10),
    CONSTRAINT "PollQuestion_prompt_length" CHECK (char_length("prompt") BETWEEN 1 AND 200),
    CONSTRAINT "PollQuestion_not_self" CHECK ("supersedesId" IS DISTINCT FROM "id")
);
CREATE INDEX IF NOT EXISTS "PollQuestion_jobId_position_idx" ON "public"."PollQuestion"("jobId", "position");
CREATE INDEX IF NOT EXISTS "PollQuestion_createdById_idx" ON "public"."PollQuestion"("createdById");
-- A question is superseded at most once, so the chain of versions never forks.
CREATE UNIQUE INDEX IF NOT EXISTS "PollQuestion_supersedesId_key" ON "public"."PollQuestion"("supersedesId");

CREATE TABLE IF NOT EXISTS "public"."PollChoice" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "PollChoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PollChoice_position" CHECK ("position" BETWEEN 1 AND 8),
    CONSTRAINT "PollChoice_label_length" CHECK (char_length("label") BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX IF NOT EXISTS "PollChoice_questionId_position_key" ON "public"."PollChoice"("questionId", "position");
-- So an answer can name a choice together with its question, and the database refuses a choice that belongs to another question.
CREATE UNIQUE INDEX IF NOT EXISTS "PollChoice_id_questionId_key" ON "public"."PollChoice"("id", "questionId");

CREATE TABLE IF NOT EXISTS "public"."PollAnswer" (
    "id" UUID NOT NULL,
    "stopId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "choiceId" UUID,
    "declined" BOOLEAN NOT NULL DEFAULT false,
    "engagementId" UUID,
    "recordedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollAnswer_pkey" PRIMARY KEY ("id"),
    -- Exactly one of a choice and "declined".
    CONSTRAINT "PollAnswer_choice_or_declined" CHECK (("choiceId" IS NOT NULL) <> "declined")
);
CREATE INDEX IF NOT EXISTS "PollAnswer_stopId_questionId_createdAt_idx" ON "public"."PollAnswer"("stopId", "questionId", "createdAt");
CREATE INDEX IF NOT EXISTS "PollAnswer_questionId_idx" ON "public"."PollAnswer"("questionId");
CREATE INDEX IF NOT EXISTS "PollAnswer_engagementId_idx" ON "public"."PollAnswer"("engagementId");
CREATE INDEX IF NOT EXISTS "PollAnswer_recordedById_idx" ON "public"."PollAnswer"("recordedById");

DO $$ BEGIN
  ALTER TABLE "public"."PollQuestion" ADD CONSTRAINT "PollQuestion_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollQuestion" ADD CONSTRAINT "PollQuestion_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "public"."PollQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollQuestion" ADD CONSTRAINT "PollQuestion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollChoice" ADD CONSTRAINT "PollChoice_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."PollQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollAnswer" ADD CONSTRAINT "PollAnswer_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "public"."WalkbookStop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollAnswer" ADD CONSTRAINT "PollAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."PollQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- A choice goes with its own question (a null choice, "declined", is not checked).
DO $$ BEGIN
  ALTER TABLE "public"."PollAnswer" ADD CONSTRAINT "PollAnswer_choiceId_questionId_fkey" FOREIGN KEY ("choiceId", "questionId") REFERENCES "public"."PollChoice"("id", "questionId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollAnswer" ADD CONSTRAINT "PollAnswer_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "public"."PollAnswer" ADD CONSTRAINT "PollAnswer_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Append-only (rule 3). Needs turfcut_private.append_only() from m4-migration.sql.
CREATE OR REPLACE TRIGGER "PollQuestion_append_only" BEFORE UPDATE OR DELETE ON "public"."PollQuestion"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollQuestion_no_truncate" BEFORE TRUNCATE ON "public"."PollQuestion"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollChoice_append_only" BEFORE UPDATE OR DELETE ON "public"."PollChoice"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollChoice_no_truncate" BEFORE TRUNCATE ON "public"."PollChoice"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollAnswer_append_only" BEFORE UPDATE OR DELETE ON "public"."PollAnswer"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PollAnswer_no_truncate" BEFORE TRUNCATE ON "public"."PollAnswer"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

ALTER TABLE "public"."PollQuestion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PollChoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PollAnswer" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."PollQuestion", "public"."PollChoice", "public"."PollAnswer" FROM anon, authenticated;

COMMIT;
