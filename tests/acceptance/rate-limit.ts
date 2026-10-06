/* Rate-limit store acceptance: the Postgres store shared across instances, against a fresh database (tests/acceptance/run.sh). */
// Worst case: one connection per instance (production uses three; set before the first query).
process.env.DATABASE_URL = `${process.env.DATABASE_URL}${process.env.DATABASE_URL?.includes("?") ? "&" : "?"}connection_limit=1&pool_timeout=20`;
import { db } from "@/lib/db";
import { allow, check as verdict, LIMITS, postgresStore, retryAfter } from "@/lib/rate-limit";

let fails = 0;
const check = (l: string, c: unknown, d?: unknown) => { if (c) console.log(`PASS ${l}`); else { fails++; console.log(`FAIL ${l}`, d ?? ""); } };
const quiet = <T,>(f: () => Promise<T>) => { const e = console.error; console.error = () => {}; return f().finally(() => { console.error = e; }); };

(async () => {
  const p = db();
  const never = () => 1; // no random sweeps unless a check asks for one
  const a = postgresStore(never);
  const b = postgresStore(never); // a second serverless instance
  const W = LIMITS.signup.windowMs;
  const t0 = Math.floor(Date.now() / W) * W + 1000; // just after a window starts

  // Two instances count into the same bucket.
  for (let i = 0; i < LIMITS.signup.max; i++) await allow("signup", "198.51.100.7", t0 + i, i % 2 ? a : b);
  check("hits from two instances add up to one limit", !(await allow("signup", "198.51.100.7", t0 + 10, a)) && !(await allow("signup", "198.51.100.7", t0 + 11, b)));
  check("another address is unaffected", await allow("signup", "198.51.100.8", t0 + 12, b));
  const wait = await retryAfter("signup", "198.51.100.7", t0 + 20, b);
  check("retryAfter says to wait into the next window", wait * 1000 > W - 30 && wait * 1000 < 2 * W, wait);
  const row = await p.rateLimitCounter.findFirst({ where: { bucket: "signup:198.51.100.7" } });
  check("one row per bucket and window; refused retries stop at one past the limit", !!row && row.count === LIMITS.signup.max + 1 && Number(row.windowStart) === t0 - 1000, row);

  // Many concurrent requests (as from many instances) never overshoot: each gets its own count.
  const burst = await Promise.all(Array.from({ length: 30 }, (_, i) => allow("login", "203.0.113.50", t0 + i, i % 3 ? a : b)));
  check("30 concurrent sign-ins: exactly the limit get through", burst.filter(Boolean).length === LIMITS.login.max, burst.filter(Boolean).length);

  // The review's probe: the instance's only connection is busy for 3 s while a flood arrives.
  const hold = p.$transaction(async (tx) => { await tx.$executeRaw`SELECT pg_sleep(3)`; }, { timeout: 10_000 });
  await new Promise((r) => setTimeout(r, 200));
  const flood = await Promise.all(Array.from({ length: 15 }, (_, i) => allow("login", "203.0.113.77", t0 + i)));
  await hold;
  check("a busy connection doesn't open the gate: 15 attempts, exactly 10 allowed", flood.filter(Boolean).length === LIMITS.login.max, flood.filter(Boolean).length);

  // The window slides: a window and a half later, part of the old count still weighs in.
  const later = await allow("signup", "198.51.100.7", t0 - 1000 + 2 * W, a);
  check("two windows on, the address is allowed again", later);

  // Expired rows are swept in capped batches (on a random fraction of calls; forced here).
  const before = await p.rateLimitCounter.count();
  await allow("sync", "worker-1", t0 + 10 * W, postgresStore(() => 0));
  const left = await p.rateLimitCounter.findMany({ select: { expiresAt: true } });
  check("a sweep deletes only expired rows", left.length < before && left.every((r) => Number(r.expiresAt) > t0 + 10 * W), { before, left: left.length });

  // A missing table refuses sign-in (fails closed) but not sync.
  await p.$executeRawUnsafe(`ALTER TABLE "RateLimitCounter" RENAME TO "RateLimitCounter_away"`);
  let closed: string, syncOk: boolean;
  try {
    closed = await quiet(() => verdict("login", "203.0.113.99", t0, a));
    syncOk = await quiet(() => allow("sync", "worker-2", t0, a));
  } finally {
    await p.$executeRawUnsafe(`ALTER TABLE "RateLimitCounter_away" RENAME TO "RateLimitCounter"`);
  }
  check("without the table, sign-in answers 'unavailable' (not unlimited, not 'too many'); sync still goes through", closed === "unavailable" && syncOk === true, { closed, syncOk });

  // The store is server-only.
  const rls = await p.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'RateLimitCounter'`;
  const grants = await p.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM information_schema.role_table_grants WHERE table_name = 'RateLimitCounter' AND grantee IN ('anon', 'authenticated')`;
  check("RLS is on and anon/authenticated have no grants", rls[0]?.relrowsecurity === true && Number(grants[0].n) === 0, { rls, grants });

  await p.$disconnect();
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
