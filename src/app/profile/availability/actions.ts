"use server";

import { revalidatePath } from "next/cache";
import { saveAvailability } from "@/lib/availability-data";
import { requireWorker } from "@/lib/worker-session";

export interface AvailabilityFormState {
  ok: boolean;
  message: string;
  errors: Record<string, string>;
}

const PAYLOAD_MAX = 20_000;

export async function saveAvailabilityAction(payload: string): Promise<AvailabilityFormState> {
  const { workerId, userId } = await requireWorker();
  let raw: unknown;
  try {
    if (typeof payload !== "string" || payload.length > PAYLOAD_MAX) throw new Error("too long");
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, message: "Something went wrong reading your week. Reload and try again.", errors: {} };
  }
  const saved = await saveAvailability(workerId, userId, raw);
  if (!saved.ok) return { ok: false, message: "Nothing was saved. Fix the parts marked below.", errors: saved.errors };
  revalidatePath("/profile");
  revalidatePath("/profile/availability");
  return { ok: true, message: saved.changed ? "Saved." : "Saved. Nothing had changed.", errors: {} };
}
