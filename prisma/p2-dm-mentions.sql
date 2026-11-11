-- Staff direct messages and mentions (Caden, Nov 10 2026: Slack-like
-- messaging, slice 3).
--
--   * A new conversation kind, STAFF_DM: a private conversation between two
--     staff members of one organization. One per pair there (orgId + dmKey is unique).
--     Its two people are MEMBER participants; nobody is added or removed by
--     hand. Leaving the organization ends it for that person (the MEMBER
--     trigger from p2-channels.sql), and the other keeps read-only history.
--   * MessageMention: who a message named with "@". Written with the
--     message and never changed. Server-only.
--
-- Idempotent: safe to run again, in one transaction or as one statement
-- (nothing below names the new enum value except through ::text).
-- Also folded into supabase-manual-setup.sql.

ALTER TYPE "public"."ConversationKind" ADD VALUE IF NOT EXISTS 'STAFF_DM';

BEGIN;

ALTER TABLE "public"."Conversation" ADD COLUMN IF NOT EXISTS "dmKey" TEXT;
-- One conversation per pair within an organization. (Two people who both move to another organization start a new one there; the old one stays closed to them.)
DROP INDEX IF EXISTS "public"."Conversation_dmKey_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_orgId_dmKey_key" ON "public"."Conversation"("orgId", "dmKey");

ALTER TABLE "public"."Conversation" DROP CONSTRAINT IF EXISTS "Conversation_kind_shape";
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_kind_shape" CHECK (
     ("kind"::text = 'DIRECT' AND "engagementId" IS NOT NULL)
  OR ("kind"::text = 'GROUP' AND "engagementId" IS NULL AND "name" IS NOT NULL)
  OR ("kind"::text = 'CHANNEL' AND "engagementId" IS NULL AND "name" IS NOT NULL)
  OR ("kind"::text = 'STAFF_DM' AND "engagementId" IS NULL AND "name" IS NULL));
-- The pair key is on staff conversations and nothing else: two different uuids, the lower first.
ALTER TABLE "public"."Conversation" DROP CONSTRAINT IF EXISTS "Conversation_dm_shape";
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_dm_shape" CHECK (
     ("kind"::text <> 'STAFF_DM' AND "dmKey" IS NULL)
  OR ("kind"::text = 'STAFF_DM' AND "dmKey" ~ '^[0-9a-f-]{36}:[0-9a-f-]{36}$' AND split_part("dmKey", ':', 1) < split_part("dmKey", ':', 2)));

-- Who may be a participant of what: the same function as in p2-channels.sql,
-- word for word (a test compares them). A staff conversation holds exactly
-- its two people, as MEMBER.
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

CREATE TABLE IF NOT EXISTS "public"."MessageMention" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageMention_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MessageMention_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "MessageMention_messageId_profileId_key" ON "public"."MessageMention"("messageId", "profileId");
CREATE INDEX IF NOT EXISTS "MessageMention_profileId_conversationId_idx" ON "public"."MessageMention"("profileId", "conversationId");

-- conversationId always matches the message; a mention is never changed or removed.
DROP TRIGGER IF EXISTS "MessageMention_scope" ON "public"."MessageMention";
CREATE TRIGGER "MessageMention_scope" BEFORE INSERT ON "public"."MessageMention"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."copy_message_scope"();
DROP TRIGGER IF EXISTS "MessageMention_append_only" ON "public"."MessageMention";
CREATE TRIGGER "MessageMention_append_only" BEFORE UPDATE OR DELETE ON "public"."MessageMention"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();

-- Server-only.
ALTER TABLE "public"."MessageMention" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."MessageMention" FROM anon, authenticated;

COMMIT;
