"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/jobs/actions";
import { getAuthUser, getSessionProfile } from "@/lib/auth";
import { acceptInvite } from "@/lib/members-data";
import { cookies } from "next/headers";
import { SHARING_NOTE_COOKIE, withDismissal } from "@/lib/sharing";

/** A removed member accepts one invite they were sent: joining is always their choice. */
export async function acceptOrgInvite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const [session, user] = await Promise.all([getSessionProfile(), getAuthUser()]);
  if (!session || !user || session.userId !== user.id) return { ok: false, message: "Sign in again to accept." };
  if (session.role === "WORKER" || session.orgId) return { ok: false, message: "This login can't join another organization." };
  const ok = await acceptInvite(user, { inviteId: String(fd.get("inviteId") ?? "") });
  revalidatePath("/", "layout");
  return ok ? { ok: true, message: "Joined. Welcome back." } : { ok: false, message: "That invite is no longer open. Ask an owner to send a new one." };
}

/**
 * Hides the sharing note for the signed-in worker on this device. The
 * cookie lists the worker ids that dismissed it, so on a shared crew phone
 * each worker still sees it once.
 */
export async function dismissSharingNote(): Promise<void> {
  const session = await getSessionProfile();
  if (!session?.workerId) return;
  const jar = await cookies();
  jar.set(SHARING_NOTE_COOKIE, withDismissal(jar.get(SHARING_NOTE_COOKIE)?.value, session.workerId), {
    path: "/", maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
  });
  // Dismissals of earlier wordings mean nothing now; don't send them on every request for a year.
  for (const c of jar.getAll()) if (c.name.startsWith("tc_sharing_note") && c.name !== SHARING_NOTE_COOKIE) jar.delete(c.name);
  revalidatePath("/dashboard");
}
