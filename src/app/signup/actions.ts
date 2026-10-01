"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { validateSignup } from "@/lib/auth-input";
import { formToObject } from "@/lib/jobs";

export interface SignupState {
  message: string;
  errors: Record<string, string>;
  values: Record<string, string>;
}

/**
 * Creates the auth user and the Turfcut rows: Profile + Worker (WORKER) or
 * Profile + Organization (OWNER). A server action, so it works before (or
 * without) the page's JavaScript and never puts a password in a URL.
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
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error || !data.user) {
    return { message: error?.message ?? "Sign-up failed. Try again.", errors: {}, values };
  }

  const userId = data.user.id;
  const existing = await db().profile.findUnique({ where: { id: userId } });
  if (!existing) {
    if (accountType === "worker") {
      await db().profile.create({
        data: { id: userId, role: "WORKER", worker: { create: { displayName: name, phone } } },
      });
    } else {
      await db().$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name } });
        await tx.profile.create({ data: { id: userId, role: "OWNER", orgId: org.id } });
      });
    }
  }

  // With email confirmation on, there's no session until the link is used.
  if (!data.session) {
    return { message: `Check ${email} for a confirmation link, then log in.`, errors: {}, values: { ...values, done: "1" } };
  }
  redirect("/dashboard");
}
