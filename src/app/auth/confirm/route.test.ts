import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// redirect() throws in Next; the mock does the same so the handler stops there.
const m = vi.hoisted(() => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
  createClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.createClient }));
vi.mock("@/lib/account", () => ({ ensureAccount: vi.fn() }));

import { GET } from "./route";

const req = (qs: string) => ({ nextUrl: new URL(`https://turf-cut.vercel.app/auth/confirm${qs}`) }) as unknown as NextRequest;

describe("GET /auth/confirm on a server missing its settings", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("DATABASE_URL", "");
    m.redirect.mockClear();
    m.createClient.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("says the server isn't set up, without using the link or blaming it", async () => {
    await expect(GET(req("?code=abc&next=/dashboard"))).rejects.toThrow("REDIRECT /login?error=config");
    expect(m.createClient).not.toHaveBeenCalled();
  });

  it("uses the link as before once configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://postgres@localhost:5432/turfcut");
    m.createClient.mockResolvedValue({ auth: { exchangeCodeForSession: async () => ({ error: { message: "bad code" } }) } });
    await expect(GET(req("?code=abc"))).rejects.toThrow("REDIRECT /login?error=link");
    expect(m.createClient).toHaveBeenCalled();
  });
});
