import { describe, expect, it } from "vitest";
import { hasSupabaseConfig } from "./env";

describe("env helpers", () => {
  it("reports missing Supabase config without throwing", () => {
    // M0 rule: the app boots with no env set. hasSupabaseConfig() must be a
    // pure boolean check, never a throw.
    const saved = { ...process.env };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(hasSupabaseConfig()).toBe(false);
    process.env = saved;
  });

  it("getSupabaseUrl throws a clear, actionable error when unset", async () => {
    const { getSupabaseUrl } = await import("./env");
    const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => getSupabaseUrl()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => getSupabaseUrl()).toThrow(/\.env\.local/);
    if (saved !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });
});
