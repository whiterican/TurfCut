# Turfcut

The marketplace for political field work — petition signature gathering first,
canvassing second. Companies post jobs, workers (1099 contractors) apply or get
invited, shifts get worked and verified, approved earnings pay out in-app.

Patent pending. Built milestone-by-milestone; see `CLAUDE.md` for the working
agreements and the build plan for the full roadmap.

## Prerequisites

- Node 20+ and npm
- A Supabase project (see "What needs Caden" below)
- No Supabase account yet? The app still typechecks, builds, and boots —
  auth/DB features show a clear "missing env" message until keys are set.

## Setup

```bash
npm install

# 1. Copy env template and fill in (see "What needs Caden")
cp .env.example .env.local

# 2. Create the database schema (needs DATABASE_URL and DIRECT_URL)
npm run db:push

# 3. Seed: 1 org, 3 workers, 1 jurisdiction, 1 job, sample shift + payout
#    (idempotent — safe to re-run)
npm run seed

# 4. Run it
npm run dev   # → http://localhost:3000
```

## Scripts

| Command            | What it does                              |
| ------------------ | ----------------------------------------- |
| `npm run dev`      | Start dev server                          |
| `npm run build`    | Production build                          |
| `npm run start`    | Start production server                   |
| `npm run typecheck`| `tsc --noEmit`                            |
| `npm run lint`     | ESLint                                    |
| `npm test`         | Vitest (run once)                         |
| `npm run seed`     | Seed the database (`prisma/seed.ts`)      |
| `npm run db:push`  | Push Prisma schema to the database        |
| `npm run db:generate` | Regenerate the Prisma client           |
| `npm run test:acceptance` | Data-layer checks on a real Postgres (`tests/acceptance/`) |

CI (`.github/workflows/ci.yml`) runs on pushes to `master` and on every PR:
`prisma generate` → `prisma validate` → typecheck → lint → test → build,
using dummy env values (no real DB touched); a second job runs the
acceptance checks against a throwaway Postgres 16 service.

Acceptance checks (`tests/acceptance/`): each script gets a fresh database
built from `prisma/supabase-manual-setup.sql` plus the seed and exercises
the data layer end to end (locks under contention, append-only rules, pay
lines and transfers, offline sync ordering, corrections, closure, export).
Locally: `PGURL=postgresql://postgres@localhost:5432 npm run test:acceptance`
(add `PGQUERY="?host=/tmp"` for a Unix socket). They drop and recreate
`turfcut_acc_*` databases on that server and leave them for inspection.
They run as the connection role through Prisma, as the app does, so they
exercise the locks, triggers and data rules, not the RLS policies.

## What needs Caden (only you can do these)

1. **Create a Supabase project** at https://supabase.com (free tier is fine).
2. **Copy three values** from the Supabase dashboard into `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key, or the legacy anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - A secret key, or the legacy service_role key (Project Settings → API
     Keys; keep it secret) → `SUPABASE_SERVICE_ROLE_KEY`. The app hands both
     straight to Supabase's client libraries, which accept either kind.
3. **Copy the Postgres connection strings** (Project → Connect) into
   `.env.local`: `DATABASE_URL` for the running app and `DIRECT_URL` for the
   Prisma CLI. Locally they can be the same. See **Deploying to Vercel** for
   which one goes where in production.
4. **Run the schema + seed:**
   ```bash
   npm run db:push
   npm run seed
   ```
5. **Sign-in links and email confirmation:**
   - Set `SITE_URL` to the app's public address (e.g. `https://app.turfcut.com`)
     in the hosting environment. Without it, production refuses to send
     sign-in links rather than trusting the request's Host header.
   - Supabase → Authentication → URL Configuration → **Redirect URLs**: add
     `<SITE_URL>/auth/confirm` (exact — avoid wildcards).
   - Optional but recommended for field phones: in Supabase → Authentication
     → Email Templates, change the **Magic Link** and **Confirm signup**
     links to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
     That style works even when the email opens in a different browser than
     the one that asked for it.
   - **Member invites (C1) need it:** set the **Magic Link** template as above
     and the **Invite user** template to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`.
     Invites are sent server-side, so the default link style can't complete
     them. The pilot uses Supabase's built-in sender; switch Authentication →
     SMTP to a real provider before scaling beyond the pilot.
     Invites rely on **Confirm email** being on (below): an invite is matched
     to the address the person has proven they own.
   - Keep **Confirm email** turned on in production (Authentication →
     Providers → Email). Accounts are only created after the address is
     confirmed; with confirmation off, sign-up necessarily reveals whether an
     email is already registered.
   - Preview deployments run in production mode too: give each one its own
     `SITE_URL` (and add its `/auth/confirm` to Redirect URLs), or sign-in
     links stay disabled there.
6. **Payouts (M5)** — optional until you want to send real (test) money:
   - Create a Stripe account and turn on **Connect** (Express accounts),
     in **test mode**.
   - Developers → API keys → copy the secret key into `STRIPE_SECRET_KEY`.
   - Developers → Webhooks → add an endpoint at
     `<SITE_URL>/api/stripe/webhook` for `transfer.created` and
     `transfer.reversed`, and copy its signing secret into
     `STRIPE_WEBHOOK_SECRET`. (Optional: a second endpoint listening to
     **connected accounts** for `account.updated` — the app also re-checks
     a worker's setup on its own.)
   - Transfers come out of Turfcut's Stripe balance, which organizations
     fund by invoice. In test mode, add test funds in the Stripe dashboard.
   Without these keys the app still records, approves, disputes and exports
   pay; the **Pay** button explains that Stripe isn't connected yet.
7. **Going live on Vercel**, in this order:
   1. **One Vercel project for the site.** Importing the repo twice makes two
      projects that both build every push, and settings added to one never
      reach the other. Keep one; delete the other (its Settings, at the bottom).
   2. **Bring the live database up to date first** (the upgrade notes below,
      or the catch-up file from the latest handover). Pages that read new
      tables fail until it's done.
   3. **Settings → Environment Variables**, ticked for **Production**:
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (the transaction pooler,
      port 6543; see **Deploying to Vercel**), `SITE_URL` (the public
      address, e.g. `https://turf-cut.vercel.app`) and
      `CLIENT_IP_HEADER=x-vercel-forwarded-for`. Tick Preview too for all but
      `SITE_URL` if you'll test previews (each preview needs its own, item 5).
      The app reads exactly these names. Supabase's Vercel integration adds
      differently named ones (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
      `SUPABASE_SECRET_KEY`, `POSTGRES_PRISMA_URL`), so add the app's names
      as well, with the same values: the publishable key (or legacy anon key)
      as `NEXT_PUBLIC_SUPABASE_ANON_KEY`, a secret key (or legacy
      service_role key) as `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL`
      from Connect → Transaction pooler (or a copy of `POSTGRES_PRISMA_URL`
      once you've checked it's port 6543; a copy doesn't follow later
      password changes).
   4. **Redeploy after any settings change** (Deployments → ⋯ → Redeploy).
      Settings only reach new deployments, and the `NEXT_PUBLIC_` ones are
      baked in when the site is built.
      The server's region comes from `vercel.json` (`cle1`, Cleveland, next
      to a Supabase project in us-east-2) and overrides the dashboard's
      Function Region; change it there if the database moves.
   5. **Use the project's public domain.** With Deployment Protection on
      (the default for new projects), every other address, per-deployment URLs
      and `<project>-<team>.vercel.app` included, sits behind Vercel's own
      login, so field phones can't open them.
   6. **Supabase → Authentication → URL Configuration:** Site URL = `SITE_URL`,
      and add `<SITE_URL>/auth/confirm` to Redirect URLs. Set the email
      templates as in item 5 above.
   7. **Check it:** open `/login` and sign in.
      - A missing setting is named on the page ("Sign-in isn't configured on
        this server yet (DATABASE_URL).") and in Vercel → Logs
        (`[turfcut] sign-in refused: not configured (DATABASE_URL)`). Member
        invites do the same for `SUPABASE_SERVICE_ROLE_KEY` and `SITE_URL`.
      - "Sign-in is briefly unavailable" for a password sign-in, with every
        setting present, means the database is behind: most often
        `prisma/rate-limit.sql` hasn't run (step 2). Logs show
        `[turfcut] rate limiter error`.
      - Signing in seems to work but lands back on the login page: the
        address or password in `DATABASE_URL` is wrong, or the database is
        behind. Logs show the database error that says which.

**Already set up under M0?** Upgrade the live database for M1 by pasting,
in order, `prisma/m1-migration.sql`, `prisma/m1-profile-migration.sql`, then
`prisma/manual-seed.sql` (adds the seeded shift's check-in, pause, check-out
and batch-count events; existing rows are left alone). The migration stops
without changing anything if duplicate consent versions already exist.

**Already on M1?** Paste `prisma/m2-migration.sql` once. Every new column is
nullable or defaulted, so existing rows stay valid. Then, in the app, an
owner signs the contractor terms and an owner or compliance lead records the
classification review under **Organization settings** — no job publishes
until both are on file.

**Already on M2?** Paste `prisma/m3-migration.sql` once (nullable columns
only; safe to re-run).

**Already on M3? Messaging (M4)** — in the Supabase SQL editor:
1. Run `prisma/m4-0-rls-lockdown.sql` (turns on row-level security for every
   existing table and takes back the browser roles' default access — the app
   itself is unaffected; it connects as the database owner). Safe to re-run.
2. Run `prisma/m4-migration.sql` once (chat tables, append-only triggers,
   access-ending triggers, the policies Realtime uses).
3. Turn on Realtime for messages:
   `ALTER PUBLICATION supabase_realtime ADD TABLE "public"."Message", "public"."MessageRevision";`
4. Check the app's database login bypasses row-level security (should say `t`):
   `select rolbypassrls from pg_roles where rolname = current_user;`
5. Storage → **New bucket** → name `chat-attachments`, **Public: off**. The app
   uploads through the server only and hands out 60-second download links.

Without steps 3 and 5, chat still works: threads refresh every 15 seconds
instead of instantly, and attaching a document fails with a clear error.

**Already on M4?** Run `prisma/m4-1-hardening.sql` (safe to re-run): browsers
can read only chat ids and times (never message text), a deleted message
disappears for everyone, chat history can't be truncated, consent and
metric versions can't be edited, and deleting a worker no longer erases
them (a worker with history can't be deleted). It gives up after 5 seconds if the
database is busy; just run it again.

**Payouts (M5)** — in the Supabase SQL editor, run
`prisma/m5-migration.sql` once. It turns `Payout` into an append-only pay
line with a status log, adds the transfer, dispute and webhook tables, and
blocks updates and deletes on all of them. It stops without changing
anything if an existing payout can't be traced to an organization or has a
negative amount, and gives up after 5 seconds if the database is busy. Any
unpaid payout from before M5 comes over on hold with no approval: finance
checks its amount, releases it, and it's approved again (by two people)
before it's paid. Then run `prisma/m5-1-history-lock.sql`: the database
refuses edits and deletes of work events, shift reviews and the audit log,
as it already does for messages and pay (safe to re-run).

Until steps 1–4 are done, `npm run dev` boots fine and the login/signup pages
render. While the Supabase URL and key or `DATABASE_URL` are unset, sign-in
and sign-up say which is missing and create nothing. Once they're set but
before step 4 has run, a password sign-in reads "briefly unavailable": the
database has no tables yet.

## Project layout

```
src/
  app/
    page.tsx            # landing
    login/              # worker/company login
    signup/             # signup + role selection (worker vs company)
    dashboard/          # worker: Today (saved for offline); org roles go to their desk
    profile/            # worker: scorecard, experience, fit summary
    profile/preferences # worker: 6-step political-fit consent flow
    workers/            # company: worker directory + authorized view + invite
    jobs/               # worker feed / org job list, builder, job page
    shifts/             # worker calendar + field day; supervisor custody/review
    earnings/           # worker: pay per campaign, disputes, payout setup (M5)
    pay/                # owners/finance: approve, hold, disputes, pay, export (M5)
    api/stripe/webhook  # Stripe events (M5)
    org/settings/       # publish-gate records, legal contact, jurisdictions
    api/workers/[workerId]/scorecard  # GET scorecard JSON
    api/jobs/…          # jobs, publish, applications, claims, invitations
    api/engagements/[engagementId]/accept
    api/shifts/…        # schedule, check-in, events, closeout, sync, corrections
  components/           # ScorecardPanel, ExperienceList/Form, PreferencesFlow, FitSignals,
                        # JobForm, JobCard, SnapshotView, ActionButton,
                        # TurfMap (Leaflet), ShiftProgress, FieldDayActions
  lib/
    env.ts              # env access with clear missing-var errors
    db.ts               # Prisma client singleton (lazy)
    auth.ts             # getSessionProfile / requireRole / requireAuth
    metrics.ts          # pure scorecard formulas (tested)
    scorecard.ts        # scorecard derived from work events, with explanations
    experience.ts       # experience validation + verified totals
    political-fit.ts    # preference validation + employer view (never inferred)
    political-fit-data.ts # append-only consent versioning
    access.ts           # who may view a worker
    jobs.ts             # job validation, publish gate, card answers, exclusions
    jobs-data.ts        # create / publish (locked, audited) / feed
    engagements.ts      # apply / invite / claim / accept rules + hiring snapshot
    engagements-data.ts # engagements under a per-job lock
    field-day.ts        # shift rules: check-in, custody, logging, review
    field-day-data.ts   # scheduling, shift actions, ops view (locked)
    pay.ts              # pay calculation, line status replay, dispute rules (M5)
    offline-sync.ts     # offline field actions: shapes, clock correction, limits (M6)
    offline-queue.ts    # the phone's queue of field actions (M6, browser)
    pay-data.ts         # pay lines, approvals, disputes, pay runs, export (locked)
    payout-provider.ts  # Stripe Connect (lazy client; tests use a fake)
    supabase/           # browser / server / proxy clients
  proxy.ts              # session refresh (Next.js 16 convention)
prisma/
  schema.prisma         # all core tables + enums
  seed.ts               # seed data (idempotent)
  seed-fixture.ts       # seeded shift's events, shared with the tests
  manual-ddl.sql        # Prisma's table DDL only — no triggers, CHECKs, partial
                        # indexes or RLS; use supabase-manual-setup.sql for a real DB
  m1-migration.sql      # M0 → M1 upgrade for an existing database (run 1st)
  m1-profile-migration.sql # experience fields + consent expiry (run 2nd)
  m2-migration.sql      # M1 → M2 upgrade (jobs, publish gate, cancellations)
  m3-migration.sql      # M2 → M3 upgrade (staging, turf, supervisor, actor)
  m4-0-rls-lockdown.sql # RLS on + browser-role grants revoked (run before m4)
  m4-migration.sql      # M3 → M4 upgrade (messaging)
  m4-1-hardening.sql    # review fixes: chat read grants, history guards
  m5-migration.sql      # M4 → M5 upgrade (pay lines, payouts, disputes)
  m5-1-history-lock.sql # append-only triggers on work events, reviews, audit
  m6-migration.sql      # M5 → M6 upgrade (offline sync ids on work events)
  fk-indexes.sql        # indexes on nine foreign keys (safe to re-run)
```

## Demo data

`npm run seed:demo -- --yes` (after `npm run seed`) fills the app for
testers. Export `DATABASE_URL` in the shell first; tsx doesn't read
`.env.local`. Without `--yes` it only says where it would write. It makes:

- six organizations with their staff and twelve workers, all named "… (demo)";
- 27 published Colorado jobs, all titled "… (demo)" and fictional: local
  measures and civic work, plus a job for each campaign type and
  affiliation (candidate, party committee, issue advocacy; Democratic,
  Republican, Libertarian, Green, other). The candidates have invented
  names and run in districts that don't exist. Between them the campaigns
  disclose every issue, so the feed's filters and workers' own "do not
  match me" answers have something to act on. Four canvass jobs ask for no
  credentials (two of them open to applications);
- about fifty worked and reviewed daytime shifts with pay lines, waiting
  applications, claims and invitations, and a few messages.

Jobs whose campaign takes a party or an issue position hire by invitation
only, so no real worker's issue answers are matched against a demo
campaign. The nonpartisan demo jobs stay open, so testers can apply and
claim. Like any application, one to a demo job carries what the worker
shares with organizations they apply to: their scorecard and the
political-fit answers they chose to share (identity, party, campaign
interests). Nobody signs in as demo staff, so it reaches no one. Never link
a real login to a demo organization (it would see those applicants), and
close the demo jobs before real workers arrive.

Everything goes through the app's own rules (publish gate, hiring, field
day, review, pay), backdated so workers have history. Audit-log entries
carry the date of the load. It runs once: a completion marker naming the
demo organizations is written last, and a run that stopped partway is
reported rather than repeated. Work history, reviews, pay lines and
messages are append-only and stay. To take the demo jobs out of the feed
(by the ids in the marker, not by name, since anyone can name an
organization "… (demo)"):

```sql
UPDATE "Job" SET status = 'CLOSED'
WHERE status = 'PUBLISHED' AND "orgId" IN (
  SELECT (jsonb_array_elements_text(metadata -> 'orgIds'))::uuid
  FROM "AuditEvent" WHERE action = 'demo.seeded');
```

## M0 scope (done)

Next.js + TS scaffold, Supabase wiring, Prisma schema for all core tables,
worker/company auth with role skeleton, seed script, CI, smoke tests.
No M1 features (no profile builder, no scorecard UI, no job posting UI).

## M1 scope

Worker profile builder (spec p.9 experience records with verification
levels; self-reported records shown but excluded from verified totals;
reference contacts never shown to employers), political-fit preferences flow
(visibility → identity → party → issues → boundaries → review & consent, with
per-answer sharing and a worker-chosen expiry; every change is a new consent
version, and expired or outdated consent shares nothing until reconfirmed), company view showing
only worker-authorized signals, and a scorecard derived from work events
(`GET /api/workers/:workerId/scorecard`).

Scorecard formulas follow spec p.10. Averages use verified shifts only
(checked in, checked out, closeout approved) and are segmented by work type;
`?period=lifetime|12m|90d&workType=PETITION|CANVASS&state=CO` filters them.
Hand-computed values for the seeded petition shift (4h on shift, 30 min
paused, closeout approved):

| Metric | Formula | Seed | Value |
| --- | --- | --- | --- |
| Doors per active hour | verified doors ÷ verified active field hours | 40 / 3.5 | 11.43 |
| Doors per completed shift | verified doors ÷ completed door shifts | 40 / 1 | 40 |
| Contact rate | contacts ÷ doors attempted | 18 / 40 | 45% |
| Signatures per active hour | submitted ÷ verified petition hours | 22 / 3.5 | 6.29 |
| Acceptance rate | accepted ÷ reviewed | 20 / 22 | 90.9% |
| Show rate | started accepted shifts ÷ accepted shifts not cancelled | 1 / 1 | 100% |

## M2 scope

Jobs and hiring, built on the M1 profile.

- **Job builder** (owners, recruiters): type, dates, place, pay, headcount,
  hiring modes, requirements, campaign disclosure (type, affiliation, name,
  message, public issue positions, ballot-measure IDs), who handles
  emergencies / disputes / lost materials, and the cancellation-notice window.
  Saves a draft; drafts stay editable until published.
- **Publish gate — jurisdiction hard stop.** Publishing re-checks everything
  under a per-job lock and lists every blocking reason: org not approved,
  contractor terms unsigned, classification review missing, a jurisdiction
  profile that is unknown / unapproved / superseded / not yet effective /
  expired, a pay method its rules don't allow (per-unit needs explicit
  approval), or missing disclosure / contacts / hiring mode. Both blocked and
  successful attempts are audited.
- **Worker feed** (`/jobs`): published jobs, soonest first, with filters. Not
  ranked. Jobs a worker's own "do not match me" answers exclude are listed
  separately with the reason; nothing else hides a job.
- **Job card**: who you work for, what you're paid (gross), what counts as
  payable, credentials needed, who handles problems — plus the disclosure.
- **Apply / invite / claim / accept.** Workers apply or claim; orgs invite;
  orgs accept applications and workers accept invitations. Headcount is
  enforced under a lock, so simultaneous claims can't overfill a job.
- **Hiring snapshot.** Each engagement freezes what the org could see at that
  moment — scorecard summary and authorized fit signals only, with consent
  version and time. Issue overlap compares the worker's shared answers with
  the job's disclosed positions. An invitation shows fit answers only if
  the worker already applied to, claimed or accepted one of the org's jobs;
  an invitation alone (even a second one) is never a relationship.
- **Late cancellations.** A worker `SHIFT_CANCELLED` inside the job's notice
  window counts as a no-show; timely and organization cancellations don't.
  A shift scheduled with less notice than the window can be cancelled
  without penalty until it starts (or until an hour after it was
  scheduled, if that's later). Once a shift has ended nobody can cancel
  it: an unstarted shift is a no-show from its end (not its start).

API: `GET/POST /api/jobs`, `POST /api/jobs/:id/publish`,
`GET/POST /api/jobs/:id/applications`, `POST /api/jobs/:id/claims`,
`POST /api/jobs/:id/invitations` `{ workerId }`,
`POST /api/engagements/:id/accept`.

## M3 scope — field day

The petition field loop, from schedule to supervisor review (spec p.13).

- **Scheduling** (owners, recruiters, supervisors): shifts for hired workers,
  with a staging location, a supervisor and a **turf map** — draw the turf
  and drop the staging point on an OpenStreetMap map (Leaflet). Refused while
  the job's jurisdiction profile is frozen, and if the worker already has an
  overlapping shift on *any* campaign (checked under a per-worker lock).
- **Worker field day** (`/shifts/:id`): check in (from an hour before),
  breaks, logging signatures (or doors and contacts for canvass work),
  returning packets, check-out, cancellation with a reason. A five-step
  timeline mirrors the mockup; the turf map and "who handles problems" are on
  the same screen. **My shifts** lists every campaign in one calendar.
- **Check-in location**: the phone's position is compared with the staging
  point once and discarded. Only "at staging: yes/no" and a distance band
  (under 250 m / 250 m–1 km / over 1 km) are stored. Declining location still
  checks in, marked "location not checked". Nothing is tracked during a shift.
- **Chain of custody**: supervisors hand out packets by ID; a packet can't be
  out on two shifts at once (per-job lock). Workers return packets with sheet
  and signature counts and can't check out holding one. Signed sheets are
  never photographed or uploaded — custody is metadata only.
- **Review**: batch count (accepted + rejected = reviewed), then approve or
  not approve with a reason the worker sees. Reviews append validations; a
  later one supersedes an earlier one. An approved shift becomes a verified
  shift in the scorecard.
- **Ops home** for organizers: shifts in the field today, checked in,
  signatures submitted, and a "needs attention" list (late check-ins, shifts
  awaiting review).
- Every event records who made it (worker or organization).

Map tiles load from tile.openstreetmap.org, which sees the viewer's IP and
the area viewed. Fine for the pilot; switch to a hosted tile provider before
public launch (OSM's tile policy).

API: `GET/POST /api/shifts`, `POST /api/shifts/:id/check-in` `{ location? }`
(the device's own staging check — the server refuses coordinates),
`POST /api/shifts/:id/events` `{ kind, … }`,
`POST /api/shifts/:id/closeout` `{ status, reason? }`.

## M6 scope — offline field day

- **Field actions work with no signal.** Check-in, breaks, logging
  signatures/doors/contacts, packet returns and check-out are saved on the
  phone first with the time they happened, then sent in order when there's
  signal (on load, when signal returns, when the app comes back to the
  front, and every 20 seconds), up to 50 per request. Today and My shifts
  send every shift's waiting entries. The controls update right away and
  stay updated until the page shows what synced; a badge says what's
  waiting or couldn't be saved, with the reason. Only the server refusing
  an entry marks it "couldn't be saved"; no signal, a signed-out session or
  server trouble leave it waiting.
- **Times are checked on sync.** Phone clocks are corrected (server now −
  phone now). The server refuses future times and anything held offline
  more than 24 hours (a supervisor enters those) and keeps the phone's
  order. A synced action never lands before the worker's own field events
  already on the shift (it goes after the latest check-in, break, count,
  packet return or check-out) and is judged against the whole shift, so a
  phone clock can't rewrite recorded time. Other people's events — a
  packet handed out, a map pin — don't move it; a packet return goes after
  that packet was handed out. Once a supervisor has reviewed the shift,
  nothing more syncs into it. An action
  re-sent after a dropped connection is saved once (`clientId`).
  Supervisors see "recorded offline, synced HH:MM" in the activity log, and
  a note before approving when any entry came in late from the phone.
  The phone's own checks use the server's clock (learned at each sync).
- **Check-in location stays on the phone.** The phone compares its position
  with the staging point; only "at staging: yes/no" and a distance band are
  sent. No server endpoint accepts a position.
- **Offline brief.** A service worker (`public/sw.js`, no library, production
  builds only) saves Today, My shifts and the shift pages for today and the
  next two days — with the scripts they need — so they open in a dead zone.
  Pages are network-first, falling back to the saved copy on no signal, a
  server error or an 8-second wait; copies are kept for one worker and
  72 hours at most, and only for pages on that list. API calls and server
  actions are never cached. Saved pages are deleted when another worker's
  list arrives, on the sign-in pages and when a field page redirects
  anywhere (signed out, or someone else's session). These pages keep no
  loading screen, so the server's real redirect, 404 and 500 reach the
  service worker.
  Sign-out warns about this worker's unsynced entries and clears the queue
  and saved pages. (Another worker's unsynced entries stay on the phone
  until they sign in again.)
- **Still needs a connection:** cancelling a shift, turf pins, messages,
  disputes, pay. A packet a supervisor hands out shows on the worker's
  phone once it has signal (until then it can't be returned offline).
  Entries synced into a shift the organization cancelled in the meantime,
  or one a supervisor already reviewed, are refused with that reason — a
  supervisor enters the work instead.

## Deploying to Vercel — database connections

Serverless functions each open their own database connections, so the
running app must go through Supabase's connection pooler; the direct
connection is only for schema changes.

| Env var | Where | Value (Supabase → Project → Connect) |
|---|---|---|
| `DATABASE_URL` | Vercel (Production and Preview) | **Transaction pooler**, port **6543**: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres` |
| `DIRECT_URL` | Your machine / CI only, when running `npm run db:push` or one-off scripts | **Direct connection**, port **5432**: `postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres` |

- The app adds `pgbouncer=true` (Prisma can't use prepared statements on the
  transaction pooler) and `connection_limit=3` to a 6543 URL that doesn't
  set them, and logs a warning on Vercel if `DATABASE_URL` isn't port 6543.
- A pasted value is tidied first: spaces and line breaks, wrapping quotes, a
  `DATABASE_URL=` prefix and a phone's capital `P` in `postgresql://` are
  undone. One that still doesn't start with `postgresql://` (or
  `postgres://`) makes sign-in
  name `DATABASE_URL`; a pooler user without the project ref
  (`postgres` instead of `postgres.<ref>`) is warned about. Warnings describe
  the URL's shape, never its password.
- Sessions are refreshed by the proxy with `getClaims()`, which checks the
  token locally when the project signs with an asymmetric key (Supabase →
  JWT Keys; this project uses ES256). On a legacy symmetric key every
  request and tab prefetch costs a call to Supabase Auth instead.
- Everything the app does in a database transaction (advisory locks,
  interactive transactions) is transaction-scoped, so it works through the
  pooler.
- SQL migration files (`prisma/*.sql`) are pasted into the Supabase SQL
  editor and need neither URL.
- `DIRECT_URL` isn't needed on Vercel. The build runs `prisma generate`
  (so a cached install never ships a stale client), and that reads neither
  URL. `db:push` connects through `DIRECT_URL`, and `prisma validate` fails
  if it's unset (any placeholder satisfies it, as in CI).

## Infra — error reporting and rate limits

- **Sentry** (optional): set `SENTRY_DSN` (server) and `NEXT_PUBLIC_SENTRY_DSN`
  (browser) in `.env.local`. Without them nothing is initialised and the app
  runs exactly as before. Only errors and stacks are sent: collection of
  IPs, cookies, headers, bodies and query strings is switched off and a
  final scrub drops anything left (`src/instrumentation.ts`).
  `src/app/global-error.tsx` reports a crashed page and offers a reload.
- **Rate limits** (`lib/rate-limit.ts`): password sign-in 10 per 10 minutes
  per connection and 20 per address from anywhere; sign-in links 5 per 10
  minutes and sign-up 5 per hour per connection; offline sync 60 batches a
  minute per worker (the phone treats a 429 as "retry later"). No header
  is trusted for the client's address until the deployment names one:
  `CLIENT_IP_HEADER` (a header the platform sets itself, e.g.
  `x-vercel-forwarded-for`, `cf-connecting-ip`, `fly-client-ip`) or
  `TRUSTED_PROXY_HOPS` (behind your own proxy, so `x-forwarded-for` is read
  from the trusted end). With neither set the per-connection limits are
  skipped rather than shared by everyone; the per-email and per-worker
  limits still apply (on Vercel a warning is logged until one is set:
  `CLIENT_IP_HEADER=x-vercel-forwarded-for`). Counts live in Postgres
  (`RateLimitCounter`, created by `prisma/rate-limit.sql`), one row per key
  per window, so every serverless instance shares them. Each request is a
  single atomic upsert (no lock, no transaction), read as a sliding window
  by weighting the previous window's count. If the database is unreachable
  the request goes through (an outage mustn't lock everyone out); any
  other failure, such as the table missing, refuses sign-in, sign-up and
  invites rather than silently lifting the limits. Offline sync always goes
  through. Run `prisma/rate-limit.sql` before deploying this. Member
  invites are capped at 20 emails per organization per day the same way.

## M7 scope — field truth and leaving cleanly

- **Supervisor corrections.** On a shift's activity log, an owner or
  supervisor can **correct** any of the worker's entries — its time, or a
  count, or a packet's sheets and signatures — or **enter a missing entry**
  (a forgotten check-out, work older than the 24-hour offline window) at a
  stated time, with a reason the worker sees. Nothing is edited: a
  correction is a `CORRECTION` work event naming the entry it supersedes,
  signed by the supervisor; an entered entry is an ordinary event in the
  worker's name marked `enteredBy`. Every reader — shift state, the live
  clock, the scorecard, pay — applies corrections the same way
  (`lib/corrections.ts`; newest signed correction per entry wins).
- **Checked by replay.** A correction is refused if the shift couldn't have
  happened that way (two check-ins, a break ending before it starts, a
  packet returned before it went out, work logged after check-out, a time
  more than 2 hours outside the schedule, a count outside 1–500).
- **Pay follows.** Allowed only until the shift's pay is approved for
  payment (after that, finance adjusts). Pay already recorded from the old
  entries is withdrawn like after a recount, and the supervisor approves
  the shift again at the corrected figure; a finance hold carries over.
- Workers see each correction on the shift page and on Earnings, and can
  dispute as before. `POST /api/shifts/:id/corrections` mirrors the screen.
  Whoever entered or corrected a shift's entries counts as having set its
  pay, so the two-person rule keeps them from approving that pay.
- **Your data.** Settings → Your data: a worker downloads everything
  Turfcut holds about them (`GET /api/account/export`, a ZIP of JSON and
  CSV: profile, experience, every consent version, every metric version,
  engagements, shifts, the field ledger, reviews, pay lines and their
  history, transfers, disputes, messages sent). No dependency: the ZIP is
  written by `lib/zip.ts` (stored entries).
- **Closing an account.** Same place, two steps (a typed phrase). Refused
  with the reasons while anything is open: pay on the way, a transfer in
  flight, an open dispute, a live shift, or entries on this phone not yet
  synced. On closing: the login is deleted (Supabase admin API), the name
  becomes "Former worker" and the phone is cleared, `closedAt` is set on
  Profile and Worker, unstarted shifts are cancelled in the worker's name
  with `accountClosed: true` (never a no-show — owner decision), open
  applications and invitations are withdrawn. The ledger, pay, consent and
  metric versions, reviews and messages stay exactly as recorded (rule 3).
  Closed workers are hidden from People, can't be invited, their profile is
  not found, and any remaining session is refused.

**Already on M6? Field truth (M7)** — run `prisma/m7-migration.sql` once
in the Supabase SQL editor (`closedAt` on `Profile` and `Worker`).

**Already on M5? Offline field day (M6)** — run `prisma/m6-migration.sql`
once in the Supabase SQL editor (two nullable columns on `WorkEvent`).

## M5 scope — review and in-app payouts

- **Pay is calculated, never typed.** When a supervisor approves a shift, the
  server records its pay line from what review verified: hourly = verified
  hours (check-in to check-out, minus breaks, corrections applied) × rate;
  shift rate = the rate; per accepted unit = the latest batch count's
  accepted signatures (or verified contacts) × rate. The formula is saved on
  the line ("3h 30m verified × $25.00/hr") and never recalculated. A
  per-signature shift can't be approved before its batch count.
- **Two approvals, two people.** Supervisors approve the work; owners and
  finance approve the pay on the **Pay** tab — never the person who made the
  shift's latest review. Extra pay from a dispute is approved by someone
  other than whoever decided it; deductions always apply (at once on
  approved pay, otherwise together with the shift's pay) — an open dispute
  or a hold never keeps an approved deduction out of the next payment. Pay
  can be held with a reason the worker sees, and released. A review can
  change only until its pay is approved; after that, changes are
  adjustments. A batch recount before then withdraws pay worked out from
  the old counts, and the supervisor approves the shift again (a dispute
  can't adjust the shift's pay until then; a finance hold carries over to
  the new line). Pay lines
  approved before M5 come over on hold and need a fresh approval.
  Hourly pay for more time than was scheduled is flagged to the approver.
- **Workers see their pay** on **Earnings** (from Today and Profile): gross
  totals per campaign and every shift's status — awaiting approval,
  approved, sending, paid, on hold, disputed.
- **Disputes.** A worker can dispute any reviewed shift's pay, approved or
  not (up to 3 times per shift). Unpaid pay waits. Owners and finance close
  it by keeping the pay (with a response), adjusting it (a new adjustment
  line — a deduction can't exceed the shift's pay), or recording that a
  supervisor re-reviewed the shift.
- **Stripe Connect payouts.** Workers set up payouts on Stripe's pages (bank
  and tax details never reach Turfcut). Finance pays a worker everything
  approved in one transfer; every transfer is recorded before money moves
  and carries a unique idempotency key, so retries and timeouts can't pay
  twice. Reversals put lines on hold. A partial reversal is shown on the
  Pay tab until finance records the returned amount (a settled deduction,
  so the ledger matches what the worker kept — and if the whole transfer
  is reversed later, it comes off the re-payment with the rest), optionally
  paying it again with a second person's approval. Stripe amounts that differ from what
  Turfcut recorded are shown for 30 days.
- **Platform fee: 15%** of approved pay, invoiced to the organization and
  never taken from the worker; saved on each line so a change is never
  retroactive.
- **Finance export**: CSV of pay lines recorded or paid in a period (a
  `paid_in_period` column marks the payments, so monthly exports add up) — payee, project, purpose, measure
  IDs, shift date, calculation, gross, fee, total cost, who reviewed and who
  approved, paid date and Stripe reference.
- **Append-only, enforced by the database**: pay lines, their status log,
  transfers, disputes, resolutions and handled webhooks can't be updated,
  deleted or truncated. A minimum-wage flag appears when a jurisdiction's
  rules list `minimumWageCents`.

## M4 scope — messaging

- **Direct messages**: one thread per hire, between the worker and the person
  who hired them (the inviter, the person who accepted the application, or —
  for instant claims — the job's creator, else the owner). Opens only once
  the hire is confirmed; read-only when it ends. If that contact leaves the
  organization, the worker can reopen the thread with a current contact, who
  sees it only from that point on.
- **Team chats**: owners, recruiters and supervisors create a chat for a
  campaign or team, tied to jobs, and add staff (managers) and workers hired
  on those jobs. Workers never add themselves. Managers' messages carry a
  "Manager" badge. Removed members keep read-only history up to their
  removal; a worker whose hire ends, or staff who leave the org or lose
  their role, are removed automatically (database triggers).
- **Safety**: workers can block an employer or manager (their new messages
  are hidden, history stays). Anyone can report a message; reports go to the
  org owner's queue (**Messages → Reports**) and the audit log, and the
  owner can remove a reported message.
- **History is append-only**: edits (within 5 minutes, marked "edited") and
  deletes ("Message deleted") are new rows; the original is never changed.
- **Attachments**: documents only (PDF, Word, Excel, text; up to 4 MB). Photos
  are refused everywhere, and documents are scanned for pictures (scanned
  PDFs, embedded images, images encoded as text). The composer always shows
  "Do not photograph or share signed petition sheets."
- **Live updates**: Supabase Realtime, filtered by row-level security, with a
  15-second refresh as a fallback. Unread counts per thread and on the
  Messages tab. No push or email yet — `onMessageSent` in
  `src/lib/chat-hooks.ts` is the hook a future notifier registers on.
- Chat never reads or shows political-fit answers.

