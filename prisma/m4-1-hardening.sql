-- Turfcut M4.1 — hardening from the full review. Run after m4-migration.sql
-- (safe to re-run). Paste into the Supabase SQL editor. (Fresh databases:
-- supabase-manual-setup.sql already includes it.) Needs the
-- turfcut_private.append_only() function from m4-migration.sql.
--
-- Changes (no tables or columns change):
--   1. Signed-in browsers can read only the ids and times of chat rows —
--      all the Realtime "something changed" signal uses — never message
--      text or attachment paths. Before, a participant could fetch the
--      original text of a deleted or edited message through Supabase's API.
--   2. A deletion (tombstone) reaches everyone in the thread, even someone
--      who blocked the person who made it (an owner removing a reported
--      message removes it for the reporter too). Edits by a blocked person
--      stay hidden.
--   3. Message and MessageRevision can't be truncated (UPDATE and DELETE
--      were already refused).
--   4. PoliticalPreference and ProfileMetric (CLAUDE.md rule 3) refuse
--      UPDATE and TRUNCATE, and deleting a worker no longer cascades to
--      them: a worker with consent or metric history can't be deleted
--      (owner decision).

BEGIN;
-- Don't queue the app behind a long transaction; on timeout everything
-- rolls back and the script can simply be run again.
SET LOCAL lock_timeout = '5s';

-- 1. Column-level read grants (revoking the table grant also clears any
--    earlier column grants, so this is re-runnable).
REVOKE SELECT ON "public"."Message", "public"."MessageRevision" FROM authenticated;
GRANT SELECT ("id", "conversationId", "createdAt") ON "public"."Message" TO authenticated;
GRANT SELECT ("id", "messageId", "conversationId", "createdAt") ON "public"."MessageRevision" TO authenticated;

-- 2. Tombstones aren't filtered by blocks (a NULL actor never matches a block).
DROP POLICY IF EXISTS "participants read revisions" ON "public"."MessageRevision";
CREATE POLICY "participants read revisions" ON "public"."MessageRevision"
  FOR SELECT TO authenticated
  USING ("turfcut_private"."can_see_revision"("messageId", CASE WHEN "kind" = 'DELETE' THEN NULL ELSE "actorId" END, "createdAt"));

-- 3. No truncating chat history.
CREATE OR REPLACE TRIGGER "Message_no_truncate" BEFORE TRUNCATE ON "public"."Message"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "MessageRevision_no_truncate" BEFORE TRUNCATE ON "public"."MessageRevision"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

-- 4. Consent versions and metric versions are never edited or wiped.
CREATE OR REPLACE TRIGGER "PoliticalPreference_no_update" BEFORE UPDATE ON "public"."PoliticalPreference"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "PoliticalPreference_no_truncate" BEFORE TRUNCATE ON "public"."PoliticalPreference"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "ProfileMetric_no_update" BEFORE UPDATE ON "public"."ProfileMetric"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "ProfileMetric_no_truncate" BEFORE TRUNCATE ON "public"."ProfileMetric"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
-- Deleting a worker must not erase their history.
ALTER TABLE "public"."PoliticalPreference" DROP CONSTRAINT "PoliticalPreference_workerId_fkey",
  ADD CONSTRAINT "PoliticalPreference_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ProfileMetric" DROP CONSTRAINT "ProfileMetric_workerId_fkey",
  ADD CONSTRAINT "ProfileMetric_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
