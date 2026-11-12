-- Threads and reactions (Caden, Nov 10 2026: Slack-like channels, slice 2).
--
--   * Message.parentId: a reply in a thread. One level only, and always in
--     its parent's conversation (a trigger checks both, whatever path writes
--     the row). Set when the message is sent; messages stay immutable.
--   * MessageReaction: one of a fixed set of marks on a message. Taking one
--     back sets removedAt. Server-only: nothing is granted to the API roles.
--
-- Idempotent: safe to run again, in one transaction or as one statement.
-- Also folded into supabase-manual-setup.sql.

BEGIN;

ALTER TABLE "public"."Message" ADD COLUMN IF NOT EXISTS "parentId" UUID;
DO $$ BEGIN
  ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "Message_parentId_createdAt_idx" ON "public"."Message"("parentId", "createdAt");

CREATE OR REPLACE FUNCTION "turfcut_private"."check_reply_parent"() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  parent RECORD;
BEGIN
  SELECT m."conversationId", m."parentId" INTO STRICT parent FROM "public"."Message" m WHERE m."id" = NEW."parentId";
  IF parent."conversationId" <> NEW."conversationId" THEN
    RAISE EXCEPTION 'a reply belongs to its parent''s conversation' USING ERRCODE = 'check_violation';
  END IF;
  IF parent."parentId" IS NOT NULL THEN
    RAISE EXCEPTION 'a reply has no replies of its own' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION "turfcut_private"."check_reply_parent"() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS "Message_reply_parent" ON "public"."Message";
CREATE TRIGGER "Message_reply_parent" BEFORE INSERT ON "public"."Message"
  FOR EACH ROW WHEN (NEW."parentId" IS NOT NULL) EXECUTE FUNCTION "turfcut_private"."check_reply_parent"();

CREATE TABLE IF NOT EXISTS "public"."MessageReaction" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MessageReaction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- The same set as REACTIONS in src/lib/chat.ts.
    CONSTRAINT "MessageReaction_emoji" CHECK ("emoji" IN ('👍', '❤️', '😂', '🎉', '👀', '✅'))
);
CREATE INDEX IF NOT EXISTS "MessageReaction_messageId_idx" ON "public"."MessageReaction"("messageId");
CREATE INDEX IF NOT EXISTS "MessageReaction_profileId_idx" ON "public"."MessageReaction"("profileId");
-- One live reaction per person per mark per message; taken-back rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS "MessageReaction_live" ON "public"."MessageReaction"("messageId", "profileId", "emoji") WHERE "removedAt" IS NULL;

-- conversationId always matches the message (the M4 scope function).
DROP TRIGGER IF EXISTS "MessageReaction_scope" ON "public"."MessageReaction";
CREATE TRIGGER "MessageReaction_scope" BEFORE INSERT ON "public"."MessageReaction"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."copy_message_scope"();

-- Server-only.
ALTER TABLE "public"."MessageReaction" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."MessageReaction" FROM anon, authenticated;

COMMIT;
