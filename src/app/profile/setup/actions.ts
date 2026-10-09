"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { alreadyConfirmed, loadSharing, saveSharing } from "@/lib/sharing-data";
import { requireWorker } from "@/lib/worker-session";
import { dismissSharingNote } from "@/app/dashboard/actions";
import { SETUP_STEPS, setupOrigin, shownVersion } from "@/lib/setup-flow";

/**
 * Last step of the setup: records the choices the worker was shown, under
 * the wording they were shown, as their own (version 1 when they kept the
 * defaults), so the reminders stop. If a save landed after the page opened,
 * or the wording changed, nothing is written and the worker is sent back to
 * check, unless those exact choices are already confirmed under today's
 * wording (a double press, or the same confirm in two tabs): then it's done.
 */
export async function confirmSharing(fd: FormData): Promise<void> {
  const { workerId, userId } = await requireWorker();
  const origin = setupOrigin(fd.get("from")) === "profile" ? "&from=profile" : "";
  const textVersion = typeof fd.get("textVersion") === "string" ? (fd.get("textVersion") as string) : "";
  // Back to Done, still under the wording the steps began with.
  const back = (error: string) => `/profile/setup?step=${SETUP_STEPS.length}${origin}&tv=${encodeURIComponent(textVersion)}&error=${error}`;
  const shown = shownVersion(fd.get("version"));
  if (shown === undefined) redirect(back("stale"));
  const { choices } = await loadSharing(workerId);
  const r = await saveSharing(workerId, userId, choices, { expectedVersion: shown, textVersion });
  if (!r.ok) {
    // The wording changed since step 1: the steps start again, as they read now.
    if (r.errors.reworded) redirect(`/profile/setup?step=1${origin}&error=reworded`);
    if (!(r.errors.stale && (await alreadyConfirmed(workerId, shown)))) redirect(back(r.errors.stale ? "stale" : "invalid"));
  }
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
