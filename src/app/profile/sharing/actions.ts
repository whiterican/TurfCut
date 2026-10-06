"use server";

import { revalidatePath } from "next/cache";
import { loadSharing, saveSharing } from "@/lib/sharing-data";
import { sharingFromForm } from "@/lib/sharing-form";
import { requireWorker } from "@/lib/worker-session";

export interface SharingFormState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
}

export async function saveSharingChoices(_prev: SharingFormState, formData: FormData): Promise<SharingFormState> {
  const { workerId, userId } = await requireWorker();
  const current = await loadSharing(workerId);
  const saved = await saveSharing(workerId, userId, sharingFromForm(formData, current.choices.readReceipts));
  if (!saved.ok) return { ok: false, message: "Fix the highlighted choices.", errors: saved.errors };
  revalidatePath("/profile");
  revalidatePath("/profile/sharing");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: saved.changed ? "Saved. Organizations see the change straight away." : "No changes to save.",
    errors: {},
  };
}
