import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ check: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ check: m.check, clientKey: () => "203.0.113.9", retryAfter: async () => 60, waitText: () => "1 minute" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { logIn } from "./actions";

const START = { ok: false, message: "", email: "" };
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("logIn when the server isn't fully configured", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@localhost:5432/turfcut");
    m.check.mockReset();
    m.createClient.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("names the missing setting instead of calling it an outage, before any limit or Supabase call", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const r = await logIn(START, form({ email: "Caden@Example.com", password: "long enough", intent: "password" }));
    expect(r).toEqual({ ok: false, message: "Sign-in isn't configured on this server yet (DATABASE_URL).", email: "caden@example.com" });
    expect(m.check).not.toHaveBeenCalled();
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it("does the same for sign-in links", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const r = await logIn(START, form({ email: "caden@example.com", intent: "link" }));
    expect(r.message).toBe("Sign-in isn't configured on this server yet (NEXT_PUBLIC_SUPABASE_ANON_KEY).");
    expect(m.check).not.toHaveBeenCalled();
  });

  it("still checks a bad address first", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const r = await logIn(START, form({ email: "not-an-email", intent: "password" }));
    expect(r.message).toBe("Enter a valid email address.");
  });

  it("goes on to the sign-in limits once configured (a real outage still reads as one)", async () => {
    m.check.mockResolvedValue("unavailable");
    const r = await logIn(START, form({ email: "caden@example.com", password: "long enough", intent: "password" }));
    expect(m.check).toHaveBeenCalled();
    expect(r.message).toBe("Sign-in is briefly unavailable. Try again in a minute.");
  });
});
