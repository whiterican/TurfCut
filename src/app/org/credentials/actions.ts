"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/app/jobs/actions";
import { requireArea } from "@/lib/employer-session";
import { verifyCredential } from "@/lib/verification-data";

/** Records that this organization checked a hired worker's credential, and how (C3.6a). */
export async function verify(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireArea("compliance");
  const r = await verifyCredential({ profileId: s.userId, orgId: s.orgId, role: s.role }, String(fd.get("credentialId") ?? ""), String(fd.get("method") ?? ""));
  if (!r.ok) return { ok: false, message: r.reason };
  revalidatePath("/org/credentials");
  // The form goes away once the credential is verified, so the confirmation is shown by the page.
  redirect("/org/credentials?checked=1");
}
