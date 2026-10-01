-- Turfcut M4-0 — lock down Supabase's automatic Data API. Run ONCE (safe to
-- re-run). Paste into the Supabase SQL editor, before m4-migration.sql.
--
-- Why: Supabase exposes every table in `public` through its REST API using
-- the anon key that ships to every browser. With row-level security (RLS)
-- off, anyone holding that key could read or write these tables directly —
-- including PoliticalPreference. Enabling RLS with NO policies denies the
-- `anon` and `authenticated` roles everything through that API.
--
-- The app is unaffected: Prisma connects as `postgres`, which bypasses RLS.

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
COMMIT;
