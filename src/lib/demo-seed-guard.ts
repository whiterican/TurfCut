/**
 * Demo seed (prisma/demo-seed.ts): the pure parts, so they can be tested
 * without a database. A placeholder statewide CO profile is only created
 * when the seed is clearly pointed at a dedicated demo database.
 */
import { cleanDatabaseUrl } from "./env";

/** How long a demo-created statewide profile stays approved. */
export const DEMO_STATEWIDE_EXPIRY_DAYS = 14;

/** Written into the profile's rules notes: this is not counsel-approved. */
export const DEMO_ONLY_NOTES =
  "DEMO ONLY — not counsel-approved. Seed rules — replace with counsel-approved text before pilot.";

export const STATEWIDE_CO_ID = "00000000-0000-0000-0000-000000000022";

export type DemoSeedEnv = {
  TURFCUT_DEMO?: string;
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
      const pooled = /^postgres\.([a-z0-9]+)/i.exec(user);
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
  if (env.TURFCUT_DEMO !== "1") {
    return { ok: false, reason: "TURFCUT_DEMO is not 1: a placeholder statewide profile is only created in a dedicated demo database." };
  }
  const confirmed = env.TURFCUT_DEMO_PROJECT_REF?.trim().toLowerCase() ?? "";
  if (!confirmed) {
    return { ok: false, reason: "Set TURFCUT_DEMO_PROJECT_REF to the dedicated demo project's ref, matching both NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL." };
  }
  const supabaseRef = projectRefFromSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (!supabaseRef) {
    return { ok: false, reason: "Set NEXT_PUBLIC_SUPABASE_URL to the dedicated demo project's URL." };
  }
  const databaseRef = projectRefFromDatabaseUrl(env.DATABASE_URL);
  if (!databaseRef) {
    return { ok: false, reason: "Set DATABASE_URL to the dedicated demo project's database." };
  }
  if (confirmed !== supabaseRef) {
    return { ok: false, reason: "TURFCUT_DEMO_PROJECT_REF doesn't match NEXT_PUBLIC_SUPABASE_URL." };
  }
  if (confirmed !== databaseRef) {
    return { ok: false, reason: "TURFCUT_DEMO_PROJECT_REF doesn't match DATABASE_URL." };
  }
  return { ok: true, ref: confirmed };
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
