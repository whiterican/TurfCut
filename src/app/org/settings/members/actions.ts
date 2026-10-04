"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/jobs/actions";
import { requireArea } from "@/lib/employer-session";
import { supabaseInviteMailer } from "@/lib/invite-mailer";
import { changeMemberRole, inviteMember, isInviteRole, normalizeEmail, removeMember, resendInvite, revokeInvite } from "@/lib/members-data";
import { allow, retryAfter } from "@/lib/rate-limit";

const PATH = "/org/settings/members";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const tooMany = (orgId: string): ActionState => ({ ok: false, message: `Your organization has sent today's limit of invites. Try again in ${Math.ceil(retryAfter("invite", orgId) / 3600)} hours.` });

// Every action re-checks the caller: owners only (C1-Q1).
const owner = async () => {
  const s = await requireArea("orgMembers");
  return { userId: s.userId, orgId: s.orgId };
};

export async function invite(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await owner();
  const email = normalizeEmail(str(fd, "email"));
  if (!email) return { ok: false, message: "Enter a valid email address." };
  if (!isInviteRole(str(fd, "role"))) return { ok: false, message: "Choose a role." };
  if (!allow("invite", actor.orgId)) return tooMany(actor.orgId);
  const r = await inviteMember(actor, { email, role: str(fd, "role") }, supabaseInviteMailer);
  revalidatePath(PATH);
  if (!r.ok) return { ok: false, message: r.reason };
  return { ok: r.sent, message: r.message ?? "Invite sent. It works for 7 days." };
}

export async function resend(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await owner();
  if (!allow("invite", actor.orgId)) return tooMany(actor.orgId);
  const r = await resendInvite(actor, str(fd, "inviteId"), supabaseInviteMailer);
  revalidatePath(PATH);
  return r.ok ? { ok: true, message: "Sent again. It works for 7 more days." } : { ok: false, message: r.reason };
}

export async function revoke(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await revokeInvite(await owner(), str(fd, "inviteId"));
  revalidatePath(PATH);
  return r.ok ? { ok: true, message: "Invite revoked." } : { ok: false, message: r.reason };
}

export async function changeRole(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await changeMemberRole(await owner(), str(fd, "profileId"), str(fd, "role"));
  revalidatePath(PATH);
  return r.ok ? { ok: true, message: "Role updated." } : { ok: false, message: r.reason };
}

export async function remove(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await removeMember(await owner(), str(fd, "profileId"));
  revalidatePath(PATH);
  return r.ok ? { ok: true, message: "Removed. Their past work stays on record." } : { ok: false, message: r.reason };
}
