"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/jobs/actions";
import { requireStaff } from "@/lib/staff-session";
import { UUID_RE } from "@/lib/jobs";
import { unverifyCampaign, verifyCampaign } from "@/lib/campaign-admin-data";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Verify a campaign profile, or take the mark off (M10.5). Staff only; the reason is recorded with the staff member's name. */
export async function decideVerification(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const staff = await requireStaff();
  const id = str(fd, "campaignId");
  const decision = str(fd, "decision");
  if (!UUID_RE.test(id) || (decision !== "verify" && decision !== "unverify")) return { ok: false, message: "That request didn't make sense. Reload the page and try again." };
  const actor = { userId: staff.userId, staff: true as const };
  const r = decision === "verify"
    ? await verifyCampaign(actor, id, { handle: str(fd, "seenHandle"), displayName: str(fd, "seenName") }, str(fd, "reason"))
    : await unverifyCampaign(actor, id, str(fd, "reason"));
  if (!r.ok) return r;
  // The public pages and the owner's page render per request; there is nothing of theirs to revalidate.
  for (const path of ["/admin", "/admin/campaigns", `/admin/campaigns/${id}`]) revalidatePath(path);
  return { ok: true, message: decision === "verify" ? "Verified. The mark shows on the public page, the directory and shared links." : "The mark is off." };
}
