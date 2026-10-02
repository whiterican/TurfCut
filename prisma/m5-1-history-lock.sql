-- Turfcut M5.1 — the database refuses edits to work history. Run ONCE, after
-- m5-migration.sql. Paste into the Supabase SQL editor. (Fresh databases:
-- supabase-manual-setup.sql already includes it.)
--
-- Approved with M5 (CLAUDE.md rule 3): work events, supervisor reviews
-- (Validation) and the audit log are append-only. The app never changes
-- them; now the database refuses UPDATE, DELETE and TRUNCATE too, the same
-- protection messages and pay records have. Corrections stay new rows
-- (CORRECTION events, later reviews).

BEGIN;

-- ---- Security (M5.1): append-only work history ----
CREATE TRIGGER "WorkEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."WorkEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "Validation_append_only" BEFORE UPDATE OR DELETE ON "public"."Validation"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "AuditEvent_append_only" BEFORE UPDATE OR DELETE ON "public"."AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "WorkEvent_no_truncate" BEFORE TRUNCATE ON "public"."WorkEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "Validation_no_truncate" BEFORE TRUNCATE ON "public"."Validation"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();
CREATE TRIGGER "AuditEvent_no_truncate" BEFORE TRUNCATE ON "public"."AuditEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION "turfcut_private"."append_only"();

COMMIT;
