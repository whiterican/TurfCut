import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ check: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ check: m.check, clientKey: () => "203.0.113.9", retryAfter: async () => 60, waitText: () => "1 minute" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { signUp } from "./actions";

const START = { message: "", errors: {}, values: {} };
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const WORKER = { accountType: "worker", name: "Caden", email: "caden@example.com", password: "long enough", phone: "" };

describe("signUp when the server isn't fully configured", () => {
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

  it("refuses before any login is created when the database isn't set, and says which setting", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const r = await signUp(START, form(WORKER));
    expect(r.message).toBe("Sign-up isn't configured on this server yet (DATABASE_URL).");
    expect(r.errors).toEqual({});
    expect(r.values).toMatchObject({ accountType: "worker", name: "Caden", email: "caden@example.com" });
    expect(m.check).not.toHaveBeenCalled();
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it("names every missing setting", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const r = await signUp(START, form(WORKER));
    expect(r.message).toBe("Sign-up isn't configured on this server yet (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  });

  it("still reports form mistakes first", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const r = await signUp(START, form({ ...WORKER, password: "short" }));
    expect(r.message).toBe("Fix the highlighted fields.");
    expect(r.errors.password).toBeTruthy();
  });

  it("goes on to the sign-up limit once configured", async () => {
    m.check.mockResolvedValue("unavailable");
    const r = await signUp(START, form(WORKER));
    expect(m.check).toHaveBeenCalledWith("signup", "203.0.113.9");
    expect(r.message).toBe("Sign-up is briefly unavailable. Try again in a minute.");
  });
});
