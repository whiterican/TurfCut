@AGENTS.md

# Turfcut — working agreements

Non-negotiable. Every milestone, every session.

1. **One milestone at a time.** Never start the next milestone until Caden approves the current one.
2. **Small commits.** Commit after each working slice. Never commit secrets (`.env.local`, keys, tokens — check `.gitignore`).
3. **Append-only history.** Never UPDATE or DELETE rows in `work_events`, `validations`, `payouts`, or `audit_events`. Corrections are new events that supersede; the old value stays. Same rule for `political_preferences` (consent versioning) and `profile_metrics` (versioned aggregates).
4. **Never infer politics.** Matching uses only worker-authorized fit signals. No demographic proxies, no social scraping, no hidden ideology scores, no exceptions. When in doubt, leave it out and ask.
5. **Every ranking explains itself.** Show the weighted components and the evidence behind each. There is no universal worker score anywhere in the system — not in the UI, not in the DB, not in a comment.
6. **Jurisdiction hard stop.** A job cannot publish with an unknown, expired, or unapproved jurisdiction rule profile. Block it with a clear error, never a silent default.
7. **Verify before marking done.** Run typecheck and tests before marking any slice done. Fix failures; don't skip them.
8. **Ask before adding a dependency or changing the data model.** The schema is the contract — changes get explicit approval first.

## Stack (M0)

Next.js 16 (App Router) + TypeScript · Supabase (Auth + Postgres) · Prisma 6 ·
Vitest · Tailwind v4. Stripe Connect lands in M5.

## Notes for future sessions

- `src/proxy.ts` (not `middleware.ts`) — Next.js 16 renamed the convention.
- Supabase/Prisma clients are lazy: the app boots with no env set; DB/auth
  calls throw clear "missing env" errors. Keep it that way.
- Seed: `npm run seed` (needs `DATABASE_URL`). Idempotent.
- Seed auth users don't exist — `/signup` creates them; link a login to a
  seeded worker by updating the worker's `profileId`.
