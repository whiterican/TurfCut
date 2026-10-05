import { db } from "@/lib/db";
import { isDatabaseUnreachable } from "@/lib/outage";

/**
 * A small sliding-window limiter for the few endpoints that take unauthenticated
 * or unmetered input: sign-in, sign-up, the phone's offline sync, and the
 * invite emails an owner can trigger.
 *
 * Counts live in Postgres (RateLimitCounter, prisma/rate-limit.sql), shared
 * by every serverless instance: one atomic upsert per request, no lock and
 * no transaction. Supabase Auth applies its own limits to sign-in and
 * sign-up on top of this. See allow() for what happens if the store fails.
 */
export interface Limit {
  /** Requests allowed per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export const LIMITS = {
  /** Password attempts per connection. */
  login: { max: 10, windowMs: 10 * 60_000 },
  /** Password attempts per email address, from anywhere (credential stuffing). */
  "login-email": { max: 20, windowMs: 10 * 60_000 },
  /** Sign-in links per connection (each one is an email). */
  link: { max: 5, windowMs: 10 * 60_000 },
  /** New accounts per connection. */
  signup: { max: 5, windowMs: 60 * 60_000 },
  /** Offline sync batches per worker (a phone retries, a script floods). */
  sync: { max: 60, windowMs: 60_000 },
  /** Member invite emails (sends and resends) per organization per day. */
  invite: { max: 20, windowMs: 24 * 60 * 60_000 },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;

/** Where hits are counted. Postgres in the app; an in-memory one for unit tests. */
/**
 * Counts per fixed window, read as a sliding one: the previous window's
 * count is weighted by how much of it still overlaps (the approach large
 * rate limiters use). No lock, no transaction: each request is one atomic
 * upsert, so a busy connection or a flood can't make the limiter give up.
 */
export interface Counts {
  /** Requests in the current window, including this one. */
  current: number;
  /** Requests in the window before. */
  previous: number;
}

export interface RateStore {
  /**
   * Adds this request to the bucket's current window, never storing more
   * than `cap` (one past the limit: refused retries don't pile up and stretch
   * the wait); returns both windows' counts.
   */
  hit(bucket: string, windowStart: number, windowMs: number, now: number, cap: number): Promise<Counts>;
  /** Both windows' counts without adding anything. */
  peek(bucket: string, windowStart: number, windowMs: number): Promise<Counts>;
}

const windowStartOf = (now: number, windowMs: number) => Math.floor(now / windowMs) * windowMs;

/** The sliding estimate: this window, plus the previous one's still-overlapping share. Pure. */
export function estimate(c: Counts, now: number, windowMs: number): number {
  const elapsed = (now - windowStartOf(now, windowMs)) / windowMs;
  return c.current + c.previous * (1 - elapsed);
}

/** Milliseconds until one more request would be allowed (0 if it would be now). Pure. */
export function waitMs(c: Counts, now: number, windowMs: number, max: number): number {
  const start = windowStartOf(now, windowMs);
  const room = max - c.current - 1; // what the previous window's share may still be
  if (room >= 0) {
    if (c.previous === 0) return 0;
    const t = start + windowMs * Math.max(0, 1 - room / c.previous);
    return Math.max(0, Math.ceil(t - now));
  }
  // This window is full: wait for the next, where this window becomes "previous".
  const next = start + windowMs;
  return Math.ceil(next + windowMs * Math.max(0, 1 - (max - 1) / c.current) - now);
}

const SWEEP_EVERY = 50; // on average one call in 50 deletes a capped batch of expired rows
const SWEEP_BATCH = 1000;

/**
 * The shared store (RateLimitCounter, prisma/rate-limit.sql): one row per
 * bucket and window, all integers (epoch ms), so there's nothing to convert.
 */
export function postgresStore(random: () => number = Math.random): RateStore {
  const read = async (bucket: string, windowStart: number, windowMs: number): Promise<Counts> => {
    const rows = await db().$queryRaw<{ windowStart: bigint; count: number }[]>`
      SELECT "windowStart", "count" FROM "RateLimitCounter"
       WHERE "bucket" = ${bucket} AND "windowStart" IN (${BigInt(windowStart)}, ${BigInt(windowStart - windowMs)})`;
    const at = (ws: number) => rows.find((r) => Number(r.windowStart) === ws)?.count ?? 0;
    return { current: at(windowStart), previous: at(windowStart - windowMs) };
  };
  return {
    async hit(bucket, windowStart, windowMs, now, cap) {
      // One statement: count this request and read the previous window.
      const [row] = await db().$queryRaw<{ current: number; previous: number }[]>`
        WITH up AS (
          INSERT INTO "RateLimitCounter" ("bucket", "windowStart", "count", "expiresAt")
          VALUES (${bucket}, ${BigInt(windowStart)}, 1, ${BigInt(windowStart + 2 * windowMs)})
          ON CONFLICT ("bucket", "windowStart") DO UPDATE SET "count" = LEAST("RateLimitCounter"."count" + 1, ${cap})
          RETURNING "count")
        SELECT up."count" AS "current",
               COALESCE((SELECT "count" FROM "RateLimitCounter" WHERE "bucket" = ${bucket} AND "windowStart" = ${BigInt(windowStart - windowMs)}), 0) AS "previous"
          FROM up`;
      if (random() * SWEEP_EVERY < 1) {
        await db().$executeRaw`
          DELETE FROM "RateLimitCounter" WHERE ctid IN (
            SELECT ctid FROM "RateLimitCounter" WHERE "expiresAt" <= ${BigInt(now)} LIMIT ${SWEEP_BATCH})`.catch((e) => console.error("[turfcut] rate-limit sweep failed", e));
      }
      return { current: Number(row.current), previous: Number(row.previous) };
    },
    peek: read,
  };
}

/** Per-process store for unit tests, with the same window arithmetic. */
export function memoryStore(): RateStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  const key = (bucket: string, ws: number) => `${bucket}@${ws}`;
  const peek = async (bucket: string, ws: number, windowMs: number) => ({ current: counts.get(key(bucket, ws)) ?? 0, previous: counts.get(key(bucket, ws - windowMs)) ?? 0 });
  return {
    counts,
    async hit(bucket, ws, windowMs, _now, cap) {
      counts.set(key(bucket, ws), Math.min(cap, (counts.get(key(bucket, ws)) ?? 0) + 1));
      return peek(bucket, ws, windowMs);
    },
    peek,
  };
}

let shared: RateStore | null = null;
const store = () => (shared ??= postgresStore());

/**
 * When the store fails: let the request through only if the database can't
 * be reached or connected to at all, so an outage doesn't lock everyone out.
 * (A missing DATABASE_URL never gets here: sign-in and sign-up check their
 * settings first and say what's missing; see missingCoreSettings.)
 * Anything else (a missing table, an error under load) makes the sign-in,
 * sign-up and invite limits answer "unavailable" rather than silently
 * switching them off; offline sync stays open, since refusing it loses
 * field data. A connection-pool timeout is also let through for the
 * per-connection sign-in limit: the per-address limit still applies, and
 * otherwise anyone keeping an instance busy could block every sign-in on it.
 */
const FAIL_OPEN: ReadonlySet<LimitName> = new Set(["sync"]);
function failOpen(name: LimitName, e: unknown): boolean {
  if (FAIL_OPEN.has(name) || isDatabaseUnreachable(e)) return true;
  return (e as { code?: unknown })?.code === "P2024" && name === "login";
}

/** "ok": go ahead. "limited": too many, say when to retry. "unavailable": the limiter can't tell; say so, don't blame the user. */
export type Verdict = "ok" | "limited" | "unavailable";

export async function check(name: LimitName, key: string, now = Date.now(), s: RateStore = store()): Promise<Verdict> {
  const { max, windowMs } = LIMITS[name];
  try {
    const c = await s.hit(`${name}:${key}`, windowStartOf(now, windowMs), windowMs, now, max + 1);
    return estimate(c, now, windowMs) <= max ? "ok" : "limited";
  } catch (e) {
    const open = failOpen(name, e);
    console.error(`[turfcut] rate limiter error (${name}); ${open ? "allowing" : "refusing"}`, e);
    return open ? "ok" : "unavailable";
  }
}

/** True when the call may go ahead (check() for why not). */
export async function allow(name: LimitName, key: string, now = Date.now(), s: RateStore = store()): Promise<boolean> {
  return (await check(name, key, now, s)) === "ok";
}

/** "1 minute", "3 minutes", "2 hours": a wait in words, never zero. */
export function waitText(seconds: number, unit: "minute" | "hour" = "minute"): string {
  const n = Math.max(1, Math.ceil(seconds / (unit === "hour" ? 3600 : 60)));
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** Seconds until one more request would be allowed (for Retry-After and messages). */
export async function retryAfter(name: LimitName, key: string, now = Date.now(), s: RateStore = store()): Promise<number> {
  const { max, windowMs } = LIMITS[name];
  try {
    const c = await s.peek(`${name}:${key}`, windowStartOf(now, windowMs), windowMs);
    const ms = waitMs(c, now, windowMs, max);
    return ms === 0 ? 0 : Math.max(1, Math.ceil(ms / 1000));
  } catch {
    return 60;
  }
}

let warnedNoIp = false;

/**
 * The caller's address, or null when the deployment has not said which
 * header to believe: callers then skip the per-connection limit rather than
 * lock every visitor into one shared bucket.
 *
 * Nothing is trusted by default. A client can send any header, and a
 * generic reverse proxy forwards client headers unchanged and appends to
 * x-forwarded-for rather than replacing it. So the deployment names exactly
 * one source: CLIENT_IP_HEADER (a header the platform itself sets, such as
 * cf-connecting-ip, fly-client-ip, x-vercel-forwarded-for or x-real-ip) or
 * TRUSTED_PROXY_HOPS (x-forwarded-for read from the trusted end).
 */
export function clientKey(h: { get(name: string): string | null }, env: Record<string, string | undefined> = process.env): string | null {
  const header = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (!header && !env.TRUSTED_PROXY_HOPS?.trim() && env.VERCEL && !warnedNoIp) {
    warnedNoIp = true;
    console.warn("[turfcut] Neither CLIENT_IP_HEADER nor TRUSTED_PROXY_HOPS is set: per-connection rate limits are off. On Vercel, set CLIENT_IP_HEADER=x-vercel-forwarded-for.");
  }
  if (header) return h.get(header)?.split(",")[0].trim() || null;
  const hops = Number(env.TRUSTED_PROXY_HOPS ?? "0");
  const chain = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!chain.length || !Number.isInteger(hops) || hops < 1) return null;
  // Each trusted proxy appends the address it was reached from, so with n
  // trusted proxies the client's address is the n-th entry from the end;
  // anything before it was supplied by the client and is ignored.
  return chain[Math.max(0, chain.length - hops)] ?? null;
}

