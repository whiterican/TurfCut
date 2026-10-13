"use server";

import { revalidatePath } from "next/cache";
import { saveSharing } from "@/lib/sharing-data";
import { sharingFromForm } from "@/lib/sharing-form";
import { requireWorker } from "@/lib/worker-session";

export interface SharingFormState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
}

export async function saveSharingChoices(_prev: SharingFormState, formData: FormData): Promise<SharingFormState> {
  const { workerId, userId } = await requireWorker();
  // The wording the form was drawn with: a save across a wording change is refused (saveSharing).
  const textVersion = typeof formData.get("textVersion") === "string" ? (formData.get("textVersion") as string) : "";
  const saved = await saveSharing(workerId, userId, sharingFromForm(formData), { textVersion });
  if (!saved.ok) {
    if (saved.errors.reworded) return { ok: false, message: saved.errors.reworded, errors: {} };
    return { ok: false, message: "Nothing was saved. Fix the choices marked below.", errors: saved.errors };
  }
  revalidatePath("/profile");
  revalidatePath("/profile/sharing");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: !saved.changed
      ? "Saved. Nothing had changed."
      : saved.sameForOrgs
        ? "Saved. Your choices are confirmed; nothing changes for organizations."
        : "Saved. Organizations that can see your profile see the change straight away; copies kept with applications, claims and invitations don't change.",
    errors: {},
  };
}
