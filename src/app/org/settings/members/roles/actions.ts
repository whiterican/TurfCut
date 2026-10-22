"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/jobs/actions";
import { requireArea } from "@/lib/employer-session";
import { archiveOrgRole, createOrgRole, updateOrgRole } from "@/lib/org-roles-data";
import { validateRole } from "@/lib/org-roles";

const PATH = "/org/settings/members/roles";
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Building roles is the owner's alone (M10.6): the page guard is the members area, the data layer re-checks "owner" under the lock. */
const owner = async () => {
  const s = await requireArea("orgMembers");
  return { userId: s.userId, orgId: s.orgId };
};

export type RoleFormState = ActionState & { errors?: Record<string, string> };

export async function saveRole(_prev: RoleFormState, fd: FormData): Promise<RoleFormState> {
  const actor = await owner();
  const v = validateRole(fd);
  if (!v.ok) return { ok: false, message: "Fix the highlighted fields.", errors: v.errors };
  const id = str(fd, "roleId");
  const r = id ? await updateOrgRole(actor, id, v.value) : await createOrgRole(actor, v.value);
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors };
  revalidatePath(PATH);
  revalidatePath("/org/settings/members");
  return { ok: true, message: id ? "Saved. Members on this role have the new access on their next page." : "Role created. Choose it when you invite someone or change a member's role." };
}

export async function archiveRole(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const r = await archiveOrgRole(await owner(), str(fd, "roleId"));
  revalidatePath(PATH);
  revalidatePath("/org/settings/members");
  return r.ok ? { ok: true, message: "Archived." } : { ok: false, message: r.reason };
}
