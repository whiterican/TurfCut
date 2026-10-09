-- Turfcut C2 migration — workers decide what each organization sees. Run
-- ONCE, after c1-roles.sql (and rate-limit.sql). Paste into the Supabase SQL
-- editor. (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Changes (approved for C2, Oct 4 and Oct 6). Additive; nothing existing
-- changes, and no organization sees less until a worker narrows sharing:
--   1. WorkerSharing: who sees each scorecard group, availability and
--      credentials (one of three audiences), plus findability. One version
--      per save; no row = the defaults (organizations the worker applied to
--      or accepted an invitation from; not findable).
--   2. WorkerAvailability: the usual week and date exceptions, versioned.
--   3. WorkerCredential: credentials, where an edit or a removal appends a
--      row that supersedes the old one.
-- All three are append-only (triggers) and server-only (RLS on, no policies).

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

CREATE TYPE "public"."ShareAudience" AS ENUM ('RELATIONSHIP', 'ANY_APPROVED_ORG', 'NOBODY');
CREATE TYPE "public"."CredentialKind" AS ENUM ('CIRCULATOR_REGISTRATION', 'NOTARY_OR_AFFIDAVIT', 'TRAINING', 'OTHER');

CREATE TABLE "public"."WorkerSharing" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "outputAudience" "public"."ShareAudience" NOT NULL,
    "qualityAudience" "public"."ShareAudience" NOT NULL,
    "reliabilityAudience" "public"."ShareAudience" NOT NULL,
    "historyAudience" "public"."ShareAudience" NOT NULL,
    "availabilityAudience" "public"."ShareAudience" NOT NULL,
    "credentialsAudience" "public"."ShareAudience" NOT NULL,
    "readReceipts" BOOLEAN NOT NULL DEFAULT false,
    "findable" BOOLEAN NOT NULL DEFAULT false,
    "workTypes" "public"."JobType"[] DEFAULT ARRAY[]::"public"."JobType"[],
    "homeArea" TEXT,
    "travelMiles" INTEGER,
    "consentTextVersion" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerSharing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkerSharing_version_positive" CHECK ("version" > 0),
    CONSTRAINT "WorkerSharing_home_area_length" CHECK ("homeArea" IS NULL OR char_length("homeArea") BETWEEN 1 AND 80),
    CONSTRAINT "WorkerSharing_travel_miles_range" CHECK ("travelMiles" IS NULL OR "travelMiles" BETWEEN 1 AND 500),
    -- Findable needs somewhere to be found from: a typed area and a radius.
    CONSTRAINT "WorkerSharing_findable_shape" CHECK (NOT "findable" OR ("homeArea" IS NOT NULL AND "travelMiles" IS NOT NULL AND cardinality("workTypes") > 0)),
    CONSTRAINT "WorkerSharing_work_types_shape" CHECK ("workTypes" IS NOT NULL AND array_position("workTypes", NULL) IS NULL),
    CONSTRAINT "WorkerSharing_home_area_trimmed" CHECK ("homeArea" IS NULL OR "homeArea" ~ '^\S(.*\S)?$'),
    CONSTRAINT "WorkerSharing_text_version" CHECK ("consentTextVersion" ~ '^\S+$')
);

CREATE TABLE "public"."WorkerAvailability" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "weekly" JSONB NOT NULL,
    "exceptions" JSONB NOT NULL,
    "note" TEXT,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerAvailability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkerAvailability_version_positive" CHECK ("version" > 0),
    CONSTRAINT "WorkerAvailability_shape" CHECK (jsonb_typeof("weekly") = 'object' AND jsonb_typeof("exceptions") = 'array'),
    CONSTRAINT "WorkerAvailability_note_length" CHECK ("note" IS NULL OR char_length("note") <= 500)
);

CREATE TABLE "public"."WorkerCredential" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "kind" "public"."CredentialKind" NOT NULL,
    "label" TEXT,
    "state" TEXT,
    "identifier" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE,
    "verification" "public"."VerificationLevel" NOT NULL DEFAULT 'SELF_REPORTED',
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "proofPath" TEXT,
    "supersedesId" UUID,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerCredential_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkerCredential_state_code" CHECK ("state" IS NULL OR "state" ~ '^[A-Z]{2}$'),
    CONSTRAINT "WorkerCredential_label_length" CHECK ("label" IS NULL OR char_length("label") BETWEEN 1 AND 80),
    CONSTRAINT "WorkerCredential_identifier_length" CHECK ("identifier" IS NULL OR char_length("identifier") BETWEEN 1 AND 64),
    CONSTRAINT "WorkerCredential_dates" CHECK ("issuedOn" IS NULL OR "expiresOn" IS NULL OR "issuedOn" <= "expiresOn"),
    -- Taking a credential down supersedes the row it removes.
    CONSTRAINT "WorkerCredential_removal_supersedes" CHECK (NOT "removed" OR "supersedesId" IS NOT NULL),
    CONSTRAINT "WorkerCredential_not_self" CHECK ("supersedesId" IS NULL OR "supersedesId" <> "id"),
    -- Self-reported means nobody verified it. Anything else says when it was
    -- verified (not in the future) and names the verifier, who is the one
    -- writing the row; the trigger below also refuses the worker as their
    -- own verifier.
    CONSTRAINT "WorkerCredential_verification_shape" CHECK (
      ("verification" = 'SELF_REPORTED' AND "verifiedById" IS NULL AND "verifiedAt" IS NULL)
      OR ("verification" <> 'SELF_REPORTED' AND "verifiedAt" IS NOT NULL AND "verifiedAt" <= "createdAt" + interval '1 minute'
          AND "verifiedById" IS NOT NULL AND "verifiedById" = "actorId")),
    -- A removal records only what it removes: no new content, no verification.
    CONSTRAINT "WorkerCredential_removal_bare" CHECK (NOT "removed" OR (
      "label" IS NULL AND "state" IS NULL AND "identifier" IS NULL AND "issuedOn" IS NULL AND "expiresOn" IS NULL
      AND "proofPath" IS NULL AND "verification" = 'SELF_REPORTED')),
    -- Proof files live under the worker's own folder in credential-proofs.
    CONSTRAINT "WorkerCredential_proof_path" CHECK ("proofPath" IS NULL OR (
      left("proofPath", 37) = "workerId"::text || '/' AND strpos("proofPath", '..') = 0 AND strpos(substr("proofPath", 38), '/') = 0
      AND char_length("proofPath") BETWEEN 38 AND 200))
);

CREATE UNIQUE INDEX "WorkerSharing_workerId_version_key" ON "public"."WorkerSharing"("workerId", "version");
CREATE UNIQUE INDEX "WorkerAvailability_workerId_version_key" ON "public"."WorkerAvailability"("workerId", "version");
CREATE UNIQUE INDEX "WorkerCredential_supersedesId_key" ON "public"."WorkerCredential"("supersedesId");
CREATE INDEX "WorkerCredential_workerId_createdAt_idx" ON "public"."WorkerCredential"("workerId", "createdAt");

ALTER TABLE "public"."WorkerSharing" ADD CONSTRAINT "WorkerSharing_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."WorkerAvailability" ADD CONSTRAINT "WorkerAvailability_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."WorkerCredential" ADD CONSTRAINT "WorkerCredential_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."WorkerCredential" ADD CONSTRAINT "WorkerCredential_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "public"."WorkerCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every row: the database's clock sets createdAt (so time checks can't be
-- fed a chosen time), and nobody verifies their own credential.
-- A row can only supersede an existing credential of the same worker and
-- kind, and nothing supersedes a removal (a removed credential is added again
-- as a new one). An edit can't carry a verification forward: a superseding
-- row that isn't self-reported must have been verified after the row it
-- replaces was written.
CREATE OR REPLACE FUNCTION "turfcut_private"."credential_supersedes_own"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE prev record;
BEGIN
  NEW."createdAt" := clock_timestamp();
  IF NEW."verifiedById" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "public"."Worker" WHERE "id" = NEW."workerId" AND "profileId" = NEW."verifiedById") THEN
    RAISE EXCEPTION 'WorkerCredential: a worker can''t verify their own credential' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."supersedesId" IS NULL THEN RETURN NEW; END IF;
  SELECT "workerId", "kind", "removed", "createdAt" INTO prev FROM "public"."WorkerCredential" WHERE "id" = NEW."supersedesId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WorkerCredential: the credential being superseded doesn''t exist' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF prev."workerId" <> NEW."workerId" THEN
    RAISE EXCEPTION 'WorkerCredential: a row can only supersede the same worker''s credential' USING ERRCODE = 'check_violation';
  END IF;
  IF prev."removed" THEN
    RAISE EXCEPTION 'WorkerCredential: a removed credential can''t be superseded' USING ERRCODE = 'check_violation';
  END IF;
  IF prev."kind" <> NEW."kind" THEN
    RAISE EXCEPTION 'WorkerCredential: an edit or removal keeps the credential''s kind' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW."verification" <> 'SELF_REPORTED' AND NEW."verifiedAt" <= prev."createdAt" THEN
    RAISE EXCEPTION 'WorkerCredential: an edit can''t carry an earlier verification forward' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."credential_supersedes_own"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "WorkerCredential_supersedes_own" BEFORE INSERT ON "public"."WorkerCredential"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."credential_supersedes_own"();

-- Append-only: rows are never changed, removed or wiped (rule 3).
CREATE TRIGGER "WorkerSharing_append_only" BEFORE UPDATE OR DELETE ON "public"."WorkerSharing"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "WorkerSharing_no_truncate" BEFORE TRUNCATE ON "public"."WorkerSharing"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "WorkerAvailability_append_only" BEFORE UPDATE OR DELETE ON "public"."WorkerAvailability"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "WorkerAvailability_no_truncate" BEFORE TRUNCATE ON "public"."WorkerAvailability"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "WorkerCredential_append_only" BEFORE UPDATE OR DELETE ON "public"."WorkerCredential"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "WorkerCredential_no_truncate" BEFORE TRUNCATE ON "public"."WorkerCredential"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Server-only: row-level security on with no policies, nothing granted.
ALTER TABLE "public"."WorkerSharing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WorkerAvailability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WorkerCredential" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."WorkerSharing", "public"."WorkerAvailability", "public"."WorkerCredential" FROM anon, authenticated;

COMMIT;
