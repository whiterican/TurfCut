-- Turfcut M4 migration — in-app messaging. Run ONCE, after m4-0-rls-lockdown.sql.
-- Paste into the Supabase SQL editor. (Fresh databases: supabase-manual-setup.sql
-- already includes it.)
--
-- Changes (approved for M4):
--   1. Profile.displayName (org staff's name in chat); Engagement.hiredById
--      (who hired the worker), backfilled from the audit log.
--   2. New tables: Conversation, ConversationJob, ConversationParticipant,
--      Message (immutable), MessageRevision (append-only edits/tombstones),
--      MessageReport, ProfileBlock.
--   3. Integrity: foreign keys, CHECKs, one report per person per message,
--      and triggers that refuse UPDATE/DELETE on Message and MessageRevision
--      (append-only, enforced by the database itself).
--   4. RLS on all new tables. Writes: none from clients (the server writes, as
--      `postgres`). Reads: Message/MessageRevision only, for Supabase Realtime
--      — a signed-in user sees a row only if they're a participant (and, if
--      removed, only what happened before their removal) and the sender isn't
--      someone they blocked at the time. Helper functions live in a private
--      schema that Supabase's API doesn't expose.

BEGIN;

-- CreateEnum
CREATE TYPE "public"."ConversationKind" AS ENUM ('DIRECT', 'GROUP');

-- CreateEnum
CREATE TYPE "public"."ParticipantRole" AS ENUM ('WORKER', 'MANAGER');

-- CreateEnum
CREATE TYPE "public"."RevisionKind" AS ENUM ('EDIT', 'DELETE');

-- AlterTable
ALTER TABLE "public"."Profile" ADD COLUMN     "displayName" TEXT;

-- AlterTable
ALTER TABLE "public"."Engagement" ADD COLUMN     "hiredById" UUID;

-- CreateTable
CREATE TABLE "public"."Conversation" (
    "id" UUID NOT NULL,
    "kind" "public"."ConversationKind" NOT NULL,
    "orgId" UUID NOT NULL,
    "engagementId" UUID,
    "name" TEXT,
    "createdById" UUID NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConversationJob" (
    "conversationId" UUID NOT NULL,
    "jobId" UUID NOT NULL,

    CONSTRAINT "ConversationJob_pkey" PRIMARY KEY ("conversationId","jobId")
);

-- CreateTable
CREATE TABLE "public"."ConversationParticipant" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "role" "public"."ParticipantRole" NOT NULL,
    "addedById" UUID NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" UUID,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachmentPath" TEXT,
    "attachmentName" TEXT,
    "attachmentType" TEXT,
    "attachmentSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageRevision" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "kind" "public"."RevisionKind" NOT NULL,
    "body" TEXT,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MessageReport" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "bodySnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,

    CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProfileBlock" (
    "id" UUID NOT NULL,
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),

    CONSTRAINT "ProfileBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_engagementId_key" ON "public"."Conversation"("engagementId");

-- CreateIndex
CREATE INDEX "Conversation_orgId_kind_idx" ON "public"."Conversation"("orgId", "kind");

-- CreateIndex
CREATE INDEX "ConversationJob_jobId_idx" ON "public"."ConversationJob"("jobId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_profileId_idx" ON "public"."ConversationParticipant"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_profileId_key" ON "public"."ConversationParticipant"("conversationId", "profileId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "public"."Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageRevision_messageId_createdAt_idx" ON "public"."MessageRevision"("messageId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageRevision_conversationId_createdAt_idx" ON "public"."MessageRevision"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageReport_orgId_createdAt_idx" ON "public"."MessageReport"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReport_messageId_reporterId_key" ON "public"."MessageReport"("messageId", "reporterId");

-- CreateIndex
CREATE INDEX "ProfileBlock_blockedId_idx" ON "public"."ProfileBlock"("blockedId");

-- AddForeignKey
ALTER TABLE "public"."Engagement" ADD CONSTRAINT "Engagement_hiredById_fkey" FOREIGN KEY ("hiredById") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "public"."Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "public"."Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationJob" ADD CONSTRAINT "ConversationJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationJob" ADD CONSTRAINT "ConversationJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageRevision" ADD CONSTRAINT "MessageRevision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MessageReport" ADD CONSTRAINT "MessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProfileBlock" ADD CONSTRAINT "ProfileBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProfileBlock" ADD CONSTRAINT "ProfileBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active block per pair; lifted blocks stay as history.
CREATE UNIQUE INDEX "ProfileBlock_active_pair" ON "public"."ProfileBlock"("blockerId", "blockedId") WHERE "liftedAt" IS NULL;
-- Owners' open-reports list.
CREATE INDEX "MessageReport_open" ON "public"."MessageReport"("orgId", "createdAt") WHERE "resolvedAt" IS NULL;

-- Shape checks.
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_kind_shape" CHECK (
  ("kind" = 'DIRECT' AND "engagementId" IS NOT NULL) OR ("kind" = 'GROUP' AND "engagementId" IS NULL AND "name" IS NOT NULL));
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_body_length" CHECK (char_length("body") <= 4000);
ALTER TABLE "public"."MessageRevision" ADD CONSTRAINT "MessageRevision_shape" CHECK (
  ("kind" = 'EDIT' AND "body" IS NOT NULL AND char_length("body") <= 4000) OR ("kind" = 'DELETE' AND "body" IS NULL));

-- Turfcut's database functions live in a schema the Data API doesn't expose
-- (never callable as RPC).
CREATE SCHEMA IF NOT EXISTS "turfcut_private";
REVOKE ALL ON SCHEMA "turfcut_private" FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA "turfcut_private" TO authenticated;

-- Append-only, enforced: messages and their revisions are never changed or removed.
CREATE OR REPLACE FUNCTION "turfcut_private"."append_only"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."append_only"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "Message_append_only" BEFORE UPDATE OR DELETE ON "public"."Message"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "MessageRevision_append_only" BEFORE UPDATE OR DELETE ON "public"."MessageRevision"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Copied columns always match their message: Realtime filters revisions by
-- conversationId, and reports are routed by orgId.
CREATE OR REPLACE FUNCTION "turfcut_private"."copy_message_scope"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  SELECT m."conversationId" INTO STRICT NEW."conversationId" FROM "public"."Message" m WHERE m."id" = NEW."messageId";
  IF TG_TABLE_NAME = 'MessageReport' THEN
    SELECT c."orgId" INTO STRICT NEW."orgId" FROM "public"."Conversation" c WHERE c."id" = NEW."conversationId";
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."copy_message_scope"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "MessageRevision_scope" BEFORE INSERT ON "public"."MessageRevision"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."copy_message_scope"();
CREATE TRIGGER "MessageReport_scope" BEFORE INSERT ON "public"."MessageReport"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."copy_message_scope"();

-- Access ends with the job or the role, whatever path makes the change: a
-- frozen member must not keep reading new messages (here, over Realtime, or
-- the Data API). Removal keeps their history up to now, read-only.
-- Staff who leave the org, or stop being owner/recruiter/supervisor, are
-- removed from every conversation they manage there.
CREATE OR REPLACE FUNCTION "turfcut_private"."end_staff_chat_access"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE "public"."ConversationParticipant" p
     SET "removedAt" = (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
    FROM "public"."Conversation" c
   WHERE c."id" = p."conversationId" AND p."profileId" = NEW."id" AND p."role" = 'MANAGER' AND p."removedAt" IS NULL
     AND (NEW."orgId" IS DISTINCT FROM c."orgId" OR NEW."role"::text NOT IN ('OWNER', 'RECRUITER', 'SUPERVISOR'));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."end_staff_chat_access"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "Profile_end_chat_access" AFTER UPDATE OF "orgId", "role" ON "public"."Profile"
  FOR EACH ROW WHEN (OLD."orgId" IS DISTINCT FROM NEW."orgId" OR OLD."role" IS DISTINCT FROM NEW."role")
  EXECUTE FUNCTION "turfcut_private"."end_staff_chat_access"();

-- A worker whose hire ends leaves each team chat where they're no longer
-- hired on any of its jobs. (Their direct thread freezes for both sides by
-- the engagement's status, so nothing new is posted there.)
CREATE OR REPLACE FUNCTION "turfcut_private"."end_worker_chat_access"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Serialize per worker: two of their hires ending at once must not each
  -- see the other as still active. The UPDATE below runs after the wait,
  -- with a fresh snapshot.
  PERFORM pg_advisory_xact_lock(hashtext('chat-worker:' || NEW."workerId"::text));
  UPDATE "public"."ConversationParticipant" p
     SET "removedAt" = (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
    FROM "public"."Worker" w, "public"."ConversationJob" cj
   WHERE w."id" = NEW."workerId" AND p."profileId" = w."profileId" AND p."role" = 'WORKER' AND p."removedAt" IS NULL
     AND cj."conversationId" = p."conversationId" AND cj."jobId" = NEW."jobId"
     AND NOT EXISTS (
       SELECT 1 FROM "public"."ConversationJob" cj2 JOIN "public"."Engagement" e ON e."jobId" = cj2."jobId"
        WHERE cj2."conversationId" = p."conversationId" AND e."workerId" = NEW."workerId" AND e."status" IN ('ACTIVE', 'CLAIMED'));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."end_worker_chat_access"() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER "Engagement_end_chat_access" AFTER UPDATE OF "status" ON "public"."Engagement"
  FOR EACH ROW WHEN (OLD."status" IN ('ACTIVE', 'CLAIMED') AND NEW."status" NOT IN ('ACTIVE', 'CLAIMED'))
  EXECUTE FUNCTION "turfcut_private"."end_worker_chat_access"();

-- Backfill who hired each current/past worker: the org member who accepted
-- the application, else who sent the invitation, else (instant claims) who
-- created the job, else the organization's first owner.
UPDATE "public"."Engagement" e SET "hiredById" = COALESCE(
  (SELECT a."actorId" FROM "public"."AuditEvent" a JOIN "public"."Profile" p ON p."id" = a."actorId"
    WHERE a."entityType" = 'Engagement' AND a."entityId" = e."id"::text
      AND a."action" = 'engagement.accepted' AND a."metadata"->>'acceptedBy' = 'org'
    ORDER BY a."createdAt" DESC LIMIT 1),
  (SELECT a."actorId" FROM "public"."AuditEvent" a JOIN "public"."Profile" p ON p."id" = a."actorId"
    WHERE a."entityType" = 'Engagement' AND a."entityId" = e."id"::text AND a."action" = 'engagement.invited'
    ORDER BY a."createdAt" DESC LIMIT 1),
  (SELECT a."actorId" FROM "public"."AuditEvent" a JOIN "public"."Profile" p ON p."id" = a."actorId"
    WHERE a."entityType" = 'Job' AND a."entityId" = e."jobId"::text AND a."action" = 'job.created'
    ORDER BY a."createdAt" ASC LIMIT 1),
  (SELECT p."id" FROM "public"."Profile" p JOIN "public"."Job" j ON j."orgId" = p."orgId"
    WHERE j."id" = e."jobId" AND p."role" = 'OWNER' ORDER BY p."createdAt" ASC LIMIT 1)
)
WHERE e."hiredById" IS NULL AND e."status" IN ('ACTIVE', 'CLAIMED', 'COMPLETED');
-- (Each candidate must be an existing profile, so the new foreign key holds.)

-- RLS: deny-by-default on every new table.
ALTER TABLE "public"."Conversation"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ConversationJob"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ConversationParticipant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Message"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MessageRevision"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."MessageReport"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProfileBlock"            ENABLE ROW LEVEL SECURITY;

-- Policy helpers (below): SECURITY DEFINER so they can read the participant
-- and block tables; search_path empty, every name qualified.

-- Can the signed-in user see something that happened at p_at in this
-- conversation, by p_author? Participant (and, if removed, p_at before the
-- removal), and p_author wasn't blocked by them at p_at.
CREATE OR REPLACE FUNCTION "turfcut_private"."can_see"(p_conversation uuid, p_author uuid, p_at timestamp)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
           SELECT 1 FROM "public"."ConversationParticipant" p
             JOIN "public"."Conversation" c ON c."id" = p."conversationId"
            WHERE p."conversationId" = p_conversation AND p."profileId" = auth.uid()
              AND (p."removedAt" IS NULL OR p_at <= p."removedAt")
              -- A contact who takes over a direct thread reads it from when they joined.
              AND (c."kind" = 'GROUP' OR p."role" = 'WORKER' OR p_at >= p."addedAt"))
     AND NOT EXISTS (
           SELECT 1 FROM "public"."ProfileBlock" b
            WHERE b."blockerId" = auth.uid() AND b."blockedId" = p_author
              AND b."createdAt" <= p_at AND (b."liftedAt" IS NULL OR p_at < b."liftedAt"));
$$;

-- A revision is visible if its message is, and the revision itself happened
-- inside the viewer's window and wasn't made by someone they had blocked.
CREATE OR REPLACE FUNCTION "turfcut_private"."can_see_revision"(p_message uuid, p_actor uuid, p_at timestamp)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT COALESCE((SELECT "turfcut_private"."can_see"(m."conversationId", m."senderId", m."createdAt")
                          AND "turfcut_private"."can_see"(m."conversationId", p_actor, p_at)
                     FROM "public"."Message" m WHERE m."id" = p_message), false);
$$;

REVOKE ALL ON FUNCTION "turfcut_private"."can_see"(uuid, uuid, timestamp) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION "turfcut_private"."can_see_revision"(uuid, uuid, timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "turfcut_private"."can_see"(uuid, uuid, timestamp) TO authenticated;
GRANT EXECUTE ON FUNCTION "turfcut_private"."can_see_revision"(uuid, uuid, timestamp) TO authenticated;

-- Only these two tables are readable by signed-in clients (for Realtime),
-- and only through these policies. Nothing is granted to anon.
GRANT SELECT ON "public"."Message", "public"."MessageRevision" TO authenticated;

CREATE POLICY "participants read messages" ON "public"."Message"
  FOR SELECT TO authenticated
  USING ("turfcut_private"."can_see"("conversationId", "senderId", "createdAt"));

CREATE POLICY "participants read revisions" ON "public"."MessageRevision"
  FOR SELECT TO authenticated
  USING ("turfcut_private"."can_see_revision"("messageId", "actorId", "createdAt"));

COMMIT;

-- Realtime (run once after the migration; Supabase only):
--   ALTER PUBLICATION supabase_realtime ADD TABLE "public"."Message", "public"."MessageRevision";
