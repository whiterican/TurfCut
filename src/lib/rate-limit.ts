/**
 * A small sliding-window limiter for the few endpoints that take unauthenticated
 * or unmetered input: sign-in, sign-up, and the phone's offline sync.
 *
 * Per-process and in memory: on a single server it is exact; on serverless
 * hosting each instance counts on its own, so it is a floor, not a wall.
 * Supabase Auth applies its own limits to sign-in and sign-up on top of
 * this. Swapping in a shared store (Postgres or Upstash) only changes the
 * `store` below; callers stay the same.
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
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof LIMITS;
type Store = Map<string, number[]>;
const store: Store = new Map();
const MAX_KEYS = 10_000;

/** Returns true when the call is allowed, false when the window is full. */
export function allow(name: LimitName, key: string, now = Date.now(), s: Store = store): boolean {
  const { max, windowMs } = LIMITS[name];
  const k = `${name}:${key}`;
  const since = now - windowMs;
  const hits = (s.get(k) ?? []).filter((t) => t > since);
  if (hits.length >= max) {
    s.set(k, hits);
    return false;
  }
  hits.push(now);
  s.set(k, hits);
  if (s.size > MAX_KEYS) sweep(s, now);
  return true;
}

/** Seconds until the oldest hit in the window ages out (for Retry-After). */
export function retryAfter(name: LimitName, key: string, now = Date.now(), s: Store = store): number {
  const { windowMs } = LIMITS[name];
  const hits = s.get(`${name}:${key}`) ?? [];
  if (!hits.length) return 0;
  return Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
}

/** Drops aged hits using each key's own window, so a short window never resets a long one. */
function sweep(s: Store, now: number) {
  for (const [k, hits] of s) {
    const name = k.slice(0, k.indexOf(":")) as LimitName;
    const since = now - (LIMITS[name]?.windowMs ?? 0);
    const live = hits.filter((t) => t > since);
    if (live.length) s.set(k, live);
    else s.delete(k);
  }
}

/**
 * The caller's address, or null when the deployment gives none (plain
 * `next start` with no proxy): callers then skip the per-connection limit
 * rather than lock every visitor into one shared bucket.
 *
 * Only headers a hosting platform sets itself are trusted; a client can put
 * anything in x-forwarded-for, and a generic reverse proxy appends to it
 * rather than replacing it. Set TRUSTED_PROXY_HOPS to the number of proxies
 * in front of the app to read x-forwarded-for from the right end.
 */
export function clientKey(h: { get(name: string): string | null }): string | null {
  for (const name of ["cf-connecting-ip", "fly-client-ip", "x-vercel-forwarded-for", "x-real-ip"]) {
    const v = h.get(name)?.split(",")[0].trim();
    if (v) return v;
  }
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "0");
  const chain = (h.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!chain.length || !Number.isInteger(hops) || hops < 1) return null;
  // Each trusted proxy appends the address it was reached from, so with n
  // trusted proxies the client's address is the n-th entry from the end;
  // anything before it was supplied by the client and is ignored.
  return chain[Math.max(0, chain.length - hops)] ?? null;
}

/** Test hook. */
export const _reset = () => store.clear();
