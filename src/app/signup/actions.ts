"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateSignup } from "@/lib/auth-input";
import { formToObject } from "@/lib/jobs";
import { ensureAccount, SIGNUP_METADATA_KEY } from "@/lib/account";
import { siteOrigin } from "@/lib/site-origin";

export interface SignupState {
  message: string;
  errors: Record<string, string>;
  values: Record<string, string>;
}

/**
 * Creates the auth user. The Turfcut rows (Profile + Worker, or Profile +
 * Organization) are created only once the person holds a real session —
 * here when email confirmation is off, otherwise when they open the
 * confirmation link — so nobody can claim an email address they don't own.
 * A server action: works without JavaScript, never puts a password in a URL.
 */
export async function signUp(_prev: SignupState, fd: FormData): Promise<SignupState> {
  const raw = formToObject(fd);
  const values = Object.fromEntries(["accountType", "name", "email", "phone"].map((k) => [k, typeof raw[k] === "string" ? (raw[k] as string) : ""]));
  const v = validateSignup(raw);
  if (!v.ok) return { message: "Fix the highlighted fields.", errors: v.errors, values };
  const { accountType, name, email, password, phone } = v.value;

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { message: "Sign-up isn't configured on this server yet.", errors: {}, values };
  }
  const origin = await siteOrigin();
  // The same answer for a new address and an existing one, so the form
  // can't be used to find out who has an account.
  const checkEmail: SignupState = {
    message: `Check ${email} for a confirmation link. Already have an account? Log in instead.`,
    errors: {},
    values: { ...values, done: "1" },
  };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { [SIGNUP_METADATA_KEY]: { accountType, name, phone } },
      ...(origin ? { emailRedirectTo: `${origin}/auth/confirm?next=/dashboard` } : {}),
    },
  });
  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") return checkEmail;
    if (error.code === "weak_password") return { message: "Fix the highlighted fields.", errors: { password: "Choose a stronger password." }, values };
    if (error.status === 429) return { message: "Too many attempts. Wait a minute and try again.", errors: {}, values };
    return { message: "We couldn't create the account. Try again in a minute.", errors: {}, values };
  }
  // Confirmation on: either a new user awaiting confirmation, or (no
  // identities) an existing address — both get the same reply.
  if (!data.session || !data.user || !data.user.identities?.length) return checkEmail;

  try {
    await ensureAccount(data.user);
  } catch {
    return { message: "Your login was created, but setting up your profile failed. Log in to finish.", errors: {}, values };
  }
  redirect("/dashboard");
}
