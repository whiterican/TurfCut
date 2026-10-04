"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateSetup } from "@/lib/auth-input";
import { formToObject } from "@/lib/jobs";
import { ensureAccount, SIGNUP_METADATA_KEY } from "@/lib/account";
import { db } from "@/lib/db";

export interface SetupState {
  message: string;
  errors: Record<string, string>;
}

/**
 * Finishes an account for a signed-in login that has no profile: the same
 * details sign-up asks for, stored the same way, then the usual setup.
 */
export async function finishSetup(_prev: SetupState, fd: FormData): Promise<SetupState> {
  const v = validateSetup(formToObject(fd));
  if (!v.ok) return { message: "Fix the highlighted fields.", errors: v.errors };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (await db().profile.findUnique({ where: { id: data.user.id }, select: { id: true } })) redirect("/dashboard");
  const updated = await supabase.auth.updateUser({ data: { [SIGNUP_METADATA_KEY]: v.value } });
  if (updated.error || !updated.data.user) return { message: "We couldn't save that. Try again in a minute.", errors: {} };
  try {
    if (!(await ensureAccount(updated.data.user))) return { message: "We couldn't set up your account. Try again in a minute.", errors: {} };
  } catch {
    return { message: "We couldn't set up your account. Try again in a minute.", errors: {} };
  }
  redirect("/dashboard");
}
