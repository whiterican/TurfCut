import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getClaims, createServerClient } = vi.hoisted(() => {
  const getClaims = vi.fn();
  const createServerClient = vi.fn(() => ({ auth: { getClaims } }));
  return { getClaims, createServerClient };
});
vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { updateSession } from "./proxy";

const req = () => new NextRequest("https://turf-cut.vercel.app/dashboard");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("updateSession", () => {
  it("passes every request through untouched when the Supabase URL is blank or has no scheme", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    for (const url of ["  ", "abc.supabase.co"]) {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
      const res = await updateSession(req());
      expect(res.status).toBe(200);
    }
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("hands Supabase the trimmed settings", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " https://abc.supabase.co\n");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", " anon ");
    getClaims.mockResolvedValue({ data: null, error: null });
    await updateSession(req());
    expect(createServerClient).toHaveBeenCalledWith("https://abc.supabase.co", "anon", expect.anything());
  });

  it("still answers when the session check throws, and logs only the error's type", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    getClaims.mockRejectedValue(new SyntaxError("Unexpected token in eyJhbGciOi.secret"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await updateSession(req());
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith("[turfcut] session check skipped: SyntaxError");
    warn.mockRestore();
  });
});
