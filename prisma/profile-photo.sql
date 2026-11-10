-- Profile photos (Caden, Nov 10 2026): anyone signed in may add a photo of
-- themself. One nullable column on "Profile" and one PRIVATE storage bucket.
-- The photo is shown only to the person it belongs to; it is served through
-- a signed-in route (/api/profile-photo), never by a public or signed link.
-- Nothing ranks, matches or infers anything from it.
-- Idempotent: safe to run again. Also folded into supabase-manual-setup.sql.

ALTER TABLE "public"."Profile" ADD COLUMN IF NOT EXISTS "avatarKey" TEXT;

-- No grant on the new column: "Profile" stays closed to anon and authenticated
-- (m4-0-rls-lockdown.sql); only the server reads it.

DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('profile-photos', 'profile-photos', false, 2097152, ARRAY['image/png', 'image/jpeg'])
    ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/png', 'image/jpeg'];
  END IF;
END $$;
