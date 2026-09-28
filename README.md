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
  lib/
    env.ts              # env access with clear missing-var errors
    db.ts               # Prisma client singleton (lazy)
    auth.ts             # getSessionProfile / requireRole / requireAuth
    metrics.ts          # pure scorecard formulas (tested)
    supabase/           # browser / server / proxy clients
  proxy.ts              # session refresh (Next.js 16 convention)
prisma/
  schema.prisma         # all core tables + enums
  seed.ts               # M0 seed data
```

## M0 scope (done)

Next.js + TS scaffold, Supabase wiring, Prisma schema for all core tables,
worker/company auth with role skeleton, seed script, CI, smoke tests.
No M1 features (no profile builder, no scorecard UI, no job posting UI).
