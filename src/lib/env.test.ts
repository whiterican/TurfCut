import { describe, expect, it } from "vitest";
import { getStripeSecretKey, hasStripeConfig, hasSupabaseConfig, liveStripeKeyProblem, stripeSecretKeyMode, stripeWebhookLivemodeProblem, turfcutDemoOn } from "./env";

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

describe("live Stripe keys in demo and non-production deploys", () => {
  const live = "sk_live_abc";
  const restricted = "rk_live_abc";
  const testKey = "sk_test_abc";

  it("tells test keys from live ones, including restricted keys and leading space", () => {
    expect(stripeSecretKeyMode(undefined)).toBe("none");
    expect(stripeSecretKeyMode("sk_test_abc")).toBe("test");
    expect(stripeSecretKeyMode("rk_test_abc")).toBe("test");
    expect(stripeSecretKeyMode("sk_live_abc")).toBe("live");
    expect(stripeSecretKeyMode("rk_live_abc")).toBe("live");
    expect(stripeSecretKeyMode(" sk_live_abc ")).toBe("live");
    expect(stripeSecretKeyMode("pk_test_abc")).toBe("unknown");
  });

  it("TURFCUT_DEMO=1 refuses sk_live_ and rk_live_, and leaves test keys alone", () => {
    expect(liveStripeKeyProblem(live, { TURFCUT_DEMO: "1" })).toMatch(/TURFCUT_DEMO is set/);
    expect(liveStripeKeyProblem(restricted, { TURFCUT_DEMO: "1" })).toMatch(/rk_live_/);
    expect(liveStripeKeyProblem(testKey, { TURFCUT_DEMO: "1" })).toBeNull();
    expect(liveStripeKeyProblem(live, { TURFCUT_DEMO: "" })).toBeNull();
  });

  it("a set VERCEL_ENV that isn't production refuses live keys; unset and production do not", () => {
    expect(liveStripeKeyProblem(live, { VERCEL_ENV: "preview" })).toMatch(/isn't production/);
    expect(liveStripeKeyProblem(restricted, { VERCEL_ENV: "development" })).toMatch(/isn't production/);
    expect(liveStripeKeyProblem(live, { VERCEL_ENV: "production" })).toBeNull();
    expect(liveStripeKeyProblem(live, {})).toBeNull();
    expect(liveStripeKeyProblem(testKey, { VERCEL_ENV: "preview" })).toBeNull();
  });

  it("getStripeSecretKey throws only when those guards apply, and otherwise returns the key unchanged", () => {
    const saved = {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      TURFCUT_DEMO: process.env.TURFCUT_DEMO,
      VERCEL_ENV: process.env.VERCEL_ENV,
    };
    const restore = () => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    };
    try {
      process.env.STRIPE_SECRET_KEY = live;
      delete process.env.TURFCUT_DEMO;
      delete process.env.VERCEL_ENV;
      expect(getStripeSecretKey()).toBe(live);

      process.env.TURFCUT_DEMO = "1";
      expect(() => getStripeSecretKey()).toThrow(/TURFCUT_DEMO is set/);
      process.env.STRIPE_SECRET_KEY = restricted;
      expect(() => getStripeSecretKey()).toThrow(/live key/);
      process.env.STRIPE_SECRET_KEY = testKey;
      expect(getStripeSecretKey()).toBe(testKey);

      delete process.env.TURFCUT_DEMO;
      process.env.STRIPE_SECRET_KEY = live;
      process.env.VERCEL_ENV = "preview";
      expect(() => getStripeSecretKey()).toThrow(/isn't production/);
      process.env.VERCEL_ENV = "production";
      expect(getStripeSecretKey()).toBe(live);
    } finally {
      restore();
    }
  });

  it("demo mode and non-production Vercel deploys reject live-mode webhook events; otherwise they pass", () => {
    expect(stripeWebhookLivemodeProblem(true, { TURFCUT_DEMO: "1" })).toMatch(/live mode/);
    expect(stripeWebhookLivemodeProblem(false, { TURFCUT_DEMO: "1" })).toBeNull();
    expect(stripeWebhookLivemodeProblem(true, { VERCEL_ENV: "preview" })).toMatch(/live mode/);
    expect(stripeWebhookLivemodeProblem(true, { VERCEL_ENV: "production" })).toBeNull();
    expect(stripeWebhookLivemodeProblem(true, {})).toBeNull();
  });

  it("TURFCUT_DEMO accepts 1, true and yes in any case, and fails loudly on anything else", () => {
    for (const v of ["1", "true", "TRUE", "yes", "Yes", " yes "]) expect(turfcutDemoOn({ TURFCUT_DEMO: v })).toBe(true);
    for (const v of [undefined, "", "  "]) expect(turfcutDemoOn({ TURFCUT_DEMO: v })).toBe(false);
    for (const v of ["0", "on", "false", "ture", "2"]) expect(() => turfcutDemoOn({ TURFCUT_DEMO: v })).toThrow(/TURFCUT_DEMO must be 1, true or yes/);
    expect(liveStripeKeyProblem(live, { TURFCUT_DEMO: "true" })).toMatch(/TURFCUT_DEMO is set/);
    expect(() => liveStripeKeyProblem(live, { TURFCUT_DEMO: "on" })).toThrow(/TURFCUT_DEMO must be/);
  });

  it("hasStripeConfig is false when the live-key guard applies, so the Pay buttons hide; unchanged otherwise", () => {
    const saved = { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY, TURFCUT_DEMO: process.env.TURFCUT_DEMO, VERCEL_ENV: process.env.VERCEL_ENV };
    try {
      delete process.env.VERCEL_ENV;
      delete process.env.TURFCUT_DEMO;
      process.env.STRIPE_SECRET_KEY = live;
      expect(hasStripeConfig()).toBe(true);
      process.env.TURFCUT_DEMO = "yes";
      expect(hasStripeConfig()).toBe(false);
      process.env.STRIPE_SECRET_KEY = testKey;
      expect(hasStripeConfig()).toBe(true);
      delete process.env.TURFCUT_DEMO;
      process.env.STRIPE_SECRET_KEY = live;
      process.env.VERCEL_ENV = "preview";
      expect(hasStripeConfig()).toBe(false);
      delete process.env.STRIPE_SECRET_KEY;
      expect(hasStripeConfig()).toBe(false);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
