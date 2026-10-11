-- Turfcut S1 migration — campaign profiles and posts (the social layer,
-- campaign side). Run AFTER the pending queue (the M5/M6 live SQL, then the
-- C1–C4 files in order), BEFORE deploying the S1 code. Paste into the
-- Supabase SQL editor. Safe to run again: everything it creates is skipped
-- or replaced when it already exists.
-- (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Changes (approved for S1, Oct 11). Additive; nothing existing changes:
--   1. CampaignProfile: a campaign's public page (handle, name, bio, images,
--      published or draft). An organization may run several.
--   2. CampaignPost: posts up to 500 characters, optionally embedding one of
--      the organization's jobs; pinned posts are the talking points.
--   3. CampaignPostRevision: every version of a post, append-only.
--   4. Job.campaignProfileId: the campaign a job works for.
--
-- Reads: published profiles of approved organizations, and their live
-- posts, are readable by anyone through the Data API, column by column
-- (never who wrote or deleted a post). Writes: the app's server only, scoped
-- to the organization in code; nothing is granted to the API roles for
-- writing (deny by default).
--
-- Re-running prisma/m4-0-rls-lockdown.sql restores these read grants itself.
-- Re-running prisma/m4-migration.sql takes anon's use of "turfcut_private"
-- back: re-run this file after it.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "public"."CampaignProfile" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "avatarKey" TEXT,
    "headerKey" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CampaignProfile_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CampaignProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignProfile_handle_shape" CHECK ("handle" ~ '^[a-z0-9_]{3,30}$'),
    CONSTRAINT "CampaignProfile_displayName_length" CHECK (char_length("displayName") BETWEEN 1 AND 80),
    CONSTRAINT "CampaignProfile_bio_length" CHECK (char_length("bio") <= 4000)
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignProfile_handle_key" ON "public"."CampaignProfile"("handle");
CREATE INDEX IF NOT EXISTS "CampaignProfile_orgId_idx" ON "public"."CampaignProfile"("orgId");

CREATE TABLE IF NOT EXISTS "public"."CampaignPost" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "jobId" UUID,
    "pinnedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    CONSTRAINT "CampaignPost_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CampaignPost_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."CampaignProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignPost_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignPost_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignPost_body_length" CHECK (char_length("body") BETWEEN 1 AND 500 AND btrim("body") <> ''),
    CONSTRAINT "CampaignPost_deleted_pair" CHECK (("deletedAt" IS NULL) = ("deletedById" IS NULL)),
    -- A deleted post isn't pinned (the talking points are live posts).
    CONSTRAINT "CampaignPost_deleted_unpinned" CHECK ("deletedAt" IS NULL OR "pinnedAt" IS NULL)
);
CREATE INDEX IF NOT EXISTS "CampaignPost_profileId_createdAt_idx" ON "public"."CampaignPost"("profileId", "createdAt");
CREATE INDEX IF NOT EXISTS "CampaignPost_jobId_idx" ON "public"."CampaignPost"("jobId");
CREATE INDEX IF NOT EXISTS "CampaignPost_authorId_idx" ON "public"."CampaignPost"("authorId");
CREATE INDEX IF NOT EXISTS "CampaignPost_deletedById_idx" ON "public"."CampaignPost"("deletedById");

CREATE TABLE IF NOT EXISTS "public"."CampaignPostRevision" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "jobId" UUID, -- a snapshot of the embed at that version (no FK: history, not a link)
    "editorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CampaignPostRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CampaignPostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."CampaignPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignPostRevision_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignPostRevision_body_length" CHECK (char_length("body") BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS "CampaignPostRevision_postId_createdAt_idx" ON "public"."CampaignPostRevision"("postId", "createdAt");
CREATE INDEX IF NOT EXISTS "CampaignPostRevision_editorId_idx" ON "public"."CampaignPostRevision"("editorId");
CREATE OR REPLACE TRIGGER "CampaignPostRevision_append_only" BEFORE UPDATE OR DELETE ON "public"."CampaignPostRevision"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "CampaignPostRevision_no_truncate" BEFORE TRUNCATE ON "public"."CampaignPostRevision"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

ALTER TABLE "public"."Job" ADD COLUMN IF NOT EXISTS "campaignProfileId" UUID;
CREATE INDEX IF NOT EXISTS "Job_campaignProfileId_idx" ON "public"."Job"("campaignProfileId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Job_campaignProfileId_fkey') THEN
    ALTER TABLE "public"."Job" ADD CONSTRAINT "Job_campaignProfileId_fkey" FOREIGN KEY ("campaignProfileId") REFERENCES "public"."CampaignProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Same organization, always: a job works only for its own organization's
-- campaign, and a post embeds only its own organization's job.
CREATE OR REPLACE FUNCTION "turfcut_private"."job_campaign_same_org"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."campaignProfileId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "public"."CampaignProfile" c WHERE c."id" = NEW."campaignProfileId" AND c."orgId" = NEW."orgId") THEN
    RAISE EXCEPTION 'A job works only for its own organization''s campaign';
  END IF;
  -- A job moving to another organization would leave posts embedding it on the old one's campaigns.
  IF TG_OP = 'UPDATE' AND NEW."orgId" IS DISTINCT FROM OLD."orgId" AND EXISTS (
       SELECT 1 FROM "public"."CampaignPost" p WHERE p."jobId" = NEW."id") THEN
    RAISE EXCEPTION 'A job embedded in campaign posts can''t move to another organization';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."job_campaign_same_org"() FROM PUBLIC, anon, authenticated;
-- A campaign belongs to one organization for good (its jobs and posts are that organization's).
CREATE OR REPLACE FUNCTION "turfcut_private"."campaign_org_fixed"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."orgId" IS DISTINCT FROM OLD."orgId" THEN
    RAISE EXCEPTION 'A campaign can''t move to another organization';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."campaign_org_fixed"() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER "CampaignProfile_org_fixed" BEFORE UPDATE OF "orgId" ON "public"."CampaignProfile"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."campaign_org_fixed"();
CREATE OR REPLACE TRIGGER "Job_campaign_same_org" BEFORE INSERT OR UPDATE OF "campaignProfileId", "orgId" ON "public"."Job"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."job_campaign_same_org"();

CREATE OR REPLACE FUNCTION "turfcut_private"."post_job_same_org"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."jobId" IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM "public"."Job" j JOIN "public"."CampaignProfile" c ON c."orgId" = j."orgId"
        WHERE j."id" = NEW."jobId" AND c."id" = NEW."profileId") THEN
    RAISE EXCEPTION 'A post embeds only its own organization''s job';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."post_job_same_org"() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE TRIGGER "CampaignPost_job_same_org" BEFORE INSERT OR UPDATE OF "jobId", "profileId" ON "public"."CampaignPost"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."post_job_same_org"();

-- Public read: a profile is public while published and its organization is
-- approved by Turfcut. SECURITY DEFINER so the policy can read Organization,
-- which stays closed to the API roles.
CREATE OR REPLACE FUNCTION "turfcut_private"."campaign_public"(p_profile uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM "public"."CampaignProfile" c JOIN "public"."Organization" o ON o."id" = c."orgId"
     WHERE c."id" = p_profile AND c."publishedAt" IS NOT NULL AND o."approved");
$$;
REVOKE ALL ON FUNCTION "turfcut_private"."campaign_public"(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA "turfcut_private" TO anon;
GRANT EXECUTE ON FUNCTION "turfcut_private"."campaign_public"(uuid) TO anon, authenticated;

ALTER TABLE "public"."CampaignProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CampaignPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CampaignPostRevision" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."CampaignProfile", "public"."CampaignPost", "public"."CampaignPostRevision" FROM anon, authenticated;
GRANT SELECT ("id", "handle", "displayName", "bio", "avatarKey", "headerKey", "publishedAt", "createdAt", "updatedAt") ON "public"."CampaignProfile" TO anon, authenticated;
GRANT SELECT ("id", "profileId", "body", "jobId", "pinnedAt", "createdAt", "editedAt") ON "public"."CampaignPost" TO anon, authenticated;

DROP POLICY IF EXISTS "public reads published campaigns" ON "public"."CampaignProfile";
CREATE POLICY "public reads published campaigns" ON "public"."CampaignProfile"
  FOR SELECT TO anon, authenticated USING ("turfcut_private"."campaign_public"("id"));
DROP POLICY IF EXISTS "public reads live posts" ON "public"."CampaignPost";
CREATE POLICY "public reads live posts" ON "public"."CampaignPost"
  FOR SELECT TO anon, authenticated USING ("deletedAt" IS NULL AND "turfcut_private"."campaign_public"("profileId"));

-- No write policies: nothing is granted to the API roles for writing, so
-- every write goes through the app's server (deny by default). (An earlier
-- draft of this file had FOR ALL policies; they're dropped if present.)
DROP POLICY IF EXISTS "campaign staff write profiles" ON "public"."CampaignProfile";
DROP POLICY IF EXISTS "campaign staff write posts" ON "public"."CampaignPost";
DROP FUNCTION IF EXISTS "turfcut_private"."campaign_writer"(uuid, text[]);

COMMIT;
