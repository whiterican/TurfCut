"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadSharing, saveSharing } from "@/lib/sharing-data";
import { requireWorker } from "@/lib/worker-session";
import { dismissSharingNote } from "@/app/dashboard/actions";

/**
 * Last step of the setup: records the choices on screen as the worker's own
 * (version 1 when they kept the defaults), so the reminders stop.
 */
export async function confirmSharing(): Promise<void> {
  const { workerId, userId } = await requireWorker();
  const { choices } = await loadSharing(workerId);
  await saveSharing(workerId, userId, choices);
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  redirect("/profile?setup=done");
}

/** "Skip for now": the defaults stay; Today's note goes away on this device; Profile keeps a reminder. */
export async function skipSetup(): Promise<void> {
  await requireWorker();
  await dismissSharingNote();
  redirect("/dashboard");
}
