-- Turfcut M5.1 — the database refuses edits to work history. Run ONCE, after
-- m5-migration.sql. Paste into the Supabase SQL editor. (Fresh databases:
-- supabase-manual-setup.sql already includes it.)
--
-- Approved with M5 (CLAUDE.md rule 3): work events, supervisor reviews
-- (Validation) and the audit log are append-only. The app never changes
-- them; now the database refuses UPDATE, DELETE and TRUNCATE too, the same
-- protection messages and pay records have. Corrections stay new rows
-- (CORRECTION events, later reviews). Safe to re-run.
-- Needs turfcut_private.append_only() from m4-migration.sql (databases set
-- up with `npm run db:push` instead of the SQL files don't have it).

BEGIN;
-- Don't stall the app: give up (and change nothing) if a table is busy.
SET LOCAL lock_timeout = '5s';

-- ---- Security (M5.1): append-only work history ----
CREATE OR REPLACE TRIGGER "WorkEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."WorkEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "Validation_append_only" BEFORE UPDATE OR DELETE ON "public"."Validation"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "WorkEvent_no_truncate" BEFORE TRUNCATE ON "public"."WorkEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "Validation_no_truncate" BEFORE TRUNCATE ON "public"."Validation"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE OR REPLACE TRIGGER "AuditEvent_no_truncate" BEFORE TRUNCATE ON "public"."AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

COMMIT;
