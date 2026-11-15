/**
 * Demo logins: sign-ins for the demo seed's organization staff and one demo
 * worker, so the organizer side (post → hire → schedule → review → approve
 * pay as a second person → Pay now) can be shown on demo data.
 *
 * ONLY for a dedicated demo project (its own Supabase project and database).
 * The README's rule stands for every other project: never link a real login
 * to a demo organization, because its staff see its applicants. So this
 * script refuses unless
 *   - TURFCUT_DEMO_PROJECT_REF names the Supabase project the keys point at
 *     (a deliberate "yes, this is the demo project"), and
 *   - nobody the seeds didn't make is in the database or in Supabase Auth
 *     (a real sign-up means it isn't a dedicated demo project).
 *
 * For each demo organization it adds a finance person if there isn't one
 * (owners and finance approve pay; supervisors review the work), then
 * creates an auth user for the owner, the supervisor and the finance person,
 * and for the first demo worker. Each auth user gets the id of the existing
 * demo profile, so nothing is relinked. Emails are role.name@example.com (a
 * reserved domain: nothing is ever delivered), confirmed, all with the one
 * password from DEMO_ACCOUNTS_PASSWORD. No password is ever written to a file
 * or the database.
 *
 * Run (after npm run seed and npm run seed:demo -- --yes):
 *   npm run seed:demo-accounts -- --plan     what it would do; reads only, needs DATABASE_URL only
 *   npm run seed:demo-accounts -- --yes      do it
 * With --yes it needs, in the shell: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, TURFCUT_DEMO_PROJECT_REF, DEMO_ACCOUNTS_PASSWORD
 * (12+ characters) and optionally DEMO_ACCOUNTS_EMAIL_DOMAIN. Safe to re-run:
 * logins that exist are left alone.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { db } from "../src/lib/db";
import {
  DEFAULT_DEMO_EMAIL_DOMAIN,
  DEMO_FINANCE_NAMES,
  DEMO_SUFFIX,
  emailDomainProblem,
  orgsMissingFinance,
  passwordProblem,
  planAccounts,
  projectProblem,
  strangers,
  type DemoAccount,
  type DemoOrgStaff,
} from "../src/lib/demo-accounts";

const p = db();
/** The base seed's three workers (prisma/seed.ts): made by a seed, so not strangers. */
const BASE_SEED_PROFILES = ["00000000-0000-0000-0000-000000000101", "00000000-0000-0000-0000-000000000102", "00000000-0000-0000-0000-000000000103"];
const SEEDED = { action: "demo.seeded", entityType: "Demo", entityId: "demo-data" };
const MARKER = { action: "demo.accounts", entityType: "Demo", entityId: "demo-accounts" };

const listOf = (metadata: unknown, key: "orgIds" | "workerIds"): string[] => {
  const v = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>)[key] : null;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
};

function stop(message: string): never {
  console.error(message);
  process.exit(1);
}

async function loadOrgs(orgIds: string[]): Promise<DemoOrgStaff[]> {
  const rows = await p.organization.findMany({
    where: { id: { in: orgIds } },
    select: { id: true, name: true, profiles: { where: { closedAt: null, role: { in: ["OWNER", "SUPERVISOR", "FINANCE"] } }, select: { id: true, role: true, displayName: true }, orderBy: { createdAt: "asc" } } },
  });
  // In the order the demo seed made them (the marker's order).
  return orgIds.flatMap((id) => rows.filter((r) => r.id === id)).map((r) => ({ id: r.id, name: r.name, staff: r.profiles }));
}

async function allAuthUserIds(admin: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Listing the project's logins failed: ${error.message}`);
    ids.push(...data.users.map((u) => u.id));
    if (data.users.length < 1000) return ids;
  }
}

function printPlan(accounts: DemoAccount[], addFinance: DemoOrgStaff[]) {
  for (const o of addFinance) console.log(`  + finance person for ${o.name}`);
  for (const a of accounts) console.log(`  ${a.role.padEnd(10)} ${a.email.padEnd(52)} ${a.displayName}${a.orgName ? ` — ${a.orgName}` : ""}`);
}

async function main() {
  const planOnly = process.argv.includes("--plan");
  if (!planOnly && !process.argv.includes("--yes")) {
    console.log("This creates demo logins. Only for a dedicated demo project (see the header of prisma/demo-accounts.ts).");
    console.log("See what it would do: npm run seed:demo-accounts -- --plan");
    console.log("Then go ahead:        npm run seed:demo-accounts -- --yes");
    process.exitCode = 1;
    return;
  }
  const domain = process.env.DEMO_ACCOUNTS_EMAIL_DOMAIN?.trim() || DEFAULT_DEMO_EMAIL_DOMAIN;
  const badDomain = emailDomainProblem(domain);
  if (badDomain) stop(badDomain);

  // --- The demo seed must have finished ---
  const seeded = await p.auditEvent.findMany({ where: SEEDED, select: { metadata: true }, orderBy: { createdAt: "asc" } });
  const orgIds = [...new Set(seeded.flatMap((m) => listOf(m.metadata, "orgIds")))];
  const workerIds = [...new Set(seeded.flatMap((m) => listOf(m.metadata, "workerIds")))];
  if (!orgIds.length) stop("No finished demo seed here: run npm run seed:demo -- --yes first.");
  const orgs = await loadOrgs(orgIds);
  const demoWorkers = await p.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, profileId: true, displayName: true } });
  const firstWorker = workerIds.map((id) => demoWorkers.find((w) => w.id === id)).find((w) => !!w) ?? null;

  // --- Nobody the seeds didn't make ---
  const known = new Set([...BASE_SEED_PROFILES, ...demoWorkers.map((w) => w.profileId), ...orgs.flatMap((o) => o.staff.map((s) => s.id))]);
  const profiles = await p.profile.findMany({ select: { id: true } });
  const extra = strangers(profiles.map((x) => x.id), known);
  // A demo organization's other members (recruiters, custom roles …) would be strangers too; they're counted above.
  if (extra.length) {
    stop(
      `This database has ${extra.length} profile(s) the seeds didn't make (real sign-ups or members). ` +
        "Demo logins go only into a dedicated demo project with nothing but seeded data: never link a real login to a demo organization (README)."
    );
  }

  const addFinance = orgsMissingFinance(orgs);
  // Plan with placeholders for the finance people still to be made, so --plan shows every login.
  const planned = planAccounts(
    orgs.map((o) => (addFinance.includes(o) ? { ...o, staff: [...o.staff, { id: "(new)", role: "FINANCE", displayName: `${DEMO_FINANCE_NAMES[orgIds.indexOf(o.id) % DEMO_FINANCE_NAMES.length]}${DEMO_SUFFIX}` }] } : o)),
    firstWorker ? { profileId: firstWorker.profileId, displayName: firstWorker.displayName } : null,
    domain
  );
  if (planOnly) {
    console.log(`Demo logins (${planned.length}), for a dedicated demo project only:`);
    printPlan(planned, addFinance);
    console.log("Nothing was written. Go ahead with --yes (see the header for the settings it needs).");
    return;
  }

  // --- The project must be named on purpose, and empty of real logins ---
  const problem = projectProblem(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.TURFCUT_DEMO_PROJECT_REF) ?? passwordProblem(process.env.DEMO_ACCOUNTS_PASSWORD);
  if (problem) stop(problem);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) stop("Set SUPABASE_SERVICE_ROLE_KEY (the demo project's secret key) in the shell.");
  const password = process.env.DEMO_ACCOUNTS_PASSWORD!;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const plannedIds = new Set(planned.map((a) => a.profileId));
  const logins = await allAuthUserIds(admin);
  const strayLogins = strangers(logins, plannedIds);
  if (strayLogins.length) {
    stop(`This Supabase project has ${strayLogins.length} login(s) that aren't demo logins. Demo logins go only into a dedicated demo project.`);
  }

  // --- Write: finance people, then logins with the profiles' own ids ---
  for (const o of addFinance) {
    const name = `${DEMO_FINANCE_NAMES[orgIds.indexOf(o.id) % DEMO_FINANCE_NAMES.length]}${DEMO_SUFFIX}`;
    await p.profile.create({ data: { id: crypto.randomUUID(), role: "FINANCE", orgId: o.id, displayName: name } });
  }
  const accounts = planAccounts(await loadOrgs(orgIds), firstWorker ? { profileId: firstWorker.profileId, displayName: firstWorker.displayName } : null, domain);
  const existing = new Set(logins);
  const made: DemoAccount[] = [];
  for (const a of accounts) {
    if (existing.has(a.profileId)) continue;
    const { error } = await admin.auth.admin.createUser({ id: a.profileId, email: a.email, password, email_confirm: true, user_metadata: { demo: true } });
    if (error) throw new Error(`Creating ${a.email} failed: ${error.message}`);
    made.push(a);
  }
  if (made.length || addFinance.length) {
    await p.auditEvent.create({
      data: { ...MARKER, actorId: null, metadata: { profileIds: accounts.map((a) => a.profileId), emails: accounts.map((a) => a.email), created: made.length, financeAdded: addFinance.length } },
    });
  }
  console.log(`Demo logins ready (${made.length} new, ${accounts.length - made.length} already there). Password: the DEMO_ACCOUNTS_PASSWORD you set.`);
  printPlan(accounts, []);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
