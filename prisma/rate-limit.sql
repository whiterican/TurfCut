-- Turfcut rate-limit store — move the sign-in/sign-up/sync/invite limiter
-- from per-process memory to Postgres, so limits accumulate across every
-- serverless instance. Run ONCE (after c1-roles.sql on the live project),
-- BEFORE deploying the code that uses it: until it exists, sign-in, sign-up
-- and invites are refused (the limiter fails closed on a missing table).
-- Paste into the Supabase SQL editor. (Fresh databases:
-- supabase-manual-setup.sql already includes it.)
--
-- One row per bucket ("login:203.0.113.9") per fixed window: the window's
-- start, how many requests it saw, and when the row stops mattering (two
-- windows on, since the next window still reads it). All epoch milliseconds,
-- so there is no time zone to get wrong. Operational state, not a ledger:
-- expired rows are deleted in small batches. Row-level security on with no
-- policies: only the server reads or writes it.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE "public"."RateLimitCounter" (
    "bucket" TEXT NOT NULL,
    "windowStart" BIGINT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" BIGINT NOT NULL,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("bucket", "windowStart"),
    CONSTRAINT "RateLimitCounter_count_positive" CHECK ("count" > 0)
);

CREATE INDEX "RateLimitCounter_expiresAt_idx" ON "public"."RateLimitCounter"("expiresAt");

ALTER TABLE "public"."RateLimitCounter" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "public"."RateLimitCounter" FROM anon, authenticated;

COMMIT;
