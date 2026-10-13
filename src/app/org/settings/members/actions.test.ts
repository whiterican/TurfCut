import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ check: vi.fn(), inviteMember: vi.fn(), resendInvite: vi.fn() }));
vi.mock("@/lib/employer-session", () => ({ requireArea: async () => ({ userId: "owner-1", orgId: "org-1" }) }));
vi.mock("@/lib/rate-limit", () => ({ check: m.check, retryAfter: async () => 3600, waitText: () => "1 hour" }));
vi.mock("@/lib/invite-mailer", () => ({ supabaseInviteMailer: vi.fn() }));
vi.mock("@/lib/members-data", () => ({
  inviteMember: m.inviteMember,
  resendInvite: m.resendInvite,
  revokeInvite: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  isInviteRole: (r: string) => ["OWNER", "RECRUITER", "SUPERVISOR", "FINANCE", "PUBLISHER"].includes(r),
  normalizeEmail: (e: string) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim()) ? e.trim().toLowerCase() : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { invite, resend } from "./actions";

const START = { ok: false, message: "" };
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("member invites when the server isn't fully configured", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("SITE_URL", "https://turf-cut.vercel.app");
    m.check.mockReset();
    m.inviteMember.mockReset();
    m.resendInvite.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("names a missing service key and neither counts the attempt nor saves an invite", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await invite(START, form({ email: "maya@campaign.org", role: "RECRUITER" }));
    expect(r).toEqual({ ok: false, message: "Sending invites isn't configured on this server yet (SUPABASE_SERVICE_ROLE_KEY)." });
    expect(m.check).not.toHaveBeenCalled();
    expect(m.inviteMember).not.toHaveBeenCalled();
  });

  it("names a missing SITE_URL in production, for resends too", async () => {
    vi.stubEnv("SITE_URL", "");
    const r = await resend(START, form({ inviteId: "inv-1" }));
    expect(r.message).toBe("Sending invites isn't configured on this server yet (SITE_URL).");
    expect(m.check).not.toHaveBeenCalled();
    expect(m.resendInvite).not.toHaveBeenCalled();
  });

  it("still asks for a valid address and role first", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect((await invite(START, form({ email: "nope", role: "RECRUITER" }))).message).toBe("Enter a valid email address.");
  });

  it("goes on to the daily invite limit once configured", async () => {
    m.check.mockResolvedValue("limited");
    const r = await invite(START, form({ email: "maya@campaign.org", role: "RECRUITER" }));
    expect(m.check).toHaveBeenCalledWith("invite", "org-1");
    expect(r.message).toBe("Your organization has sent today's limit of invites. Try again in 1 hour.");
    expect(m.inviteMember).not.toHaveBeenCalled();
  });
});
