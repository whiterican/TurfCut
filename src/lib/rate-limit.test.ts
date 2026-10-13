import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { allow, check, clientKey, estimate, LIMITS, memoryStore, retryAfter, waitMs, waitText, type RateStore } from "./rate-limit";

const h = (m: Record<string, string>) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });
const W = LIMITS.login.windowMs; // 10 minutes
const MAX = LIMITS.login.max; // 10

describe("rate limit", () => {
  it("allows up to the limit in a window, then refuses", async () => {
    const s = memoryStore();
    const t0 = 50 * W; // the start of a window
    for (let i = 0; i < MAX; i++) expect(await allow("login", "1.2.3.4", t0 + i, s)).toBe(true);
    expect(await allow("login", "1.2.3.4", t0 + 100, s)).toBe(false);
    expect(await allow("login", "5.6.7.8", t0 + 100, s)).toBe(true);
  });

  it("slides: the previous window's requests fade out across the next one", async () => {
    const s = memoryStore();
    const t0 = 50 * W;
    for (let i = 0; i < MAX; i++) await allow("login", "k", t0 + i, s);
    // Right after the boundary the last window still counts almost fully...
    expect(await allow("login", "k", t0 + W + 1000, s)).toBe(false);
    // ...halfway through, about half of it does, so a few more get through, then not.
    const half = t0 + W + W / 2;
    const results = [];
    for (let i = 0; i < MAX; i++) results.push(await allow("login", "k", half + i, s));
    expect(results.filter(Boolean).length).toBeGreaterThanOrEqual(3);
    expect(results.filter(Boolean).length).toBeLessThan(MAX);
    // Two full windows later it's all gone.
    expect(await allow("login", "k", t0 + 3 * W, s)).toBe(true);
  });

  it("estimate and wait: the arithmetic behind it", () => {
    expect(estimate({ current: 3, previous: 10 }, 50 * W + W / 2, W)).toBe(8);
    // Room now: wait 0.
    expect(waitMs({ current: 3, previous: 0 }, 50 * W, W, MAX)).toBe(0);
    // Current window full: wait into the next window until this one's share has faded enough.
    const full = waitMs({ current: MAX, previous: 0 }, 50 * W + 1000, W, MAX);
    expect(full).toBe(W - 1000 + Math.ceil(W * (1 - (MAX - 1) / MAX)));
    // Not full, but the previous window still fills it: wait until its share fades.
    const fading = waitMs({ current: 5, previous: 10 }, 50 * W, W, MAX);
    expect(fading).toBe(Math.ceil(W * (1 - 4 / 10)));
  });

  it("retryAfter matches when the next request would be allowed", async () => {
    const s = memoryStore();
    const t0 = 50 * W;
    for (let i = 0; i < MAX + 1; i++) await allow("login", "r", t0, s);
    const secs = await retryAfter("login", "r", t0, s);
    expect(secs).toBeGreaterThan(0);
    expect(await allow("login", "r", t0 + secs * 1000 - 2000, memoryStoreFrom(s))).toBe(false);
    expect(await allow("login", "r", t0 + secs * 1000 + 1, s)).toBe(true);
    expect(await retryAfter("login", "nobody", t0, s)).toBe(0);
  });

  it("refused retries don't stretch the wait (stored counts stop at one past the limit)", async () => {
    const s = memoryStore();
    const t0 = 50 * W;
    for (let i = 0; i < MAX + 50; i++) await check("login", "spam", t0 + i, s);
    expect([...s.counts.values()]).toEqual([MAX + 1]);
    expect(await check("login", "spam", t0 + 100, s)).toBe("limited");
    // The wait is the same as after a single refused attempt.
    const one = memoryStore();
    for (let i = 0; i < MAX + 1; i++) await check("login", "once", t0 + i, one);
    expect(await retryAfter("login", "spam", t0 + 100, s)).toBe(await retryAfter("login", "once", t0 + 100, one));
  });

  it("puts waits into words, never zero and with the right plural", () => {
    expect(waitText(0)).toBe("1 minute");
    expect(waitText(30)).toBe("1 minute");
    expect(waitText(61)).toBe("2 minutes");
    expect(waitText(3600, "hour")).toBe("1 hour");
    expect(waitText(5000, "hour")).toBe("2 hours");
  });

  it("keeps limits separate per endpoint", async () => {
    const s = memoryStore();
    for (let i = 0; i < LIMITS.signup.max; i++) await allow("signup", "k", i, s);
    expect(await allow("signup", "k", 10, s)).toBe(false);
    expect(await allow("login", "k", 10, s)).toBe(true);
    expect(await allow("link", "k", 10, s)).toBe(true);
  });

  describe("when the store fails", () => {
    const failing = (e: unknown): RateStore => ({ hit: () => Promise.reject(e), peek: () => Promise.reject(e) });
    const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});
    it("lets requests through only if the database is unreachable", async () => {
      const log = quiet();
      const down = new Prisma.PrismaClientKnownRequestError("Can't reach database server", { code: "P1001", clientVersion: "6" });
      expect(await allow("login", "x", 0, failing(down))).toBe(true);
      expect(await allow("login", "x", 0, failing(new Prisma.PrismaClientInitializationError("no DATABASE_URL", "6")))).toBe(true);
      log.mockRestore();
    });
    it("answers 'unavailable' (not 'limited') for sign-in, sign-up and invites on anything else", async () => {
      const log = quiet();
      const missing = new Prisma.PrismaClientKnownRequestError('relation "RateLimitCounter" does not exist', { code: "P2010", clientVersion: "6" });
      for (const name of ["login", "login-email", "link", "signup", "invite"] as const) {
        expect(await check(name, "x", 0, failing(missing))).toBe("unavailable");
        expect(await allow(name, "x", 0, failing(missing))).toBe(false);
      }
      expect(await retryAfter("login", "x", 0, failing(missing))).toBe(60);
      log.mockRestore();
    });
    it("a pool timeout lets the per-connection sign-in limit through (the per-address one still answers)", async () => {
      const log = quiet();
      const busy = new Prisma.PrismaClientKnownRequestError("Timed out fetching a new connection", { code: "P2024", clientVersion: "6" });
      expect(await check("login", "x", 0, failing(busy))).toBe("ok");
      expect(await check("login-email", "x", 0, failing(busy))).toBe("unavailable");
      expect(await check("signup", "x", 0, failing(busy))).toBe("unavailable");
      log.mockRestore();
    });
    it("keeps offline sync open, since refusing it would lose field data", async () => {
      const log = quiet();
      expect(await allow("sync", "w", 0, failing(new Error("anything")))).toBe(true);
      log.mockRestore();
    });
  });

  it("trusts only the header or hop count the deployment names", () => {
    // nothing configured: no address, so no per-connection limit (never a shared bucket)
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9", "x-real-ip": "6.6.6.7" }), {})).toBeNull();
    // a platform header, named explicitly: client-sent x-forwarded-for is ignored
    expect(clientKey(h({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "6.6.6.6" }), { CLIENT_IP_HEADER: "CF-Connecting-IP" })).toBe("203.0.113.9");
    expect(clientKey(h({ "x-vercel-forwarded-for": "203.0.113.9" }), { CLIENT_IP_HEADER: " x-vercel-forwarded-for " })).toBe("203.0.113.9");
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6" }), { CLIENT_IP_HEADER: "x-real-ip" })).toBeNull();
    // one proxy: it appended the client's address last; a forged x-real-ip is ignored
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9", "x-real-ip": "6.6.6.7" }), { TRUSTED_PROXY_HOPS: "1" })).toBe("203.0.113.9");
    // two proxies: the second appended the first's address
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }), { TRUSTED_PROXY_HOPS: "2" })).toBe("203.0.113.9");
    expect(clientKey(h({}), { TRUSTED_PROXY_HOPS: "1" })).toBeNull();
    // nonsense hop counts trust nothing
    for (const bad of ["0", "-1", "1.5", "abc"]) expect(clientKey(h({ "x-forwarded-for": "203.0.113.9" }), { TRUSTED_PROXY_HOPS: bad })).toBeNull();
  });

  it("with TRUSTED_PROXY_HOPS set, each client address gets its own bucket; spoofed prefixes don't dodge it", async () => {
    const s = memoryStore();
    const env = { TRUSTED_PROXY_HOPS: "1" };
    // The attacker varies the part of x-forwarded-for they control; the proxy-appended address stays the same.
    for (let i = 0; i < LIMITS.signup.max; i++) {
      const who = clientKey(h({ "x-forwarded-for": `10.0.0.${i}, 198.51.100.7` }), env)!;
      expect(await allow("signup", who, i, s)).toBe(true);
    }
    const again = clientKey(h({ "x-forwarded-for": "10.9.9.9, 198.51.100.7" }), env)!;
    expect(again).toBe("198.51.100.7");
    expect(await allow("signup", again, 100, s)).toBe(false);
    expect([...s.counts.keys()].map((k) => k.split("@")[0])).toEqual(["signup:198.51.100.7"]);
  });

  it("warns once on Vercel when no client-address source is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    clientKey(h({ "x-forwarded-for": "1.1.1.1" }), { VERCEL: "1" });
    clientKey(h({ "x-forwarded-for": "1.1.1.1" }), { VERCEL: "1" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/CLIENT_IP_HEADER=x-vercel-forwarded-for/);
    warn.mockRestore();
  });
});

/** A store reading the same counts without sharing writes (to probe without counting). */
function memoryStoreFrom(src: ReturnType<typeof memoryStore>) {
  const copy = memoryStore();
  for (const [k, v] of src.counts) copy.counts.set(k, v);
  return copy;
}

