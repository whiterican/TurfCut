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
  const saved = await saveSharing(workerId, userId, sharingFromForm(formData));
  if (!saved.ok) return { ok: false, message: "Nothing was saved. Fix the choices marked below.", errors: saved.errors };
  revalidatePath("/profile");
  revalidatePath("/profile/sharing");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: saved.changed ? "Saved. Organizations see the change straight away." : "Saved. Nothing had changed.",
    errors: {},
  };
}
