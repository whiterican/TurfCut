import { afterEach, describe, expect, it, vi } from "vitest";
import { CORE_SETTINGS, getSiteUrl, missingCoreSettings, missingInviteSettings, notConfiguredMessage, siteOriginOf } from "./env";

const ALL = Object.fromEntries(CORE_SETTINGS.map((k) => [k, `value-of-${k}`]));

describe("core settings for sign-in and sign-up", () => {
  it("reports nothing when every core setting is present", () => {
    expect(missingCoreSettings(ALL)).toEqual([]);
  });

  it("names exactly the missing ones, in a fixed order", () => {
    expect(missingCoreSettings({ ...ALL, DATABASE_URL: undefined })).toEqual(["DATABASE_URL"]);
    expect(missingCoreSettings({})).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "DATABASE_URL"]);
  });

  it("treats empty and whitespace-only values as missing (a blank paste in a host's settings)", () => {
    expect(missingCoreSettings({ ...ALL, DATABASE_URL: "", NEXT_PUBLIC_SUPABASE_URL: "  " })).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL"]);
  });

  it("says what isn't configured, naming settings but never values", () => {
    expect(notConfiguredMessage("Sign-in", ["DATABASE_URL"])).toBe("Sign-in isn't configured on this server yet (DATABASE_URL).");
    expect(notConfiguredMessage("Sign-up", ["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL"])).toBe(
      "Sign-up isn't configured on this server yet (NEXT_PUBLIC_SUPABASE_URL, DATABASE_URL).",
    );
  });
});

describe("core settings read from the environment by default", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sees what the server was given", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("DATABASE_URL", "");
    expect(missingCoreSettings()).toEqual(["DATABASE_URL"]);
  });
});

describe("invite settings", () => {
  const KEY = "service-role-key";

  it("needs the service key everywhere", () => {
    expect(missingInviteSettings({ NODE_ENV: "development" })).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
    expect(missingInviteSettings({ SUPABASE_SERVICE_ROLE_KEY: KEY, NODE_ENV: "development" })).toEqual([]);
  });

  it("needs a usable SITE_URL in production only, as the invite link does", () => {
    expect(missingInviteSettings({ SUPABASE_SERVICE_ROLE_KEY: KEY, NODE_ENV: "production" })).toEqual(["SITE_URL"]);
    expect(missingInviteSettings({ SUPABASE_SERVICE_ROLE_KEY: KEY, SITE_URL: "turf-cut.vercel.app", NODE_ENV: "production" })).toEqual(["SITE_URL"]);
    expect(missingInviteSettings({ SUPABASE_SERVICE_ROLE_KEY: KEY, SITE_URL: "https://turf-cut.vercel.app", NODE_ENV: "production" })).toEqual([]);
  });

  it("treats a SITE_URL without http(s) as unset (it would build links like null/auth/confirm)", () => {
    expect(missingInviteSettings({ SUPABASE_SERVICE_ROLE_KEY: KEY, SITE_URL: "localhost:3000", NODE_ENV: "production" })).toEqual(["SITE_URL"]);
  });

  it("names both when both are missing", () => {
    expect(missingInviteSettings({ NODE_ENV: "production" })).toEqual(["SUPABASE_SERVICE_ROLE_KEY", "SITE_URL"]);
  });
});

describe("SITE_URL", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps only an http(s) origin", () => {
    expect(siteOriginOf("https://turf-cut.vercel.app/some/path?x=1")).toBe("https://turf-cut.vercel.app");
    expect(siteOriginOf(" http://localhost:3000 ")).toBe("http://localhost:3000");
  });

  it("treats anything else as unset", () => {
    for (const v of [undefined, "", "  ", "turf-cut.vercel.app", "localhost:3000", "mailto:caden@example.com"]) expect(siteOriginOf(v)).toBeNull();
  });

  it("is what getSiteUrl reads", () => {
    vi.stubEnv("SITE_URL", "localhost:3000");
    expect(getSiteUrl()).toBeNull();
    vi.stubEnv("SITE_URL", "https://turf-cut.vercel.app/");
    expect(getSiteUrl()).toBe("https://turf-cut.vercel.app");
  });
});
