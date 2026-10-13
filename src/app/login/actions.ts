"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { check, clientKey, retryAfter, waitText } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_RE, safeNext } from "@/lib/auth-input";
import { siteOrigin } from "@/lib/site-origin";
import { db } from "@/lib/db";
import { missingCoreSettings, notConfiguredMessage, unsetDetail } from "@/lib/env";

export interface LoginState {
  ok: boolean;
  message: string;
  email: string;
}

/**
 * Log in with a password, or email a one-time sign-in link. A server action,
 * so it works before (or without) the page's JavaScript — and credentials
 * are only ever POSTed, never put in a URL.
 */
export async function logIn(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const intent = fd.get("intent") === "link" ? "link" : "password";
  const next = safeNext(fd.get("next"));
  if (!EMAIL_RE.test(email)) return { ok: false, message: "Enter a valid email address.", email };
  const unset = missingCoreSettings();
  if (unset.length) {
    console.error(`[turfcut] sign-in refused: not configured (${unsetDetail(unset)})`);
    return { ok: false, message: notConfiguredMessage("Sign-in", unset), email };
  }
  // Per connection (when the host tells us one) and, for passwords, per address from anywhere.
  const who = clientKey(await headers());
  const bucket = intent === "link" ? "link" : "login";
  const busy = { ok: false, message: "Sign-in is briefly unavailable. Try again in a minute.", email };
  const conn = who ? await check(bucket, who) : "ok";
  if (conn === "unavailable") return busy;
  if (conn === "limited") return { ok: false, message: `Too many sign-in attempts. Try again in ${waitText(await retryAfter(bucket, who!))}.`, email };
  const addr = intent === "password" ? await check("login-email", email) : "ok";
  if (addr === "unavailable") return busy;
  if (addr === "limited") return { ok: false, message: `Too many sign-in attempts for this address. Try again in ${waitText(await retryAfter("login-email", email))}, or use a sign-in link.`, email };

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, message: "Sign-in isn't configured on this server yet.", email };
  }

  if (intent === "link") {
    const origin = await siteOrigin();
    if (!origin) return { ok: false, message: "Sign-in links aren't configured on this server yet (SITE_URL).", email };
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
    });
    // The same reply whether or not the account exists (otp_disabled = no
    // such user) or was rate limited, so the form can't reveal who has an
    // account. Other failures are real and are reported.
    if (error && error.code !== "otp_disabled" && error.status !== 429) {
      return { ok: false, message: "We couldn't send the link. Check the address and try again.", email };
    }
    return { ok: true, message: `If ${email} has an account, a sign-in link is on its way. It works best opened on this phone.`, email };
  }

  const password = String(fd.get("password") ?? "");
  if (!password) return { ok: false, message: "Enter your password, or email yourself a sign-in link.", email };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  // Supabase checks the password before confirmation, so this message
  // needs the right password — it doesn't reveal who has an account.
  if (error?.code === "email_not_confirmed") {
    return { ok: false, message: "Confirm your email first — check your inbox — or use a sign-in link below.", email };
  }
  if (error) return { ok: false, message: "That email and password don't match. Try again, or use a sign-in link.", email };
  // A closed account whose login outlived the closure (the admin delete
  // failed) is signed straight back out — it's closed, not locked out.
  if (data.user && (await closed(data.user.id))) {
    await supabase.auth.signOut();
    redirect("/login?closed=1");
  }
  redirect(next);
}

async function closed(userId: string): Promise<boolean> {
  try {
    return !!(await db().profile.findUnique({ where: { id: userId }, select: { closedAt: true } }))?.closedAt;
  } catch {
    return false;
  }
}
