-- Turfcut C3 migration — the hiring hub. Run ONCE, after c2-consent.sql.
-- Paste into the Supabase SQL editor. (Fresh databases:
-- supabase-manual-setup.sql already includes it.)
--
-- Changes (approved for C3, Oct 9). Additive; nothing existing changes:
--   1. EngagementStatus gains OFFERED, DECLINED and WITHDRAWN. An offer waits
--      on the worker: nothing starts without their accept.
--   2. EngagementEvent: the dated hiring history of each engagement (applied,
--      in review, offered, not selected with a reason code, withdrawn, ...).
--      Append-only and server-only, like the other history tables.
--   3. Each existing engagement gets its opening event (applied, claimed or
--      invited, from the copy it kept), dated when it was created.

-- New enum values can't be used in the transaction that adds them, so they
-- come first, each committed on its own (re-running skips them).
ALTER TYPE "public"."EngagementStatus" ADD VALUE IF NOT EXISTS 'OFFERED';
ALTER TYPE "public"."EngagementStatus" ADD VALUE IF NOT EXISTS 'DECLINED';
ALTER TYPE "public"."EngagementStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';

BEGIN;
-- Don't queue the app behind a long transaction: after 5 seconds of waiting
-- this stops and rolls back (nothing changes); run it again.
SET LOCAL lock_timeout = '5s';

CREATE TYPE "public"."EngagementEventType" AS ENUM (
  'APPLIED', 'CLAIMED', 'INVITED', 'INVITE_VIEWED', 'INVITE_ACCEPTED', 'INVITE_DECLINED', 'INVITE_WITHDRAWN',
  'IN_REVIEW', 'OFFERED', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'NOT_SELECTED', 'WITHDRAWN');

CREATE TABLE "public"."EngagementEvent" (
    "id" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "type" "public"."EngagementEventType" NOT NULL,
    "actorId" UUID,
    "reasonCode" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EngagementEvent_pkey" PRIMARY KEY ("id"),
    -- A structured reason only when an organization doesn't select someone
    -- (no free-text notes about a worker, C3 decision Q5).
    CONSTRAINT "EngagementEvent_reason_shape" CHECK (
      ("type" = 'NOT_SELECTED' AND "reasonCode" IN ('positions_filled', 'schedule', 'credentials', 'area', 'other'))
      OR ("type" <> 'NOT_SELECTED' AND "reasonCode" IS NULL)),
    CONSTRAINT "EngagementEvent_note_length" CHECK ("note" IS NULL OR char_length("note") BETWEEN 1 AND 500)
);
CREATE INDEX "EngagementEvent_engagementId_createdAt_idx" ON "public"."EngagementEvent"("engagementId", "createdAt");
ALTER TABLE "public"."EngagementEvent" ADD CONSTRAINT "EngagementEvent_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only: rows are never changed, removed or wiped (rule 3).
CREATE TRIGGER "EngagementEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."EngagementEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "EngagementEvent_no_truncate" BEFORE TRUNCATE ON "public"."EngagementEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Server-only: row-level security on with no policies, nothing granted.
ALTER TABLE "public"."EngagementEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."EngagementEvent" FROM anon, authenticated;

-- History so far: the opening event of each engagement that kept a copy of
-- how it began. Who did it: the worker for an application or claim, the
-- inviter for an invitation.
INSERT INTO "public"."EngagementEvent" ("id", "engagementId", "type", "actorId", "createdAt")
SELECT gen_random_uuid(), e."id",
       (CASE e."applicationSnapshot"->>'kind' WHEN 'application' THEN 'APPLIED' WHEN 'claim' THEN 'CLAIMED' ELSE 'INVITED' END)::"public"."EngagementEventType",
       CASE WHEN e."applicationSnapshot"->>'kind' = 'invitation' THEN e."hiredById" ELSE w."profileId" END,
       e."createdAt"
  FROM "public"."Engagement" e JOIN "public"."Worker" w ON w."id" = e."workerId"
 WHERE e."applicationSnapshot"->>'kind' IN ('application', 'claim', 'invitation')
   AND NOT EXISTS (SELECT 1 FROM "public"."EngagementEvent" x WHERE x."engagementId" = e."id");

COMMIT;
