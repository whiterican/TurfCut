"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/jobs/actions";
import { requireStaff } from "@/lib/staff-session";
import { decideOrganization, isDecision } from "@/lib/admin-orgs-data";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Approve an organization for the pilot, or withdraw its approval (M10.2). Staff only; the reason is recorded with the staff member's name. */
export async function decideOrg(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const orgId = str(fd, "orgId");
  const decision = str(fd, "decision");
  if (!UUID_RE.test(orgId) || !isDecision(decision)) return { ok: false, message: "That request didn't make sense. Reload the page and try again." };
  const r = await decideOrganization({ userId: staff.userId, staff: true }, orgId, decision, str(fd, "reason"));
  if (!r.ok) return r;
  for (const path of ["/admin", "/admin/organizations", `/admin/organizations/${orgId}`, "/org/settings"]) revalidatePath(path);
  return { ok: true, message: decision === "approve" ? "Approved. The owners have been told." : "Approval withdrawn. The owners have been told." };
}
