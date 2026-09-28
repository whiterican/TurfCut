/**
 * Central env access. Every missing-variable failure in the app should go
 * through here so the developer gets "set X in .env.local" instead of a
 * cryptic crash. The app must boot without any of these set (M0 rule).
 */

export function getSupabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw missing("NEXT_PUBLIC_SUPABASE_URL");
  return v;
}

export function getSupabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw missing("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return v;
}

export function getSupabaseServiceRoleKey(): string {
  const v = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!v) throw missing("SUPABASE_SERVICE_ROLE_KEY");
  return v;
}

export function getDatabaseUrl(): string {
  const v = process.env.DATABASE_URL;
  if (!v) throw missing("DATABASE_URL");
  return v;
}

/** True when the browser-safe Supabase config is present. */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function missing(name: string): Error {
  return new Error(
    `[turfcut] Missing environment variable ${name}. ` +
      `Copy .env.example to .env.local and fill it in (see README.md).`
  );
}
