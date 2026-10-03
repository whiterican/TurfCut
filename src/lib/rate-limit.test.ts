import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _reset, allow, clientKey, LIMITS, retryAfter } from "./rate-limit";

const h = (m: Record<string, string>) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });

describe("rate limit", () => {
  beforeEach(_reset);
  afterEach(() => { delete process.env.TRUSTED_PROXY_HOPS; });

  it("allows up to the limit in a window, then refuses until it slides", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < LIMITS.login.max; i++) expect(allow("login", "1.2.3.4", t0 + i)).toBe(true);
    expect(allow("login", "1.2.3.4", t0 + 100)).toBe(false);
    expect(retryAfter("login", "1.2.3.4", t0 + 100)).toBe(Math.ceil((LIMITS.login.windowMs - 100) / 1000));
    expect(allow("login", "5.6.7.8", t0 + 100)).toBe(true);
    const later = t0 + LIMITS.login.windowMs + 10;
    for (let i = 0; i < LIMITS.login.max; i++) expect(allow("login", "1.2.3.4", later + i)).toBe(true);
    expect(allow("login", "1.2.3.4", later + 20)).toBe(false);
  });

  it("keeps limits separate per endpoint", () => {
    for (let i = 0; i < LIMITS.signup.max; i++) allow("signup", "k", i);
    expect(allow("signup", "k", 10)).toBe(false);
    expect(allow("login", "k", 10)).toBe(true);
    expect(allow("link", "k", 10)).toBe(true);
  });

  it("sweeps each key by its own window", () => {
    const s = new Map<string, number[]>();
    for (let i = 0; i < 10_001; i++) allow("sync", `w${i}`, 0, s); // fills past the sweep threshold
    allow("signup", "slow", 0, s);
    allow("sync", "trigger", 5 * 60_000, s); // a sync hit five minutes later sweeps
    expect(s.get("signup:slow")).toEqual([0]); // one-hour window: still counted
    expect(s.has("sync:w1")).toBe(false); // one-minute window: gone
  });

  it("trusts platform headers, never the client's own x-forwarded-for", () => {
    expect(clientKey(h({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "6.6.6.6" }))).toBe("203.0.113.9");
    expect(clientKey(h({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBeNull(); // no trusted hop count: unknown
    process.env.TRUSTED_PROXY_HOPS = "1"; // one proxy: it appended the client's address last
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    process.env.TRUSTED_PROXY_HOPS = "2"; // two proxies: the second appended the first's address
    expect(clientKey(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientKey(h({}))).toBeNull();
  });
});
