"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EMAIL_RE, safeNext } from "@/lib/auth-input";

export interface LoginState {
  ok: boolean;
  message: string;
  email: string;
}

/** The site's own origin, for the magic-link return address. */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
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

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { ok: false, message: "Sign-in isn't configured on this server yet.", email };
  }

  if (intent === "link") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${await origin()}/auth/confirm?next=${encodeURIComponent(next)}` },
    });
    // Same answer whether or not the account exists, so the form can't be
    // used to discover who has an account.
    if (error && error.status !== 400 && error.status !== 422) return { ok: false, message: "We couldn't send the link. Try again in a minute.", email };
    return { ok: true, message: `If ${email} has an account, a sign-in link is on its way. Open it on this phone.`, email };
  }

  const password = String(fd.get("password") ?? "");
  if (!password) return { ok: false, message: "Enter your password, or email yourself a sign-in link.", email };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: "That email and password don't match. Try again, or use a sign-in link.", email };
  redirect(next);
}
