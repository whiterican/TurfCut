"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/jobs/actions";
import { requireStaff } from "@/lib/staff-session";
import { UUID_RE } from "@/lib/jobs";
import { staffRemoveMember, staffResendInvite } from "@/lib/admin-people-data";
import { supabaseInviteMailer } from "@/lib/invite-mailer";
import { check, retryAfter, waitText } from "@/lib/rate-limit";
import { missingInviteSettings, notConfiguredMessage } from "@/lib/env";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Resend a pending invite for an organization (M10.4). The organization's own daily invite limit applies to a staff resend too. */
export async function resendInviteAsStaff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const inviteId = str(fd, "inviteId");
  const orgId = str(fd, "orgId");
  const profileId = str(fd, "profileId");
  if (!UUID_RE.test(inviteId) || !UUID_RE.test(orgId) || !UUID_RE.test(profileId)) return { ok: false, message: "That request didn't make sense. Reload the page and try again." };
  const unset = missingInviteSettings();
  if (unset.length) {
    console.error(`[turfcut] staff invite resend refused: not configured (${unset.join(", ")})`);
    return { ok: false, message: notConfiguredMessage("Sending invites", unset) };
  }
  const verdict = await check("invite", orgId);
  if (verdict === "unavailable") return { ok: false, message: "Invites are briefly unavailable. Try again in a minute." };
  if (verdict !== "ok") return { ok: false, message: `This organization has sent today's limit of invites. Try again in ${waitText(await retryAfter("invite", orgId), "hour")}.` };
  const r = await staffResendInvite({ userId: staff.userId, staff: true }, inviteId, supabaseInviteMailer, str(fd, "reason"));
  if (!r.ok) return r;
  revalidatePath(`/admin/people/${profileId}`);
  return { ok: true, message: "Sent again. The invite is good for another 7 days." };
}

/** Remove a member from their organization (M10.4), with the owner's own rules. */
export async function removeMemberAsStaff(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const profileId = str(fd, "profileId");
  if (!UUID_RE.test(profileId)) return { ok: false, message: "That request didn't make sense. Reload the page and try again." };
  const r = await staffRemoveMember({ userId: staff.userId, staff: true }, profileId, str(fd, "reason"));
  if (!r.ok) return r;
  for (const path of ["/admin", "/admin/organizations", `/admin/people/${profileId}`]) revalidatePath(path);
  return { ok: true, message: "Removed. The login and history stay; access to the organization has ended." };
}
