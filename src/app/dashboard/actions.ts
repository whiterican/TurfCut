"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/jobs/actions";
import { getAuthUser, getSessionProfile } from "@/lib/auth";
import { acceptInvite } from "@/lib/members-data";

/** A removed member accepts one invite they were sent: joining is always their choice. */
export async function acceptOrgInvite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const [session, user] = await Promise.all([getSessionProfile(), getAuthUser()]);
  if (!session || !user || session.userId !== user.id) return { ok: false, message: "Sign in again to accept." };
  if (session.role === "WORKER" || session.orgId) return { ok: false, message: "This login can't join another organization." };
  const ok = await acceptInvite(user, { inviteId: String(fd.get("inviteId") ?? "") });
  revalidatePath("/", "layout");
  return ok ? { ok: true, message: "Joined. Welcome back." } : { ok: false, message: "That invite is no longer open. Ask an owner to send a new one." };
}
