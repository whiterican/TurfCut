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
-- new values. Nothing below names them as enum values, so the whole file
-- can also be sent as one statement or run in a single transaction: checks
-- and functions compare through ::text, and the one index predicate (which
-- must be immutable) names the two older kinds instead.

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
-- (The kind check below already names STAFF_DM, the kind p2-dm-mentions.sql
-- adds: both files state it the same way, so running this one again never
-- narrows it. It compares through ::text, so it is valid before that kind exists.)
ALTER TABLE "public"."Conversation" DROP CONSTRAINT IF EXISTS "Conversation_kind_shape";
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_kind_shape" CHECK (
     ("kind"::text = 'DIRECT' AND "engagementId" IS NOT NULL)
  OR ("kind"::text = 'GROUP' AND "engagementId" IS NULL AND "name" IS NOT NULL)
  OR ("kind"::text = 'CHANNEL' AND "engagementId" IS NULL AND "name" IS NOT NULL)
  OR ("kind"::text = 'STAFF_DM' AND "engagementId" IS NULL AND "name" IS NULL));
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
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_channel_name" ON "public"."Conversation"("orgId", lower("name")) WHERE "kind" NOT IN ('DIRECT', 'GROUP') AND "archivedAt" IS NULL;

-- Who may be a participant of what, whatever path writes the row:
--   MEMBER only in a channel or a staff conversation, and only a member of
--   that organization; WORKER never in a staff-only channel; a staff
--   conversation (p2-dm-mentions.sql) holds only its two people.
-- This file and p2-dm-mentions.sql define the same function, word for word
-- (a test compares them), so running either again never undoes the other.
-- It reads the pair key through jsonb, so it is valid before that column exists.
CREATE OR REPLACE FUNCTION "turfcut_private"."check_channel_participant"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  c RECORD;
BEGIN
  SELECT cv."kind"::text AS kind, cv."orgId", cv."staffOnly", to_jsonb(cv) ->> 'dmKey' AS "dmKey" INTO STRICT c FROM "public"."Conversation" cv WHERE cv."id" = NEW."conversationId";
  IF NEW."role"::text = 'MEMBER' THEN
    IF c.kind NOT IN ('CHANNEL', 'STAFF_DM') THEN
      RAISE EXCEPTION 'MEMBER participants belong to channels and staff conversations only' USING ERRCODE = 'check_violation';
    END IF;
    IF c.kind = 'STAFF_DM' AND position(NEW."profileId"::text IN c."dmKey") = 0 THEN
      RAISE EXCEPTION 'a staff conversation holds only its two people' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW."removedAt" IS NULL AND NOT EXISTS (
         SELECT 1 FROM "public"."Profile" p WHERE p."id" = NEW."profileId" AND p."orgId" = c."orgId" AND p."role"::text <> 'WORKER' AND p."closedAt" IS NULL FOR SHARE) THEN
      RAISE EXCEPTION 'a channel member must belong to the channel''s organization' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF c.kind = 'STAFF_DM' THEN
    RAISE EXCEPTION 'a staff conversation has staff only' USING ERRCODE = 'check_violation';
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

-- Leaving the organization, becoming a worker, or closing the account ends
-- channel membership. (A role change among staff roles does not: every staff
-- role may be in a channel.) This is its own function and trigger, beside
-- M10's end_staff_chat_access, so re-running an earlier migration cannot
-- undo it, and it fires on closedAt, which the M10 trigger does not watch.
CREATE OR REPLACE FUNCTION "turfcut_private"."end_member_chat_access"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  UPDATE "public"."ConversationParticipant" p
     SET "removedAt" = (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
    FROM "public"."Conversation" c
   WHERE c."id" = p."conversationId" AND p."profileId" = NEW."id" AND p."role"::text = 'MEMBER' AND p."removedAt" IS NULL
     AND (NEW."orgId" IS DISTINCT FROM c."orgId" OR NEW."role"::text = 'WORKER' OR NEW."closedAt" IS NOT NULL);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."end_member_chat_access"() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS "Profile_end_member_chat_access" ON "public"."Profile";
CREATE TRIGGER "Profile_end_member_chat_access" AFTER UPDATE OF "orgId", "role", "closedAt" ON "public"."Profile"
  FOR EACH ROW WHEN (OLD."orgId" IS DISTINCT FROM NEW."orgId" OR OLD."role" IS DISTINCT FROM NEW."role" OR OLD."closedAt" IS DISTINCT FROM NEW."closedAt")
  EXECUTE FUNCTION "turfcut_private"."end_member_chat_access"();

-- A channel with a worker in it cannot be turned staff-only (no screen does
-- this today; the rule holds whatever path writes the row).
CREATE OR REPLACE FUNCTION "turfcut_private"."check_channel_staff_only"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW."staffOnly" AND EXISTS (
       SELECT 1 FROM "public"."ConversationParticipant" p WHERE p."conversationId" = NEW."id" AND p."role"::text = 'WORKER' AND p."removedAt" IS NULL) THEN
    RAISE EXCEPTION 'a staff-only channel has no workers' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."check_channel_staff_only"() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS "Conversation_staff_only_check" ON "public"."Conversation";
CREATE TRIGGER "Conversation_staff_only_check" BEFORE UPDATE OF "staffOnly" ON "public"."Conversation"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."check_channel_staff_only"();

-- Realtime: a channel reads like a team chat (full history for its members);
-- only a direct thread limits a contact to what came after they joined.
CREATE OR REPLACE FUNCTION "turfcut_private"."can_see"(p_conversation uuid, p_author uuid, p_at timestamp)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
           SELECT 1 FROM "public"."ConversationParticipant" p
             JOIN "public"."Conversation" c ON c."id" = p."conversationId"
            WHERE p."conversationId" = p_conversation AND p."profileId" = auth.uid()
              AND (p."removedAt" IS NULL OR p_at <= p."removedAt")
              AND (c."kind"::text <> 'DIRECT' OR p."role"::text = 'WORKER' OR p_at >= p."addedAt")
              -- A staff row (channels, staff conversations) reads only while the person is on that organization's
              -- staff: afterwards not even the history, the same rule the app applies (lib/chat.ts).
              AND (p."role"::text <> 'MEMBER' OR EXISTS (
                     SELECT 1 FROM "public"."Profile" pr
                      WHERE pr."id" = p."profileId" AND pr."orgId" = c."orgId" AND pr."role"::text <> 'WORKER' AND pr."closedAt" IS NULL)))
     AND NOT EXISTS (
           SELECT 1 FROM "public"."ProfileBlock" b
            WHERE b."blockerId" = auth.uid() AND b."blockedId" = p_author
              AND b."createdAt" <= p_at AND (b."liftedAt" IS NULL OR p_at < b."liftedAt"));
$$;
REVOKE ALL ON FUNCTION "turfcut_private"."can_see"(uuid, uuid, timestamp) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION "turfcut_private"."can_see"(uuid, uuid, timestamp) TO authenticated;

COMMIT;
