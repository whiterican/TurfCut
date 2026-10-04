import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/env";
import { siteOrigin } from "@/lib/site-origin";
import type { InviteMailer } from "@/lib/members-data";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/**
 * Pilot sender (C1-Q4): Supabase Auth's own invite email. New addresses get
 * an invite link; an address that already has a login gets a sign-in link
 * instead. Either lands on /auth/confirm, where the invite is accepted. Both
 * rely on the token_hash email templates (README, step 5). Replace with a
 * real sender before scaling beyond the pilot.
 */
export const supabaseInviteMailer: InviteMailer = async (email) => {
  const origin = await siteOrigin();
  if (!origin) return { ok: false, message: "SITE_URL is not set" };
  const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent("/dashboard")}`;
  const admin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), noSession);
  const invited = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!invited.error) return { ok: true };
  if (invited.error.code !== "email_exists") return { ok: false, message: invited.error.message };
  // A separate, cookie-less client: the owner's own session is never touched.
  const anon = createClient(getSupabaseUrl(), getSupabaseAnonKey(), noSession);
  const link = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
  return link.error ? { ok: false, message: link.error.message } : { ok: true };
};
