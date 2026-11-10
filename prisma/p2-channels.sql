-- Channels (Caden, Nov 10 2026): Slack-like named channels in an
-- organization's workspace, built on the M4 conversation tables.
--
--   * A new conversation kind, CHANNEL, with a topic, a staff-only flag, an
--     archive time and one "general" channel per organization.
--   * A new participant role, MEMBER: organization staff in a channel. They
--     are there because they belong to the organization, whatever their role
--     (the Messages area still decides who runs team chats and channels).
--   * Workers are in a channel only when a manager adds them, and only for
--     channels tied to jobs they are hired on. Staff-only channels never
--     have workers (checked by a trigger, not only by the app).
--
-- Idempotent: safe to run again. Also folded into supabase-manual-setup.sql.
-- The two ADD VALUE statements must be committed before anything uses the
-- new values, so they come first, outside the transaction. (Checks and
-- functions below compare through ::text; the one index predicate names the
-- committed value, because an index predicate must be immutable.)

ALTER TYPE "public"."ConversationKind" ADD VALUE IF NOT EXISTS 'CHANNEL';
ALTER TYPE "public"."ParticipantRole" ADD VALUE IF NOT EXISTS 'MEMBER';

BEGIN;

ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "topic" TEXT;
ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "staffOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "isGeneral" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "archivedById" UUID;

-- Shape: a channel has a name and no engagement; only channels carry the
-- channel columns; the general channel is staff-only and is never archived.
ALTER TABLE "public"."Conversation" DROP CONSTRAINT IF EXISTS "Conversation_kind_shape";
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_kind_shape" CHECK (
     ("kind"::text = 'DIRECT' AND "engagementId" IS NOT NULL)
  OR ("kind"::text = 'GROUP' AND "engagementId" IS NULL AND "name" IS NOT NULL)
  OR ("kind"::text = 'CHANNEL' AND "engagementId" IS NULL AND "name" IS NOT NULL));
ALTER TABLE "public"."Conversation" DROP CONSTRAINT IF EXISTS "Conversation_channel_shape";
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_channel_shape" CHECK (
     ("kind"::text = 'CHANNEL'
        AND char_length("name") BETWEEN 1 AND 80
        AND ("topic" IS NULL OR char_length("topic") <= 250)
        AND (NOT "isGeneral" OR ("staffOnly" AND "archivedAt" IS NULL))
        AND (("archivedAt" IS NULL) = ("archivedById" IS NULL)))
  OR ("kind"::text <> 'CHANNEL' AND "topic" IS NULL AND NOT "staffOnly" AND NOT "isGeneral" AND "archivedAt" IS NULL AND "archivedById" IS NULL));

-- One general channel per organization, and no two live channels with the same name (whatever the letter case).
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_general_per_org" ON "public"."Conversation"("orgId") WHERE "isGeneral";
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_channel_name" ON "public"."Conversation"("orgId", lower("name")) WHERE "kind" = 'CHANNEL'::"public"."ConversationKind" AND "archivedAt" IS NULL;

-- Who may be a participant of what, whatever path writes the row:
--   MEMBER only in a channel, and only a member of that organization;
--   WORKER never in a staff-only channel.
CREATE OR REPLACE FUNCTION "turfcut_private"."check_channel_participant"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  c RECORD;
BEGIN
  SELECT cv."kind"::text AS kind, cv."orgId", cv."staffOnly" INTO STRICT c FROM "public"."Conversation" cv WHERE cv."id" = NEW."conversationId";
  IF NEW."role"::text = 'MEMBER' THEN
    IF c.kind <> 'CHANNEL' THEN
      RAISE EXCEPTION 'MEMBER participants belong to channels only' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."removedAt" IS NULL AND NOT EXISTS (
         SELECT 1 FROM "public"."Profile" p WHERE p."id" = NEW."profileId" AND p."orgId" = c."orgId" AND p."role"::text <> 'WORKER' AND p."closedAt" IS NULL) THEN
      RAISE EXCEPTION 'a channel member must belong to the channel''s organization' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF c.kind = 'CHANNEL' THEN
    IF NEW."role"::text = 'MANAGER' THEN
      RAISE EXCEPTION 'staff join channels as MEMBER' USING ERRCODE = 'check_violation';
    END IF;
    IF c."staffOnly" AND NEW."removedAt" IS NULL THEN
      RAISE EXCEPTION 'a staff-only channel has no workers' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."check_channel_participant"() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS "ConversationParticipant_channel_check" ON "public"."ConversationParticipant";
CREATE TRIGGER "ConversationParticipant_channel_check" BEFORE INSERT OR UPDATE OF "role", "removedAt", "conversationId", "profileId" ON "public"."ConversationParticipant"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."check_channel_participant"();

-- Leaving the organization ends channel membership too. (A role change does
-- not: every staff role may be in a channel. Team-chat and direct-thread
-- managers still leave when they stop running teams, as M10.6 set.)
CREATE OR REPLACE FUNCTION "turfcut_private"."end_staff_chat_access"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE "public"."ConversationParticipant" p
     SET "removedAt" = (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
    FROM "public"."Conversation" c
   WHERE c."id" = p."conversationId" AND p."profileId" = NEW."id" AND p."role"::text = 'MANAGER' AND p."removedAt" IS NULL
     AND (NEW."orgId" IS DISTINCT FROM c."orgId"
          OR NOT (NEW."role"::text IN ('OWNER', 'RECRUITER', 'SUPERVISOR')
                  OR (NEW."role"::text = 'CUSTOM' AND EXISTS (
                        SELECT 1 FROM "public"."OrgRole" r JOIN "public"."OrgRoleGrant" g ON g."roleId" = r."id"
                         WHERE r."id" = NEW."orgRoleId" AND r."orgId" = NEW."orgId" AND r."archivedAt" IS NULL AND g."area" = 'messages' AND g."level"::text = 'FULL'))));
  UPDATE "public"."ConversationParticipant" p
     SET "removedAt" = (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
    FROM "public"."Conversation" c
   WHERE c."id" = p."conversationId" AND p."profileId" = NEW."id" AND p."role"::text = 'MEMBER' AND p."removedAt" IS NULL
     AND (NEW."orgId" IS DISTINCT FROM c."orgId" OR NEW."role"::text = 'WORKER' OR NEW."closedAt" IS NOT NULL);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."end_staff_chat_access"() FROM PUBLIC, anon, authenticated;

-- Realtime: a channel reads like a team chat (full history for its members);
-- only a direct thread limits a contact to what came after they joined.
CREATE OR REPLACE FUNCTION "turfcut_private"."can_see"(p_conversation uuid, p_author uuid, p_at timestamp)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
           SELECT 1 FROM "public"."ConversationParticipant" p
             JOIN "public"."Conversation" c ON c."id" = p."conversationId"
            WHERE p."conversationId" = p_conversation AND p."profileId" = auth.uid()
              AND (p."removedAt" IS NULL OR p_at <= p."removedAt")
              AND (c."kind"::text <> 'DIRECT' OR p."role"::text = 'WORKER' OR p_at >= p."addedAt"))
     AND NOT EXISTS (
           SELECT 1 FROM "public"."ProfileBlock" b
            WHERE b."blockerId" = auth.uid() AND b."blockedId" = p_author
              AND b."createdAt" <= p_at AND (b."liftedAt" IS NULL OR p_at < b."liftedAt"));
$$;
REVOKE ALL ON FUNCTION "turfcut_private"."can_see"(uuid, uuid, timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "turfcut_private"."can_see"(uuid, uuid, timestamp) TO authenticated;

COMMIT;
