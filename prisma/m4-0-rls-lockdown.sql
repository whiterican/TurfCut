-- Turfcut M4-0 — lock down Supabase's automatic Data API. Run ONCE (safe to
-- re-run). Paste into the Supabase SQL editor, before m4-migration.sql.
--
-- Why: Supabase exposes every table in `public` through its REST API using
-- the anon key that ships to every browser. With row-level security (RLS)
-- off, anyone holding that key could read or write these tables directly —
-- including PoliticalPreference. Enabling RLS with NO policies denies the
-- `anon` and `authenticated` roles everything through that API.
--
-- The app is unaffected: Prisma connects as `postgres`, which owns these
-- tables (and on Supabase has BYPASSRLS). Verify once, over DATABASE_URL:
--   select r.rolbypassrls from pg_roles r where r.rolname = current_user;

BEGIN;
ALTER TABLE "public"."Profile"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Worker"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ExperienceRecord"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PoliticalPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Organization"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."JurisdictionProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Job"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Engagement"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Shift"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."WorkEvent"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Validation"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ProfileMetric"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."Payout"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."AuditEvent"          ENABLE ROW LEVEL SECURITY;

-- Defense in depth: take back the table privileges Supabase grants the API
-- roles by default, now and for tables created later — so a future table
-- that forgets RLS still isn't exposed. (Tables the app intends to expose
-- to clients, like Message for Realtime, are granted explicitly.)
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
-- Postgres also grants EXECUTE on every new function to PUBLIC, globally; a
-- per-schema default can't take that back. So Turfcut keeps its functions
-- in "turfcut_private" (not exposed) and revokes PUBLIC on each one.
-- Re-running this after m4-migration.sql must not cut off chat Realtime:
-- restore the one deliberate client grant (still filtered by RLS policies).
DO $$
BEGIN
  IF to_regclass('"public"."Message"') IS NOT NULL THEN
    -- Ids and times only (M4.1): never message text. The REVOKE ALL above
    -- already cleared any table-wide grant, so this leaves only columns.
    GRANT SELECT ("id", "conversationId", "createdAt") ON "public"."Message" TO authenticated;
    GRANT SELECT ("id", "messageId", "conversationId", "createdAt") ON "public"."MessageRevision" TO authenticated;
  END IF;
END $$;
COMMIT;
