import { cleanDatabaseUrl } from "./env";

/**
 * Demo logins (prisma/demo-accounts.ts): the pure parts, so they can be
 * tested without a database or Supabase.
 *
 * The demo seed (prisma/demo-seed.ts) makes organizations, staff and workers
 * with no auth users, and the README says never to link a real login to a
 * demo organization: anyone signed in as its staff sees its applicants. The
 * demo-accounts script gives the demo staff (and one demo worker) their own
 * logins, and only in a dedicated demo project: it refuses a database or
 * Supabase project that has anyone the seeds didn't make.
 */

export type DemoStaffRole = "OWNER" | "SUPERVISOR" | "FINANCE";
export type DemoAccountRole = DemoStaffRole | "WORKER";

export interface DemoOrgStaff {
  id: string;
  name: string;
  staff: Array<{ id: string; role: string; displayName: string | null }>;
}

export interface DemoAccount {
  /** The existing profile's id: the auth user is created with the same id, so nothing is relinked. */
  profileId: string;
  role: DemoAccountRole;
  email: string;
  displayName: string;
  orgName: string | null;
}

/** Demo staff roles each demo organization gets a login for: two of them can approve pay, so the two-person rule can be shown. */
export const DEMO_STAFF_ROLES: readonly DemoStaffRole[] = ["OWNER", "SUPERVISOR", "FINANCE"];

/**
 * Finance people the script adds, one per demo organization in the order the
 * demo seed made them. Fictional, like every other demo name.
 */
export const DEMO_FINANCE_NAMES = ["Rosa Jimenez", "Theo Grant", "Lila Chen", "Ivan Petrov", "Maren Holt", "Kofi Mensah"] as const;

export const DEMO_SUFFIX = " (demo)";

/** Reserved for documentation (RFC 2606): no mail ever reaches it. */
export const DEFAULT_DEMO_EMAIL_DOMAIN = "example.com";

/** The minimum for the shared demo password (the app's own sign-up asks for 8; demo logins get more). */
export const DEMO_PASSWORD_MIN = 12;

export function slug(s: string): string {
  return s
    .replace(/\(demo\)/gi, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** e.g. owner.mile-high-civic-works@example.com, worker.maya-okafor@example.com */
export function demoEmail(role: DemoAccountRole, name: string, domain = DEFAULT_DEMO_EMAIL_DOMAIN): string {
  return `${role.toLowerCase()}.${slug(name)}@${domain}`;
}

/** A plain domain only: the emails must never reach a real inbox by accident of a typo. */
export function emailDomainProblem(domain: string): string | null {
  return /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain) ? null : `DEMO_ACCOUNTS_EMAIL_DOMAIN "${domain}" isn't a domain name.`;
}

export function passwordProblem(pw: string | undefined): string | null {
  if (!pw) return "Set DEMO_ACCOUNTS_PASSWORD in the shell (never in a committed file): the password every demo login gets.";
  if (pw.length < DEMO_PASSWORD_MIN) return `DEMO_ACCOUNTS_PASSWORD must be at least ${DEMO_PASSWORD_MIN} characters.`;
  // Whole words anywhere, not only at the start: "xx-password-1234" and "please-changeme-now" are placeholders too.
  if (/(?:^|[^a-z0-9])(password|changeme|change-me|change_me|demo|turfcut)(?:[^a-z0-9]|$)/i.test(pw)) {
    return "DEMO_ACCOUNTS_PASSWORD looks like a placeholder: pick a real one for the demo project.";
  }
  return null;
}

/**
 * The Supabase project's ref, from its URL: "abcd1234" for
 * https://abcd1234.supabase.co, the host and port for anything else (a local
 * Supabase at http://127.0.0.1:54321 is "127.0.0.1:54321").
 */
export function projectRefOf(url: string | undefined): string | null {
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
 * Live Turfcut Supabase projects. The demo-accounts script always refuses
 * these, even when TURFCUT_DEMO_PROJECT_REF matches. This is the only
 * project in the TurfCut org ("caden1@me.com's Project"), and the GitHub
 * "Supabase Preview" check links to its dashboard.
 */
export const LIVE_SUPABASE_PROJECT_REFS: readonly string[] = ["txzxtvsfzxfhgfiurufq"];

/**
 * The demo project must be named on purpose: TURFCUT_DEMO_PROJECT_REF has to
 * equal the ref of the Supabase project the keys point at. The confirmation
 * message never echoes the expected value, so it can't be used as a bypass.
 * A confirmed value that is only a substring of the ref is refused.
 */
export function projectProblem(supabaseUrl: string | undefined, confirmedRef: string | undefined): string | null {
  const ref = projectRefOf(supabaseUrl);
  if (!ref) return "Set NEXT_PUBLIC_SUPABASE_URL to the dedicated demo project's URL.";
  if (LIVE_SUPABASE_PROJECT_REFS.includes(ref)) {
    return "This Supabase project is the live Turfcut project. Demo logins go only into a dedicated demo project.";
  }
  if (!confirmedRef) return "Set TURFCUT_DEMO_PROJECT_REF to confirm this is a dedicated demo project, never the live one.";
  if (confirmedRef.trim().toLowerCase() !== ref) return "TURFCUT_DEMO_PROJECT_REF doesn't match the project the keys point at.";
  return null;
}

/**
 * For a hosted Supabase URL (*.supabase.co / *.supabase.in), DATABASE_URL
 * must point at the same project: either the direct host db.<ref>.supabase.co
 * (or .in), or the user postgres.<ref> on a *.pooler.supabase.com host. A
 * live project's ref anywhere in DATABASE_URL is always refused. Local
 * Supabase URLs are left alone.
 */
export function databaseUrlProblem(supabaseUrl: string | undefined, databaseUrl: string | undefined): string | null {
  const ref = projectRefOf(supabaseUrl);
  if (!ref || !supabaseUrl) return null;
  const lowered = (databaseUrl ?? "").toLowerCase();
  if (LIVE_SUPABASE_PROJECT_REFS.some((live) => lowered.includes(live))) {
    return "DATABASE_URL points at the live Turfcut project. Demo logins go only into a dedicated demo project.";
  }
  let hosted = false;
  try {
    hosted = /^[a-z0-9]+\.supabase\.(co|in)$/i.test(new URL(supabaseUrl).hostname);
  } catch {
    return null;
  }
  if (!hosted) return null;
  if (!databaseUrl?.trim()) return "Set DATABASE_URL to this same Supabase project's database.";
  let u: URL;
  try {
    u = new URL(cleanDatabaseUrl(databaseUrl));
  } catch {
    return "DATABASE_URL isn't a usable Postgres URL, so it can't be checked against the Supabase project.";
  }
  let user = u.username;
  try {
    user = decodeURIComponent(user);
  } catch {
    // keep the raw user name
  }
  const host = u.hostname.toLowerCase();
  const mismatch = "DATABASE_URL doesn't point at the same Supabase project as NEXT_PUBLIC_SUPABASE_URL (need db.<project-ref>.supabase.co, or user postgres.<project-ref> on *.pooler.supabase.com).";
  const direct = /^db\.([a-z0-9]+)\.supabase\.(co|in)$/.exec(host);
  if (direct) return direct[1] === ref ? null : mismatch;
  if (host.endsWith(".pooler.supabase.com") && user.toLowerCase() === `postgres.${ref}`) return null;
  return mismatch;
}

/**
 * The whole --yes decision for seed:demo-accounts, in the order the script
 * applies it. Pass authUserIds as null for the checks that run before
 * Supabase Auth is listed, then again with the listed ids.
 */
export function demoAccountsYesProblem(input: {
  supabaseUrl: string | undefined;
  confirmedRef: string | undefined;
  databaseUrl: string | undefined;
  password: string | undefined;
  serviceRoleKey: string | undefined;
  authUserIds: readonly string[] | null;
  plannedProfileIds: ReadonlySet<string>;
}): string | null {
  return (
    projectProblem(input.supabaseUrl, input.confirmedRef) ??
    databaseUrlProblem(input.supabaseUrl, input.databaseUrl) ??
    passwordProblem(input.password) ??
    (input.serviceRoleKey ? null : "Set SUPABASE_SERVICE_ROLE_KEY (the demo project's secret key) in the shell.") ??
    (input.authUserIds ? strayAuthLoginsProblem(input.authUserIds, input.plannedProfileIds) : null)
  );
}

/**
 * Ids the seeds made but aren't in this list are strangers: a real sign-up.
 * Demo logins never go into a project that has one.
 */
export function strangers(ids: readonly string[], known: ReadonlySet<string>): string[] {
  return ids.filter((id) => !known.has(id));
}

/**
 * Extra logins in Supabase Auth that aren't the planned demo accounts. The
 * seed script must call this; a project with a real sign-up is never a
 * dedicated demo project.
 */
export function strayAuthLoginsProblem(authUserIds: readonly string[], plannedProfileIds: ReadonlySet<string>): string | null {
  const n = strangers(authUserIds, plannedProfileIds).length;
  if (!n) return null;
  return `This Supabase project has ${n} login(s) that aren't demo logins. Demo logins go only into a dedicated demo project.`;
}

/** Demo organizations that still need a finance person (the script adds one each). */
export function orgsMissingFinance(orgs: readonly DemoOrgStaff[]): DemoOrgStaff[] {
  return orgs.filter((o) => !o.staff.some((s) => s.role === "FINANCE"));
}

/**
 * Every demo login: an owner, a supervisor and a finance person for each
 * demo organization, and the demo worker. Throws when a demo organization
 * is missing a role, so a broken demo seed is never papered over.
 */
export function planAccounts(
  orgs: readonly DemoOrgStaff[],
  worker: { profileId: string; displayName: string } | null,
  domain = DEFAULT_DEMO_EMAIL_DOMAIN
): DemoAccount[] {
  const out: DemoAccount[] = [];
  for (const o of orgs) {
    for (const role of DEMO_STAFF_ROLES) {
      // The earliest profile in each role, if a demo organization somehow has more.
      const s = o.staff.find((x) => x.role === role);
      if (!s) throw new Error(`Demo organization "${o.name}" has no ${role.toLowerCase()}.`);
      out.push({ profileId: s.id, role, email: demoEmail(role, o.name, domain), displayName: s.displayName ?? `${role.toLowerCase()}${DEMO_SUFFIX}`, orgName: o.name });
    }
  }
  if (worker) out.push({ profileId: worker.profileId, role: "WORKER", email: demoEmail("WORKER", worker.displayName, domain), displayName: worker.displayName, orgName: null });
  const emails = new Set(out.map((a) => a.email));
  if (emails.size !== out.length) throw new Error("Two demo logins would share an email: rename a demo organization.");
  return out;
}

/**
 * Pay now in the demo (fix 2): Stripe stays in test mode. A live key
 * (sk_live_/rk_live_) is refused outright; no key at all is fine for the
 * script itself (it never calls Stripe), but the app needs a test key to pay.
 */
export function stripeKeyMode(key: string | undefined): "none" | "test" | "live" | "unknown" {
  if (!key) return "none";
  if (/^(sk|rk)_test_/.test(key)) return "test";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return "unknown";
}

export function stripeKeyProblem(key: string | undefined): string | null {
  const mode = stripeKeyMode(key);
  if (mode === "live") return "STRIPE_SECRET_KEY is a LIVE key. The demo runs on Stripe test mode only: use the sk_test_ key.";
  if (mode === "unknown") return "STRIPE_SECRET_KEY isn't a Stripe secret key (sk_test_…).";
  return null;
}

/** The demo worker's Stripe test Connect (Express) account, made in Stripe's test mode (README, "Pay now in the demo"). */
export function connectAccountProblem(id: string | undefined): string | null {
  if (!id) return null;
  return /^acct_[A-Za-z0-9]{8,}$/.test(id.trim()) ? null : `DEMO_STRIPE_ACCOUNT_ID "${id}" isn't a Stripe account id (acct_…).`;
}

/**
 * What linking the test account to the demo worker would do: link it, leave
 * it (already linked), or refuse (the worker already has another account,
 * or another worker has this one).
 */
export function connectLinkPlan(
  accountId: string,
  worker: { id: string; stripeAccountId: string | null },
  holder: { id: string } | null
): { action: "link" | "keep" } | { action: "refuse"; reason: string } {
  if (worker.stripeAccountId === accountId) return { action: "keep" };
  if (worker.stripeAccountId) return { action: "refuse", reason: `The demo worker already has Stripe account ${worker.stripeAccountId}; not replacing it.` };
  if (holder && holder.id !== worker.id) return { action: "refuse", reason: `Stripe account ${accountId} already belongs to another worker.` };
  return { action: "link" };
}
