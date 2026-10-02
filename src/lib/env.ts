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

/**
 * The site's public origin (e.g. https://app.turfcut.com), used to build
 * links that leave the site — magic links and confirmation emails. Never
 * derived from request headers in production: a forged Host header would
 * otherwise point a victim's sign-in link at an attacker's server.
 * Returns null when unset in production.
 */
export function getSiteUrl(): string | null {
  const v = process.env.SITE_URL;
  if (v) {
    try {
      return new URL(v).origin;
    } catch {
      return null;
    }
  }
  return null;
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
