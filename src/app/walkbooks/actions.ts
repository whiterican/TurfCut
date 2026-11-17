"use server";

import { revalidatePath } from "next/cache";
import { requireWorker } from "@/lib/worker-session";
import { recordStopOutcome } from "@/lib/stop-outcomes-data";
import { formToObject } from "@/lib/jobs";

export interface OutcomeState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
}

/** The worker holding a walkbook records what happened at one stop. Worker and profile come from the session, never from the form. */
export async function recordOutcomeAction(_prev: OutcomeState, fd: FormData): Promise<OutcomeState> {
  const { workerId, userId } = await requireWorker();
  const raw = formToObject(fd);
  const r = await recordStopOutcome({ workerId, profileId: userId }, raw.stopId, raw.clientId, raw);
  if (!r.ok) return { ok: false, message: r.reason, errors: r.errors ?? {} };
  revalidatePath("/walkbooks");
  revalidatePath("/jobs", "layout");
  return { ok: true, message: r.repeated ? "Already saved." : "Saved.", errors: {} };
}
