import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-input";
import { ensureAccount } from "@/lib/account";

/**
 * GET /auth/confirm — where a magic link lands. Handles both link styles
 * Supabase sends (PKCE `code`, or `token_hash` + `type`), sets the session
 * cookie, finishes account setup for a just-confirmed sign-up, then
 * continues to `next` (same-site paths only).
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const next = safeNext(p.get("next"));
  let ok = false;
  try {
    const supabase = await createClient();
    const code = p.get("code");
    const tokenHash = p.get("token_hash");
    const type = p.get("type") as EmailOtpType | null;
    if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    if (ok) {
      // The person has now proven they own this address: finish setting up
      // their account from what they entered at sign-up.
      const { data } = await supabase.auth.getUser();
      if (data.user) await ensureAccount(data.user);
    }
  } catch {
    ok = false;
  }
  redirect(ok ? next : "/login?error=link");
}
