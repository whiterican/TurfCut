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

CI (`.github/workflows/ci.yml`) runs on every push/PR: `prisma validate` →
typecheck → lint → test → build, using dummy env values (no real DB touched).

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

**Already set up under M0?** Upgrade the live database for M1 by pasting
`prisma/m1-migration.sql` into the Supabase SQL editor, then
`prisma/manual-seed.sql` (adds the seeded shift's check-in, pause, check-out
and batch-count events; existing rows are left alone). The migration stops
without changing anything if duplicate consent versions already exist.

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
    workers/            # company: worker directory + authorized view
    api/workers/[workerId]/scorecard  # GET scorecard JSON
  components/           # ScorecardPanel, ExperienceList/Form, PreferencesFlow, FitSignals
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
    supabase/           # browser / server / proxy clients
  proxy.ts              # session refresh (Next.js 16 convention)
prisma/
  schema.prisma         # all core tables + enums
  seed.ts               # seed data (idempotent)
  seed-fixture.ts       # seeded shift's events, shared with the tests
  manual-ddl.sql        # full DDL for a fresh database
  m1-migration.sql      # M0 → M1 upgrade for an existing database
```

## M0 scope (done)

Next.js + TS scaffold, Supabase wiring, Prisma schema for all core tables,
worker/company auth with role skeleton, seed script, CI, smoke tests.
No M1 features (no profile builder, no scorecard UI, no job posting UI).

## M1 scope

Worker profile builder (experience records with verification levels;
self-reported records shown but excluded from verified totals), political-fit
preferences flow (visibility → identity → party → issues → boundaries →
review & consent; every change is a new consent version), company view showing
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
