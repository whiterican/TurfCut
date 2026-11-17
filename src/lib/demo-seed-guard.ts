/**
 * Demo seed (prisma/demo-seed.ts): the pure parts, so they can be tested
 * without a database. A placeholder statewide CO profile is only created
 * when the seed is clearly pointed at a dedicated demo database.
 */
import { LIVE_SUPABASE_PROJECT_REFS } from "./demo-accounts";
import { cleanDatabaseUrl, turfcutDemoOn } from "./env";

/** How long a demo-created statewide profile stays approved. */
export const DEMO_STATEWIDE_EXPIRY_DAYS = 14;

/** Written into the profile's rules notes: this is not counsel-approved. */
export const DEMO_ONLY_NOTES =
  "DEMO ONLY — not counsel-approved. Seed rules — replace with counsel-approved text before pilot.";

export const STATEWIDE_CO_ID = "00000000-0000-0000-0000-000000000022";

/**
 * Live Turfcut Supabase projects: the one list, kept with the demo logins
 * (src/lib/demo-accounts.ts). The demo seed always refuses these, even when
 * TURFCUT_DEMO is on and TURFCUT_DEMO_PROJECT_REF matches.
 */
export { LIVE_SUPABASE_PROJECT_REFS };

export function isLiveSupabaseRef(ref: string | null | undefined): boolean {
  return !!ref && LIVE_SUPABASE_PROJECT_REFS.includes(ref.trim().toLowerCase());
}

export type DemoSeedEnv = {
  TURFCUT_DEMO?: string;
  DIRECT_URL?: string;
  TURFCUT_DEMO_PROJECT_REF?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  DATABASE_URL?: string;
  [key: string]: string | undefined;
};

/**
 * The Supabase project's ref, from its URL: "abcd1234" for
 * https://abcd1234.supabase.co, the host and port for anything else (a local
 * stack at http://127.0.0.1:54321 is "127.0.0.1:54321").
 */
export function projectRefFromSupabaseUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const m = /^([a-z0-9]+)\.supabase\.(co|in)$/i.exec(u.hostname);
    return m ? m[1].toLowerCase() : u.host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The project the database URL points at: the Supabase ref from
 * db.<ref>.supabase.co, or from a pooler user postgres.<ref>, or the
 * host (and port) for a local or other database.
 */
export function projectRefFromDatabaseUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const u = new URL(cleanDatabaseUrl(url));
    const host = u.hostname.toLowerCase();
    const direct = /^db\.([a-z0-9]+)\.supabase\.(co|in)$/i.exec(host);
    if (direct) return direct[1].toLowerCase();
    const hosted = /^([a-z0-9]+)\.supabase\.(co|in)$/i.exec(host);
    if (hosted) return hosted[1].toLowerCase();
    if (/\.pooler\.supabase\.(co|com|in)$/i.test(host)) {
      let user = u.username;
      try {
        user = decodeURIComponent(u.username);
      } catch {
        /* keep the raw username */
      }
      // Exact postgres.<ref> only: postgres.abc-x must not be read as ref "abc".
      const pooled = /^postgres\.([a-z0-9]+)$/i.exec(user);
      return pooled ? pooled[1].toLowerCase() : null;
    }
    if (!host) {
      const sock = u.searchParams.get("host");
      return sock?.startsWith("/") ? `socket:${sock}` : null;
    }
    return u.host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Whether this run may create a placeholder statewide CO profile: TURFCUT_DEMO
 * is 1, and TURFCUT_DEMO_PROJECT_REF equals the ref in both
 * NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL. A mismatch or a missing value
 * is not an error for the rest of the seed — it just must not create that
 * profile. Error text never echoes the expected ref (so it can't be copied
 * onto a live project).
 */
export function demoDatabaseGuard(env: DemoSeedEnv): { ok: true; ref: string } | { ok: false; reason: string } {
  let demoOn = false;
  try {
    demoOn = turfcutDemoOn(env);
  } catch {
    demoOn = false;
  }
  if (!demoOn) {
    return { ok: false, reason: "TURFCUT_DEMO is not on (1, true or yes): a placeholder statewide profile is only created in a dedicated demo database." };
  }
  // A live project's ref anywhere in DATABASE_URL is refused, as the demo logins do (src/lib/demo-accounts.ts).
  const lowered = (env.DATABASE_URL ?? "").toLowerCase();
  if (LIVE_SUPABASE_PROJECT_REFS.some((live) => lowered.includes(live))) {
    return { ok: false, reason: "DATABASE_URL points at the live Turfcut project. The demo seed goes only into a dedicated demo project." };
  }
  const supabaseRef = projectRefFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const databaseRef = projectRefFromDatabaseUrl(env.DATABASE_URL);
  if (isLiveSupabaseRef(supabaseRef) || isLiveSupabaseRef(databaseRef)) {
    return { ok: false, reason: "This Supabase project is the live Turfcut project. The demo seed goes only into a dedicated demo project." };
  }
  const confirmed = env.TURFCUT_DEMO_PROJECT_REF?.trim().toLowerCase() ?? "";
  if (!confirmed) {
    return { ok: false, reason: "Set TURFCUT_DEMO_PROJECT_REF to the dedicated demo project's ref, matching both NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL." };
  }
  if (!supabaseRef) {
    return { ok: false, reason: "Set NEXT_PUBLIC_SUPABASE_URL to the dedicated demo project's URL." };
  }
  if (!databaseRef) {
    return { ok: false, reason: "Set DATABASE_URL to the dedicated demo project's database." };
  }
  if (isLiveSupabaseRef(confirmed)) {
    return { ok: false, reason: "This Supabase project is the live Turfcut project. The demo seed goes only into a dedicated demo project." };
  }
  if (confirmed !== supabaseRef) {
    return { ok: false, reason: "TURFCUT_DEMO_PROJECT_REF doesn't match NEXT_PUBLIC_SUPABASE_URL." };
  }
  if (confirmed !== databaseRef) {
    return { ok: false, reason: "TURFCUT_DEMO_PROJECT_REF doesn't match DATABASE_URL." };
  }
  return { ok: true, ref: confirmed };
}

/** The settings a guarded run needs, said the same way in every refusal. */
const GUARDED_SETTINGS =
  "Set TURFCUT_DEMO=1, NEXT_PUBLIC_SUPABASE_URL=https://<demo-ref>.supabase.co and TURFCUT_DEMO_PROJECT_REF=<demo-ref> for the dedicated demo project, with DATABASE_URL pointing at that same project, then run it again.";

/** The live project's ref appears anywhere in this value (raw or URL-decoded, any case). */
function mentionsLiveRef(value: string | undefined): boolean {
  if (!value) return false;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    /* keep the raw value */
  }
  const haystack = `${value}\n${decoded}`.toLowerCase();
  return LIVE_SUPABASE_PROJECT_REFS.some((live) => haystack.includes(live));
}

const HOSTED_SUPABASE_HOST = /(^|\.)supabase\.(co|com|in)$/i;

/**
 * Whether DATABASE_URL is a hosted Supabase database: a *.supabase.co /
 * *.supabase.in host (direct db.<ref>), a *.pooler.supabase.com host, or a
 * libpq-style ?host= override naming one. Anything else (localhost,
 * 127.0.0.1, a CI service container, a Unix socket) counts as local.
 */
export function isHostedSupabaseDatabaseUrl(url: string): boolean {
  const u = new URL(cleanDatabaseUrl(url));
  if (HOSTED_SUPABASE_HOST.test(u.hostname)) return true;
  const hostParam = u.searchParams.get("host") ?? "";
  return hostParam.split(",").some((h) => HOSTED_SUPABASE_HOST.test(h.trim().replace(/:\d+$/, "")));
}

export type DemoSeedTarget =
  | { ok: true; kind: "guarded"; ref: string }
  | { ok: true; kind: "local"; guard: ReturnType<typeof demoDatabaseGuard> }
  | { ok: false; reason: string };

/**
 * Where `npm run seed:demo` may write. Checked before the seed reads or
 * writes anything; a refusal exits 1 with nothing written.
 *
 * 1. The live Turfcut project, named anywhere in NEXT_PUBLIC_SUPABASE_URL,
 *    DATABASE_URL, DIRECT_URL or TURFCUT_DEMO_PROJECT_REF: always refused.
 *    No setting overrides it.
 * 2. Any other hosted Supabase database: refused unless the run is guarded
 *    (demoDatabaseGuard: TURFCUT_DEMO=1 and a matching ref in both URLs). So
 *    a hosted run can never fall back to filing every job in Denver.
 * 3. A local Postgres (anything that isn't hosted Supabase): runs as it
 *    always has, with no extra settings. Unguarded, jobs outside Denver are
 *    filed in Denver and no statewide profile is created.
 * An unset or unreadable DATABASE_URL is refused, since it can't be classified.
 */
export function demoSeedTarget(env: DemoSeedEnv): DemoSeedTarget {
  if ([env.NEXT_PUBLIC_SUPABASE_URL, env.DATABASE_URL, env.DIRECT_URL, env.TURFCUT_DEMO_PROJECT_REF].some(mentionsLiveRef)) {
    return {
      ok: false,
      reason: "This is the live Turfcut Supabase project. The demo seed never writes there, whatever TURFCUT_DEMO or TURFCUT_DEMO_PROJECT_REF say. Point DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL at a dedicated demo project or a local Postgres.",
    };
  }
  if (!env.DATABASE_URL?.trim()) {
    return { ok: false, reason: "DATABASE_URL is not set. Export the demo database's DATABASE_URL in this shell (tsx doesn't read .env.local)." };
  }
  let hosted: boolean;
  try {
    hosted = isHostedSupabaseDatabaseUrl(env.DATABASE_URL);
  } catch {
    return { ok: false, reason: "DATABASE_URL isn't a usable Postgres URL, so the demo seed can't tell where it would write." };
  }
  const guard = demoDatabaseGuard(env);
  if (hosted) {
    if (!guard.ok) {
      return { ok: false, reason: `DATABASE_URL is a hosted Supabase database, and this run isn't guarded: ${guard.reason} ${GUARDED_SETTINGS}` };
    }
    return { ok: true, kind: "guarded", ref: guard.ref };
  }
  return guard.ok ? { ok: true, kind: "guarded", ref: guard.ref } : { ok: true, kind: "local", guard };
}

export type ExistingStatewide = { id: string; isCurrent: boolean; usable: boolean };

export type StatewidePlan =
  | { kind: "use-existing"; id: string }
  | { kind: "create"; id: string; approvalExpiresAt: Date; notes: string }
  | { kind: "denver-only" }
  | { kind: "refuse"; reason: string };

/** When a newly created demo statewide profile's approval lapses. */
export function demoStatewideExpiry(now: Date, days = DEMO_STATEWIDE_EXPIRY_DAYS): Date {
  return new Date(now.getTime() + days * 86_400_000);
}

/**
 * Whether the seed may create or reuse a statewide CO profile, or should
 * keep every demo job in Denver. Looks at every statewide row, not only the
 * current one: Postgres treats a null locality as distinct in the unique
 * index, so creating another approved v1 would silently succeed.
 */
export function planStatewideProfile(opts: {
  guarded: boolean;
  existing: readonly ExistingStatewide[];
  now: Date;
  fixedId?: string;
}): StatewidePlan {
  const current = opts.existing.find((e) => e.isCurrent) ?? null;
  if (current?.usable) return { kind: "use-existing", id: current.id };
  if (current && !current.usable) {
    if (opts.guarded) {
      return { kind: "refuse", reason: "The current statewide CO jurisdiction can't take demo jobs." };
    }
    return { kind: "denver-only" };
  }
  if (opts.existing.length > 0) {
    if (opts.guarded) {
      return {
        kind: "refuse",
        reason: "A statewide CO profile already exists but isn't current. The seed will not create another approved version.",
      };
    }
    return { kind: "denver-only" };
  }
  if (opts.guarded) {
    return {
      kind: "create",
      id: opts.fixedId ?? STATEWIDE_CO_ID,
      approvalExpiresAt: demoStatewideExpiry(opts.now),
      notes: DEMO_ONLY_NOTES,
    };
  }
  return { kind: "denver-only" };
}

/** A DEMO ONLY profile is treated as expiring once fewer than this many days remain. */
export const DEMO_STATEWIDE_RENEW_WITHIN_DAYS = 7;

export function demoOnlyRules(rules: unknown): boolean {
  if (!rules || typeof rules !== "object" || !("notes" in rules)) return false;
  return String((rules as { notes?: unknown }).notes ?? "") === DEMO_ONLY_NOTES;
}

/**
 * Re-seeding a guarded demo may extend this profile's approval (and nothing
 * else) when it has expired or is within DEMO_STATEWIDE_RENEW_WITHIN_DAYS of
 * expiring. Counsel-approved or never-expiring profiles are left alone.
 */
export function shouldRenewDemoStatewide(
  profile: { state: string; locality: string | null; approvalExpiresAt: Date | null; rules: unknown } | null,
  now: Date
): boolean {
  if (!profile || profile.state !== "CO" || profile.locality !== null) return false;
  if (!demoOnlyRules(profile.rules) || !profile.approvalExpiresAt) return false;
  return profile.approvalExpiresAt.getTime() - now.getTime() <= DEMO_STATEWIDE_RENEW_WITHIN_DAYS * 86_400_000;
}

/**
 * City and profile for one demo job. Outside a guarded demo (or when the
 * plan is denver-only), non-Denver jobs are filed in Denver so the publish
 * gate stays consistent and no statewide profile is created.
 */
export function demoJobCityAndJurisdiction(
  pickedCity: string,
  plan: StatewidePlan,
  denverId: string,
  denverCity = "Denver"
): { city: string; jurisdictionId: string } {
  if (pickedCity === denverCity) return { city: pickedCity, jurisdictionId: denverId };
  if (plan.kind === "use-existing" || plan.kind === "create") {
    return { city: pickedCity, jurisdictionId: plan.id };
  }
  return { city: denverCity, jurisdictionId: denverId };
}
