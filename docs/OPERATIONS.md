# Running Turfcut: what to watch and what only Caden can switch on

Checked on Nov 16, 2026 against the live project (Supabase, Sentry and the public site; Vercel's
settings could not be read from here, so those rows say "check"). Re-check after each deploy.

## Is it up?

- `GET /api/health` returns `200 {"ok":true}` when the app can reach its database, and `503 {"ok":false}`
  otherwise. It needs no sign-in, skips the session refresh (src/proxy.ts), and says nothing else to the
  caller; the reason goes to the server log as `[turfcut] health: …` (Vercel → Logs).
- Point an uptime monitor at `https://turf-cut.vercel.app/api/health` (any free one: a 1-minute check that alerts on
  a non-200 and on no answer in 10 seconds). Nothing in the repo does this for you.
- Errors: Sentry (`turfcut.sentry.io`) is wired in `src/instrumentation.ts`. On Nov 16 it had no unresolved
  errors in 14 days.

## State on Nov 16

| Area | State |
| --- | --- |
| Database | Supabase project active and healthy (Postgres 17, us-east-2). The columns the code reads (`Job.sector`, `Job.activity`, `Job.workMode`, message reactions and mentions) are present, so the SQL files through `p3-sectors.sql` have been applied. The Supabase migration list stops at `profile_photo` because those files were pasted into the SQL editor, which does not record them. |
| Site | `/login` answers 200. |
| Payouts | **Not configured.** `/api/stripe/webhook` answers 503 "Payouts aren't configured." Until Stripe is set up the Pay button only explains that. |
| Security advisor | No errors. Three warnings, below. |

## Only Caden can do these (in this order of value)

1. **Payouts (Stripe, test mode first).** README, "What needs Caden", item 7: turn on Connect (Express),
   put the secret key in `STRIPE_SECRET_KEY`, add a webhook at `<SITE_URL>/api/stripe/webhook` for
   `transfer.created` and `transfer.reversed`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Redeploy.
   Check: a `POST` to the webhook with no signature should answer 400 "Missing signature", not 503.
2. **Real email sending.** Sign-in links, confirmation and invites use Supabase's built-in sender, which is
   rate-limited and meant for a pilot. Before more than a handful of people sign up: Supabase → Authentication →
   SMTP → a real provider. Keep **Confirm email** on.
3. **Leaked-password protection** (advisor warning). Supabase → Authentication → Password security. It is a
   dashboard switch; nothing in the code changes.
4. **Check these Vercel settings exist** (Production): `SITE_URL`, `CLIENT_IP_HEADER=x-vercel-forwarded-for`,
   `CRON_SECRET` (the daily photo purge in `vercel.json` refuses to run without it) and `CREDENTIAL_PROOF_KEY`
   (credential photos). Missing ones are named on the page or in the logs, as the README's step 8.7 describes.
5. **`public.rls_auto_enable()`** (advisor warning, twice: callable by signed-out and by signed-in users through
   `/rest/v1/rpc/rls_auto_enable`). It looks like a helper the project got from Supabase, not from this repo. If it
   is not wanted, `revoke execute on function public.rls_auto_enable() from anon, authenticated;` closes it. That is
   a change to the live database, so it waits for Caden's word.

The advisor's 48 "RLS enabled, no policy" notices are intended: every table is closed to the public API and the
app reaches data only through the server (`prisma/m4-0-rls-lockdown.sql`).

## After every deploy

1. `GET /api/health` answers 200.
2. Open `/login` and sign in.
3. Sentry shows nothing new.
4. If a deploy needs SQL first, the README lists the files and their order; run them **before** deploying.
