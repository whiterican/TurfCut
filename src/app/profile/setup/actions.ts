"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadSharing, saveSharing } from "@/lib/sharing-data";
import { requireWorker } from "@/lib/worker-session";
import { dismissSharingNote } from "@/app/dashboard/actions";
import { SETUP_STEPS, setupOrigin, shownVersion } from "@/lib/setup-flow";

/**
 * Last step of the setup: records the choices the worker was shown as their
 * own (version 1 when they kept the defaults), so the reminders stop. If a
 * save landed after the page opened, nothing is written and the worker is
 * sent back to check.
 */
export async function confirmSharing(fd: FormData): Promise<void> {
  const { workerId, userId } = await requireWorker();
  const back = (error: string) => `/profile/setup?step=${SETUP_STEPS.length}${setupOrigin(fd.get("from")) === "profile" ? "&from=profile" : ""}&error=${error}`;
  const shown = shownVersion(fd.get("version"));
  if (shown === undefined) redirect(back("stale"));
  const { choices } = await loadSharing(workerId);
  const r = await saveSharing(workerId, userId, choices, { expectedVersion: shown });
  if (!r.ok) redirect(back(r.errors.stale ? "stale" : "invalid"));
  revalidatePath("/profile");
  revalidatePath("/dashboard");
  // Replace, not push: Back from Profile mustn't land on a Done that would now be stale.
  redirect("/profile?setup=done", "replace");
}

/** "Skip for now": the choices stay; Today's note goes away on this device; Profile keeps a reminder. Back to where the setup was opened. */
export async function skipSetup(fd: FormData): Promise<void> {
  await requireWorker();
  await dismissSharingNote();
  redirect(setupOrigin(fd.get("from")) === "profile" ? "/profile" : "/dashboard", "replace");
}
