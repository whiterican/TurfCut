"use server";

import { revalidatePath } from "next/cache";
import { requireWorker } from "@/lib/worker-session";
import { recordStopOutcome } from "@/lib/stop-outcomes-data";
import { recordPollAnswers } from "@/lib/poll-data";
import { formToObject } from "@/lib/jobs";
import { orTryAgain, TRY_AGAIN } from "@/lib/try-again";

export interface OutcomeState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
  /** The book isn't this worker's any more (handed on, taken back, or the job ended): nothing to retry; the page should refresh. */
  gone?: boolean;
  /** The save failed in a way it may still have landed (a database timeout): retry with the same tap id, so a save that did land counts once. */
  retry?: boolean;
}

/** The worker holding a walkbook records what happened at one stop. Worker and profile come from the session, never from the form. */
export async function recordOutcomeAction(_prev: OutcomeState, fd: FormData): Promise<OutcomeState> {
  const { workerId, userId } = await requireWorker();
  const raw = formToObject(fd);
  const r = await orTryAgain("stop outcome", () => recordStopOutcome({ workerId, profileId: userId }, raw.stopId, raw.clientId, raw));
  if (!r) return { ok: false, retry: true, message: TRY_AGAIN, errors: {} };
  if (!r.ok) {
    if (r.gone) return { ok: false, gone: true, message: "This walkbook may have been handed on or taken back. Refresh to see what you hold now.", errors: {} };
    return { ok: false, message: r.reason, errors: r.errors ?? {} };
  }
  revalidatePath("/walkbooks");
  revalidatePath(`/jobs/${r.jobId}/walkbooks`, "layout");
  return { ok: true, message: r.repeated ? "Already saved." : "Saved.", errors: {} };
}

/** The worker holding a walkbook records or edits a poll at a Done stop. Worker and profile come from the session, never from the form. */
export async function recordPollAction(_prev: OutcomeState, fd: FormData): Promise<OutcomeState> {
  const { workerId, userId } = await requireWorker();
  const raw = formToObject(fd);
  const r = await orTryAgain("poll answer", () => recordPollAnswers({ workerId, profileId: userId }, raw.stopId, raw.clientId, raw));
  if (!r) return { ok: false, retry: true, message: TRY_AGAIN, errors: {} };
  if (!r.ok) {
    if (r.gone) return { ok: false, gone: true, message: "This walkbook may have been handed on or taken back. Refresh to see what you hold now.", errors: {} };
    return { ok: false, message: r.reason, errors: r.errors ?? {} };
  }
  revalidatePath("/walkbooks");
  revalidatePath(`/jobs/${r.jobId}/walkbooks`, "layout");
  return { ok: true, message: r.repeated || r.saved === 0 ? "Nothing changed." : "Poll saved.", errors: {} };
}
