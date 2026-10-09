"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/jobs/actions";
import { missingProofSettings, notConfiguredMessage } from "@/lib/env";
import { addProof, removeProof } from "@/lib/proof-data";
import { PROOF_MAX_BYTES } from "@/lib/proof-photos";
import { check, retryAfter, waitText } from "@/lib/rate-limit";
import { requireWorker } from "@/lib/worker-session";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Adds a photo of the worker's own certificate (C3.6b); shared only when they tick the box. */
export async function addProofAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const unset = missingProofSettings();
  if (unset.length) {
    console.error(`[turfcut] proof photo upload refused: not configured (${unset.join(", ")})`);
    return { ok: false, message: notConfiguredMessage("Credential photos", unset) };
  }
  const upload = fd.get("photo");
  if (!(upload instanceof File) || upload.size === 0) return { ok: false, message: "Choose a photo." };
  if (upload.size > PROOF_MAX_BYTES) return { ok: false, message: "That photo is over 4 MB. Take it again at a lower resolution." };
  const verdict = await check("proof-upload", workerId);
  if (verdict === "unavailable") return { ok: false, message: "Photo uploads are briefly unavailable. Try again in a minute." };
  if (verdict !== "ok") return { ok: false, message: `That's today's limit of photo uploads. Try again in ${waitText(await retryAfter("proof-upload", workerId), "hour")}.` };
  const r = await addProof(
    { workerId, profileId: userId },
    { credentialId: str(fd, "credentialId"), side: str(fd, "side"), shared: fd.get("shared") === "on", file: new Uint8Array(await upload.arrayBuffer()) }
  );
  if (!r.ok) return { ok: false, message: r.reason };
  revalidatePath("/profile/credentials");
  return { ok: true, message: "Photo added. Turfcut kept a cleaned copy, without location or camera details." };
}

/** Takes a photo down; it's deleted, not hidden. */
export async function removeProofAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { workerId, userId } = await requireWorker();
  const r = await removeProof({ workerId, profileId: userId }, str(fd, "proofId"));
  if (!r.ok) return { ok: false, message: r.reason };
  revalidatePath("/profile/credentials");
  return { ok: true, message: "Photo deleted." };
}
