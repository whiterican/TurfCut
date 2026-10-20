"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/jobs/actions";
import { requireStaff } from "@/lib/staff-session";
import { UUID_RE } from "@/lib/jobs";
import { approveJurisdictionVersion, isJurisdictionDecision, proposeJurisdictionVersion, retireJurisdictionProposal, withdrawJurisdictionApproval } from "@/lib/admin-jurisdictions-data";
import { rulesFromForm } from "@/lib/jurisdiction-rules";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
/** A date input's value ("YYYY-MM-DD") as the start of that day (UTC), null when empty, an invalid Date when malformed. */
const dayStart = (raw: string): Date | null => (raw.trim() ? new Date(`${raw.trim()}T00:00:00Z`) : null);
/** The same value as the end of that day: an approval lasts through the day counsel named. */
const dayEnd = (raw: string): Date | null => (raw.trim() ? new Date(`${raw.trim()}T23:59:59.999Z`) : null);
const refresh = (id?: string) => {
  for (const path of ["/admin", "/admin/jurisdictions", ...(id ? [`/admin/jurisdictions/${id}`] : [])]) revalidatePath(path);
};

/** Propose a new version of a place's rules (M10.3). Staff only. On success, straight to the new version's page. */
export async function proposeVersion(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const r = await proposeJurisdictionVersion(
    { userId: staff.userId, staff: true },
    { state: str(fd, "state"), locality: str(fd, "locality"), rules: rulesFromForm((name) => fd.getAll(name).map(String)), effectiveFrom: dayStart(str(fd, "effectiveFrom")), reason: str(fd, "reason") }
  );
  if (!r.ok) return r;
  refresh(r.id);
  redirect(`/admin/jurisdictions/${r.id}`);
}

/** Approve (or renew) a version, withdraw its approval, or retire a proposal (M10.3). Staff only; every decision is recorded with the reason. */
export async function decideJurisdiction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const id = str(fd, "id");
  const decision = str(fd, "decision");
  if (!UUID_RE.test(id) || !isJurisdictionDecision(decision)) return { ok: false, message: "That request didn't make sense. Reload the page and try again." };
  const actor = { userId: staff.userId, staff: true as const };
  const reason = str(fd, "reason");
  if (decision === "approve") {
    const r = await approveJurisdictionVersion(actor, id, { approvalExpiresAt: dayEnd(str(fd, "approvalExpiresAt")), reason });
    if (!r.ok) return r;
    refresh(id);
    const moved = r.moved ? ` ${r.moved} ${r.moved === 1 ? "job" : "jobs"} moved to this version.` : "";
    const frozen = r.frozen ? ` ${r.frozen} ${r.frozen === 1 ? "job stays" : "jobs stay"} frozen on the old one; the organizations have been told.` : "";
    const waiting = r.notEffectiveUntil ? ` This version isn't effective until ${r.notEffectiveUntil.toISOString().slice(0, 10)}: the moved jobs are frozen until then, and their organizations have been told.` : "";
    return { ok: true, message: `Approved.${moved}${frozen}${waiting}` };
  }
  if (decision === "withdraw") {
    const r = await withdrawJurisdictionApproval(actor, id, reason);
    if (!r.ok) return r;
    refresh(id);
    return { ok: true, message: `Approval withdrawn.${r.frozen ? ` ${r.frozen} ${r.frozen === 1 ? "job is" : "jobs are"} frozen; the organizations have been told.` : ""}` };
  }
  const r = await retireJurisdictionProposal(actor, id, reason);
  if (!r.ok) return r;
  refresh(id);
  return { ok: true, message: "Proposal retired." };
}
