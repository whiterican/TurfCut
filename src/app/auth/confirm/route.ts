import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth-input";
import { ensureAccount } from "@/lib/account";
import { missingCoreSettings } from "@/lib/env";

/**
 * GET /auth/confirm — where a magic link lands. Handles both link styles
 * Supabase sends (PKCE `code`, or `token_hash` + `type`), sets the session
 * cookie, finishes account setup for a just-confirmed sign-up, then
 * continues to `next` (same-site paths only).
 */
export async function GET(req: NextRequest) {
  // A server missing its settings mustn't blame the link ("expired or already
  // used"): say the server isn't set up. Nothing here exchanges the link, so
  // a token_hash link still works later; the default style's token was
  // already spent at Supabase, so the page offers password or a new link.
  const unset = missingCoreSettings();
  if (unset.length) {
    console.error(`[turfcut] sign-in link not used: not configured (${unset.join(", ")})`);
    redirect("/login?error=config");
  }
  const p = req.nextUrl.searchParams;
  const next = safeNext(p.get("next"));
  let ok = false;
  let setup = false;
  try {
    const supabase = await createClient();
    const code = p.get("code");
    const tokenHash = p.get("token_hash");
    const type = p.get("type") as EmailOtpType | null;
    if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
    else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
    if (ok) {
      // The person has now proven they own this address: finish setting up
      // their account from what they entered at sign-up. They're signed in
      // either way, so a setup hiccup must not look like a dead link —
      // getSessionProfile retries on their next request.
      try {
        const { data } = await supabase.auth.getUser();
        // No profile and nothing to build one from (an invite that closed
        // before they opened it): let them finish setting up.
        if (data.user && !(await ensureAccount(data.user, { fromInviteLink: type === "invite" }))) setup = true;
      } catch (e) {
        console.error("[turfcut] account setup after confirmation failed", e);
      }
    }
  } catch {
    ok = false;
  }
  redirect(!ok ? "/login?error=link" : setup ? "/welcome" : next);
}
