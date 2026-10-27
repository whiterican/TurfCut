"use server";

import { revalidatePath } from "next/cache";
import { requireWorker } from "@/lib/worker-session";
import { isMark } from "@/lib/job-marks";
import { markJob } from "@/lib/job-marks-data";
import type { ActionState } from "@/app/jobs/actions";

const field = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

/**
 * A worker saves or hides a job on the feed, or undoes either (P1.6). Private
 * to the worker: never used to rank jobs or people, never shown to an
 * organization. Its own file, so nothing that imports the shared jobs actions
 * (every form in the app) reaches the marks.
 */
export async function markJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workerId } = await requireWorker();
  const mark = field(formData, "mark");
  if (!isMark(mark)) return { ok: false, message: "That isn't a thing you can do to a job." };
  const r = await markJob(workerId, field(formData, "jobId"), mark);
  revalidatePath("/jobs");
  if (!r.ok) return { ok: false, message: r.reason };
  return { ok: true, message: { save: "Saved.", unsave: "Removed from saved.", hide: "Hidden from your feed.", unhide: "Back in your feed." }[mark] };
}
