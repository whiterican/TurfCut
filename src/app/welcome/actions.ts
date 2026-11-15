"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateSetup } from "@/lib/auth-input";
import { formToObject } from "@/lib/jobs";
import { ensureAccount, SIGNUP_METADATA_KEY } from "@/lib/account";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { acceptInvite } from "@/lib/members-data";
import type { ActionState as ActionStateLike } from "@/app/jobs/actions";

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
  // Every page reads the account: none of the copies the app kept while it had none may be shown again.
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/** Joins one invite the person chose, from /welcome. */
export async function acceptFromWelcome(_prev: ActionStateLike, fd: FormData): Promise<ActionStateLike> {
  const user = await getAuthUser();
  if (!user) return { ok: false, message: "Sign in again to accept." };
  if (await acceptInvite(user, { inviteId: String(fd.get("inviteId") ?? "") })) {
    // A new organization changes the menus and pages: drop the copies the app kept from before.
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }
  return { ok: false, message: "That invite is no longer open. Ask an owner to send a new one." };
}
