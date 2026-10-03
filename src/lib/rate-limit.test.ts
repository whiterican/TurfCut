import { beforeEach, describe, expect, it } from "vitest";
import { _reset, allow, clientKey, LIMITS, retryAfter } from "./rate-limit";

describe("rate limit", () => {
  beforeEach(_reset);

  it("allows up to the limit in a window, then refuses until it slides", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < LIMITS.login.max; i++) expect(allow("login", "1.2.3.4", t0 + i)).toBe(true);
    expect(allow("login", "1.2.3.4", t0 + 100)).toBe(false);
    expect(retryAfter("login", "1.2.3.4", t0 + 100)).toBe(Math.ceil((LIMITS.login.windowMs - 100) / 1000));
    // another address is its own bucket
    expect(allow("login", "5.6.7.8", t0 + 100)).toBe(true);
    // once the hits age out, the window is open again
    const later = t0 + LIMITS.login.windowMs + 10;
    for (let i = 0; i < LIMITS.login.max; i++) expect(allow("login", "1.2.3.4", later + i)).toBe(true);
    expect(allow("login", "1.2.3.4", later + 20)).toBe(false);
  });

  it("keeps limits separate per endpoint", () => {
    for (let i = 0; i < LIMITS.signup.max; i++) allow("signup", "k", i);
    expect(allow("signup", "k", 10)).toBe(false);
    expect(allow("login", "k", 10)).toBe(true);
  });

  it("reads the client address from proxy headers, first hop wins", () => {
    const h = (m: Record<string, string>) => ({ get: (n: string) => m[n.toLowerCase()] ?? null });
    expect(clientKey(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientKey(h({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientKey(h({}))).toBe("unknown");
  });
});
