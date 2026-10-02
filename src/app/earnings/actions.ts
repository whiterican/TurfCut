"use server";

import { revalidatePath } from "next/cache";
import { requireWorker } from "@/lib/worker-session";
import { openDispute } from "@/lib/pay-data";
import type { ActionState } from "@/app/jobs/actions";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** The worker disputes their pay for one shift. */
export async function dispute(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const shiftId = str(fd, "shiftId").trim();
  const r = await openDispute({ workerId, profileId: userId }, shiftId, str(fd, "reason"));
  if (!r.ok) return { ok: false, message: r.reason };
  revalidatePath("/earnings");
  revalidatePath(`/shifts/${shiftId}`);
  return {
    ok: true,
    message: r.paymentWaits ? "Dispute sent. Payment for this shift waits until it's resolved." : "Dispute sent. You'll see the response here.",
  };
}
