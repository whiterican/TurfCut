/**
 * Central env access. Every missing-variable failure in the app should go
 * through here so the developer gets "set X in .env.local" instead of a
 * cryptic crash. The app must boot without any of these set (M0 rule).
 */

export function getSupabaseUrl(): string {
  const v = supabaseUrlOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!v) throw missing("NEXT_PUBLIC_SUPABASE_URL");
  return v;
}

export function getSupabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!v) throw missing("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return v;
}

/**
 * A usable Supabase project URL (http(s), trimmed), or null. Supabase's
 * client throws on anything else, so a blank or scheme-less paste counts as
 * unset everywhere, including the proxy that runs on every request.
 */
export function supabaseUrlOf(v: string | undefined): string | null {
  const t = v?.trim();
  // Supabase's own check: URL parsers forgive "https:abc" or "https:/abc",
  // Supabase's client throws on them.
  if (!t || !/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === "https:" || u.protocol === "http:" ? t : null;
  } catch {
    return null;
  }
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
  if (!v?.trim()) throw missing("DATABASE_URL");
  // Refused before Prisma sees it: Prisma's own errors would print part of a
  // password with an unencoded / # or ? as the "host:port" it couldn't reach.
  if (unusableDatabaseUrl(v)) throw new Error(`[turfcut] DATABASE_URL can't be used (${describeDatabaseUrl(v)}).`);
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
 * pgbouncer=true (no prepared statements). Each instance gets three
 * connections: pages run their queries side by side (Promise.all) and one
 * instance serves several requests at once, so with one connection they
 * queued, and a write's $transaction (pay, chat, jobs, members) could give up
 * after Prisma's 2 s maxWait while another held it. The cost: the pooler's
 * client limit is per project (200 on Supabase's smallest plans), so it now
 * fits about 66 warm instances instead of 200; ?connection_limit=1 in
 * DATABASE_URL restores the old setting. Both are added when the URL doesn't
 * say otherwise. Pure.
 */
export function runtimeDatabaseUrl(raw: string, serverless: boolean): { url: string; warning: string | null } {
  const clean = cleanDatabaseUrl(raw);
  if (!hasPostgresScheme(clean)) {
    return { url: clean, warning: `DATABASE_URL must start with postgresql:// (${describeDatabaseUrl(raw)}).` };
  }
  let u: URL;
  try {
    u = new URL(clean);
  } catch {
    return { url: clean, warning: null }; // leave anything unusual to Prisma's own error
  }
  const pooled = u.port === "6543";
  if (pooled) {
    if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "3");
  }
  const notes: string[] = [];
  if (serverless && !pooled)
    notes.push(
      "DATABASE_URL is not the Supabase pooler (port 6543). Serverless instances each open connections and will exhaust max_connections; use the pooler URL at runtime and DIRECT_URL for migrations."
    );
  // Supabase's pooler finds the project from the user name: "postgres.<project-ref>".
  if (u.hostname.endsWith(".pooler.supabase.com") && !safeDecode(u.username).includes("."))
    notes.push('DATABASE_URL points at the Supabase pooler, whose user name must be "postgres.<project-ref>", not "postgres".');
  const warning = notes.length ? `${notes.join(" ")} (${describeDatabaseUrl(raw)})` : null;
  return { url: pooled ? u.toString() : clean, warning };
}

/**
 * Undoes what a settings form or a notes app does to a pasted URL: spaces
 * and line breaks around it, wrapping quotes or backticks, a "DATABASE_URL="
 * prefix, and a capitalised scheme (phones capitalise the first letter).
 * Prisma accepts only a literal lowercase postgresql:// or postgres:// start.
 */
export function cleanDatabaseUrl(raw: string): string {
  return tidy(raw).clean;
}

function tidy(raw: string): { clean: string; stripped: string; fixes: string[] } {
  const fixes: string[] = [];
  let v = raw.trim();
  if (v !== raw) fixes.push("had spaces or line breaks around it");
  // Line breaks and tabs never belong in a URL (URL parsers drop them too), so
  // any inside is a wrapped paste or a stray Return in a settings box; take
  // spaces next to them along. A lone space stays: in a password it is legal
  // once encoded, and Prisma encodes it.
  const unbroken = v.replace(/[ \t]*[\r\n]+[ \t]*/g, "").replace(/\t/g, "");
  if (unbroken !== v) {
    v = unbroken;
    fixes.push("had line breaks inside it");
  }
  const prefix = /^(export\s*)?DATABASE_URL\s*=\s*/i.exec(v);
  if (prefix) {
    v = v.slice(prefix[0].length).trim();
    fixes.push('had a "DATABASE_URL=" prefix');
  }
  const q = /^(["'`])([\s\S]*)\1$/.exec(v);
  if (q) {
    v = q[2].trim();
    fixes.push("was wrapped in quotes");
  }
  const clean = v.replace(/^postgres(ql)?:\/\//i, (m) => m.toLowerCase());
  if (clean !== v) fixes.push("had capital letters in postgresql://");
  return { clean, stripped: v, fixes };
}

function hasPostgresScheme(v: string): boolean {
  return v.startsWith("postgresql://") || v.startsWith("postgres://");
}

/**
 * True when an @ comes after the host part ends. URL parsers end the host at
 * the first / # or ?, so a password holding one unencoded puts part of
 * itself where the host and port would be (and into any error that names
 * them). A real @ in a query or path is possible but has no place in a
 * database URL.
 */
function credentialsNeedEncoding(clean: string): boolean {
  const rest = clean.slice(clean.indexOf("://") + 3);
  const end = rest.search(/[/?#]/);
  return end >= 0 && rest.slice(end).includes("@");
}

/** A DATABASE_URL that can't be handed to Prisma, even after tidying. */
export function unusableDatabaseUrl(raw: string): boolean {
  const clean = cleanDatabaseUrl(raw);
  if (!hasPostgresScheme(clean) || credentialsNeedEncoding(clean)) return true;
  // A user name holding an @ means the split may be wrong, and Prisma's
  // login errors name the user.
  try {
    return safeDecode(new URL(clean).username).includes("@");
  } catch {
    return false;
  }
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * A DATABASE_URL's shape for logs, never its password: what was tidied, what
 * it starts with, and the user name, host and port when they can be told
 * apart from the password with certainty.
 */
export function describeDatabaseUrl(raw: string): string {
  const { clean, stripped, fixes } = tidy(raw);
  const parts = [...fixes];
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(stripped);
  parts.push(scheme ? `starts with "${scheme[1]}://"` : "doesn't start with a scheme like postgresql://");
  if (!scheme) return parts.join(", ");
  if (credentialsNeedEncoding(clean)) {
    parts.push("the password may contain / # ? or @, which must be percent-encoded (or there's an @ after the host)");
    return parts.join(", ");
  }
  let u: URL | null = null;
  try {
    u = new URL(clean);
  } catch {}
  if (!u) parts.push("not readable as a URL");
  else if (!u.username) parts.push("no user name");
  // Without a password the one name given may itself be the password.
  else if (!u.password) parts.push("no password given");
  // An @ in the user name means the split is uncertain: it may hold password text.
  else if (safeDecode(u.username).includes("@")) parts.push("the user name contains @, which must be percent-encoded");
  else parts.push(`user "${safeDecode(u.username)}"`, `host "${u.hostname || "(none)"}"`, `port ${u.port || "(default)"}`);
  return parts.join(", ");
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
  // A value the app would refuse counts as missing, so the form names it
  // instead of reading as an outage.
  return CORE_SETTINGS.filter((name) => {
    const v = env[name];
    if (!v?.trim()) return true;
    if (name === "NEXT_PUBLIC_SUPABASE_URL") return !supabaseUrlOf(v);
    if (name === "DATABASE_URL") return unusableDatabaseUrl(v);
    return false;
  });
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

/**
 * The missing names for a log line, plus what's wrong with a DATABASE_URL
 * that is set but unusable (its shape, never its password).
 */
export function unsetDetail(names: readonly string[], databaseUrl = process.env.DATABASE_URL): string {
  const base = names.join(", ");
  return names.includes("DATABASE_URL") && databaseUrl?.trim() ? `${base}; DATABASE_URL ${describeDatabaseUrl(databaseUrl)}` : base;
}

/** "Sign-in isn't configured on this server yet (DATABASE_URL)." */
export function notConfiguredMessage(what: string, missingNames: readonly string[]): string {
  return `${what} isn't configured on this server yet (${missingNames.join(", ")}).`;
}

/** True when the browser-safe Supabase config is present and usable. */
export function hasSupabaseConfig(): boolean {
  return Boolean(supabaseUrlOf(process.env.NEXT_PUBLIC_SUPABASE_URL) && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
}

function missing(name: string): Error {
  return new Error(
    `[turfcut] Missing environment variable ${name}. ` +
      `Copy .env.example to .env.local and fill it in (see README.md).`
  );
}
