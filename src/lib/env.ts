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

/**
 * The app's runtime connection: DATABASE_URL, which on Vercel must be the
 * Supabase pooler (transaction mode, port 6543). Migrations and the
 * Prisma CLI use DIRECT_URL (port 5432) instead; see prisma/schema.prisma
 * and the README's deployment notes.
 */
export function getDatabaseUrl(): string {
  const v = process.env.DATABASE_URL;
  if (!v) throw missing("DATABASE_URL");
  const { url, warning } = runtimeDatabaseUrl(v, !!process.env.VERCEL);
  if (warning && !warned) {
    warned = true;
    console.warn(`[turfcut] ${warning}`);
  }
  return url;
}
let warned = false;

/**
 * Prepares the runtime URL. Serverless instances each open their own
 * connections, so production must go through Supabase's pooler; a direct
 * connection (5432) on Vercel is warned about, since it exhausts
 * max_connections under load. On the pooler's transaction mode Prisma needs
 * pgbouncer=true (no prepared statements), and one connection per instance
 * is plenty: both are added when the URL doesn't say otherwise. Pure.
 */
export function runtimeDatabaseUrl(raw: string, serverless: boolean): { url: string; warning: string | null } {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { url: raw, warning: null }; // leave anything unusual to Prisma's own error
  }
  const pooled = u.port === "6543";
  if (pooled) {
    if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "1");
  }
  const warning =
    serverless && !pooled
      ? "DATABASE_URL is not the Supabase pooler (port 6543). Serverless instances each open connections and will exhaust max_connections; use the pooler URL at runtime and DIRECT_URL for migrations."
      : null;
  return { url: pooled ? u.toString() : raw, warning };
}

/**
 * The site's public origin (e.g. https://app.turfcut.com), used to build
 * links that leave the site — magic links and confirmation emails. Never
 * derived from request headers in production: a forged Host header would
 * otherwise point a victim's sign-in link at an attacker's server.
 * Returns null when unset in production.
 */
export function getSiteUrl(): string | null {
  return siteOriginOf(process.env.SITE_URL);
}

/**
 * The http(s) origin of a SITE_URL value, or null. Anything else counts as
 * unset: "localhost:3000" parses as a URL whose origin is "null", which would
 * otherwise build links like "null/auth/confirm".
 */
export function siteOriginOf(v: string | undefined): string | null {
  if (!v?.trim()) return null;
  try {
    const u = new URL(v.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** Stripe secret key (M5 payouts). Server only. */
export function getStripeSecretKey(): string {
  const v = process.env.STRIPE_SECRET_KEY;
  if (!v) throw missing("STRIPE_SECRET_KEY");
  return v;
}

/**
 * Signing secrets for /api/stripe/webhook: the platform endpoint
 * (STRIPE_WEBHOOK_SECRET, transfer events) and, optionally, the Connect
 * endpoint (STRIPE_CONNECT_WEBHOOK_SECRET, account.updated).
 */
export function getStripeWebhookSecrets(): string[] {
  const v = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET].filter((x): x is string => !!x);
  if (!v.length) throw missing("STRIPE_WEBHOOK_SECRET");
  return v;
}

/** True when payouts can reach Stripe. Without it, pay is tracked but not sent. */
export function hasStripeConfig(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * What sign-in and sign-up can't work without. They check these up front so a
 * half-configured deployment names what's missing, instead of reading as an
 * outage ("briefly unavailable") or creating logins the app can't finish
 * setting up. Names only, never values.
 */
export const CORE_SETTINGS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "DATABASE_URL"] as const;

// Fixed references, like the getters above: Next builds NEXT_PUBLIC_ values
// into server code too, so on a host that passes them only at build time the
// check must see the same values the getters do.
const coreEnv = (): Record<string, string | undefined> => ({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  DATABASE_URL: process.env.DATABASE_URL,
});

export function missingCoreSettings(env: Record<string, string | undefined> = coreEnv()): string[] {
  return CORE_SETTINGS.filter((name) => !env[name]?.trim());
}

/**
 * What sending a member invite needs on top of the core settings: the
 * service key (the invite email is sent server-side) and, in production, a
 * valid SITE_URL for the link (development falls back to the request's host,
 * as siteOrigin does).
 */
export function missingInviteSettings(
  env: Record<string, string | undefined> = {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SITE_URL: process.env.SITE_URL,
    NODE_ENV: process.env.NODE_ENV,
  }
): string[] {
  const out: string[] = [];
  if (!env.SUPABASE_SERVICE_ROLE_KEY?.trim()) out.push("SUPABASE_SERVICE_ROLE_KEY");
  if (env.NODE_ENV === "production" && !siteOriginOf(env.SITE_URL)) out.push("SITE_URL");
  return out;
}

/** "Sign-in isn't configured on this server yet (DATABASE_URL)." */
export function notConfiguredMessage(what: string, missingNames: readonly string[]): string {
  return `${what} isn't configured on this server yet (${missingNames.join(", ")}).`;
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
