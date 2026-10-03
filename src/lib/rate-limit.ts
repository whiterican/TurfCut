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
  /** Password attempts and sign-in links per address. */
  login: { max: 10, windowMs: 10 * 60_000 },
  /** New accounts per address. */
  signup: { max: 5, windowMs: 60 * 60_000 },
  /** Offline sync batches per worker (a phone retries, a script floods). */
  sync: { max: 60, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;

type Store = Map<string, number[]>;
const store: Store = new Map();
const MAX_KEYS = 10_000;

/** Returns true when the call is allowed, false when the window is full. */
export function allow(name: keyof typeof LIMITS, key: string, now = Date.now(), s: Store = store): boolean {
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
  if (s.size > MAX_KEYS) sweep(s, since);
  return true;
}

/** Seconds until the oldest hit in the window ages out (for Retry-After). */
export function retryAfter(name: keyof typeof LIMITS, key: string, now = Date.now(), s: Store = store): number {
  const { windowMs } = LIMITS[name];
  const hits = s.get(`${name}:${key}`) ?? [];
  if (!hits.length) return 0;
  return Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
}

function sweep(s: Store, since: number) {
  for (const [k, hits] of s) {
    const live = hits.filter((t) => t > since);
    if (live.length) s.set(k, live);
    else s.delete(k);
  }
}

/** The caller's address from the proxy headers, or "unknown" (still limited, as one bucket). */
export function clientKey(h: { get(name: string): string | null }): string {
  const fwd = h.get("x-forwarded-for");
  const ip = fwd?.split(",")[0].trim() || h.get("x-real-ip")?.trim();
  return ip || "unknown";
}

/** Test hook. */
export const _reset = () => store.clear();
