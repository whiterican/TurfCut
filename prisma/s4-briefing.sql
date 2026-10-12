-- Turfcut S4 migration — the briefing kit: supporting facts behind talking
-- points, and campaign resources (scripts, common questions, guides).
-- Run AFTER prisma/s2-social.sql, BEFORE deploying the S4 code. Safe to run
-- again: everything it creates is skipped or replaced when it already
-- exists, and nothing is dropped.
-- (Fresh databases: supabase-manual-setup.sql already includes it.)
--
-- Changes (S4, Oct 12). Additive; nothing existing changes:
--   1. TalkingPointFact: up to 5 short facts behind a pinned post, each with
--      an optional source link. Edited in place; removing hides the row.
--   2. CampaignResource: scripts, common questions and guides, for anyone
--      (PUBLIC, on the campaign page) or for the workers on the campaign's
--      jobs (WORKERS, in the shift brief only).
--
-- Reads: facts of live pinned posts on public campaigns, and PUBLIC
-- resources of public campaigns, are readable by anyone through the Data
-- API, column by column (never who wrote them). WORKERS resources are
-- server-only. Writes: the app's server only (deny by default).

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'CampaignResourceKind' AND n.nspname = 'public') THEN
    CREATE TYPE "public"."CampaignResourceKind" AS ENUM ('SCRIPT', 'FAQ', 'GUIDE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'CampaignResourceAudience' AND n.nspname = 'public') THEN
    CREATE TYPE "public"."CampaignResourceAudience" AS ENUM ('PUBLIC', 'WORKERS');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "public"."TalkingPointFact" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "position" INTEGER NOT NULL,
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "TalkingPointFact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TalkingPointFact_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."CampaignPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TalkingPointFact_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TalkingPointFact_body_length" CHECK (char_length("body") BETWEEN 1 AND 300 AND btrim("body") <> ''),
    CONSTRAINT "TalkingPointFact_sourceUrl_shape" CHECK ("sourceUrl" IS NULL OR ("sourceUrl" ~* '^https?://' AND char_length("sourceUrl") <= 500)),
    CONSTRAINT "TalkingPointFact_position_range" CHECK ("position" BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS "TalkingPointFact_postId_position_idx" ON "public"."TalkingPointFact"("postId", "position");
CREATE INDEX IF NOT EXISTS "TalkingPointFact_authorId_idx" ON "public"."TalkingPointFact"("authorId");

CREATE TABLE IF NOT EXISTS "public"."CampaignResource" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "kind" "public"."CampaignResourceKind" NOT NULL,
    "audience" "public"."CampaignResourceAudience" NOT NULL DEFAULT 'WORKERS',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "authorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CampaignResource_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CampaignResource_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."CampaignProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignResource_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CampaignResource_title_length" CHECK (char_length("title") BETWEEN 1 AND 120 AND btrim("title") <> ''),
    CONSTRAINT "CampaignResource_body_length" CHECK (char_length("body") BETWEEN 1 AND 8000 AND btrim("body") <> ''),
    CONSTRAINT "CampaignResource_position_range" CHECK ("position" BETWEEN 1 AND 100)
);
CREATE INDEX IF NOT EXISTS "CampaignResource_profileId_kind_position_idx" ON "public"."CampaignResource"("profileId", "kind", "position");
CREATE INDEX IF NOT EXISTS "CampaignResource_authorId_idx" ON "public"."CampaignResource"("authorId");

-- A fact is public while its post is a live talking point on a public campaign.
CREATE OR REPLACE FUNCTION "turfcut_private"."fact_public"(p_post uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM "public"."CampaignPost" p
     WHERE p."id" = p_post AND p."deletedAt" IS NULL AND p."pinnedAt" IS NOT NULL
       AND "turfcut_private"."campaign_public"(p."profileId"));
$$;
REVOKE ALL ON FUNCTION "turfcut_private"."fact_public"(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "turfcut_private"."fact_public"(uuid) TO anon, authenticated;

ALTER TABLE "public"."TalkingPointFact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."CampaignResource" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."TalkingPointFact", "public"."CampaignResource" FROM anon, authenticated;
GRANT SELECT ("id", "postId", "body", "sourceUrl", "position", "createdAt", "updatedAt") ON "public"."TalkingPointFact" TO anon, authenticated;
GRANT SELECT ("id", "profileId", "kind", "audience", "title", "body", "position", "createdAt", "updatedAt") ON "public"."CampaignResource" TO anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'TalkingPointFact' AND policyname = 'public reads facts of live talking points') THEN
    CREATE POLICY "public reads facts of live talking points" ON "public"."TalkingPointFact"
      FOR SELECT TO anon, authenticated USING ("deletedAt" IS NULL AND "turfcut_private"."fact_public"("postId"));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'CampaignResource' AND policyname = 'public reads public resources') THEN
    CREATE POLICY "public reads public resources" ON "public"."CampaignResource"
      FOR SELECT TO anon, authenticated USING ("deletedAt" IS NULL AND "audience" = 'PUBLIC' AND "turfcut_private"."campaign_public"("profileId"));
  END IF;
END $$;

COMMIT;
