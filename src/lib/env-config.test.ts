import { describe, expect, it } from "vitest";
import { CORE_SETTINGS, missingCoreSettings, notConfiguredMessage } from "./env";

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
