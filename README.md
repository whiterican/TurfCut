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

# 2. Create the database schema (needs DATABASE_URL)
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

CI (`.github/workflows/ci.yml`) runs on pushes to `master` and on every PR:
`prisma generate` → `prisma validate` → typecheck → lint → test → build,
using dummy env values (no real DB touched).

## What needs Caden (only you can do these)

1. **Create a Supabase project** at https://supabase.com (free tier is fine).
2. **Copy three values** from the Supabase dashboard into `.env.local`:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Service-role key (Settings → API, keep secret) → `SUPABASE_SERVICE_ROLE_KEY`
3. **Copy the Postgres connection string** (Settings → Database → Connection
   string) into `DATABASE_URL` in `.env.local`.
4. **Run the schema + seed:**
   ```bash
   npm run db:push
   npm run seed
   ```
5. **(M5, later)** Create a Stripe account and enable Connect (test mode) for
   payouts.

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

Until steps 1–4 are done, `npm run dev` boots fine and the login/signup pages
render, but sign-up will fail with a clear "missing environment variable"
message.

## Project layout

```
src/
  app/
    page.tsx            # landing
    login/              # worker/company login
    signup/             # signup + role selection (worker vs company)
    dashboard/          # role-gated dashboard skeleton
    profile/            # worker: scorecard, experience, fit summary
    profile/preferences # worker: 6-step political-fit consent flow
    workers/            # company: worker directory + authorized view + invite
    jobs/               # worker feed / org job list, builder, job page
    org/settings/       # publish-gate records, legal contact, jurisdictions
    api/workers/[workerId]/scorecard  # GET scorecard JSON
    api/jobs/…          # jobs, publish, applications, claims, invitations
    api/engagements/[engagementId]/accept
  components/           # ScorecardPanel, ExperienceList/Form, PreferencesFlow, FitSignals,
                        # JobForm, JobCard, SnapshotView, ActionButton
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
    supabase/           # browser / server / proxy clients
  proxy.ts              # session refresh (Next.js 16 convention)
prisma/
  schema.prisma         # all core tables + enums
  seed.ts               # seed data (idempotent)
  seed-fixture.ts       # seeded shift's events, shared with the tests
  manual-ddl.sql        # full DDL for a fresh database
  m1-migration.sql      # M0 → M1 upgrade for an existing database (run 1st)
  m1-profile-migration.sql # experience fields + consent expiry (run 2nd)
  m2-migration.sql      # M1 → M2 upgrade (jobs, publish gate, cancellations)
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
  the job's disclosed positions. An invitation sent before the worker has
  any relationship with the org shows no fit answers.
- **Late cancellations.** A worker `SHIFT_CANCELLED` inside the job's notice
  window counts as a no-show; timely and organization cancellations don't.

API: `GET/POST /api/jobs`, `POST /api/jobs/:id/publish`,
`GET/POST /api/jobs/:id/applications`, `POST /api/jobs/:id/claims`,
`POST /api/jobs/:id/invitations` `{ workerId }`,
`POST /api/engagements/:id/accept`.
